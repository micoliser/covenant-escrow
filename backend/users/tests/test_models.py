from django.test import TestCase
from django.db import IntegrityError
from django.utils import timezone
from users.models import User, AuthNonce, RefreshToken
import uuid
from datetime import timedelta

class UserModelTest(TestCase):
    def test_user_creation(self):
        user = User.objects.create_user(wallet_address='0x1234567890abcdef1234567890abcdef12345678')
        self.assertEqual(user.wallet_address, '0x1234567890abcdef1234567890abcdef12345678')
        self.assertEqual(user.notification_prefs, {})
        self.assertIsNotNone(user.created_at)

    def test_user_unique_wallet(self):
        User.objects.create_user(wallet_address='0x123')
        with self.assertRaises(IntegrityError):
            User.objects.create_user(wallet_address='0x123')

class AuthNonceModelTest(TestCase):
    def test_auth_nonce_creation_and_use(self):
        expires_at = timezone.now() + timedelta(minutes=15)
        nonce = AuthNonce.objects.create(
            wallet_address='0xabc',
            nonce='testnonce',
            expires_at=expires_at
        )
        self.assertEqual(nonce.wallet_address, '0xabc')
        self.assertEqual(nonce.nonce, 'testnonce')
        self.assertFalse(nonce.used)
        
        # Test marking as used
        nonce.used = True
        nonce.save()
        nonce.refresh_from_db()
        self.assertTrue(nonce.used)

class RefreshTokenModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(wallet_address='0x123')

    def test_refresh_token_creation(self):
        expires_at = timezone.now() + timedelta(days=7)
        token = RefreshToken.objects.create(
            user=self.user,
            token_hash='testhash',
            expires_at=expires_at
        )
        self.assertEqual(token.user, self.user)
        self.assertEqual(token.token_hash, 'testhash')
        self.assertFalse(token.revoked)
        self.assertIsNone(token.replaced_by)

    def test_refresh_token_unique_hash(self):
        expires_at = timezone.now() + timedelta(days=7)
        RefreshToken.objects.create(user=self.user, token_hash='hash1', expires_at=expires_at)
        with self.assertRaises(IntegrityError):
            RefreshToken.objects.create(user=self.user, token_hash='hash1', expires_at=expires_at)

    def test_token_replacement_chain(self):
        expires_at = timezone.now() + timedelta(days=7)
        token1 = RefreshToken.objects.create(user=self.user, token_hash='hash1', expires_at=expires_at)
        token2 = RefreshToken.objects.create(user=self.user, token_hash='hash2', expires_at=expires_at)
        
        token1.revoked = True
        token1.replaced_by = token2
        token1.save()
        
        token1.refresh_from_db()
        self.assertTrue(token1.revoked)
        self.assertEqual(token1.replaced_by, token2)
