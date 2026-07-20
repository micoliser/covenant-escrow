from rest_framework import viewsets, generics, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from django.shortcuts import get_object_or_404
from django.contrib.postgres.search import SearchQuery

from .models import ProposalCache, ProposalAuditLogEntry, ProposalDraft, VoteCache, Comment
from .serializers import (
    ProposalCacheSerializer,
    ProposalAuditLogEntrySerializer,
    ProposalDraftSerializer,
    VoteCacheSerializer,
    CommentSerializer,
)

class ProposalSearchFilter(filters.BaseFilterBackend):
    def filter_queryset(self, request, queryset, view):
        search_term = request.query_params.get('search')
        if search_term:
            return queryset.filter(search_vector=SearchQuery(search_term))
        return queryset

class ProposalViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ProposalCache.objects.all()
    serializer_class = ProposalCacheSerializer
    filter_backends = [DjangoFilterBackend, ProposalSearchFilter]
    filterset_fields = ['dao_id', 'status']

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
            return Response(serializer.data, status=status.HTTP_201_CREATED)

class CommentDestroyView(generics.DestroyAPIView):
    queryset = Comment.objects.all()
    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Comment.objects.filter(author=self.request.user)

class ProposalDraftListCreateView(generics.ListCreateAPIView):
    serializer_class = ProposalDraftSerializer
    permission_classes = [permissions.IsAuthenticated]

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

class ProposalDraftPrepareSubmitView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def post(self, request, pk=None):
        draft = get_object_or_404(ProposalDraft, pk=pk)
        self.check_object_permissions(request, draft)
        
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
