"""
Tests for the indexer app: models, sync/diff logic, and the sync-request API endpoint.

Written TDD-first — these define the expected behavior before implementation.
"""
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from django.db import transaction
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch, MagicMock
import json

from indexer.models import RawStateSnapshot, SyncCursor
from indexer.sync import (
    _acquire_sync_lock,
    _release_sync_lock,
    _sync_single_dao,
    _sync_single_proposal,
    run_full_sync,
    sync_entity,
)
from daos.models import DaoCache, TreasuryStatsSnapshot
from proposals.models import ProposalCache, ProposalAuditLogEntry
from users.models import User

from rest_framework.test import APIClient
from rest_framework import status


# ---------------------------------------------------------------------------
# Helpers: sample chain data dicts matching get_dao()/get_proposal() shapes
# ---------------------------------------------------------------------------

def make_dao_chain_data(dao_id=0, **overrides):
    """Return a dict shaped like CovenantEscrow.get_dao() output."""
    data = {
        "dao_id": dao_id,
        "name": "Test DAO",
        "description": "A test DAO",
        "admin": "0xadmin",
        "quorum_bps": 1000,
        "approval_threshold_bps": 5000,
        "voting_period_seconds": 86400,
        "funding_cap_bps": 2000,
        "max_resubmissions": 3,
        "min_criteria_length": 10,
        "total_balance": 1000000,
        "total_voting_power": 2000000,
        "proposal_count": 5,
    }
    data.update(overrides)
    return data


def make_proposal_chain_data(proposal_id=0, dao_id=0, **overrides):
    """Return a dict shaped like CovenantEscrow.get_proposal() output."""
    data = {
        "proposal_id": proposal_id,
        "dao_id": dao_id,
        "contributor": "0xcontributor",
        "title": "Test Proposal",
        "description": "A test proposal",
        "deliverable_criteria": "Build something great",
        "requested_amount": 500000,
        "deadline": 9999999999,
        "status": 1,  # STATUS_OPEN_FOR_VOTING
        "yes_weight": 0,
        "no_weight": 0,
        "reclaim_yes_weight": 0,
        "reclaim_no_weight": 0,
        "reclaim_round": 0,
        "escrowed_amount": 0,
        "deliverable_url": "",
        "delivery_notes": "",
        "verdict_summary": "",
        "screening_rejection_reason": "",
        "reclaim_reason": "",
        "resubmission_count": 0,
        "submitted_at": 1700000000,
        "vote_ends_at": 1700086400,
        "reclaim_vote_ends_at": 0,
    }
    data.update(overrides)
    return data


# ===========================================================================
# Model Tests
# ===========================================================================

class RawStateSnapshotModelTest(TestCase):
    def test_creation(self):
        snapshot = RawStateSnapshot.objects.create(
            entity_type="dao",
            entity_id=0,
            raw_payload={"name": "Test"},
            trigger_source="celery_beat",
        )
        snapshot.refresh_from_db()
        self.assertEqual(snapshot.entity_type, "dao")
        self.assertEqual(snapshot.entity_id, 0)
        self.assertEqual(snapshot.raw_payload, {"name": "Test"})
        self.assertFalse(snapshot.processed)
        self.assertIsNotNone(snapshot.fetched_at)

    def test_trigger_source_default(self):
        snapshot = RawStateSnapshot.objects.create(
            entity_type="proposal",
            entity_id=1,
            raw_payload={"title": "Prop"},
        )
        snapshot.refresh_from_db()
        self.assertEqual(snapshot.trigger_source, "celery_beat")


class SyncCursorModelTest(TestCase):
    def test_creation_defaults(self):
        cursor = SyncCursor.objects.create()
        cursor.refresh_from_db()
        self.assertEqual(cursor.last_polled_dao_count, 0)
        self.assertEqual(cursor.last_polled_proposal_count, 0)
        self.assertIsNone(cursor.last_full_sync_at)
        self.assertFalse(cursor.is_syncing)
        self.assertIsNone(cursor.syncing_since)

    def test_stale_lock_detection(self):
        """A lock older than 5 minutes should be treated as stale."""
        cursor = SyncCursor.objects.create(
            is_syncing=True,
            syncing_since=timezone.now() - timedelta(minutes=6),
        )
        cursor.refresh_from_db()
        self.assertTrue(cursor.is_syncing)
        stale_threshold = timezone.now() - timedelta(minutes=5)
        self.assertTrue(cursor.syncing_since < stale_threshold)

    def test_fresh_lock_not_stale(self):
        """A lock younger than 5 minutes is NOT stale."""
        cursor = SyncCursor.objects.create(
            is_syncing=True,
            syncing_since=timezone.now() - timedelta(minutes=2),
        )
        stale_threshold = timezone.now() - timedelta(minutes=5)
        self.assertFalse(cursor.syncing_since < stale_threshold)


