from django.test import TestCase
from django.utils import timezone
from daos.models import DaoCache, TreasuryStatsSnapshot
from decimal import Decimal

class DaoCacheModelTest(TestCase):
    def test_daocache_creation(self):
        dao = DaoCache.objects.create(
            dao_id=1,
            name="Test DAO",
            description="A DAO for testing",
            admin="0xabc123",
            quorum_bps=1000,
            approval_threshold_bps=5000,
            voting_period_seconds=86400,
            funding_cap_bps=2000,
            max_resubmissions=3,
            min_criteria_length=10,
            total_balance=Decimal("1000000000000000000"),
            total_voting_power=Decimal("500000000000000000"),
            proposal_count=5
        )
        dao.refresh_from_db()
        self.assertEqual(dao.name, "Test DAO")
        self.assertEqual(dao.total_balance, Decimal("1000000000000000000"))
        self.assertEqual(dao.total_voting_power, Decimal("500000000000000000"))
        self.assertIsNotNone(dao.created_at)
        self.assertIsNotNone(dao.last_synced_at)

class TreasuryStatsSnapshotModelTest(TestCase):
    def test_treasury_stats_snapshot_creation(self):
        snapshot = TreasuryStatsSnapshot.objects.create(
            dao_id=1,
            total_balance=Decimal("2000000000000000000"),
            member_count=50,
            active_proposal_count=2
        )
        snapshot.refresh_from_db()
        self.assertEqual(snapshot.dao_id, 1)
        self.assertEqual(snapshot.total_balance, Decimal("2000000000000000000"))
        self.assertIsNotNone(snapshot.snapshot_at)
