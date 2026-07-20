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
            # mock getting from contract via GenLayer SDK
            power = "100"
            cache.set(cache_key, power, timeout=300)
            
        return Response({"voting_power": power})

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