# ===========================================================================
# Sync Lock Tests
# ===========================================================================

class SyncLockTest(TransactionTestCase):
    def test_acquire_on_unlocked_cursor(self):
        """acquire should return True and set is_syncing + syncing_since."""
        SyncCursor.objects.create()
        result = _acquire_sync_lock()
        self.assertTrue(result)
        cursor = SyncCursor.objects.get()
        self.assertTrue(cursor.is_syncing)
        self.assertIsNotNone(cursor.syncing_since)

    def test_acquire_fails_on_fresh_lock(self):
        """acquire should return False when a fresh lock exists."""
        SyncCursor.objects.create(
            is_syncing=True,
            syncing_since=timezone.now() - timedelta(minutes=2),
        )
        result = _acquire_sync_lock()
        self.assertFalse(result)

    def test_acquire_clears_stale_lock(self):
        """acquire should clear a stale (>5 min) lock and proceed."""
        SyncCursor.objects.create(
            is_syncing=True,
            syncing_since=timezone.now() - timedelta(minutes=6),
        )
        with self.assertLogs('indexer.sync', level='WARNING') as cm:
            result = _acquire_sync_lock()
        self.assertTrue(result)
        self.assertTrue(any('stale' in msg.lower() for msg in cm.output))

    def test_release_clears_lock(self):
        SyncCursor.objects.create(
            is_syncing=True,
            syncing_since=timezone.now(),
        )
        _release_sync_lock()
        cursor = SyncCursor.objects.get()
        self.assertFalse(cursor.is_syncing)
        self.assertIsNone(cursor.syncing_since)

    def test_acquire_creates_cursor_if_missing(self):
        """First-ever sync should auto-create the SyncCursor row."""
        self.assertEqual(SyncCursor.objects.count(), 0)
        result = _acquire_sync_lock()
        self.assertTrue(result)
        self.assertEqual(SyncCursor.objects.count(), 1)


# ===========================================================================
# Diffing Logic Tests (the core correctness tests)
# ===========================================================================

class DaoSyncDiffTest(TransactionTestCase):
    @patch('indexer.sync._fetch_dao_from_chain')
    def test_new_dao_inserted(self, mock_fetch):
        """A DAO not yet in the DB should be created from chain data."""
        chain_data = make_dao_chain_data(dao_id=0)
        mock_fetch.return_value = chain_data

        _sync_single_dao(0)

        self.assertEqual(DaoCache.objects.count(), 1)
        dao = DaoCache.objects.get(dao_id=0)
        self.assertEqual(dao.name, "Test DAO")
        self.assertEqual(dao.total_balance, Decimal("1000000"))

    @patch('indexer.sync._fetch_dao_from_chain')
    def test_dao_updated_on_change(self, mock_fetch):
        """An existing DAO should be updated when chain data differs."""
        DaoCache.objects.create(
            dao_id=0, name="Old Name", description="Old", admin="0xadmin",
            quorum_bps=1000, approval_threshold_bps=5000,
            voting_period_seconds=86400, funding_cap_bps=2000,
            max_resubmissions=3, min_criteria_length=10,
            total_balance=Decimal("500000"), total_voting_power=Decimal("1000000"),
            proposal_count=3,
        )
        chain_data = make_dao_chain_data(dao_id=0, total_balance=999999, name="Updated DAO")
        mock_fetch.return_value = chain_data

        _sync_single_dao(0)

        dao = DaoCache.objects.get(dao_id=0)
        self.assertEqual(dao.name, "Updated DAO")
        self.assertEqual(dao.total_balance, Decimal("999999"))

    @patch('indexer.sync._fetch_dao_from_chain')
    def test_raw_snapshot_created(self, mock_fetch):
        """Every sync call should create a RawStateSnapshot for replay."""
        mock_fetch.return_value = make_dao_chain_data(dao_id=0)
        _sync_single_dao(0)

        snapshots = RawStateSnapshot.objects.filter(entity_type="dao", entity_id=0)
        self.assertEqual(snapshots.count(), 1)
        self.assertTrue(snapshots.first().processed)


