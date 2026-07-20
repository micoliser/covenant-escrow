from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
import uuid
from django.utils import timezone

class UserManager(BaseUserManager):
    def create_user(self, wallet_address, **extra_fields):
        if not wallet_address:
            raise ValueError("The Wallet Address must be set")
        wallet_address = wallet_address.lower()
        user = self.model(wallet_address=wallet_address, **extra_fields)
        user.set_unusable_password()
        user.save(using=self._db, force_insert=True)
        return user

class User(AbstractBaseUser, PermissionsMixin):
    wallet_address = models.CharField(max_length=42, unique=True, primary_key=True)
    display_name = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    notification_prefs = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = 'wallet_address'

    def __str__(self):
        return self.wallet_address


class AuthNonce(models.Model):
    wallet_address = models.CharField(max_length=42)
    nonce = models.CharField(max_length=255, default=uuid.uuid4)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)

class RefreshToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='refresh_tokens')
    token_hash = models.CharField(max_length=255, unique=True)
    issued_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    revoked = models.BooleanField(default=False)
    replaced_by = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True)
