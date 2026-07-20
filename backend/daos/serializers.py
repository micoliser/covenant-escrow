from rest_framework import serializers
from .models import DaoCache, TreasuryStatsSnapshot

class DaoCacheSerializer(serializers.ModelSerializer):
    class Meta:
        model = DaoCache
        fields = '__all__'

class DaoPrepareCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(allow_blank=True, required=False)
    admin = serializers.CharField(max_length=42)
    quorum_bps = serializers.IntegerField()
    approval_threshold_bps = serializers.IntegerField()
    voting_period_seconds = serializers.IntegerField()
    funding_cap_bps = serializers.IntegerField()
    max_resubmissions = serializers.IntegerField()
    min_criteria_length = serializers.IntegerField()

class TreasuryStatsSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = TreasuryStatsSnapshot
        fields = '__all__'