class ProposalSyncDiffTest(TransactionTestCase):
    @patch('indexer.sync._fetch_proposal_from_chain')
    def test_new_proposal_inserted(self, mock_fetch):
        chain_data = make_proposal_chain_data(proposal_id=0)
        mock_fetch.return_value = chain_data

        _sync_single_proposal(0)

        self.assertEqual(ProposalCache.objects.count(), 1)
        prop = ProposalCache.objects.get(proposal_id=0)
        self.assertEqual(prop.title, "Test Proposal")

    @patch('indexer.sync._fetch_proposal_from_chain')
    def test_status_change_creates_audit_entry(self, mock_fetch):
        """When status changes, exactly ONE ProposalAuditLogEntry should be written."""
        ProposalCache.objects.create(
            proposal_id=0, dao_id=0, contributor="0xcontributor",
            title="Test", description="Desc", deliverable_criteria="Criteria",
            requested_amount=Decimal("500000"), deadline=timezone.now() + timedelta(days=30),
            status=1,  # OPEN_FOR_VOTING
            yes_weight=Decimal("0"), no_weight=Decimal("0"),
            reclaim_yes_weight=Decimal("0"), reclaim_no_weight=Decimal("0"),
            reclaim_round=0, escrowed_amount=Decimal("0"), resubmission_count=0,
        )
        # Chain now says status=3 (ESCROWED)
        chain_data = make_proposal_chain_data(proposal_id=0, status=3, escrowed_amount=500000)
        mock_fetch.return_value = chain_data

        _sync_single_proposal(0)

        entries = ProposalAuditLogEntry.objects.filter(proposal_id=0)
        self.assertEqual(entries.count(), 1)
        entry = entries.first()
        self.assertEqual(entry.from_status, 1)
        self.assertEqual(entry.to_status, 3)

    @patch('indexer.sync._fetch_proposal_from_chain')
    def test_no_change_creates_zero_audit_entries(self, mock_fetch):
        """Re-polling identical state should NOT create any audit entries."""
        ProposalCache.objects.create(
            proposal_id=0, dao_id=0, contributor="0xcontributor",
            title="Test Proposal", description="A test proposal",
            deliverable_criteria="Build something great",
            requested_amount=Decimal("500000"), deadline=timezone.now() + timedelta(days=30),
            status=1, yes_weight=Decimal("0"), no_weight=Decimal("0"),
            reclaim_yes_weight=Decimal("0"), reclaim_no_weight=Decimal("0"),
            reclaim_round=0, escrowed_amount=Decimal("0"), resubmission_count=0,
        )
        # Chain returns the exact same status=1
        chain_data = make_proposal_chain_data(proposal_id=0, status=1)
        mock_fetch.return_value = chain_data

        _sync_single_proposal(0)

        entries = ProposalAuditLogEntry.objects.filter(proposal_id=0)
        self.assertEqual(entries.count(), 0)

    @patch('indexer.sync._fetch_proposal_from_chain')
    def test_field_change_without_status_change_updates_cache_no_audit(self, mock_fetch):
        """Non-status field changes should update cache but NOT create audit entries."""
        ProposalCache.objects.create(
            proposal_id=0, dao_id=0, contributor="0xcontributor",
            title="Test Proposal", description="A test proposal",
            deliverable_criteria="Build something great",
            requested_amount=Decimal("500000"), deadline=timezone.now() + timedelta(days=30),
            status=1, yes_weight=Decimal("0"), no_weight=Decimal("0"),
            reclaim_yes_weight=Decimal("0"), reclaim_no_weight=Decimal("0"),
            reclaim_round=0, escrowed_amount=Decimal("0"), resubmission_count=0,
        )
        # Chain returns same status=1 but yes_weight changed (votes came in)
        chain_data = make_proposal_chain_data(proposal_id=0, status=1, yes_weight=300000)
        mock_fetch.return_value = chain_data

        _sync_single_proposal(0)

        prop = ProposalCache.objects.get(proposal_id=0)
        self.assertEqual(prop.yes_weight, Decimal("300000"))
        entries = ProposalAuditLogEntry.objects.filter(proposal_id=0)
        self.assertEqual(entries.count(), 0)

    @patch('indexer.sync._fetch_proposal_from_chain')
    def test_raw_snapshot_created_for_proposal(self, mock_fetch):
        mock_fetch.return_value = make_proposal_chain_data(proposal_id=0)
        _sync_single_proposal(0)

        snapshots = RawStateSnapshot.objects.filter(entity_type="proposal", entity_id=0)
        self.assertEqual(snapshots.count(), 1)


