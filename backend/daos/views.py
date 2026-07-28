from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.core.cache import cache
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from .models import DaoCache, TreasuryStatsSnapshot
from proposals.models import ProposalCache
from .serializers import DaoCacheSerializer, DaoPrepareCreateSerializer, TreasuryStatsSnapshotSerializer

class DaoSearchFilter(filters.BaseFilterBackend):
    def filter_queryset(self, request, queryset, view):
        search_term = request.query_params.get('search')
        if search_term:
            return queryset.filter(Q(name__icontains=search_term) | Q(description__icontains=search_term))
        return queryset

class DaoAdminFilter(filters.BaseFilterBackend):
    def filter_queryset(self, request, queryset, view):
        my_daos = request.query_params.get('my_daos')
        if my_daos == 'true' and request.user.is_authenticated:
            return queryset.filter(admin__iexact=request.user.wallet_address)
        return queryset

class DaoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DaoCache.objects.all()
    serializer_class = DaoCacheSerializer
    filter_backends = [DaoSearchFilter, DaoAdminFilter, filters.OrderingFilter]
    ordering_fields = ['created_at']
    ordering = ['-created_at']

    def get_throttles(self):
        if self.action == 'prepare_create' and self.request.method == 'POST':
            from covenant_escrow_backend.throttles import PrepareSubmitThrottle
            return [PrepareSubmitThrottle()]
        if self.action in ['latest_proposal', 'latest_dao'] and self.request.method == 'POST':
            from covenant_escrow_backend.throttles import RPCCallThrottle
            return [RPCCallThrottle()]
        return super().get_throttles()

    @action(detail=False, methods=['post'], url_path='prepare-create')
    def prepare_create(self, request):
        serializer = DaoPrepareCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        
        args = [
            data.get('name'),
            data.get('description', ''),
            data.get('quorum_bps'),
            data.get('approval_threshold_bps'),
            data.get('voting_period_seconds'),
            data.get('funding_cap_bps'),
            data.get('max_resubmissions'),
            data.get('min_criteria_length')
        ]
        return Response({"args": args})

    @action(detail=True, methods=['get'], url_path='voting-power/me', permission_classes=[permissions.IsAuthenticated])
    def voting_power(self, request, pk=None):
        dao = self.get_object()
        cache_key = f'voting_power_{dao.dao_id}_{request.user.wallet_address.lower()}'
        power = cache.get(cache_key)
        
        if power is None:
            from indexer.sync import _get_genlayer_client
            from django.conf import settings
            try:
                client = _get_genlayer_client()
                chain_power = client.read_contract(
                    address=settings.GENLAYER_CONTRACT_ADDRESS,
                    function_name="get_voting_power",
                    args=[dao.dao_id, request.user.wallet_address]
                )
                power = str(chain_power)
            except Exception:
                power = "0"
            cache.set(cache_key, power, timeout=300)
            
        return Response({"voting_power": power})

    @action(detail=True, methods=['post'], url_path='proposals/latest')
    def latest_proposal(self, request, pk=None):
        """
        Finds the most recently created proposal for this DAO directly from the chain,
        syncs it to the local cache, and returns its ID.
        """
        dao = self.get_object()
        from indexer.sync import _get_genlayer_client, sync_entity
        from django.conf import settings
        
        try:
            client = _get_genlayer_client()
            
            # Get the global proposal count
            global_count = client.read_contract(
                address=settings.GENLAYER_CONTRACT_ADDRESS,
                function_name="get_proposal_count",
                args=[]
            )
            
            # Search backwards from the newest proposal
            for p_id in range(int(global_count) - 1, -1, -1):
                prop_data = client.read_contract(
                    address=settings.GENLAYER_CONTRACT_ADDRESS,
                    function_name="get_proposal",
                    args=[p_id]
                )
                if prop_data and int(prop_data.get("dao_id", -1)) == dao.dao_id:
                    # Found the latest proposal for this DAO, force sync it!
                    sync_entity("proposal", p_id, request.user.wallet_address if request.user.is_authenticated else "")
                    return Response({"proposal_id": p_id})
                    
            return Response({"detail": "No proposals found for this DAO on-chain."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            import logging
            logging.getLogger(__name__).exception("Failed to fetch latest proposal from chain")
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], url_path='latest')
    def latest_dao(self, request):
        """
        Finds the most recently created DAO from the chain, syncs it, and returns its ID.
        """
        from indexer.sync import _get_genlayer_client, sync_entity
        from django.conf import settings
        
        try:
            client = _get_genlayer_client()
            global_count = client.read_contract(
                address=settings.GENLAYER_CONTRACT_ADDRESS,
                function_name="get_dao_count",
                args=[]
            )
            
            if int(global_count) > 0:
                latest_id = int(global_count) - 1
                sync_entity("dao", latest_id, request.user.wallet_address if request.user.is_authenticated else "")
                return Response({"dao_id": latest_id})
                
            return Response({"detail": "No DAOs found on-chain."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            import logging
            logging.getLogger(__name__).exception("Failed to fetch latest DAO from chain")
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'], url_path='treasury/stats')
    def treasury_stats(self, request, pk=None):
        dao = self.get_object()
        latest = TreasuryStatsSnapshot.objects.filter(dao_id=dao.dao_id).order_by('-snapshot_at').first()
        if not latest:
            return Response(status=status.HTTP_404_NOT_FOUND)
        serializer = TreasuryStatsSnapshotSerializer(latest)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='treasury/history')
    def treasury_history(self, request, pk=None):
        from django.utils import timezone
        import datetime
        dao = self.get_object()
        
        days = request.query_params.get('days', 30)
        try:
            days = int(days)
        except ValueError:
            days = 30
            
        cutoff_date = timezone.now() - datetime.timedelta(days=days)
        snapshots = TreasuryStatsSnapshot.objects.filter(dao_id=dao.dao_id, snapshot_at__gte=cutoff_date).order_by('-snapshot_at')
        serializer = TreasuryStatsSnapshotSerializer(snapshots, many=True)
        return Response({'results': serializer.data})

    @action(detail=False, methods=['get'], url_path='global_stats')
    def global_stats(self, request):
        from django.db.models import DecimalField, Value
        from .models import DaoMemberCache
        
        total_ecosystems = DaoCache.objects.count()
        total_tvl = DaoCache.objects.aggregate(
            total_tvl=Coalesce(Sum('total_balance'), Value(0, output_field=DecimalField()), output_field=DecimalField())
        )['total_tvl']
        
        total_proposals = ProposalCache.objects.count()
        active_proposals = ProposalCache.objects.filter(status__in=[1, 3, 4]).count()
        
        total_funding_released = ProposalCache.objects.filter(status=7).aggregate(
            total=Coalesce(Sum('requested_amount'), Value(0, output_field=DecimalField()), output_field=DecimalField())
        )['total']
        
        total_escrowed = ProposalCache.objects.aggregate(
            total=Coalesce(Sum('escrowed_amount'), Value(0, output_field=DecimalField()), output_field=DecimalField())
        )['total']
        
        total_members = DaoMemberCache.objects.values('member_address').distinct().count()
        
        return Response({
            'total_ecosystems': total_ecosystems,
            'total_members': total_members,
            'total_tvl': str(total_tvl),
            'total_proposals': total_proposals,
            'active_proposals': active_proposals,
            'total_funding_released': str(total_funding_released),
            'total_escrowed': str(total_escrowed),
        })

    @action(detail=True, methods=['get'], url_path='detailed_stats')
    def detailed_stats(self, request, pk=None):
        from django.db.models import DecimalField, Value
        dao = self.get_object()
        
        total_funding_released = ProposalCache.objects.filter(dao_id=dao.dao_id, status=7).aggregate(
            total=Coalesce(Sum('requested_amount'), Value(0, output_field=DecimalField()), output_field=DecimalField())
        )['total']
        
        total_escrowed = ProposalCache.objects.filter(dao_id=dao.dao_id).aggregate(
            total=Coalesce(Sum('escrowed_amount'), Value(0, output_field=DecimalField()), output_field=DecimalField())
        )['total']
        
        all_time_inflows = dao.total_balance + total_escrowed + total_funding_released
        
        return Response({
            'total_funding_released': str(total_funding_released),
            'total_escrowed': str(total_escrowed),
            'all_time_inflows': str(all_time_inflows),
            'current_balance': str(dao.total_balance),
        })
