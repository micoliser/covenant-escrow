from django.urls import path
from .views import NonceView, VerifySignatureView, RefreshTokenView, LogoutView

urlpatterns = [
    path('nonce/', NonceView.as_view(), name='auth_nonce'),
    path('verify/', VerifySignatureView.as_view(), name='auth_verify'),
    path('refresh/', RefreshTokenView.as_view(), name='auth_refresh'),
    path('logout/', LogoutView.as_view(), name='auth_logout'),
]