# ===========================================================================
# Full Sync Tests (beat tick integration)
# ===========================================================================

class FullSyncTest(TransactionTestCase):
    @patch('indexer.sync._fetch_proposal_from_chain')
    @patch('indexer.sync._fetch_dao_from_chain')
    @patch('indexer.sync._fetch_proposal_count_from_chain')
    @patch('indexer.sync._fetch_dao_count_from_chain')
    def test_full_sync_discovers_new_entities(
        self, mock_dao_count, mock_proposal_count, mock_dao_fetch, mock_proposal_fetch
    ):
        """Full sync should discover and insert newly created DAOs/proposals."""
        mock_dao_count.return_value = 1
        mock_proposal_count.return_value = 1
        mock_dao_fetch.return_value = make_dao_chain_data(dao_id=0)
        mock_proposal_fetch.return_value = make_proposal_chain_data(proposal_id=0)

        run_full_sync()

        self.assertEqual(DaoCache.objects.count(), 1)
        self.assertEqual(ProposalCache.objects.count(), 1)
        cursor = SyncCursor.objects.get()
        self.assertEqual(cursor.last_polled_dao_count, 1)
        self.assertEqual(cursor.last_polled_proposal_count, 1)
        self.assertIsNotNone(cursor.last_full_sync_at)
        self.assertFalse(cursor.is_syncing)  # Lock released

    @patch('indexer.sync._fetch_proposal_from_chain')
    @patch('indexer.sync._fetch_dao_from_chain')
    @patch('indexer.sync._fetch_proposal_count_from_chain')
    @patch('indexer.sync._fetch_dao_count_from_chain')
    def test_full_sync_creates_treasury_snapshots(
        self, mock_dao_count, mock_proposal_count, mock_dao_fetch, mock_proposal_fetch
    ):
        """At the end of a full sync, one TreasuryStatsSnapshot per DAO should be created."""
        mock_dao_count.return_value = 2
        mock_proposal_count.return_value = 0
        mock_dao_fetch.side_effect = [
            make_dao_chain_data(dao_id=0, total_balance=1000, proposal_count=3),
            make_dao_chain_data(dao_id=1, name="DAO Two", total_balance=2000, proposal_count=1),
        ]

        run_full_sync()

        snapshots = TreasuryStatsSnapshot.objects.all().order_by('dao_id')
        self.assertEqual(snapshots.count(), 2)
        self.assertEqual(snapshots[0].dao_id, 0)
        self.assertEqual(snapshots[0].total_balance, Decimal("1000"))
        self.assertEqual(snapshots[1].dao_id, 1)
        self.assertEqual(snapshots[1].total_balance, Decimal("2000"))


# ===========================================================================
# Out-of-Cycle Sync Entity Test
# ===========================================================================

class SyncEntityTest(TransactionTestCase):
    @patch('indexer.sync._fetch_proposal_from_chain')
    def test_sync_entity_proposal(self, mock_fetch):
        """sync_entity should sync a single proposal without creating TreasuryStatsSnapshot."""
        mock_fetch.return_value = make_proposal_chain_data(proposal_id=5)

        sync_entity("proposal", 5)

        self.assertEqual(ProposalCache.objects.filter(proposal_id=5).count(), 1)
        # No TreasuryStatsSnapshot — that's only for full syncs
        self.assertEqual(TreasuryStatsSnapshot.objects.count(), 0)

    @patch('indexer.sync._fetch_dao_from_chain')
    def test_sync_entity_dao(self, mock_fetch):
        mock_fetch.return_value = make_dao_chain_data(dao_id=3)
        sync_entity("dao", 3)
        self.assertEqual(DaoCache.objects.filter(dao_id=3).count(), 1)


# ===========================================================================
# Sync-Request Endpoint Tests
# ===========================================================================

class SyncRequestEndpointTest(TransactionTestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(wallet_address="0xendpointuser")
        self.url = "/api/indexer/sync-request/"

    def test_unauthenticated_returns_401(self):
        response = self.client.post(
            self.url,
            {"entity_type": "proposal", "entity_id": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch('indexer.views.sync_entity')
    def test_authenticated_request_triggers_sync(self, mock_sync):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            self.url,
            {"entity_type": "proposal", "entity_id": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_sync.assert_called_once_with("proposal", 1)

    def test_invalid_entity_type_returns_400(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            self.url,
            {"entity_type": "invalid_thing", "entity_id": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_fields_returns_400(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
