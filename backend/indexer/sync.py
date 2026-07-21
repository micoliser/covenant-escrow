"""
Poll-and-diff sync engine for GenLayer's CovenantEscrow contract.

GenLayer does not expose event/log subscriptions — state changes are
detected by polling get_dao(id)/get_proposal(id) and diffing against
the local DaoCache/ProposalCache rows.
"""
import logging
from datetime import timedelta, datetime, timezone as dt_timezone
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from django.conf import settings

from genlayer_py import create_client
from genlayer_py.chains import studionet

def _normalize_address(addr) -> str:
    if hasattr(addr, 'as_hex'):
        return addr.as_hex.lower()
    return str(addr).lower()
from eth_account import Account

from indexer.models import RawStateSnapshot, SyncCursor
from daos.models import DaoCache, TreasuryStatsSnapshot
from proposals.models import ProposalCache, ProposalAuditLogEntry, VoteCache

logger = logging.getLogger(__name__)

# How long before we treat a sync lock as stale (crashed worker).
STALE_LOCK_THRESHOLD = timedelta(minutes=5)


# ---------------------------------------------------------------------------
# Chain-fetch stubs — these wrap the actual GenLayer RPC calls.
# Tests mock these; in production they call the real contract.
# ---------------------------------------------------------------------------

# genlayer-py SDK requires an account even for read_contract (it requires a 'from' address),
# but since this is read-only, it doesn't need to be funded or persist.
_DUMMY_ACCOUNT = Account.create()

def _get_genlayer_client():
    return create_client(chain=studionet, account=_DUMMY_ACCOUNT)

def _fetch_dao_count_from_chain() -> int:
    """Call CovenantEscrow.get_dao_count() on studionet."""
    client = _get_genlayer_client()
    return client.read_contract(
        address=settings.GENLAYER_CONTRACT_ADDRESS,
        function_name="get_dao_count",
        args=[]
    )


def _fetch_proposal_count_from_chain() -> int:
    """Call CovenantEscrow.get_proposal_count() on studionet."""
    client = _get_genlayer_client()
    return client.read_contract(
        address=settings.GENLAYER_CONTRACT_ADDRESS,
        function_name="get_proposal_count",
        args=[]
    )


def _fetch_dao_from_chain(dao_id: int) -> dict:
    """Call CovenantEscrow.get_dao(dao_id) on studionet."""
    client = _get_genlayer_client()
    return client.read_contract(
        address=settings.GENLAYER_CONTRACT_ADDRESS,
        function_name="get_dao",
        args=[dao_id]
    )


def _fetch_proposal_from_chain(proposal_id: int) -> dict:
    """Call CovenantEscrow.get_proposal(proposal_id) on studionet."""
    client = _get_genlayer_client()
    return client.read_contract(
        address=settings.GENLAYER_CONTRACT_ADDRESS,
        function_name="get_proposal",
        args=[proposal_id]
    )


def _fetch_voters_from_chain(proposal_id: int) -> list:
    """Call CovenantEscrow.get_voters(proposal_id) on studionet."""
    client = _get_genlayer_client()
    return client.read_contract(
        address=settings.GENLAYER_CONTRACT_ADDRESS,
        function_name="get_voters",
        args=[proposal_id]
    )


def _fetch_vote_from_chain(proposal_id: int, vote_type: str, address: str) -> dict:
    """Call CovenantEscrow.get_vote(...) on studionet."""
    client = _get_genlayer_client()
    return client.read_contract(
        address=settings.GENLAYER_CONTRACT_ADDRESS,
        function_name="get_vote",
        args=[proposal_id, vote_type, address]
    )


# ---------------------------------------------------------------------------
# Sync Lock
# ---------------------------------------------------------------------------

def _acquire_sync_lock() -> bool:
    """
    Attempt to acquire the sync mutex.  Returns True if acquired.

    If a prior task crashed and left the lock held for >5 minutes,
    we treat that as stale, log a warning, clear it, and proceed.

    Creates the SyncCursor singleton if it doesn't exist yet.
    """
    cursor = SyncCursor.objects.first()
    if cursor is None:
        cursor = SyncCursor.objects.create()

    if cursor.is_syncing:
        if (
            cursor.syncing_since
            and cursor.syncing_since < timezone.now() - STALE_LOCK_THRESHOLD
        ):
            logger.warning(
                "Stale sync lock detected (held since %s). "
                "Clearing and proceeding — the prior task likely crashed.",
                cursor.syncing_since,
            )
            # Fall through to acquire
        else:
            return False

    cursor.is_syncing = True
    cursor.syncing_since = timezone.now()
    cursor.save(update_fields=['is_syncing', 'syncing_since'])
    return True


