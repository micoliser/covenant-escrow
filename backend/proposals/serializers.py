from rest_framework import serializers
from .models import ProposalCache, ProposalAuditLogEntry, ProposalDraft, VoteCache, Comment

class ProposalCacheSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProposalCache
        exclude = ('search_vector',)

class ProposalAuditLogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProposalAuditLogEntry
        fields = '__all__'

class ProposalDraftSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProposalDraft
        fields = '__all__'
        read_only_fields = ('contributor', 'dao_id')

class ProposalPrepareSubmitSerializer(serializers.Serializer):
    # This serializer doesn't strictly need fields, it's just a marker or we can return the structure directly from view
    pass

class VoteCacheSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoteCache
        fields = '__all__'

class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = '__all__'
        read_only_fields = ('author', 'proposal')
