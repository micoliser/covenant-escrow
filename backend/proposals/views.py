from rest_framework import viewsets, generics, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from django.shortcuts import get_object_or_404
from django.db.models import Q

from .models import ProposalCache, ProposalAuditLogEntry, ProposalDraft, VoteCache, Comment, Notification
from users.models import User
from .serializers import (
    ProposalCacheSerializer,
    ProposalAuditLogEntrySerializer,
    ProposalDraftSerializer,
    VoteCacheSerializer,
    CommentSerializer,
)
from covenant_escrow_backend.throttles import (
    CommentThrottle,
    DraftThrottle,
    PrepareSubmitThrottle,
)

class ProposalSearchFilter(filters.BaseFilterBackend):
    def filter_queryset(self, request, queryset, view):
        search_term = request.query_params.get('search')
        if search_term:
            return queryset.filter(Q(title__icontains=search_term) | Q(description__icontains=search_term))
        return queryset

class ProposalContributorFilter(filters.BaseFilterBackend):
    def filter_queryset(self, request, queryset, view):
        my_proposals = request.query_params.get('my_proposals')
        if my_proposals == 'true' and request.user.is_authenticated:
            return queryset.filter(contributor__iexact=request.user.wallet_address)
        return queryset

class ProposalViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ProposalCache.objects.all()
    serializer_class = ProposalCacheSerializer
    filter_backends = [DjangoFilterBackend, ProposalSearchFilter, ProposalContributorFilter, filters.OrderingFilter]
    filterset_fields = ['dao_id', 'status']
    ordering_fields = ['submitted_at']
    ordering = ['-submitted_at']

    def get_throttles(self):
        if self.action == 'comments' and self.request.method == 'POST':
            return [CommentThrottle()]
        return super().get_throttles()

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        entries = ProposalAuditLogEntry.objects.filter(proposal_id=pk).order_by('-observed_at')
        serializer = ProposalAuditLogEntrySerializer(entries, many=True)
        return Response({'results': serializer.data})

    @action(detail=True, methods=['get'])
    def votes(self, request, pk=None):
        votes = VoteCache.objects.filter(proposal_id=pk)
        serializer = VoteCacheSerializer(votes, many=True)
        return Response({'results': serializer.data})

    @action(detail=True, methods=['get'], url_path='votes/me', permission_classes=[permissions.IsAuthenticated])
    def my_vote(self, request, pk=None):
        votes = VoteCache.objects.filter(proposal_id=pk, voter_address=request.user.wallet_address)
        serializer = VoteCacheSerializer(votes, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get', 'post'])
    def comments(self, request, pk=None):
        proposal = self.get_object()
        if request.method == 'GET':
            comments = Comment.objects.filter(proposal=proposal).order_by('created_at')
            serializer = CommentSerializer(comments, many=True)
            return Response({'results': serializer.data})
        else:
            if not request.user.is_authenticated:
                return Response(status=status.HTTP_401_UNAUTHORIZED)
            serializer = CommentSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(author=request.user, proposal=proposal)

            if request.user.wallet_address.lower() != proposal.contributor.lower():
                contributor_user = User.objects.filter(wallet_address=proposal.contributor.lower()).first()
                if contributor_user:
                    Notification.objects.create(
                        user=contributor_user,
                        proposal=proposal,
                        type='new_comment'
                    )

            return Response(serializer.data, status=status.HTTP_201_CREATED)

class CommentDestroyView(generics.DestroyAPIView):
    queryset = Comment.objects.all()
    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [CommentThrottle]
    
    def get_queryset(self):
        return Comment.objects.filter(author=self.request.user)

class ProposalDraftListCreateView(generics.ListCreateAPIView):
    serializer_class = ProposalDraftSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [DraftThrottle]

    def get_queryset(self):
        return ProposalDraft.objects.filter(dao_id=self.kwargs['dao_id'])

    def perform_create(self, serializer):
        serializer.save(
            contributor=self.request.user,
            dao_id=self.kwargs['dao_id']
        )

class IsOwner(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.contributor == request.user

class ProposalDraftDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = ProposalDraft.objects.all()
    serializer_class = ProposalDraftSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    throttle_classes = [DraftThrottle]

class ProposalDraftPrepareSubmitView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    throttle_classes = [PrepareSubmitThrottle]

    def post(self, request, pk=None):
        draft = get_object_or_404(ProposalDraft, pk=pk)
        self.check_object_permissions(request, draft)
        
        errors = {}
        if not draft.deliverable_criteria:
            errors['deliverable_criteria'] = ["Deliverable criteria is required to submit a proposal."]
        if draft.requested_amount is None:
            errors['requested_amount'] = ["Requested amount is required to submit a proposal."]
        if not draft.deadline:
            errors['deadline'] = ["A deadline is required to submit a proposal."]
            
        if errors:
            return Response(errors, status=400)

        # GenVM arguments list expected by submit_proposal
        args = [
            draft.dao_id,
            draft.title,
            draft.description,
            draft.deliverable_criteria,
            int(draft.requested_amount),
            int(draft.deadline.timestamp())
        ]
        return Response({"args": args})
