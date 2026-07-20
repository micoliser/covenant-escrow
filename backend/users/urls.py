from django.urls import path
from .views import (
    NonceView, VerifySignatureView, RefreshTokenView, LogoutView,
    NotificationListView, NotificationReadView
)

urlpatterns = [
    path('nonce/', NonceView.as_view(), name='auth_nonce'),
    path('verify/', VerifySignatureView.as_view(), name='auth_verify'),
    path('refresh/', RefreshTokenView.as_view(), name='auth_refresh'),
    path('logout/', LogoutView.as_view(), name='auth_logout'),
    path('notifications/', NotificationListView.as_view(), name='notification-list'),
    path('notifications/<int:pk>/read/', NotificationReadView.as_view(), name='notification-read'),
]
