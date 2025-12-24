"""eBay Order Sync - Auto-detect sold items and mark flips as sold."""

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
import httpx

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Flip, EbayCredentials
from .ebay_seller import get_valid_access_token, get_fee_for_tier, EBAY_URLS

EBAY_FULFILLMENT_API = EBAY_URLS["fulfillment"]


async def get_recent_orders(access_token: str, days_back: int = 7) -> list[dict]:
    """
    Fetch recent eBay orders.

    Args:
        access_token: Valid eBay OAuth token
        days_back: How many days back to search for orders

    Returns:
        List of order dictionaries
    """
    # Calculate date range
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days_back)

    # Format dates for eBay API (ISO 8601)
    date_filter = f"creationdate:[{start_date.strftime('%Y-%m-%dT%H:%M:%S.000Z')}..{end_date.strftime('%Y-%m-%dT%H:%M:%S.000Z')}]"

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{EBAY_FULFILLMENT_API}/order",
            params={
                "filter": date_filter,
                "limit": 50,  # Max per request
            },
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

        if response.status_code != 200:
            print(f"eBay orders API error: {response.status_code} - {response.text}")
            return []

        data = response.json()
        return data.get("orders", [])


def extract_order_info(order: dict) -> dict:
    """
    Extract relevant info from an eBay order.

    Returns:
        Dict with listing_id, sell_price, fees, order_date
    """
    # Get line items (usually just one for single item sales)
    line_items = order.get("lineItems", [])

    extracted_items = []
    for item in line_items:
        listing_id = item.get("legacyItemId")  # This is the eBay item ID

        # Get sale price
        line_item_cost = item.get("lineItemCost", {})
        sell_price = Decimal(line_item_cost.get("value", "0"))

        # Get delivery cost (shipping buyer paid)
        delivery_cost = item.get("deliveryCost", {})
        shipping_cost = Decimal(delivery_cost.get("shippingCost", {}).get("value", "0"))

        extracted_items.append({
            "listing_id": listing_id,
            "sell_price": sell_price,
            "shipping_paid_by_buyer": shipping_cost,
            "title": item.get("title"),
            "quantity": item.get("quantity", 1),
        })

    # Get order-level info
    order_id = order.get("orderId")
    order_date = order.get("creationDate", "")[:10]  # Just the date part

    # Get total fees from pricing summary
    pricing_summary = order.get("pricingSummary", {})
    total_fee = Decimal("0")

    # eBay fees are in the order's fee breakdown
    fee_breakdown = order.get("totalFeeBasisAmount", {})
    if fee_breakdown:
        total_fee = Decimal(fee_breakdown.get("value", "0"))

    return {
        "order_id": order_id,
        "order_date": order_date,
        "items": extracted_items,
        "buyer_username": order.get("buyer", {}).get("username"),
        "order_status": order.get("orderFulfillmentStatus"),
    }


async def sync_sold_items(db: AsyncSession) -> dict:
    """
    Check eBay orders and mark matching flips as sold.

    Returns:
        Dict with sync results
    """
    # Get valid access token
    access_token = await get_valid_access_token(db)
    if not access_token:
        return {
            "success": False,
            "error": "No valid eBay access token",
            "synced": 0,
        }

    # Get eBay fee percentage for calculations
    result = await db.execute(select(EbayCredentials).limit(1))
    creds = result.scalar_one_or_none()
    fee_percentage = float(creds.fee_percentage) / 100 if creds and creds.fee_percentage else 0.13

    # Fetch recent orders
    orders = await get_recent_orders(access_token, days_back=7)

    if not orders:
        return {
            "success": True,
            "message": "No recent orders found",
            "synced": 0,
        }

    # Get all active flips with eBay listings
    active_flips_result = await db.execute(
        select(Flip).where(
            and_(
                Flip.status == "active",
                Flip.ebay_listing_id.isnot(None),
            )
        )
    )
    active_flips = active_flips_result.scalars().all()

    # Create lookup by eBay listing ID
    flip_by_listing = {flip.ebay_listing_id: flip for flip in active_flips}

    synced_count = 0
    synced_items = []

    for order in orders:
        order_info = extract_order_info(order)

        # Skip if order not fulfilled/completed
        if order_info["order_status"] not in ["FULFILLED", "IN_PROGRESS"]:
            continue

        for item in order_info["items"]:
            listing_id = item["listing_id"]

            if listing_id and listing_id in flip_by_listing:
                flip = flip_by_listing[listing_id]

                # Calculate fees (based on sell price)
                sell_price = float(item["sell_price"])
                fees_paid = sell_price * fee_percentage

                # Mark as sold
                flip.status = "sold"
                flip.sell_price = sell_price
                flip.sell_date = order_info["order_date"]
                flip.sell_platform = "ebay"
                flip.fees_paid = fees_paid
                flip.listing_status = "sold"

                # Calculate profit
                flip.profit = flip.calculate_profit()

                synced_count += 1
                synced_items.append({
                    "flip_id": flip.id,
                    "item_name": flip.item_name,
                    "sell_price": sell_price,
                    "profit": float(flip.profit) if flip.profit else 0,
                })

    if synced_count > 0:
        await db.commit()

    return {
        "success": True,
        "synced": synced_count,
        "items": synced_items,
        "orders_checked": len(orders),
    }


async def check_order_status(db: AsyncSession, ebay_listing_id: str) -> Optional[dict]:
    """
    Check if a specific listing has been sold.

    Args:
        db: Database session
        ebay_listing_id: The eBay listing/item ID to check

    Returns:
        Order info if sold, None if not
    """
    access_token = await get_valid_access_token(db)
    if not access_token:
        return None

    orders = await get_recent_orders(access_token, days_back=30)

    for order in orders:
        order_info = extract_order_info(order)
        for item in order_info["items"]:
            if item["listing_id"] == ebay_listing_id:
                return {
                    "sold": True,
                    "order_id": order_info["order_id"],
                    "sell_price": float(item["sell_price"]),
                    "order_date": order_info["order_date"],
                    "buyer": order_info["buyer_username"],
                }

    return None
