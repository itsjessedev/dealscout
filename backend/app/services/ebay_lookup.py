"""eBay API for looking up sold item prices with robust fallback strategies."""

import asyncio
import re
from decimal import Decimal
from typing import Optional
import httpx

from ..config import get_settings

settings = get_settings()

# eBay Browse API endpoint
EBAY_API_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"

# Simple in-memory cache for successful lookups (reduces API calls)
_price_cache: dict[str, dict] = {}
_cache_ttl = 3600 * 6  # 6 hours


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


def generate_search_variations(search_term: str) -> list[str]:
    """
    Generate multiple search term variations to maximize chances of finding results.
    Tries progressively broader searches.
    """
    variations = [search_term]  # Original term first

    # Remove common size/capacity suffixes that might be too specific
    cleaned = re.sub(r'\b\d+\s*(gb|tb|inch|"|\')\b', '', search_term, flags=re.IGNORECASE).strip()
    if cleaned and cleaned != search_term:
        variations.append(cleaned)

    # Split into words and try different combinations
    words = search_term.split()
    if len(words) >= 3:
        # Try first 2 words (usually brand + model)
        variations.append(' '.join(words[:2]))
        # Try first 3 words
        variations.append(' '.join(words[:3]))

    # Remove parenthetical content (often contains SKUs or variants)
    no_parens = re.sub(r'\([^)]*\)', '', search_term).strip()
    if no_parens and no_parens != search_term:
        variations.append(no_parens)

    # Remove special characters that might cause issues
    alphanumeric = re.sub(r'[^\w\s]', ' ', search_term)
    alphanumeric = ' '.join(alphanumeric.split())  # Normalize spaces
    if alphanumeric and alphanumeric not in variations:
        variations.append(alphanumeric)

    return variations


async def _single_ebay_search(
    client: httpx.AsyncClient,
    token: str,
    search_term: str,
    condition_filter: str,
    limit: int = 20,
) -> Optional[dict]:
    """Perform a single eBay search with the given term."""
    try:
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
            timeout=10.0,
        )

        if response.status_code != 200:
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
            "sold_items": sold_items[:10],
            "search_term_used": search_term,
        }

    except Exception:
        return None


async def get_market_value(
    search_term: str,
    condition: str = "used",
    limit: int = 20,
) -> Optional[dict]:
    """
    Look up market value for an item based on eBay listings with robust fallbacks.

    Strategy:
    1. Check cache first
    2. Try original search term
    3. Try search variations (broader terms)
    4. Try without condition filter if still no results
    5. Retry with exponential backoff on transient failures

    Args:
        search_term: Item to search for (e.g., "NVIDIA RTX 3080")
        condition: "new" or "used" to filter results
        limit: Max number of listings to analyze

    Returns:
        Dict with pricing data or None on complete failure.
    """
    # Check cache first
    cache_key = f"{search_term}:{condition}"
    if cache_key in _price_cache:
        cached = _price_cache[cache_key]
        # In production, check TTL here
        return cached

    token = await get_ebay_access_token()
    if not token:
        print("eBay: Failed to get access token")
        return None

    condition_filter = "USED" if condition == "used" else "NEW"
    variations = generate_search_variations(search_term)

    async with httpx.AsyncClient() as client:
        # Strategy 1: Try each search variation with condition filter
        for variation in variations:
            # Retry up to 2 times with exponential backoff
            for attempt in range(3):
                result = await _single_ebay_search(
                    client, token, variation, condition_filter, limit
                )
                if result:
                    # Good result - cache it
                    _price_cache[cache_key] = result
                    print(f"eBay: Found prices using '{variation}' ({result['num_sales']} listings)")
                    return result

                if attempt < 2:
                    await asyncio.sleep(0.5 * (attempt + 1))  # 0.5s, 1s backoff

        # Strategy 2: Try without condition filter (any condition)
        print(f"eBay: No {condition} results, trying any condition...")
        for variation in variations[:2]:  # Only try first 2 variations
            result = await _single_ebay_search(
                client, token, variation, "NEW|USED", limit
            )
            if result:
                result["condition_note"] = "Mixed conditions (new+used)"
                _price_cache[cache_key] = result
                print(f"eBay: Found prices using '{variation}' (any condition)")
                return result

        # Strategy 3: Try even broader search (first 2 words only)
        words = search_term.split()
        if len(words) > 2:
            broad_term = ' '.join(words[:2])
            result = await _single_ebay_search(
                client, token, broad_term, condition_filter, limit
            )
            if result:
                result["broad_match"] = True
                _price_cache[cache_key] = result
                print(f"eBay: Found prices using broad search '{broad_term}'")
                return result

    print(f"eBay: No results found for '{search_term}' after all fallback attempts")
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


