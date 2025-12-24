"""eBay Seller OAuth integration for getting actual account fees."""

import base64
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
import httpx

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import EbayCredentials

settings = get_settings()


def get_ebay_base_urls() -> dict:
    """Get eBay API base URLs based on sandbox setting."""
    if settings.ebay_sandbox:
        return {
            "auth": "https://auth.sandbox.ebay.com/oauth2/authorize",
            "token": "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
            "account": "https://apiz.sandbox.ebay.com/sell/account/v1",
            "identity": "https://apiz.sandbox.ebay.com/commerce/identity/v1",
            "fulfillment": "https://api.sandbox.ebay.com/sell/fulfillment/v1",
            "inventory": "https://api.sandbox.ebay.com/sell/inventory/v1",
            "browse": "https://api.sandbox.ebay.com/buy/browse/v1",
        }
    return {
        "auth": "https://auth.ebay.com/oauth2/authorize",
        "token": "https://api.ebay.com/identity/v1/oauth2/token",
        "account": "https://apiz.ebay.com/sell/account/v1",
        "identity": "https://apiz.ebay.com/commerce/identity/v1",
        "fulfillment": "https://api.ebay.com/sell/fulfillment/v1",
        "inventory": "https://api.ebay.com/sell/inventory/v1",
        "browse": "https://api.ebay.com/buy/browse/v1",
    }


# eBay OAuth endpoints (dynamic based on sandbox setting)
EBAY_URLS = get_ebay_base_urls()
EBAY_AUTH_URL = EBAY_URLS["auth"]
EBAY_TOKEN_URL = EBAY_URLS["token"]
EBAY_ACCOUNT_API = EBAY_URLS["account"]

# Scopes needed for seller account access and listing creation
SELLER_SCOPES = [
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
    "https://api.ebay.com/oauth/api_scope/sell.inventory",  # Create/manage listings
    "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",  # Read orders
]

# eBay store subscription tiers and their approximate final value fees
# These are for most categories - some categories have different rates
TIER_FEE_MAP = {
    "NO_STORE": Decimal("13.25"),      # No store subscription
    "STARTER": Decimal("13.25"),       # Starter store
    "BASIC": Decimal("12.90"),         # Basic store
    "FEATURED": Decimal("12.35"),      # Featured/Premium store
    "ANCHOR": Decimal("11.50"),        # Anchor store
    "ENTERPRISE": Decimal("10.75"),    # Enterprise store
}

# Default fee if we can't determine tier
DEFAULT_FEE = Decimal("13.00")


def get_auth_url() -> str:
    """Generate eBay OAuth authorization URL."""
    app_id = settings.get_ebay_app_id()
    ru_name = settings.get_ebay_ru_name()

    if not app_id or not ru_name:
        raise ValueError("eBay App ID and RuName must be configured")

    scope = " ".join(SELLER_SCOPES)

    params = {
        "client_id": app_id,
        "redirect_uri": ru_name,  # RuName, not the actual URL
        "response_type": "code",
        "scope": scope,
    }

    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{EBAY_AUTH_URL}?{query}"


async def exchange_code_for_tokens(code: str) -> dict:
    """Exchange authorization code for access and refresh tokens."""
    app_id = settings.get_ebay_app_id()
    cert_id = settings.get_ebay_cert_id()
    ru_name = settings.get_ebay_ru_name()

    if not app_id or not cert_id:
        raise ValueError("eBay credentials not configured")

    # Create Basic auth header
    credentials = f"{app_id}:{cert_id}"
    auth_header = base64.b64encode(credentials.encode()).decode()

    async with httpx.AsyncClient() as client:
        response = await client.post(
            EBAY_TOKEN_URL,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": f"Basic {auth_header}",
            },
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": ru_name,
            },
            timeout=30.0,
        )

        if response.status_code != 200:
            error_text = response.text
            print(f"eBay token exchange error: {response.status_code} - {error_text}")
            raise ValueError(f"Failed to exchange code: {error_text}")

        return response.json()


async def refresh_access_token(refresh_token: str) -> dict:
    """Refresh an expired access token."""
    app_id = settings.get_ebay_app_id()
    cert_id = settings.get_ebay_cert_id()

    if not app_id or not cert_id:
        raise ValueError("eBay credentials not configured")

    credentials = f"{app_id}:{cert_id}"
    auth_header = base64.b64encode(credentials.encode()).decode()

    async with httpx.AsyncClient() as client:
        response = await client.post(
            EBAY_TOKEN_URL,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": f"Basic {auth_header}",
            },
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "scope": " ".join(SELLER_SCOPES),
            },
            timeout=30.0,
        )

        if response.status_code != 200:
            print(f"eBay token refresh error: {response.status_code} - {response.text}")
            raise ValueError("Failed to refresh token")

        return response.json()


