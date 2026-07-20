from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DaoViewSet
from proposals.views import ProposalDraftListCreateView

router = DefaultRouter()
router.register(r'', DaoViewSet, basename='dao')

urlpatterns = [
    path('<int:dao_id>/proposals/drafts/', ProposalDraftListCreateView.as_view(), name='dao-draft-list'),
    path('', include(router.urls)),
]
