from rest_framework.test import APITestCase
from rest_framework import status
from django.utils import timezone
from users.models import User
from proposals.models import Notification, ProposalCache

class NotificationAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create(wallet_address="0x123")
        self.other_user = User.objects.create(wallet_address="0x456")
        
        self.prop = ProposalCache.objects.create(
            proposal_id=1, dao_id=1, contributor="0x123",
            title="Fix Bug", description="Bug fixes", deliverable_criteria="Code",
            requested_amount=1000, deadline=timezone.now(), status=0
        )
        
        self.notif1 = Notification.objects.create(
            user=self.user, proposal=self.prop, type="proposal_passed"
        )
        self.notif2 = Notification.objects.create(
            user=self.other_user, proposal=self.prop, type="proposal_rejected"
        )

    def test_list_notifications_unauthorized(self):
        url = '/auth/notifications/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_notifications_authorized(self):
        url = '/auth/notifications/'
        self.client.force_authenticate(user=self.user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], self.notif1.id)

    def test_read_notification_unauthorized(self):
        url = f'/auth/notifications/{self.notif1.id}/read/'
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_read_notification_not_owner(self):
        url = f'/auth/notifications/{self.notif1.id}/read/'
        self.client.force_authenticate(user=self.other_user)
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_read_notification_owner(self):
        url = f'/auth/notifications/{self.notif1.id}/read/'
        self.client.force_authenticate(user=self.user)
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.notif1.refresh_from_db()
        self.assertIsNotNone(self.notif1.read_at)
