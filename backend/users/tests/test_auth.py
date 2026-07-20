from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from eth_account import Account
from eth_account.messages import encode_defunct
from siwe import SiweMessage
import hashlib
import secrets
from datetime import timedelta

from users.models import User, AuthNonce, RefreshToken

class AuthAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.account = Account.create()
        self.checksum_address = self.account.address
        self.wallet_address = self.checksum_address.lower()
        self.domain = "localhost:3000"
        
        # Override the expected domain setting for tests
        with self.settings(SIWE_EXPECTED_DOMAIN=self.domain):
            pass

    def _create_siwe_message(self, nonce, domain=None, address=None):
        msg = SiweMessage(
            domain=domain or self.domain,
            address=address or self.checksum_address,
            statement="Sign in to Covenant Escrow.",
            uri=f"http://{domain or self.domain}",
            version="1",
            chain_id=1,
            nonce=nonce,
            issued_at=timezone.now().isoformat()
        )
        return msg.prepare_message()

    def _sign_message(self, message_text, account=None):
        acc = account or self.account
        signable = encode_defunct(text=message_text)
        signed = acc.sign_message(signable)
        return signed.signature.hex()

    def test_nonce_creation(self):
        """Test POST /auth/nonce creates a nonce bound to a wallet address."""
        response = self.client.post(reverse('auth_nonce'), {'wallet_address': self.wallet_address})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        self.assertIn('nonce', data)
        self.assertTrue(len(data['nonce']) >= 8)
        
        # Verify it was saved to the DB
        nonce_obj = AuthNonce.objects.get(wallet_address=self.wallet_address, nonce=data['nonce'])
        self.assertFalse(nonce_obj.used)
        self.assertTrue(nonce_obj.expires_at > timezone.now())

    def test_verify_happy_path(self):
        """Test POST /auth/verify with valid SIWE message and signature."""
        with self.settings(SIWE_EXPECTED_DOMAIN=self.domain):
            # 1. Get nonce
            nonce_str = secrets.token_hex(16)
            AuthNonce.objects.create(
                wallet_address=self.wallet_address,
                nonce=nonce_str,
                expires_at=timezone.now() + timedelta(minutes=5)
            )
            
            # 2. Construct SIWE message & sign
            message_text = self._create_siwe_message(nonce_str)
            signature = self._sign_message(message_text)
            
            # 3. Verify
            response = self.client.post(reverse('auth_verify'), {
                'message': message_text,
                'signature': signature
            })
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            data = response.json()
            
            # 4. Check token presence
            self.assertIn('access', data)
            self.assertIn('refresh', data)
            
            # 5. Check side effects
            # User should be created
            self.assertTrue(User.objects.filter(wallet_address=self.wallet_address).exists())
            # Nonce should be used
            self.assertTrue(AuthNonce.objects.get(nonce=nonce_str).used)
            # Refresh token row should be created
            self.assertEqual(RefreshToken.objects.count(), 1)
            # Token hash should match what is stored
            raw_refresh = data['refresh']
            token_hash = hashlib.sha256(raw_refresh.encode()).hexdigest()
            self.assertTrue(RefreshToken.objects.filter(token_hash=token_hash).exists())

    def test_verify_wrong_domain(self):
        """Test POST /auth/verify rejects message with incorrect domain (phishing protection)."""
        with self.settings(SIWE_EXPECTED_DOMAIN=self.domain):
            nonce_str = secrets.token_hex(16)
            AuthNonce.objects.create(
                wallet_address=self.wallet_address,
                nonce=nonce_str,
                expires_at=timezone.now() + timedelta(minutes=5)
            )
            
            # Construct SIWE message with wrong domain
            message_text = self._create_siwe_message(nonce_str, domain="evil-phishing-site.com")
            signature = self._sign_message(message_text)
            
            response = self.client.post(reverse('auth_verify'), {
                'message': message_text,
                'signature': signature
            })
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            # Nonce should still be marked used
            self.assertTrue(AuthNonce.objects.get(nonce=nonce_str).used)

    def test_verify_wrong_signature(self):
        """Test POST /auth/verify rejects message if signature doesn't match address."""
        with self.settings(SIWE_EXPECTED_DOMAIN=self.domain):
            nonce_str = secrets.token_hex(16)
            AuthNonce.objects.create(
                wallet_address=self.wallet_address,
                nonce=nonce_str,
                expires_at=timezone.now() + timedelta(minutes=5)
            )
            
            message_text = self._create_siwe_message(nonce_str)
            # Sign with a completely different account
            evil_account = Account.create()
            signature = self._sign_message(message_text, account=evil_account)
            
            response = self.client.post(reverse('auth_verify'), {
                'message': message_text,
                'signature': signature
            })
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertTrue(AuthNonce.objects.get(nonce=nonce_str).used)

    def test_verify_expired_nonce(self):
        """Test POST /auth/verify rejects if nonce is expired."""
        with self.settings(SIWE_EXPECTED_DOMAIN=self.domain):
            nonce_str = secrets.token_hex(16)
            AuthNonce.objects.create(
                wallet_address=self.wallet_address,
                nonce=nonce_str,
                expires_at=timezone.now() - timedelta(minutes=5) # Expired
            )
            
            message_text = self._create_siwe_message(nonce_str)
            signature = self._sign_message(message_text)
            
            response = self.client.post(reverse('auth_verify'), {
                'message': message_text,
                'signature': signature
            })
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertTrue(AuthNonce.objects.get(nonce=nonce_str).used)

    def test_verify_already_used_nonce(self):
        """Test POST /auth/verify rejects if nonce is already used."""
        with self.settings(SIWE_EXPECTED_DOMAIN=self.domain):
            nonce_str = secrets.token_hex(16)
            AuthNonce.objects.create(
                wallet_address=self.wallet_address,
                nonce=nonce_str,
                expires_at=timezone.now() + timedelta(minutes=5),
                used=True # Already used
            )
            
            message_text = self._create_siwe_message(nonce_str)
            signature = self._sign_message(message_text)
            
            response = self.client.post(reverse('auth_verify'), {
                'message': message_text,
                'signature': signature
            })
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_refresh_happy_path(self):
        """Test POST /auth/refresh issues new tokens and revokes old one."""
        user = User.objects.create_user(wallet_address=self.wallet_address)
        raw_refresh = secrets.token_hex(32)
        token_hash = hashlib.sha256(raw_refresh.encode()).hexdigest()
        
        rt = RefreshToken.objects.create(
            user=user,
            token_hash=token_hash,
            expires_at=timezone.now() + timedelta(days=7)
        )
        
        response = self.client.post(reverse('auth_refresh'), {'refresh_token': raw_refresh})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        self.assertIn('access', data)
        self.assertIn('refresh', data)
        self.assertNotEqual(data['refresh'], raw_refresh)
        
        # Verify old token is revoked and linked
        rt.refresh_from_db()
        self.assertTrue(rt.revoked)
        self.assertIsNotNone(rt.replaced_by)
        
        # Verify new token exists
        new_hash = hashlib.sha256(data['refresh'].encode()).hexdigest()
        self.assertTrue(RefreshToken.objects.filter(token_hash=new_hash).exists())

    def test_refresh_revoked_token(self):
        """Test POST /auth/refresh fails on revoked token."""
        user = User.objects.create_user(wallet_address=self.wallet_address)
        raw_refresh = secrets.token_hex(32)
        token_hash = hashlib.sha256(raw_refresh.encode()).hexdigest()
        
        RefreshToken.objects.create(
            user=user,
            token_hash=token_hash,
            expires_at=timezone.now() + timedelta(days=7),
            revoked=True
        )
        
        response = self.client.post(reverse('auth_refresh'), {'refresh_token': raw_refresh})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_refresh_expired_token(self):
        """Test POST /auth/refresh fails on expired token."""
        user = User.objects.create_user(wallet_address=self.wallet_address)
        raw_refresh = secrets.token_hex(32)
        token_hash = hashlib.sha256(raw_refresh.encode()).hexdigest()
        
        RefreshToken.objects.create(
            user=user,
            token_hash=token_hash,
            expires_at=timezone.now() - timedelta(days=1)
        )
        
        response = self.client.post(reverse('auth_refresh'), {'refresh_token': raw_refresh})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_happy_path(self):
        """Test POST /auth/logout revokes the refresh token."""
        user = User.objects.create_user(wallet_address=self.wallet_address)
        raw_refresh = secrets.token_hex(32)
        token_hash = hashlib.sha256(raw_refresh.encode()).hexdigest()
        
        rt = RefreshToken.objects.create(
            user=user,
            token_hash=token_hash,
            expires_at=timezone.now() + timedelta(days=7)
        )
        
        # Logout endpoint usually requires authentication. 
        # But we don't strictly need a valid access token to run the View logic if we override permission_classes,
        # or we just use APIClient's force_authenticate. Let's use force_authenticate.
        self.client.force_authenticate(user=user)
        
        response = self.client.post(reverse('auth_logout'), {'refresh_token': raw_refresh})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        rt.refresh_from_db()
        self.assertTrue(rt.revoked)

