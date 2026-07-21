import secrets
import hashlib
from datetime import timedelta
from django.utils import timezone
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import AccessToken
from eth_account import Account
from eth_account.messages import encode_defunct
from siwe import SiweMessage
from django.shortcuts import get_object_or_404
from rest_framework import generics

from .models import User, AuthNonce, RefreshToken
from proposals.models import Notification
from .serializers import NotificationSerializer

from rest_framework.throttling import AnonRateThrottle

class NonceRateThrottle(AnonRateThrottle):
    scope = 'nonce'

class NonceView(APIView):
    throttle_classes = [NonceRateThrottle]

    def post(self, request):
        wallet_address = request.data.get('wallet_address')
        if not wallet_address:
            return Response({"error": "wallet_address is required"}, status=status.HTTP_400_BAD_REQUEST)
            
        nonce_str = secrets.token_hex(16)
        AuthNonce.objects.create(
            wallet_address=wallet_address.lower(),
            nonce=nonce_str,
            expires_at=timezone.now() + timedelta(minutes=5)
        )
        return Response({"nonce": nonce_str})

class VerifySignatureView(APIView):
    def post(self, request):
        message_str = request.data.get('message')
        signature = request.data.get('signature')
        
        if not message_str or not signature:
            return Response({"error": "message and signature are required"}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            # Parse the SIWE message using the standard library
            siwe_msg = SiweMessage.from_message(message_str)
        except ValueError as e:
            return Response({"error": f"Invalid SIWE message: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
            
        # Fetch, check, and burn nonce atomically
        from django.db import transaction
        with transaction.atomic():
            try:
                nonce_obj = AuthNonce.objects.select_for_update().get(
                    nonce=siwe_msg.nonce,
                    wallet_address=siwe_msg.address.lower()
                )
            except AuthNonce.DoesNotExist:
                return Response({"error": "Invalid or unknown nonce"}, status=status.HTTP_400_BAD_REQUEST)
                
            if nonce_obj.used:
                return Response({"error": "Nonce already used"}, status=status.HTTP_400_BAD_REQUEST)
                
            # Burn the nonce immediately so it cannot be reused
            nonce_obj.used = True
            nonce_obj.save(update_fields=['used'])
            
            if nonce_obj.expires_at < timezone.now():
                return Response({"error": "Nonce expired"}, status=status.HTTP_400_BAD_REQUEST)
                
        # Now verify signature and domain using the official SIWE library
        expected_domain = getattr(settings, 'SIWE_EXPECTED_DOMAIN', 'localhost:3000')
        try:
            siwe_msg.verify(
                signature=signature,
                domain=expected_domain,
                nonce=nonce_obj.nonce
            )
        except Exception as e:
            return Response({"error": f"Verification failed: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
            
        # Issue tokens
        user, _ = User.objects.get_or_create(wallet_address=siwe_msg.address.lower())
        return self._issue_tokens(user)

    def _issue_tokens(self, user):
        access = AccessToken.for_user(user)
        
        raw_refresh = secrets.token_hex(32)
        token_hash = hashlib.sha256(raw_refresh.encode()).hexdigest()
        
        refresh_obj = RefreshToken.objects.create(
            user=user,
            token_hash=token_hash,
            expires_at=timezone.now() + timedelta(days=7)
        )
        
        response = Response({
            "access": str(access),
        })
        
        response.set_cookie(
            'refresh_token',
            raw_refresh,
            max_age=7 * 24 * 60 * 60,
            httponly=True,
            samesite='Lax',
            secure=not settings.DEBUG
        )
        return response

class RefreshTokenView(APIView):
    def post(self, request):
        raw_refresh = request.COOKIES.get('refresh_token')
        if not raw_refresh:
            return Response({"error": "refresh_token cookie is required"}, status=status.HTTP_400_BAD_REQUEST)
            
        token_hash = hashlib.sha256(raw_refresh.encode()).hexdigest()
        try:
            token_obj = RefreshToken.objects.get(token_hash=token_hash)
        except RefreshToken.DoesNotExist:
            return Response({"error": "Invalid refresh token"}, status=status.HTTP_400_BAD_REQUEST)
            
        if token_obj.revoked:
            return Response({"error": "Refresh token is revoked"}, status=status.HTTP_400_BAD_REQUEST)
            
        if token_obj.expires_at < timezone.now():
            return Response({"error": "Refresh token is expired"}, status=status.HTTP_400_BAD_REQUEST)
            
        # Mark old revoked
        token_obj.revoked = True
        
        # Issue new pair
        user = token_obj.user
        access = AccessToken.for_user(user)
        
        new_raw_refresh = secrets.token_hex(32)
        new_token_hash = hashlib.sha256(new_raw_refresh.encode()).hexdigest()
        
        new_refresh_obj = RefreshToken.objects.create(
            user=user,
            token_hash=new_token_hash,
            expires_at=timezone.now() + timedelta(days=7)
        )
        
        token_obj.replaced_by = new_refresh_obj
        token_obj.save(update_fields=['revoked', 'replaced_by'])
        
        response = Response({
            "access": str(access),
        })
        
        response.set_cookie(
            'refresh_token',
            new_raw_refresh,
            max_age=7 * 24 * 60 * 60,
            httponly=True,
            samesite='Lax',
            secure=not settings.DEBUG
        )
        return response

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        raw_refresh = request.COOKIES.get('refresh_token')
        if not raw_refresh:
            return Response({"error": "refresh_token cookie is required"}, status=status.HTTP_400_BAD_REQUEST)
            
        token_hash = hashlib.sha256(raw_refresh.encode()).hexdigest()
        # Find token and ensure it belongs to the logged in user
        try:
            token_obj = RefreshToken.objects.get(token_hash=token_hash, user=request.user)
            token_obj.revoked = True
            token_obj.save(update_fields=['revoked'])
            response = Response({"status": "logged out"})
            response.delete_cookie('refresh_token', samesite='Lax')
            return response
        except RefreshToken.DoesNotExist:
            return Response({"error": "Invalid refresh token"}, status=status.HTTP_400_BAD_REQUEST)

class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by('-created_at')

class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk=None):
        notification = get_object_or_404(Notification, pk=pk)
        if notification.user != request.user:
            return Response(status=status.HTTP_403_FORBIDDEN)
        
        notification.read_at = timezone.now()
        notification.save(update_fields=['read_at'])
        return Response({'status': 'read'})
