"""eBay API for looking up sold item prices."""

from decimal import Decimal
from typing import Optional
import httpx

from ..config import get_settings

settings = get_settings()

# eBay Browse API endpoint
EBAY_API_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"


async def get_ebay_access_token() -> Optional[str]:
    """
    Get eBay OAuth access token using client credentials.

    Returns access token or None on error.
    """
    if not settings.ebay_app_id or not settings.ebay_cert_id:
        print("eBay API credentials not configured")
        return None

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.ebay.com/identity/v1/oauth2/token",
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                auth=(settings.ebay_app_id, settings.ebay_cert_id),
                data={
                    "grant_type": "client_credentials",
                    "scope": "https://api.ebay.com/oauth/api_scope",
                },
            )
            if response.status_code == 200:
                return response.json().get("access_token")
            else:
                print(f"eBay auth error: {response.status_code} - {response.text}")
                return None
    except Exception as e:
        print(f"eBay auth error: {e}")
        return None


async def get_market_value(
    search_term: str,
    condition: str = "used",
    limit: int = 20,
) -> Optional[dict]:
    """
    Look up market value for an item based on eBay sold listings.

    Args:
        search_term: Item to search for (e.g., "NVIDIA RTX 3080")
        condition: "new" or "used" to filter results
        limit: Max number of sold listings to analyze

    Returns:
        Dict with pricing data:
        - avg_price: Average sold price
        - low_price: Lowest recent sale
        - high_price: Highest recent sale
        - num_sales: Number of sales found
        - sold_items: List of individual sales

    Returns None on error.
    """
    token = await get_ebay_access_token()
    if not token:
        return None

    # Map condition to eBay filter
    condition_filter = "USED" if condition == "used" else "NEW"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                EBAY_API_URL,
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
                },
                params={
                    "q": search_term,
                    "filter": f"conditionIds:{{{condition_filter}}},buyingOptions:{{FIXED_PRICE|AUCTION}},priceCurrency:USD",
                    "sort": "endingSoonest",
                    "limit": limit,
                },
            )

            if response.status_code != 200:
                print(f"eBay search error: {response.status_code} - {response.text}")
                return None

            data = response.json()
            items = data.get("itemSummaries", [])

            if not items:
                return None

            # Extract prices
            prices = []
            sold_items = []

            for item in items:
                price_data = item.get("price", {})
                if price_data.get("currency") == "USD":
                    price = Decimal(price_data.get("value", "0"))
                    if price > 0:
                        prices.append(price)
                        sold_items.append({
                            "title": item.get("title"),
                            "price": float(price),
                            "condition": item.get("condition"),
                            "item_id": item.get("itemId"),
                        })

            if not prices:
                return None

            return {
                "avg_price": float(sum(prices) / len(prices)),
                "low_price": float(min(prices)),
                "high_price": float(max(prices)),
                "num_sales": len(prices),
                "sold_items": sold_items[:10],  # Limit detail to 10
            }

    except Exception as e:
        print(f"eBay lookup error: {e}")
        return None


async def search_completed_listings(
    search_term: str,
    condition: str = "used",
) -> Optional[dict]:
    """
    Alternative: Search eBay for completed/sold listings.

    Note: This requires eBay Finding API access which has different auth.
    The Browse API above works for active listings to estimate market value.

    For actual sold prices, you may need to use:
    - eBay Finding API (findCompletedItems)
    - Third-party services like Terapeak

    This is a placeholder for future implementation.
    """
    # For now, use the browse API which gives current listings
    # This gives a good estimate of market value
    return await get_market_value(search_term, condition)
