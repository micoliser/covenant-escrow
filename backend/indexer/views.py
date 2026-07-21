"""
Sync-request API endpoint.

POST /api/indexer/sync-request/
Allows authenticated users to trigger an out-of-cycle resync of a single
entity immediately after their own wallet transaction succeeds, rather than
waiting for the next Celery beat tick.
"""
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import UserRateThrottle

from indexer.sync import sync_entity

logger = logging.getLogger(__name__)


class SyncRequestThrottle(UserRateThrottle):
    """Per-user rate limit for sync requests — protects the GenLayer RPC."""
    rate = '10/minute'


class SyncRequestSerializer(serializers.Serializer):
    entity_type = serializers.ChoiceField(choices=['dao', 'proposal'])
    entity_id = serializers.IntegerField(min_value=0)


class SyncRequestView(APIView):
    """
    Trigger an out-of-cycle resync of a single DAO or proposal.

    The frontend should call this immediately after the user's wallet
    signs a write transaction, so the UI reflects the change without
    waiting for the next poll interval.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [SyncRequestThrottle]

    def post(self, request):
        serializer = SyncRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        entity_type = serializer.validated_data['entity_type']
        entity_id = serializer.validated_data['entity_id']

        try:
            sync_entity(entity_type, entity_id, request.user.wallet_address)
        except Exception:
            logger.exception(
                "Sync-request failed for %s#%d", entity_type, entity_id
            )
            return Response(
                {"detail": "Sync failed. The entity may not exist on-chain yet."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {"detail": f"Synced {entity_type}#{entity_id} successfully."},
            status=status.HTTP_200_OK,
        )
