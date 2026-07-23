from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from users.models import User
from proposals.models import ProposalDraft
from datetime import timedelta
from django.utils import timezone

class ProposalDraftTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            wallet_address='0x1234567890123456789012345678901234567890'
        )
        self.client.force_authenticate(user=self.user)
        self.dao_id = 1

    def test_create_draft_with_only_title_and_description(self):
        url = reverse('dao-draft-list', kwargs={'dao_id': self.dao_id})
        data = {
            'title': 'Test Proposal',
            'description': 'This is a test proposal.',
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ProposalDraft.objects.count(), 1)
        draft = ProposalDraft.objects.first()
        self.assertEqual(draft.title, 'Test Proposal')
        self.assertEqual(draft.description, 'This is a test proposal.')
        self.assertEqual(draft.deliverable_criteria, '')
        self.assertIsNone(draft.requested_amount)
        self.assertIsNone(draft.deadline)

    def test_prepare_submit_fails_when_fields_missing(self):
        # Create a partial draft directly
        draft = ProposalDraft.objects.create(
            contributor=self.user,
            dao_id=self.dao_id,
            title='Incomplete Draft',
            description='Missing other fields.'
        )
        url = reverse('draft-prepare-submit', kwargs={'pk': draft.pk})
        response = self.client.post(url, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('deliverable_criteria', response.data)
        self.assertIn('requested_amount', response.data)
        self.assertIn('deadline', response.data)

    def test_prepare_submit_succeeds_when_complete(self):
        deadline = timezone.now() + timedelta(days=7)
        draft = ProposalDraft.objects.create(
            contributor=self.user,
            dao_id=self.dao_id,
            title='Complete Draft',
            description='Has everything.',
            deliverable_criteria='1. Do the thing.',
            requested_amount=1000,
            deadline=deadline
        )
        url = reverse('draft-prepare-submit', kwargs={'pk': draft.pk})
        response = self.client.post(url, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('args', response.data)
        self.assertEqual(len(response.data['args']), 6)
        self.assertEqual(response.data['args'][3], '1. Do the thing.')
        self.assertEqual(response.data['args'][4], 1000)
        self.assertEqual(response.data['args'][5], int(deadline.timestamp()))