from django.test import TransactionTestCase
import concurrent.futures

class AuthConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.account = Account.create()
        self.checksum_address = self.account.address
        self.wallet_address = self.checksum_address.lower()
        self.domain = "localhost:3000"

    def _create_siwe_message(self, nonce):
        msg = SiweMessage(
            domain=self.domain,
            address=self.checksum_address,
            statement="Sign in to Covenant Escrow.",
            uri=f"http://{self.domain}",
            version="1",
            chain_id=1,
            nonce=nonce,
            issued_at=timezone.now().isoformat()
        )
        return msg.prepare_message()

    def _sign_message(self, message_text):
        signable = encode_defunct(text=message_text)
        signed = self.account.sign_message(signable)
        return signed.signature.hex()

    def test_concurrent_verify_requests(self):
        """Test that two concurrent verify attempts with the same nonce/signature can't both succeed."""
        with self.settings(SIWE_EXPECTED_DOMAIN=self.domain):
            nonce_str = secrets.token_hex(16)
            AuthNonce.objects.create(
                wallet_address=self.wallet_address,
                nonce=nonce_str,
                expires_at=timezone.now() + timedelta(minutes=5)
            )
            
            message_text = self._create_siwe_message(nonce_str)
            signature = self._sign_message(message_text)
            
            payload = {
                'message': message_text,
                'signature': signature
            }
            
            def make_request():
                from rest_framework.test import APIClient
                from django.urls import reverse
                from django.db import connections
                try:
                    client = APIClient()
                    return client.post(reverse('auth_verify'), payload)
                finally:
                    connections.close_all()
                
                
            results = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(make_request) for _ in range(5)]
                for future in concurrent.futures.as_completed(futures):
                    results.append(future.result().status_code)
                    
            # Exactly one should succeed (200), the rest should fail (400)
            success_count = results.count(status.HTTP_200_OK)
            self.assertEqual(success_count, 1, f"Expected exactly 1 success, got {success_count}. Results: {results}")
