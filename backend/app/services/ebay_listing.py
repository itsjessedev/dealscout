"""eBay Listing creation via Inventory API."""

import uuid
from datetime import datetime
from typing import Optional
import httpx

from sqlalchemy.ext.asyncio import AsyncSession

from .ebay_seller import get_valid_access_token, EBAY_URLS
from ..config import get_settings

settings = get_settings()

# eBay API endpoints (dynamic based on sandbox setting)
EBAY_INVENTORY_API = EBAY_URLS["inventory"]
EBAY_MEDIA_API = "https://api.sandbox.ebay.com/commerce/media/v1_beta" if settings.ebay_sandbox else "https://api.ebay.com/commerce/media/v1_beta"
EBAY_VIEW_URL = "https://sandbox.ebay.com/itm" if settings.ebay_sandbox else "https://www.ebay.com/itm"

# Condition mappings for eBay
CONDITION_MAP = {
    "new": "NEW",
    "used": "USED_EXCELLENT",
    "needs_repair": "FOR_PARTS_OR_NOT_WORKING",
}


async def upload_image_to_ebay(
    db: AsyncSession,
    image_data: bytes,
    filename: str,
) -> Optional[str]:
    """
    Upload an image to eBay's media service.
    Returns the eBay image URL if successful.
    """
    access_token = await get_valid_access_token(db)
    if not access_token:
        raise ValueError("No valid eBay access token")

    async with httpx.AsyncClient() as client:
        # Step 1: Create upload task
        response = await client.post(
            f"{EBAY_MEDIA_API}/video",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={
                "title": filename,
                "description": "Product image",
            },
            timeout=30.0,
        )

        # For images, we use a simpler approach - upload directly in offer
        # eBay accepts external URLs or base64 in the pictureDetails
        return None  # We'll handle images differently


async def create_ebay_listing(
    db: AsyncSession,
    flip_id: int,
    title: str,
    description: str,
    category_id: str,
    condition: str,
    price: float,
    quantity: int = 1,
    image_urls: list[str] = None,
) -> dict:
    """
    Create a listing on eBay using the Inventory API.

    Returns:
        dict with listing_id and status
    """
    access_token = await get_valid_access_token(db)
    if not access_token:
        raise ValueError("No valid eBay access token. Please re-link your eBay account.")

    # Generate a unique SKU for this item
    sku = f"DS-{flip_id}-{uuid.uuid4().hex[:8]}"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Content-Language": "en-US",
    }

    async with httpx.AsyncClient() as client:
        # Step 1: Create/update inventory item
        inventory_item = {
            "availability": {
                "shipToLocationAvailability": {
                    "quantity": quantity
                }
            },
            "condition": CONDITION_MAP.get(condition, "USED_EXCELLENT"),
            "product": {
                "title": title[:80],  # eBay limit
                "description": description,
                "imageUrls": image_urls or [],
            }
        }

        response = await client.put(
            f"{EBAY_INVENTORY_API}/inventory_item/{sku}",
            headers=headers,
            json=inventory_item,
            timeout=30.0,
        )

        if response.status_code not in (200, 201, 204):
            error_detail = response.text
            print(f"eBay inventory item error: {response.status_code} - {error_detail}")
            raise ValueError(f"Failed to create inventory item: {error_detail}")

        # Step 2: Create offer
        offer = {
            "sku": sku,
            "marketplaceId": "EBAY_US",
            "format": "FIXED_PRICE",
            "listingDescription": description,
            "availableQuantity": quantity,
            "categoryId": category_id,
            "pricingSummary": {
                "price": {
                    "currency": "USD",
                    "value": str(price)
                }
            },
            "listingPolicies": {
                # These need to be configured in your eBay account
                # We'll use defaults or return an error
            }
        }

        response = await client.post(
            f"{EBAY_INVENTORY_API}/offer",
            headers=headers,
            json=offer,
            timeout=30.0,
        )

        if response.status_code not in (200, 201):
            error_detail = response.text
            print(f"eBay offer error: {response.status_code} - {error_detail}")
            # Return partial success - item created but not listed
            return {
                "success": False,
                "sku": sku,
                "error": f"Item created but offer failed: {error_detail}",
                "requires_manual_listing": True,
            }

        offer_data = response.json()
        offer_id = offer_data.get("offerId")

        # Step 3: Publish the offer
        response = await client.post(
            f"{EBAY_INVENTORY_API}/offer/{offer_id}/publish",
            headers=headers,
            timeout=30.0,
        )

        if response.status_code not in (200, 201):
            error_detail = response.text
            print(f"eBay publish error: {response.status_code} - {error_detail}")
            return {
                "success": False,
                "sku": sku,
                "offer_id": offer_id,
                "error": f"Offer created but publish failed: {error_detail}",
                "requires_manual_listing": True,
            }

        publish_data = response.json()
        listing_id = publish_data.get("listingId")

        return {
            "success": True,
            "sku": sku,
            "offer_id": offer_id,
            "listing_id": listing_id,
            "ebay_url": f"{EBAY_VIEW_URL}/{listing_id}",
        }


async def get_listing_policies(db: AsyncSession) -> dict:
    """Get the seller's listing policies (payment, return, fulfillment)."""
    access_token = await get_valid_access_token(db)
    if not access_token:
        return {}

    async with httpx.AsyncClient() as client:
        policies = {}

        for policy_type in ["payment_policy", "return_policy", "fulfillment_policy"]:
            response = await client.get(
                f"{EBAY_INVENTORY_API.replace('/inventory/v1', '/account/v1')}/{policy_type}?marketplace_id=EBAY_US",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                policy_list = data.get(f"{policy_type.replace('_', '')}s", [])
                if policy_list:
                    # Get the first/default policy
                    policies[policy_type] = policy_list[0].get(f"{policy_type.replace('_', '')}Id")

        return policies
