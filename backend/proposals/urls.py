from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProposalViewSet,
    ProposalDraftListCreateView,
    ProposalDraftDetailView,
    ProposalDraftPrepareSubmitView
)

router = DefaultRouter()
router.register(r'', ProposalViewSet, basename='proposal')

urlpatterns = [
    # Custom routes for drafts must come before router urls to avoid being matched as /proposals/{id} 
    # Wait, the drafts prefix is /proposals/drafts/, so it might clash with router if we include router first and router maps /drafts/ as {id}. 
    # Actually, router usually handles /proposals/, but we are mounting it on /api/proposals/ in the main urls.py.
    # So the paths below are relative to /api/proposals/
    path('drafts/<int:pk>/', ProposalDraftDetailView.as_view(), name='draft-detail'),
    path('drafts/<int:pk>/prepare-submit/', ProposalDraftPrepareSubmitView.as_view(), name='draft-prepare-submit'),
    
    path('', include(router.urls)),
]
