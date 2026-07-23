from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import permissions, status
from django.core.cache import cache
from .models import DaoCache, TreasuryStatsSnapshot
from .serializers import DaoCacheSerializer, DaoPrepareCreateSerializer, TreasuryStatsSnapshotSerializer

class DaoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DaoCache.objects.all()
    serializer_class = DaoCacheSerializer

    @action(detail=False, methods=['post'], url_path='prepare-create')
    def prepare_create(self, request):
        serializer = DaoPrepareCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        
        # GenVM arguments list expected by create_dao
        args = [
            data.get('name'),
            data.get('description', ''),
            data.get('admin'),
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
        cache_key = f'voting_power_{dao.dao_id}_{request.user.wallet_address}'
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
        dao = self.get_object()
        snapshots = TreasuryStatsSnapshot.objects.filter(dao_id=dao.dao_id).order_by('-snapshot_at')
        serializer = TreasuryStatsSnapshotSerializer(snapshots, many=True)
        return Response({'results': serializer.data})