def _release_sync_lock():
    """Release the sync mutex."""
    SyncCursor.objects.all().update(
        is_syncing=False,
        syncing_since=None,
    )


# ---------------------------------------------------------------------------
# Single-entity sync (used by both full sync and out-of-cycle resync)
# ---------------------------------------------------------------------------

def _sync_proposal_votes(proposal_id: int, reclaim_round: int):
    """
    Fetch the list of voters for a proposal, then fetch each vote (fund & reclaim)
    and upsert into VoteCache with atomic locking.
    """
    voters = _fetch_voters_from_chain(proposal_id)
    if not voters:
        return
        
    for chain_voter_address in voters:
        voter_address = _normalize_address(chain_voter_address)
        for vote_type in ["fund", "reclaim"]:
            chain_vote = _fetch_vote_from_chain(proposal_id, vote_type, chain_voter_address)
            if chain_vote is not None:
                vote_round = reclaim_round if vote_type == "reclaim" else 0
                with transaction.atomic():
                    try:
                        existing = (
                            VoteCache.objects
                            .select_for_update()
                            .get(
                                proposal_id=proposal_id,
                                voter_address=voter_address,
                                vote_type=vote_type,
                                reclaim_round=vote_round
                            )
                        )
                        existing.support = chain_vote["support"]
                        existing.weight = Decimal(str(chain_vote["weight"]))
                        existing.voted_at = _timestamp_to_datetime(chain_vote["voted_at"])
                        existing.save()
                    except VoteCache.DoesNotExist:
                        VoteCache.objects.create(
                            proposal_id=proposal_id,
                            voter_address=voter_address,
                            vote_type=vote_type,
                            reclaim_round=vote_round,
                            support=chain_vote["support"],
                            weight=Decimal(str(chain_vote["weight"])),
                            voted_at=_timestamp_to_datetime(chain_vote["voted_at"]),
                        )


def _sync_single_dao(dao_id: int, trigger_source: str = "celery_beat"):
    """
    Fetch a single DAO from chain, diff against cache, and upsert.
    Uses select_for_update() to prevent races with concurrent resyncs.
    """
    chain_data = _fetch_dao_from_chain(dao_id)

    # Record raw snapshot for replay
    snapshot = RawStateSnapshot.objects.create(
        entity_type="dao",
        entity_id=dao_id,
        raw_payload=chain_data,
        trigger_source=trigger_source,
    )

    with transaction.atomic():
        try:
            existing = (
                DaoCache.objects
                .select_for_update()
                .get(dao_id=dao_id)
            )
            # Update all fields from chain data
            existing.name = chain_data["name"]
            existing.description = chain_data.get("description", "")
            existing.admin = _normalize_address(chain_data["admin"])
            existing.quorum_bps = chain_data["quorum_bps"]
            existing.approval_threshold_bps = chain_data["approval_threshold_bps"]
            existing.voting_period_seconds = chain_data["voting_period_seconds"]
            existing.funding_cap_bps = chain_data["funding_cap_bps"]
            existing.max_resubmissions = chain_data["max_resubmissions"]
            existing.min_criteria_length = chain_data["min_criteria_length"]
            existing.total_balance = Decimal(str(chain_data["total_balance"]))
            existing.total_voting_power = Decimal(str(chain_data["total_voting_power"]))
            existing.proposal_count = chain_data["proposal_count"]
            existing.save()
        except DaoCache.DoesNotExist:
            DaoCache.objects.create(
                dao_id=dao_id,
                name=chain_data["name"],
                description=chain_data.get("description", ""),
                admin=_normalize_address(chain_data["admin"]),
                quorum_bps=chain_data["quorum_bps"],
                approval_threshold_bps=chain_data["approval_threshold_bps"],
                voting_period_seconds=chain_data["voting_period_seconds"],
                funding_cap_bps=chain_data["funding_cap_bps"],
                max_resubmissions=chain_data["max_resubmissions"],
                min_criteria_length=chain_data["min_criteria_length"],
                total_balance=Decimal(str(chain_data["total_balance"])),
                total_voting_power=Decimal(str(chain_data["total_voting_power"])),
                proposal_count=chain_data["proposal_count"],
            )

    snapshot.processed = True
    snapshot.save(update_fields=['processed'])


