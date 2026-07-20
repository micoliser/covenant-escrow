from django.urls import path
from indexer.views import SyncRequestView

urlpatterns = [
    path('sync-request/', SyncRequestView.as_view(), name='sync-request'),
]
