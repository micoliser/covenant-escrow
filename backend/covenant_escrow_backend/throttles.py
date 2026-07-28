from rest_framework.throttling import UserRateThrottle

class RPCCallThrottle(UserRateThrottle):
    """Protects against spamming on-demand RPC calls to the blockchain."""
    rate = '10/minute'

class CommentThrottle(UserRateThrottle):
    """Protects against comment spam."""
    rate = '20/minute'

class DraftThrottle(UserRateThrottle):
    """Protects against draft creation and update spam."""
    rate = '30/minute'

class PrepareSubmitThrottle(UserRateThrottle):
    """Protects preparation endpoints used right before wallet signatures."""
    rate = '20/minute'

class NotificationThrottle(UserRateThrottle):
    """Protects against notification status update spam."""
    rate = '30/minute'