def _sync_single_proposal(proposal_id: int, trigger_source: str = "celery_beat"):
    """
    Fetch a single proposal from chain, diff against cache, and upsert.
    If status changed, writes a ProposalAuditLogEntry.
    Uses select_for_update() to prevent races with concurrent resyncs.
    """
    chain_data = _fetch_proposal_from_chain(proposal_id)

    # Record raw snapshot for replay
    snapshot = RawStateSnapshot.objects.create(
        entity_type="proposal",
        entity_id=proposal_id,
        raw_payload=chain_data,
        trigger_source=trigger_source,
    )

    new_status = chain_data["status"]

    with transaction.atomic():
        try:
            existing = (
                ProposalCache.objects
                .select_for_update()
                .get(proposal_id=proposal_id)
            )
            old_status = existing.status

            # Update all fields from chain data
            existing.dao_id = chain_data["dao_id"]
            existing.contributor = _normalize_address(chain_data["contributor"])
            existing.title = chain_data["title"]
            existing.description = chain_data["description"]
            existing.deliverable_criteria = chain_data["deliverable_criteria"]
            existing.requested_amount = Decimal(str(chain_data["requested_amount"]))
            existing.deadline = _timestamp_to_datetime(chain_data["deadline"])
            existing.status = new_status
            existing.yes_weight = Decimal(str(chain_data["yes_weight"]))
            existing.no_weight = Decimal(str(chain_data["no_weight"]))
            existing.reclaim_yes_weight = Decimal(str(chain_data["reclaim_yes_weight"]))
            existing.reclaim_no_weight = Decimal(str(chain_data["reclaim_no_weight"]))
            existing.reclaim_round = chain_data["reclaim_round"]
            existing.escrowed_amount = Decimal(str(chain_data["escrowed_amount"]))
            existing.deliverable_url = chain_data.get("deliverable_url", "")
            existing.delivery_notes = chain_data.get("delivery_notes", "")
            existing.verdict_summary = chain_data.get("verdict_summary", "")
            existing.screening_rejection_reason = chain_data.get("screening_rejection_reason", "")
            existing.reclaim_reason = chain_data.get("reclaim_reason", "")
            existing.resubmission_count = chain_data["resubmission_count"]
            existing.submitted_at = _timestamp_to_datetime(chain_data["submitted_at"])
            existing.vote_ends_at = _timestamp_to_datetime_or_none(chain_data["vote_ends_at"])
            existing.reclaim_vote_ends_at = _timestamp_to_datetime_or_none(chain_data["reclaim_vote_ends_at"])
            existing.save()

            # Audit log on status transition
            if old_status != new_status:
                ProposalAuditLogEntry.objects.create(
                    proposal_id=proposal_id,
                    from_status=old_status,
                    to_status=new_status,
                )

        except ProposalCache.DoesNotExist:
            ProposalCache.objects.create(
                proposal_id=proposal_id,
                dao_id=chain_data["dao_id"],
                contributor=_normalize_address(chain_data["contributor"]),
                title=chain_data["title"],
                description=chain_data["description"],
                deliverable_criteria=chain_data["deliverable_criteria"],
                requested_amount=Decimal(str(chain_data["requested_amount"])),
                deadline=_timestamp_to_datetime(chain_data["deadline"]),
                status=new_status,
                yes_weight=Decimal(str(chain_data["yes_weight"])),
                no_weight=Decimal(str(chain_data["no_weight"])),
                reclaim_yes_weight=Decimal(str(chain_data["reclaim_yes_weight"])),
                reclaim_no_weight=Decimal(str(chain_data["reclaim_no_weight"])),
                reclaim_round=chain_data["reclaim_round"],
                escrowed_amount=Decimal(str(chain_data["escrowed_amount"])),
                deliverable_url=chain_data.get("deliverable_url", ""),
                delivery_notes=chain_data.get("delivery_notes", ""),
                verdict_summary=chain_data.get("verdict_summary", ""),
                screening_rejection_reason=chain_data.get("screening_rejection_reason", ""),
                reclaim_reason=chain_data.get("reclaim_reason", ""),
                resubmission_count=chain_data["resubmission_count"],
                submitted_at=_timestamp_to_datetime(chain_data["submitted_at"]),
                vote_ends_at=_timestamp_to_datetime_or_none(chain_data["vote_ends_at"]),
                reclaim_vote_ends_at=_timestamp_to_datetime_or_none(chain_data["reclaim_vote_ends_at"]),
            )
            # No audit log for first-ever insertion — there's no "from" status

    _sync_proposal_votes(proposal_id, chain_data["reclaim_round"])

    snapshot.processed = True
    snapshot.save(update_fields=['processed'])