# Rickman, TN location for local pickup searches
HOME_ZIP = "38580"
HOME_RADIUS_MILES = 100


async def check_local_pickup_available(
    search_term: str,
    condition: str = "used",
    limit: int = 5,
) -> Optional[dict]:
    """
    Check if similar items are available for local pickup on eBay within 100mi.

    Uses eBay Browse API with pickup filters:
    - pickupCountry, pickupPostalCode, pickupRadius, pickupRadiusUnit
    - deliveryOptions: SELLER_ARRANGED_LOCAL_PICKUP

    Returns:
        Dict with local pickup listings or None if none found.
    """
    token = await get_ebay_access_token()
    if not token:
        return None

    condition_filter = "USED" if condition == "used" else "NEW"

    # Build filter with local pickup requirements
    pickup_filter = (
        f"conditionIds:{{{condition_filter}}},"
        f"pickupCountry:US,"
        f"pickupPostalCode:{HOME_ZIP},"
        f"pickupRadius:{HOME_RADIUS_MILES},"
        f"pickupRadiusUnit:mi,"
        f"deliveryOptions:{{SELLER_ARRANGED_LOCAL_PICKUP}}"
    )

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
                    "filter": pickup_filter,
                    "sort": "distance",
                    "limit": limit,
                },
                timeout=10.0,
            )

            if response.status_code != 200:
                print(f"eBay local pickup search failed: {response.status_code}")
                return None

            data = response.json()
            items = data.get("itemSummaries", [])

            if not items:
                return None

            # Extract local pickup listings
            local_items = []
            for item in items:
                price_data = item.get("price", {})
                if price_data.get("currency") == "USD":
                    local_items.append({
                        "title": item.get("title"),
                        "price": float(price_data.get("value", 0)),
                        "condition": item.get("condition"),
                        "item_id": item.get("itemId"),
                        "location": item.get("itemLocation", {}).get("city"),
                        "distance": item.get("distanceFromPickupLocation", {}).get("value"),
                    })

            if not local_items:
                return None

            return {
                "count": len(local_items),
                "items": local_items,
                "search_term": search_term,
            }

    except Exception as e:
        print(f"eBay local pickup search error: {e}")
        return None


async def get_market_value_with_local(
    search_term: str,
    condition: str = "used",
    limit: int = 20,
) -> Optional[dict]:
    """
    Get market value AND check for local pickup availability.

    Returns market value data with additional 'local_pickup' field if available.
    """
    # Run both searches in parallel
    market_task = get_market_value(search_term, condition, limit)
    local_task = check_local_pickup_available(search_term, condition, 5)

    market_result, local_result = await asyncio.gather(market_task, local_task)

    if market_result and local_result:
        market_result["local_pickup"] = local_result

    return market_result


