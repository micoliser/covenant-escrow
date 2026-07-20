from django.test import TestCase
from django.utils import timezone
from django.db import IntegrityError, transaction
from datetime import timedelta
from proposals.models import (
    ProposalCache, ProposalDraft, VoteCache,
    Comment, Notification, ProposalAuditLogEntry
)
from users.models import User
from decimal import Decimal
from django.contrib.postgres.search import SearchVector

class ProposalsModelsTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(wallet_address="0xuser123")

    def test_proposal_cache_creation(self):
        proposal = ProposalCache.objects.create(
            proposal_id=1,
            dao_id=1,
            contributor="0xuser123",
            title="Test Proposal",
            description="Test Description",
            deliverable_criteria="Test Criteria",
            requested_amount=Decimal("1000000000000000000"),
            deadline=timezone.now() + timedelta(days=30),
            status=1, # e.g. STATUS_PENDING_SCREENING
            yes_weight=Decimal("0"),
            no_weight=Decimal("0"),
            reclaim_yes_weight=Decimal("0"),
            reclaim_no_weight=Decimal("0"),
            reclaim_round=0,
            escrowed_amount=Decimal("0"),
            resubmission_count=0
        )
        proposal.refresh_from_db()
        self.assertEqual(proposal.title, "Test Proposal")
        self.assertEqual(proposal.requested_amount, Decimal("1000000000000000000"))

    def test_proposal_search(self):
        proposal1 = ProposalCache.objects.create(
            proposal_id=101, dao_id=1, contributor="0x1", title="Quantum Computing Research", description="Advancing qubits.", deliverable_criteria="C",
            requested_amount=Decimal("0"), deadline=timezone.now(), status=0, yes_weight=Decimal("0"), no_weight=Decimal("0"),
            reclaim_yes_weight=Decimal("0"), reclaim_no_weight=Decimal("0"), reclaim_round=0, escrowed_amount=Decimal("0"), resubmission_count=0
        )
        proposal2 = ProposalCache.objects.create(
            proposal_id=102, dao_id=1, contributor="0x1", title="AI Alignment Protocol", description="Ensuring safety.", deliverable_criteria="C",
            requested_amount=Decimal("0"), deadline=timezone.now(), status=0, yes_weight=Decimal("0"), no_weight=Decimal("0"),
            reclaim_yes_weight=Decimal("0"), reclaim_no_weight=Decimal("0"), reclaim_round=0, escrowed_amount=Decimal("0"), resubmission_count=0
        )
        
        # Populate search vector manually for testing
        ProposalCache.objects.update(search_vector=SearchVector('title', 'description'))

        # Run full-text search
        results = ProposalCache.objects.filter(search_vector='quantum')
        self.assertEqual(results.count(), 1)
        self.assertEqual(results.first().proposal_id, 101)

        results_ai = ProposalCache.objects.filter(search_vector='safety')
        self.assertEqual(results_ai.count(), 1)
        self.assertEqual(results_ai.first().proposal_id, 102)

    def test_proposal_draft_creation(self):
        draft = ProposalDraft.objects.create(
            contributor=self.user,
            dao_id=1,
            title="Draft Title",
            description="Draft Desc",
            deliverable_criteria="Draft Criteria",
            requested_amount=Decimal("500000000000000000"),
            deadline=timezone.now() + timedelta(days=15)
        )
        draft.refresh_from_db()
        self.assertEqual(draft.title, "Draft Title")
        self.assertEqual(draft.contributor, self.user)
        self.assertEqual(draft.requested_amount, Decimal("500000000000000000"))

    def test_votecache_creation_and_unique_constraint(self):
        vote = VoteCache.objects.create(
            proposal_id=1,
            voter_address="0xvoter",
            vote_type="fund",
            reclaim_round=0,
            support=True,
            weight=Decimal("500")
        )
        vote.refresh_from_db()
        self.assertTrue(vote.support)
        self.assertEqual(vote.weight, Decimal("500"))

        # Test unique_together constraint
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                VoteCache.objects.create(
                    proposal_id=1,
                    voter_address="0xvoter",
                    vote_type="fund",
                    reclaim_round=0,
                    support=False,
                    weight=Decimal("1000")
                )

        # But a different round should work
        vote2 = VoteCache.objects.create(
            proposal_id=1,
            voter_address="0xvoter",
            vote_type="fund",
            reclaim_round=1,
            support=False,
            weight=Decimal("1000")
        )
        self.assertEqual(vote2.reclaim_round, 1)

    def test_comment_creation(self):
        proposal = ProposalCache.objects.create(
            proposal_id=2, dao_id=1, contributor="0x1", title="A", description="B", deliverable_criteria="C",
            requested_amount=Decimal("0"), deadline=timezone.now(), status=0, yes_weight=Decimal("0"), no_weight=Decimal("0"),
            reclaim_yes_weight=Decimal("0"), reclaim_no_weight=Decimal("0"), reclaim_round=0, escrowed_amount=Decimal("0"), resubmission_count=0
        )
        comment = Comment.objects.create(
            proposal=proposal,
            author=self.user,
            body="This is a test comment"
        )
        self.assertEqual(comment.body, "This is a test comment")
        self.assertFalse(comment.is_hidden)

    def test_notification_creation(self):
        notification = Notification.objects.create(
            user=self.user,
            type="proposal_passed"
        )
        self.assertEqual(notification.type, "proposal_passed")
        self.assertIsNone(notification.read_at)

    def test_audit_log_entry_creation(self):
        log_entry = ProposalAuditLogEntry.objects.create(
            proposal_id=1,
            from_status=0,
            to_status=1,
            chain_tx_hash="0xhash123"
        )
        self.assertEqual(log_entry.chain_tx_hash, "0xhash123")