# ---------------------------------------------------------------------------
# Full sync (Celery beat tick)
# ---------------------------------------------------------------------------

def run_full_sync():
    """
    Full poll-and-diff cycle. Called from the Celery beat task.

    1. Acquire the sync lock (with stale-lock recovery).
    2. Query dao_count/proposal_count to discover new entity IDs.
    3. For every known + new DAO/proposal, re-fetch and diff.
    4. At the end, create one TreasuryStatsSnapshot per DAO.
    5. Update SyncCursor high-water marks and release the lock.
    """
    if not _acquire_sync_lock():
        logger.info("Sync already in progress, skipping this tick.")
        return

    try:
        cursor = SyncCursor.objects.first()

        # -- Discovery --
        chain_dao_count = _fetch_dao_count_from_chain()
        chain_proposal_count = _fetch_proposal_count_from_chain()

        # -- Sync all DAOs (existing + new) --
        for dao_id in range(chain_dao_count):
            try:
                _sync_single_dao(dao_id, trigger_source="celery_beat")
            except Exception:
                logger.exception("Failed to sync DAO %d", dao_id)

        # -- Sync all proposals (existing + new) --
        for proposal_id in range(chain_proposal_count):
            try:
                _sync_single_proposal(proposal_id, trigger_source="celery_beat")
            except Exception:
                logger.exception("Failed to sync proposal %d", proposal_id)

        # -- Treasury snapshots (only on full beat-tick syncs) --
        _create_treasury_snapshots()

        # -- Update cursor --
        cursor.last_polled_dao_count = chain_dao_count
        cursor.last_polled_proposal_count = chain_proposal_count
        cursor.last_full_sync_at = timezone.now()
        cursor.save(update_fields=[
            'last_polled_dao_count',
            'last_polled_proposal_count',
            'last_full_sync_at',
        ])

    finally:
        _release_sync_lock()


def _create_treasury_snapshots():
    """
    Create one TreasuryStatsSnapshot per DAO from the current DaoCache state.
    Called only at the end of a full beat-tick sync — NOT on out-of-cycle resyncs,
    to avoid creating uneven-interval noise in the time series.
    """
    for dao in DaoCache.objects.all():
        active_count = ProposalCache.objects.filter(
            dao_id=dao.dao_id,
            status__in=[1, 3, 4],  # OPEN_FOR_VOTING, ESCROWED, VERIFICATION_FAILED
        ).count()

        # member_count = distinct depositors. For now we use the DAO's
        # proposal_count as a proxy — the real member count requires
        # scanning the voting_power map, which isn't exposed by the contract.
        # This will be refined when we add a dedicated view or index deposits.
        TreasuryStatsSnapshot.objects.create(
            dao_id=dao.dao_id,
            total_balance=dao.total_balance,
            member_count=0,  # Placeholder — needs deposit tracking
            active_proposal_count=active_count,
        )


# ---------------------------------------------------------------------------
# Out-of-cycle single-entity resync
# ---------------------------------------------------------------------------

def sync_entity(entity_type: str, entity_id: int, user_address: str = None):
    """
    Resync a single entity on demand (called from the sync-request endpoint).
    Does NOT create TreasuryStatsSnapshots to avoid uneven-interval noise.
    Uses select_for_update via the underlying _sync_single_* functions.
    """
    if entity_type == "dao":
        _sync_single_dao(entity_id, trigger_source="api")
        if user_address:
            from django.core.cache import cache
            cache.delete(f'voting_power_{entity_id}_{user_address.lower()}')
    elif entity_type == "proposal":
        _sync_single_proposal(entity_id, trigger_source="api")
    else:
        raise ValueError(f"Unknown entity_type: {entity_type}")


# ---------------------------------------------------------------------------
# Timestamp helpers
# ---------------------------------------------------------------------------

def _timestamp_to_datetime(ts):
    """Convert a Unix timestamp (int) to a timezone-aware datetime."""
    return datetime.fromtimestamp(int(ts), tz=dt_timezone.utc)


def _timestamp_to_datetime_or_none(ts):
    """Convert a Unix timestamp to datetime, or None if 0 / falsy."""
    if not ts:
        return None
    return _timestamp_to_datetime(ts)
