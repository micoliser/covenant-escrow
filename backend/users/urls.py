from django.urls import path
from .views import (
    NonceView, VerifySignatureView, RefreshTokenView, LogoutView,
    NotificationListView, NotificationReadView, NotificationUnreadCountView,
    NotificationMarkAllReadView
)

urlpatterns = [
    path('nonce/', NonceView.as_view(), name='auth_nonce'),
    path('verify/', VerifySignatureView.as_view(), name='auth_verify'),
    path('refresh/', RefreshTokenView.as_view(), name='auth_refresh'),
    path('logout/', LogoutView.as_view(), name='auth_logout'),
    path('notifications/', NotificationListView.as_view(), name='notification-list'),
    path('notifications/mark-all-read/', NotificationMarkAllReadView.as_view(), name='notification-mark-all-read'),
    path('notifications/unread-count/', NotificationUnreadCountView.as_view(), name='notification-unread-count'),
    path('notifications/<int:pk>/read/', NotificationReadView.as_view(), name='notification-read'),
]
