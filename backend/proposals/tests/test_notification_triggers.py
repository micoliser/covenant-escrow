from django.test import TestCase
from django.utils import timezone
from users.models import User
from proposals.models import ProposalCache, Notification, Comment
from indexer.sync import _create_status_notification
from decimal import Decimal

class NotificationTriggerTests(TestCase):
    def setUp(self):
        self.user1 = User.objects.create(wallet_address="0x123")
        self.user2 = User.objects.create(wallet_address="0x456")

        self.proposal = ProposalCache.objects.create(
            proposal_id=1,
            dao_id=1,
            contributor="0x123",
            title="Test Proposal",
            description="Test Description",
            requested_amount=Decimal("100"),
            deadline=timezone.now(),
            status=1,
            yes_weight=Decimal("0"),
            no_weight=Decimal("0"),
            reclaim_yes_weight=Decimal("0"),
            reclaim_no_weight=Decimal("0"),
            reclaim_round=0,
            escrowed_amount=Decimal("0"),
            resubmission_count=0,
            submitted_at=timezone.now()
        )

    def test_status_rejected_initial(self):
        _create_status_notification(1, 1, "0x123", None, 0)
        self.assertTrue(Notification.objects.filter(user=self.user1, type='status_rejected').exists())

    def test_status_approved_initial(self):
        _create_status_notification(1, 1, "0x123", None, 1)
        self.assertTrue(Notification.objects.filter(user=self.user1, type='status_approved').exists())

    def test_status_escrowed(self):
        _create_status_notification(1, 1, "0x123", 1, 3)
        self.assertTrue(Notification.objects.filter(user=self.user1, type='status_escrowed').exists())

    def test_status_vote_failed(self):
        _create_status_notification(1, 1, "0x123", 1, 2)
        self.assertTrue(Notification.objects.filter(user=self.user1, type='status_vote_failed').exists())

    def test_status_verification_failed(self):
        _create_status_notification(1, 1, "0x123", 3, 4)
        self.assertTrue(Notification.objects.filter(user=self.user1, type='status_verification_failed').exists())

    def test_status_verification_passed(self):
        _create_status_notification(1, 1, "0x123", 3, 6)
        self.assertTrue(Notification.objects.filter(user=self.user1, type='status_verification_passed').exists())

    def test_status_reclaimed(self):
        _create_status_notification(1, 1, "0x123", 4, 5)
        self.assertTrue(Notification.objects.filter(user=self.user1, type='status_reclaimed').exists())

    def test_status_released_no_notification(self):
        _create_status_notification(1, 1, "0x123", 6, 7)
        self.assertFalse(Notification.objects.filter(user=self.user1, type='status_released').exists())
        self.assertEqual(Notification.objects.count(), 0)

    def test_notification_not_created_if_user_missing(self):
        _create_status_notification(1, 1, "0x999", 1, 3)
        self.assertEqual(Notification.objects.count(), 0)

from rest_framework.test import APIClient

class CommentNotificationTests(TestCase):
    def setUp(self):
        self.user1 = User.objects.create(wallet_address="0x123")
        self.user2 = User.objects.create(wallet_address="0x456")

        self.proposal = ProposalCache.objects.create(
            proposal_id=1,
            dao_id=1,
            contributor="0x123",
            title="Test Proposal",
            description="Test Description",
            requested_amount=Decimal("100"),
            deadline=timezone.now(),
            status=1,
            yes_weight=Decimal("0"),
            no_weight=Decimal("0"),
            reclaim_yes_weight=Decimal("0"),
            reclaim_no_weight=Decimal("0"),
            reclaim_round=0,
            escrowed_amount=Decimal("0"),
            resubmission_count=0,
            submitted_at=timezone.now()
        )
        self.client = APIClient()

    def test_comment_on_others_proposal_notifies_contributor(self):
        self.client.force_authenticate(user=self.user2)
        response = self.client.post(f'/api/proposals/{self.proposal.proposal_id}/comments/', {'body': 'Hello'})
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Notification.objects.filter(user=self.user1, type='new_comment').exists())

    def test_comment_on_own_proposal_does_not_notify(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.post(f'/api/proposals/{self.proposal.proposal_id}/comments/', {'body': 'Hello'})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Notification.objects.count(), 0)


from daos.models import DaoMemberCache

class DaoBroadcastNotificationTests(TestCase):
    def setUp(self):
        self.contributor = User.objects.create(wallet_address="0x111")
        self.member1 = User.objects.create(wallet_address="0x222")
        self.member2 = User.objects.create(wallet_address="0x333")
        self.non_member = User.objects.create(wallet_address="0x444")
        
        self.proposal = ProposalCache.objects.create(
            proposal_id=1,
            dao_id=1,
            contributor="0x111",
            title="Test Proposal",
            description="Test Description",
            requested_amount=Decimal("100"),
            deadline=timezone.now(),
            status=1,
            yes_weight=Decimal("0"),
            no_weight=Decimal("0"),
            reclaim_yes_weight=Decimal("0"),
            reclaim_no_weight=Decimal("0"),
            reclaim_round=0,
            escrowed_amount=Decimal("0"),
            resubmission_count=0,
            submitted_at=timezone.now()
        )
        
        # Add members to DAO 1
        DaoMemberCache.objects.create(dao_id=1, member_address="0x111")
        DaoMemberCache.objects.create(dao_id=1, member_address="0x222")
        DaoMemberCache.objects.create(dao_id=1, member_address="0x333")
        
        # Add non-member to DAO 2
        DaoMemberCache.objects.create(dao_id=2, member_address="0x444")

    def test_broadcast_new_proposal_open_for_voting(self):
        # Trigger initial sync for proposal in DAO 1 entering OpenForVoting
        _create_status_notification(
            proposal_id=1, 
            dao_id=1, 
            contributor="0x111", 
            old_status=None, 
            new_status=1
        )
        
        # Contributor should receive 'status_approved', NOT 'new_proposal_in_dao'
        self.assertTrue(Notification.objects.filter(user=self.contributor, type='status_approved').exists())
        self.assertFalse(Notification.objects.filter(user=self.contributor, type='new_proposal_in_dao').exists())
        
        # Members should receive 'new_proposal_in_dao'
        self.assertTrue(Notification.objects.filter(user=self.member1, type='new_proposal_in_dao').exists())
        self.assertTrue(Notification.objects.filter(user=self.member2, type='new_proposal_in_dao').exists())
        
        # Non-member (in another DAO) should NOT receive it
        self.assertFalse(Notification.objects.filter(user=self.non_member, type='new_proposal_in_dao').exists())

    def test_broadcast_no_other_members(self):
        # Empty DAO 1 of other members
        DaoMemberCache.objects.filter(dao_id=1, member_address="0x222").delete()
        DaoMemberCache.objects.filter(dao_id=1, member_address="0x333").delete()
        
        _create_status_notification(
            proposal_id=1, 
            dao_id=1, 
            contributor="0x111", 
            old_status=None, 
            new_status=1
        )
        
        # Contributor should still receive 'status_approved'
        self.assertTrue(Notification.objects.filter(user=self.contributor, type='status_approved').exists())
        
        # Ensure it didn't error and no broadcast notifications exist
        self.assertFalse(Notification.objects.filter(type='new_proposal_in_dao').exists())