async def get_valid_access_token(db: AsyncSession) -> Optional[str]:
    """Get a valid access token, refreshing if needed."""
    result = await db.execute(select(EbayCredentials).limit(1))
    creds = result.scalar_one_or_none()

    if not creds:
        return None

    # Check if token is expired (with 5 min buffer)
    if creds.token_expiry < datetime.utcnow() + timedelta(minutes=5):
        try:
            # Refresh the token
            token_data = await refresh_access_token(creds.refresh_token)
            creds.access_token = token_data["access_token"]
            creds.token_expiry = datetime.utcnow() + timedelta(seconds=token_data["expires_in"])

            # Update refresh token if provided
            if "refresh_token" in token_data:
                creds.refresh_token = token_data["refresh_token"]

            await db.commit()
            print("eBay access token refreshed")
        except Exception as e:
            print(f"Failed to refresh eBay token: {e}")
            return None

    return creds.access_token


async def get_ebay_user_info(access_token: str) -> dict:
    """Get eBay user identity info (username)."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{EBAY_URLS['identity']}/user/",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

        if response.status_code == 200:
            data = response.json()
            return {
                "username": data.get("username"),
                "user_id": data.get("userId"),
            }

        return {}


async def get_seller_account_info(access_token: str) -> dict:
    """Get seller account information including store subscription."""
    async with httpx.AsyncClient() as client:
        # Get subscription info
        response = await client.get(
            f"{EBAY_ACCOUNT_API}/subscription",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

        subscription_data = {}
        if response.status_code == 200:
            data = response.json()
            subscriptions = data.get("subscriptions", [])
            for sub in subscriptions:
                if sub.get("subscriptionType") == "Store":
                    subscription_data = {
                        "tier": sub.get("subscriptionLevel", "NO_STORE"),
                        "name": sub.get("name"),
                    }
                    break

        return subscription_data


def get_fee_for_tier(tier: str) -> Decimal:
    """Get the fee percentage for a store subscription tier."""
    # Normalize tier name
    tier_upper = tier.upper().replace(" ", "_") if tier else "NO_STORE"
    return TIER_FEE_MAP.get(tier_upper, DEFAULT_FEE)


async def save_credentials(
    db: AsyncSession,
    access_token: str,
    refresh_token: str,
    expires_in: int,
    account_info: Optional[dict] = None,
    user_info: Optional[dict] = None,
    user_id: Optional[int] = None,
) -> EbayCredentials:
    """Save or update eBay credentials in database."""
    # Check for existing credentials
    result = await db.execute(select(EbayCredentials).limit(1))
    creds = result.scalar_one_or_none()

    tier = account_info.get("tier", "NO_STORE") if account_info else "NO_STORE"
    fee = get_fee_for_tier(tier)
    username = user_info.get("username") if user_info else None

    if creds:
        # Update existing
        creds.access_token = access_token
        creds.refresh_token = refresh_token
        creds.token_expiry = datetime.utcnow() + timedelta(seconds=expires_in)
        creds.store_subscription_tier = tier
        creds.fee_percentage = fee
        creds.updated_at = datetime.utcnow()
        if username:
            creds.seller_username = username
        if user_id:
            creds.user_id = user_id
    else:
        # Create new
        creds = EbayCredentials(
            access_token=access_token,
            refresh_token=refresh_token,
            token_expiry=datetime.utcnow() + timedelta(seconds=expires_in),
            store_subscription_tier=tier,
            fee_percentage=fee,
            seller_username=username,
            user_id=user_id,
        )
        db.add(creds)

    await db.commit()
    await db.refresh(creds)
    return creds


async def get_current_fee_percentage(db: AsyncSession) -> Decimal:
    """Get the current eBay fee percentage from stored credentials."""
    result = await db.execute(select(EbayCredentials).limit(1))
    creds = result.scalar_one_or_none()

    if creds and creds.fee_percentage:
        return creds.fee_percentage

    return DEFAULT_FEE


async def get_ebay_account_status(db: AsyncSession) -> dict:
    """Get current eBay account linking status."""
    result = await db.execute(select(EbayCredentials).limit(1))
    creds = result.scalar_one_or_none()

    if not creds:
        return {
            "linked": False,
            "auth_url": get_auth_url() if settings.ebay_ru_name else None,
        }

    return {
        "linked": True,
        "username": creds.seller_username,
        "store_tier": creds.store_subscription_tier,
        "fee_percentage": float(creds.fee_percentage) if creds.fee_percentage else DEFAULT_FEE,
        "token_valid": creds.token_expiry > datetime.utcnow(),
        "last_updated": creds.updated_at.isoformat() if creds.updated_at else None,
    }


async def refresh_account_info(db: AsyncSession) -> Optional[dict]:
    """Refresh account info from eBay API."""
    access_token = await get_valid_access_token(db)
    if not access_token:
        return None

    account_info = await get_seller_account_info(access_token)

    if account_info:
        result = await db.execute(select(EbayCredentials).limit(1))
        creds = result.scalar_one_or_none()

        if creds:
            tier = account_info.get("tier", creds.store_subscription_tier)
            creds.store_subscription_tier = tier
            creds.fee_percentage = get_fee_for_tier(tier)
            creds.updated_at = datetime.utcnow()
            await db.commit()

    return account_info
