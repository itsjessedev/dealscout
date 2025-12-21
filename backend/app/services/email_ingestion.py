"""Gmail API email ingestion for Swoopa alerts."""

import base64
import re
from datetime import datetime
from typing import Optional
from decimal import Decimal

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from ..config import get_settings

settings = get_settings()


class EmailIngestionService:
    """Service for ingesting Swoopa alert emails from Gmail."""

    def __init__(self):
        self.creds: Optional[Credentials] = None
        self.service = None

    def authenticate(self) -> None:
        """Authenticate with Gmail API."""
        import os.path
        import pickle

        # Load existing token
        if os.path.exists(settings.gmail_token_file):
            with open(settings.gmail_token_file, "rb") as token:
                self.creds = pickle.load(token)

        # Refresh or get new credentials
        if not self.creds or not self.creds.valid:
            if self.creds and self.creds.expired and self.creds.refresh_token:
                self.creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(
                    settings.gmail_credentials_file, settings.gmail_scopes
                )
                self.creds = flow.run_local_server(port=0)

            # Save credentials
            with open(settings.gmail_token_file, "wb") as token:
                pickle.dump(self.creds, token)

        self.service = build("gmail", "v1", credentials=self.creds)

    def get_swoopa_emails(self, max_results: int = 50) -> list[dict]:
        """
        Fetch recent Swoopa alert emails.

        Returns list of parsed deal dictionaries.
        """
        if not self.service:
            self.authenticate()

        # Search for Swoopa emails
        # Adjust query based on actual Swoopa sender/subject
        query = "from:swoopa OR from:getswoopa subject:alert OR subject:deal"

        results = self.service.users().messages().list(
            userId="me",
            q=query,
            maxResults=max_results,
        ).execute()

        messages = results.get("messages", [])
        deals = []

        for msg in messages:
            msg_data = self.service.users().messages().get(
                userId="me",
                id=msg["id"],
                format="full",
            ).execute()

            deal = self._parse_swoopa_email(msg_data)
            if deal:
                deals.append(deal)

        return deals

    def _parse_swoopa_email(self, message: dict) -> Optional[dict]:
        """
        Parse a Swoopa alert email into a deal dictionary.

        Returns None if parsing fails.
        """
        try:
            # Get headers
            headers = {h["name"]: h["value"] for h in message["payload"]["headers"]}
            subject = headers.get("Subject", "")

            # Get body
            body = self._get_email_body(message)

            # Extract deal info from body
            # This is a placeholder - actual parsing depends on Swoopa email format
            deal = self._extract_deal_info(subject, body)

            if deal:
                deal["email_id"] = message["id"]
                deal["received_at"] = datetime.fromtimestamp(
                    int(message["internalDate"]) / 1000
                )
            return deal

        except Exception as e:
            print(f"Error parsing email: {e}")
            return None

    def _get_email_body(self, message: dict) -> str:
        """Extract text body from email message."""
        payload = message["payload"]

        # Handle multipart messages
        if "parts" in payload:
            for part in payload["parts"]:
                if part["mimeType"] == "text/plain":
                    data = part["body"].get("data", "")
                    return base64.urlsafe_b64decode(data).decode("utf-8")
                elif part["mimeType"] == "text/html":
                    data = part["body"].get("data", "")
                    html = base64.urlsafe_b64decode(data).decode("utf-8")
                    # Strip HTML tags for basic parsing
                    return re.sub(r"<[^>]+>", " ", html)
        else:
            data = payload["body"].get("data", "")
            if data:
                return base64.urlsafe_b64decode(data).decode("utf-8")

        return ""

    def _extract_deal_info(self, subject: str, body: str) -> Optional[dict]:
        """
        Extract deal information from email content.

        This is a template - adjust regex patterns based on actual Swoopa format.
        """
        # Example patterns - adjust based on actual Swoopa email format
        deal = {
            "title": "",
            "asking_price": None,
            "listing_url": None,
            "source": None,
            "location": None,
        }

        # Try to extract title from subject or body
        # Swoopa format example: "New listing: RTX 3080 - $400 - Facebook Marketplace"
        title_match = re.search(r"(?:listing|alert):\s*(.+?)(?:\s*-\s*\$|\n|$)", subject + " " + body, re.I)
        if title_match:
            deal["title"] = title_match.group(1).strip()

        # Extract price
        price_match = re.search(r"\$\s*([\d,]+(?:\.\d{2})?)", body)
        if price_match:
            price_str = price_match.group(1).replace(",", "")
            deal["asking_price"] = Decimal(price_str)

        # Extract URL
        url_match = re.search(r"(https?://[^\s<>\"']+)", body)
        if url_match:
            deal["listing_url"] = url_match.group(1)

        # Detect source from URL or text
        if "facebook" in body.lower() or "fb.com" in (deal["listing_url"] or "").lower():
            deal["source"] = "facebook"
        elif "craigslist" in body.lower():
            deal["source"] = "craigslist"
        elif "ebay" in body.lower():
            deal["source"] = "ebay"
        elif "offerup" in body.lower():
            deal["source"] = "offerup"

        # Extract location if present
        location_match = re.search(r"(?:location|city|area):\s*([^,\n]+)", body, re.I)
        if location_match:
            deal["location"] = location_match.group(1).strip()

        # Only return if we got at least a title
        if deal["title"]:
            return deal
        return None


# Singleton instance
_email_service: Optional[EmailIngestionService] = None


def get_email_service() -> EmailIngestionService:
    """Get or create email service instance."""
    global _email_service
    if _email_service is None:
        _email_service = EmailIngestionService()
    return _email_service
