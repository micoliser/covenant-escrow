import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'covenant_escrow_backend.settings')
django.setup()

from users.models import User
from proposals.models import Notification, ProposalCache
from django.utils import timezone

# Assuming a user and a proposal exists
user = User.objects.first()
proposal = ProposalCache.objects.first()

if not user or not proposal:
    print("Need at least one user and one proposal.")
    exit(1)

# Clear existing notifications
Notification.objects.filter(user=user).delete()

# Create a realistic mix
types = [
    'status_rejected',
    'status_approved',
    'status_escrowed',
    'status_vote_failed',
    'status_verification_failed',
    'status_verification_passed',
    'status_reclaimed',
    'new_comment',
    'new_proposal_in_dao'
]

import datetime
now = timezone.now()

for i, t in enumerate(types):
    Notification.objects.create(
        user=user,
        proposal=proposal,
        type=t,
        created_at=now - datetime.timedelta(hours=i),
        # Leave some unread, some read
        read_at=None if i % 3 == 0 else (now - datetime.timedelta(minutes=30))
    )

print(f"Created 9 notifications for {user.wallet_address}")