async def get_part_cost(
    part_search_term: str,
    limit: int = 10,
) -> Optional[dict]:
    """
    Search eBay for replacement part pricing.

    Used for repair cost estimation - finds cheapest source for specific parts.

    Args:
        part_search_term: Specific part to search for (e.g., "iPhone 14 Pro Max screen replacement")
        limit: Max listings to check

    Returns:
        Dict with part info including URL to cheapest listing, or None if not found.
    """
    token = await get_ebay_access_token()
    if not token:
        return None

    # Search variations for parts
    search_terms = [
        f"{part_search_term} replacement",
        part_search_term,
        f"{part_search_term} repair",
        f"{part_search_term} OEM",
    ]

    async with httpx.AsyncClient() as client:
        for search in search_terms:
            try:
                response = await client.get(
                    EBAY_API_URL,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
                    },
                    params={
                        "q": search,
                        "filter": "buyingOptions:{FIXED_PRICE},priceCurrency:USD",
                        "sort": "price",  # Lowest price first
                        "limit": limit,
                    },
                    timeout=10.0,
                )

                if response.status_code != 200:
                    continue

                data = response.json()
                items = data.get("itemSummaries", [])

                if not items:
                    continue

                # Find cheapest valid listing
                for item in items:
                    price_data = item.get("price", {})
                    if price_data.get("currency") == "USD":
                        price = float(price_data.get("value", 0))
                        if price > 0:
                            item_id = item.get("itemId", "")
                            return {
                                "part_name": part_search_term,
                                "part_cost": price,
                                "part_url": f"https://www.ebay.com/itm/{item_id}",
                                "part_title": item.get("title"),
                                "seller": item.get("seller", {}).get("username"),
                                "source": "eBay",
                                "search_term_used": search,
                            }

            except Exception as e:
                print(f"Part search error for '{search}': {e}")
                continue

    return None


async def get_parts_market_value(
    search_term: str,
    limit: int = 20,
) -> Optional[dict]:
    """
    Look up market value for "for parts/broken" items.

    Used to price items that need repair - compares to other broken/parts listings.

    Args:
        search_term: Item to search for (e.g., "iPhone 14 Pro Max")
        limit: Max listings to analyze

    Returns:
        Dict with parts pricing data or None if not found.
    """
    token = await get_ebay_access_token()
    if not token:
        return None

    # Search terms for broken/parts items
    parts_searches = [
        f"{search_term} for parts",
        f"{search_term} as-is",
        f"{search_term} broken",
        f"{search_term} not working",
    ]

    async with httpx.AsyncClient() as client:
        for search in parts_searches:
            result = await _single_ebay_search(
                client, token, search, "USED", limit
            )
            if result and result.get("num_sales", 0) >= 3:
                result["parts_listing"] = True
                result["search_note"] = f"Parts/broken pricing from '{search}'"
                return result

    return None


async def analyze_price_trends(
    search_term: str,
    condition: str = "used",
) -> Optional[dict]:
    """
    Simple price trend analysis based on current listings.

    Analyzes price range spread to estimate market stability.

    Returns:
        Dict with trend indicator and note.
    """
    result = await get_market_value(search_term, condition, limit=20)
    if not result or result.get("num_sales", 0) < 5:
        return None

    avg_price = result.get("avg_price", 0)
    low_price = result.get("low_price", 0)
    high_price = result.get("high_price", 0)

    if avg_price <= 0:
        return None

    # Calculate price volatility
    price_range = high_price - low_price
    volatility = price_range / avg_price

    # Determine trend based on price distribution
    if volatility < 0.20:
        # Tight range = stable market
        trend = "stable"
        note = f"Consistent pricing around ${avg_price:.0f}"
    elif low_price > avg_price * 0.85:
        # Low prices close to average = strong demand
        trend = "up"
        note = f"Strong demand, prices ${low_price:.0f}-${high_price:.0f}"
    elif high_price < avg_price * 1.15:
        # High prices close to average = softening
        trend = "down"
        note = f"Prices softening, ${low_price:.0f}-${high_price:.0f}"
    else:
        # Wide range = variable market
        trend = "stable"
        note = f"Variable pricing ${low_price:.0f}-${high_price:.0f}"

    return {
        "trend": trend,
        "note": note,
        "avg_price": avg_price,
        "low_price": low_price,
        "high_price": high_price,
        "volatility": round(volatility, 2),
        "num_listings": result.get("num_sales", 0),
    }
