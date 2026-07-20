from django.db import models
from django.contrib.postgres.search import SearchVectorField
from django.contrib.postgres.indexes import GinIndex
from django.utils import timezone
from users.models import User
from daos.models import DaoCache

class ProposalCache(models.Model):
    proposal_id = models.BigIntegerField(primary_key=True)
    dao_id = models.BigIntegerField()
    contributor = models.CharField(max_length=42)
    title = models.CharField(max_length=255)
    description = models.TextField()
    deliverable_criteria = models.TextField()
    requested_amount = models.DecimalField(max_digits=78, decimal_places=0)
    deadline = models.DateTimeField()
    status = models.IntegerField()
    yes_weight = models.DecimalField(max_digits=78, decimal_places=0, default=0)
    no_weight = models.DecimalField(max_digits=78, decimal_places=0, default=0)
    reclaim_yes_weight = models.DecimalField(max_digits=78, decimal_places=0, default=0)
    reclaim_no_weight = models.DecimalField(max_digits=78, decimal_places=0, default=0)
    reclaim_round = models.IntegerField(default=0)
    escrowed_amount = models.DecimalField(max_digits=78, decimal_places=0, default=0)
    deliverable_url = models.URLField(blank=True)
    delivery_notes = models.TextField(blank=True)
    verdict_summary = models.TextField(blank=True)
    screening_rejection_reason = models.TextField(blank=True)
    reclaim_reason = models.TextField(blank=True)
    resubmission_count = models.IntegerField(default=0)
    submitted_at = models.DateTimeField(default=timezone.now)
    vote_ends_at = models.DateTimeField(null=True, blank=True)
    reclaim_vote_ends_at = models.DateTimeField(null=True, blank=True)
    last_synced_at = models.DateTimeField(auto_now=True)
    search_vector = SearchVectorField(null=True, blank=True)

    class Meta:
        indexes = [
            GinIndex(fields=['search_vector']),
        ]

class ProposalDraft(models.Model):
    contributor = models.ForeignKey(User, on_delete=models.CASCADE)
    dao_id = models.BigIntegerField()
    title = models.CharField(max_length=255)
    description = models.TextField()
    deliverable_criteria = models.TextField()
    requested_amount = models.DecimalField(max_digits=78, decimal_places=0)
    deadline = models.DateTimeField()
    updated_at = models.DateTimeField(auto_now=True)

class VoteCache(models.Model):
    proposal_id = models.BigIntegerField()
    voter_address = models.CharField(max_length=42)
    vote_type = models.CharField(max_length=20)
    reclaim_round = models.IntegerField(default=0)
    support = models.BooleanField()
    weight = models.DecimalField(max_digits=78, decimal_places=0)
    voted_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ('proposal_id', 'voter_address', 'vote_type', 'reclaim_round')

class Comment(models.Model):
    proposal = models.ForeignKey(ProposalCache, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.CASCADE)
    body = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)
    is_hidden = models.BooleanField(default=False)

class Notification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    proposal = models.ForeignKey(ProposalCache, on_delete=models.CASCADE, null=True, blank=True)
    type = models.CharField(max_length=50)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

class ProposalAuditLogEntry(models.Model):
    proposal_id = models.BigIntegerField()
    from_status = models.IntegerField(null=True, blank=True)
    to_status = models.IntegerField()
    chain_tx_hash = models.CharField(max_length=66, blank=True, default="")
    observed_at = models.DateTimeField(default=timezone.now)
