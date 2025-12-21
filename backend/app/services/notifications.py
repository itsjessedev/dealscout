"""Push notification service using Firebase Cloud Messaging."""

from typing import Optional
import firebase_admin
from firebase_admin import credentials, messaging

from ..config import get_settings

settings = get_settings()

# Initialize Firebase
_firebase_initialized = False


def init_firebase() -> bool:
    """Initialize Firebase Admin SDK."""
    global _firebase_initialized
    if _firebase_initialized:
        return True

    try:
        cred = credentials.Certificate(settings.firebase_credentials_file)
        firebase_admin.initialize_app(cred)
        _firebase_initialized = True
        return True
    except Exception as e:
        print(f"Firebase init error: {e}")
        return False


class NotificationService:
    """Service for sending push notifications."""

    def __init__(self):
        self.initialized = init_firebase()

    async def send_deal_notification(
        self,
        token: str,
        deal_title: str,
        estimated_profit: float,
        deal_id: int,
    ) -> bool:
        """
        Send a notification about a new profitable deal.

        Args:
            token: FCM device token
            deal_title: Title of the deal
            estimated_profit: Estimated profit amount
            deal_id: Deal ID for deep linking

        Returns:
            True if sent successfully
        """
        if not self.initialized:
            print("Firebase not initialized")
            return False

        try:
            message = messaging.Message(
                notification=messaging.Notification(
                    title=f"${estimated_profit:.0f} Profit Opportunity",
                    body=deal_title[:100],
                ),
                data={
                    "type": "deal",
                    "deal_id": str(deal_id),
                    "profit": f"{estimated_profit:.2f}",
                },
                token=token,
            )
            messaging.send(message)
            return True
        except Exception as e:
            print(f"Send notification error: {e}")
            return False

    async def send_needs_review_notification(
        self,
        token: str,
        count: int,
    ) -> bool:
        """
        Send a notification about items needing condition review.

        Args:
            token: FCM device token
            count: Number of items needing review

        Returns:
            True if sent successfully
        """
        if not self.initialized:
            print("Firebase not initialized")
            return False

        try:
            message = messaging.Message(
                notification=messaging.Notification(
                    title="Items Need Review",
                    body=f"You have {count} item{'s' if count > 1 else ''} waiting for condition input",
                ),
                data={
                    "type": "needs_review",
                    "count": str(count),
                },
                token=token,
            )
            messaging.send(message)
            return True
        except Exception as e:
            print(f"Send notification error: {e}")
            return False

    async def send_to_all_devices(
        self,
        tokens: list[str],
        title: str,
        body: str,
        data: Optional[dict] = None,
    ) -> int:
        """
        Send notification to multiple devices.

        Args:
            tokens: List of FCM device tokens
            title: Notification title
            body: Notification body
            data: Optional data payload

        Returns:
            Number of successfully sent messages
        """
        if not self.initialized or not tokens:
            return 0

        success_count = 0
        for token in tokens:
            try:
                message = messaging.Message(
                    notification=messaging.Notification(
                        title=title,
                        body=body,
                    ),
                    data=data or {},
                    token=token,
                )
                messaging.send(message)
                success_count += 1
            except Exception as e:
                print(f"Send to {token[:20]}... failed: {e}")

        return success_count


# Singleton instance
_notification_service: Optional[NotificationService] = None


def get_notification_service() -> NotificationService:
    """Get or create notification service instance."""
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service
