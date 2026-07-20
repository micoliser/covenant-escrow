from django.db import models
from django.utils import timezone


class RawStateSnapshot(models.Model):
    """
    Immutable audit trail of raw data fetched from the GenLayer contract.
    Each poll cycle (or out-of-cycle resync) records the exact dict returned
    by get_dao(id) or get_proposal(id) so parsing bugs can be replayed later.
    """
    entity_type = models.CharField(max_length=20)  # 'dao' or 'proposal'
    entity_id = models.BigIntegerField()
    raw_payload = models.JSONField()
    fetched_at = models.DateTimeField(default=timezone.now)
    processed = models.BooleanField(default=False)
    trigger_source = models.CharField(max_length=50, default='celery_beat')

    class Meta:
        indexes = [
            models.Index(fields=['entity_type', 'entity_id', 'fetched_at']),
        ]

    def __str__(self):
        return f"{self.entity_type}#{self.entity_id} @ {self.fetched_at}"


class SyncCursor(models.Model):
    """
    Singleton row tracking the indexer's high-water marks and sync mutex.

    last_polled_dao_count / last_polled_proposal_count tell us which entity
    IDs we've already seen, so we only fetch new ones on the next tick.

    is_syncing + syncing_since implement a stale-lock pattern: if a prior
    Celery task crashes without releasing the lock, the next tick can detect
    the stale lock (older than 5 minutes), clear it, and proceed.
    """
    last_polled_dao_count = models.BigIntegerField(default=0)
    last_polled_proposal_count = models.BigIntegerField(default=0)
    last_full_sync_at = models.DateTimeField(null=True, blank=True)
    is_syncing = models.BooleanField(default=False)
    syncing_since = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return (
            f"SyncCursor(daos={self.last_polled_dao_count}, "
            f"proposals={self.last_polled_proposal_count})"
        )
