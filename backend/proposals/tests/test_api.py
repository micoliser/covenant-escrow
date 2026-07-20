from rest_framework.test import APITestCase
from django.urls import reverse
from rest_framework import status
from django.utils import timezone
from decimal import Decimal
from users.models import User
from daos.models import DaoCache
from proposals.models import ProposalCache, ProposalAuditLogEntry, ProposalDraft

class ProposalAPITests(APITestCase):
    def setUp(self):
        self.dao = DaoCache.objects.create(
            dao_id=1, name="DAO1", quorum_bps=100, approval_threshold_bps=5000,
            voting_period_seconds=86400, funding_cap_bps=2000,
            max_resubmissions=3, min_criteria_length=10
        )
        self.user = User.objects.create(wallet_address="0x123")
        self.other_user = User.objects.create(wallet_address="0x456")

        self.prop1 = ProposalCache.objects.create(
            proposal_id=1, dao_id=1, contributor="0x123",
            title="Fix Bug", description="Bug fixes", deliverable_criteria="Code",
            requested_amount=Decimal("1000"), deadline=timezone.now(), status=0
        )

        self.prop2 = ProposalCache.objects.create(
            proposal_id=2, dao_id=1, contributor="0x456",
            title="Fix Bug", description="Bug fixes",
            deliverable_criteria="Code merged", requested_amount=Decimal("500"),
            deadline=timezone.now() + timezone.timedelta(days=7),
            status=3
        )

        from proposals.models import VoteCache, Comment
        self.vote = VoteCache.objects.create(
            proposal_id=1, voter_address=self.user.wallet_address,
            vote_type='fund', support=True, weight=Decimal("100")
        )

        self.comment = Comment.objects.create(
            proposal=self.prop1, author=self.user, body="This is a test comment"
        )
        
        self.other_comment = Comment.objects.create(
            proposal=self.prop1, author=self.other_user, body="Another comment"
        )
        
        ProposalAuditLogEntry.objects.create(proposal_id=1, from_status=0, to_status=1)

        self.draft = ProposalDraft.objects.create(
            contributor=self.user, dao_id=1, title="Draft",
            description="", deliverable_criteria="", requested_amount=10, deadline=timezone.now()
        )

    def test_list_proposals(self):
        url = '/api/proposals/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_filter_proposals(self):
        url = '/api/proposals/?status=1'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_search_proposals(self):
        # We need to manually set the search vector in tests if not using a trigger
        from django.contrib.postgres.search import SearchVector
        ProposalCache.objects.update(search_vector=SearchVector('title', 'description'))
        
        url = '/api/proposals/?search=Bug'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_proposal_history(self):
        url = '/api/proposals/1/history/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['to_status'], 1)

    def test_draft_delete_unauthorized(self):
        url = f'/api/proposals/drafts/{self.draft.id}/'
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_proposal_votes_public(self):
        url = '/api/proposals/1/votes/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['voter_address'], self.user.wallet_address)

    def test_proposal_votes_me_unauthorized(self):
        url = '/api/proposals/1/votes/me/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_proposal_votes_me_authorized(self):
        url = '/api/proposals/1/votes/me/'
        self.client.force_authenticate(user=self.user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['voter_address'], self.user.wallet_address)

    def test_proposal_comments_public(self):
        url = '/api/proposals/1/comments/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 2)

    def test_proposal_comments_create_unauthorized(self):
        url = '/api/proposals/1/comments/'
        response = self.client.post(url, {"body": "Will fail"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_proposal_comments_create_authorized(self):
        url = '/api/proposals/1/comments/'
        self.client.force_authenticate(user=self.user)
        response = self.client.post(url, {"body": "My new comment"})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['body'], "My new comment")

    def test_comment_delete_unauthorized(self):
        url = f'/api/comments/{self.comment.id}/'
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
    def test_comment_delete_not_owner(self):
        url = f'/api/comments/{self.comment.id}/'
        self.client.force_authenticate(user=self.other_user)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_comment_delete_owner(self):
        url = f'/api/comments/{self.comment.id}/'
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_draft_create_unauthorized(self):
        url = '/api/daos/1/proposals/drafts/'
        response = self.client.post(url, {})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_draft_create_authorized(self):
        self.client.force_authenticate(user=self.user)
        url = '/api/daos/1/proposals/drafts/'
        data = {
            "title": "My Draft",
            "description": "Desc",
            "deliverable_criteria": "Crit",
            "requested_amount": "5000",
            "deadline": timezone.now().isoformat()
        }
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['title'], "My Draft")
        self.assertEqual(response.data['contributor'], self.user.wallet_address)
        self.assertEqual(response.data['dao_id'], 1)

    def test_draft_update_ownership(self):
        draft = ProposalDraft.objects.create(
            contributor=self.user, dao_id=1, title="User1 Draft",
            description="", deliverable_criteria="", requested_amount=10, deadline=timezone.now()
        )
        
        self.client.force_authenticate(user=self.other_user)
        url = f'/api/proposals/drafts/{draft.id}/'
        response = self.client.patch(url, {"title": "Hacked"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(url, {"title": "Updated"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], "Updated")

    def test_draft_prepare_submit(self):
        draft = ProposalDraft.objects.create(
            contributor=self.user, dao_id=1, title="Submit Me",
            description="Good proposal", deliverable_criteria="Done",
            requested_amount=10, deadline=timezone.now()
        )
        self.client.force_authenticate(user=self.user)
        url = f'/api/proposals/drafts/{draft.id}/prepare-submit/'
        response = self.client.post(url, {})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("args", response.data)
        self.assertEqual(len(response.data["args"]), 6)
        self.assertEqual(response.data["args"][0], 1)
        self.assertEqual(response.data["args"][1], "Submit Me")
