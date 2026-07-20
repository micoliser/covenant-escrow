from rest_framework import serializers
from proposals.models import Notification

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = '__all__'
        read_only_fields = ('user', 'proposal', 'type', 'created_at', 'read_at')
