"""Deals API router."""

from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Deal, Flip
from ..schemas import (
    DealResponse,
    DealConditionUpdate,
    DealMarketValueUpdate,
    FlipFromDeal,
    FlipResponse,
)
from ..services.ebay_lookup import get_market_value
from ..services.profit_calculator import calculate_estimated_profit
from ..services.listing_generator import generate_listing_suggestion

router = APIRouter(prefix="/deals", tags=["deals"])


@router.get("", response_model=list[DealResponse])
async def list_deals(
    status: Optional[str] = Query(None, description="Filter by status"),
    min_profit: Optional[float] = Query(None, description="Minimum estimated profit"),
    category: Optional[str] = Query(None, description="Filter by category"),
    needs_review: bool = Query(False, description="Only show items needing condition review"),
    db: AsyncSession = Depends(get_db),
):
    """List all deals with optional filters."""
    query = select(Deal).order_by(Deal.created_at.desc())

    if status:
        query = query.where(Deal.status == status)
    if min_profit is not None:
        query = query.where(Deal.estimated_profit >= min_profit)
    if category:
        query = query.where(Deal.category == category)
    if needs_review:
        # Show items that need condition review OR need repair confirmation
        query = query.where(
            or_(
                Deal.condition == "unknown",
                Deal.status == "needs_condition"
            )
        )

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{deal_id}", response_model=DealResponse)
async def get_deal(deal_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single deal by ID."""
    result = await db.execute(select(Deal).where(Deal.id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@router.post("/{deal_id}/dismiss")
async def dismiss_deal(deal_id: int, db: AsyncSession = Depends(get_db)):
    """Mark a deal as dismissed."""
    result = await db.execute(select(Deal).where(Deal.id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    deal.status = "dismissed"
    await db.commit()
    return {"status": "dismissed", "deal_id": deal_id}


@router.post("/{deal_id}/condition", response_model=DealResponse)
async def update_condition(
    deal_id: int,
    condition_update: DealConditionUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update the condition for a deal (when AI couldn't determine it)."""
    result = await db.execute(select(Deal).where(Deal.id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    if condition_update.condition not in ("new", "used", "needs_repair"):
        raise HTTPException(status_code=400, detail="Condition must be 'new', 'used', or 'needs_repair'")

    deal.condition = condition_update.condition
    deal.condition_confidence = "user_confirmed"
    deal.status = "new"  # Now it can be processed

    # Test product mock prices (for condition change testing)
    test_prices = {
        # TEST 1: PS5 - profitable as NEW, unprofitable as USED
        "PlayStation 5": {"new": Decimal("499.00"), "used": Decimal("350.00")},
        # TEST 2: iPhone 14 Pro - profitable as USED, unprofitable as NEW
        "iPhone 14 Pro": {"new": Decimal("650.00"), "used": Decimal("850.00")},
        # TEST 3: Steam Deck OLED - profitable either way
        "Steam Deck OLED": {"new": Decimal("549.00"), "used": Decimal("480.00")},
        # TEST 5: iPad Mini 6 - FB-only as NEW, both profitable as USED
        # Asking $300: NEW $330 (FB +$30, eBay -$13), USED $400 (FB +$100, eBay +$48)
        "iPad Mini 6": {"new": Decimal("330.00"), "used": Decimal("400.00")},
        # TEST 6: Apple Watch Ultra 2 - eBay profitable as NEW, FB-only as USED
        # Asking $500: NEW $650 (FB +$150, eBay +$65), USED $550 (FB +$50, eBay -$21)
        "Apple Watch Ultra 2": {"new": Decimal("650.00"), "used": Decimal("550.00")},
        # Review items - need mock prices for condition toggle testing
        # Nintendo Switch OLED - Asking $250: NEW $350 (profitable), USED $300 (profitable)
        "Switch OLED": {"new": Decimal("350.00"), "used": Decimal("300.00")},
        # Sony WH-1000XM5 - Asking $200: NEW $350 (profitable), USED $280 (profitable)
        "WH-1000XM5": {"new": Decimal("350.00"), "used": Decimal("280.00")},
        # DJI Mini 3 Pro - Asking $500: NEW $750 (profitable), USED $600 (profitable)
        "Mini 3 Pro": {"new": Decimal("750.00"), "used": Decimal("600.00")},
        # Canon EOS R6 - Asking $1200: NEW $1800 (profitable), USED $1400 (profitable)
        "EOS R6": {"new": Decimal("1800.00"), "used": Decimal("1400.00")},
        # Bose QuietComfort Ultra - Asking $180: NEW $300 (profitable), USED $220 (FB-only)
        "QuietComfort Ultra": {"new": Decimal("300.00"), "used": Decimal("220.00")},
    }

    # Check if this is a test product
    if deal.model and deal.model in test_prices:
        # Use mock prices for test products
        deal.market_value = test_prices[deal.model][deal.condition]
        deal.estimated_profit = calculate_estimated_profit(
            asking_price=deal.asking_price,
            market_value=deal.market_value,
        )
        deal.price_status = "mock_data"
        deal.price_note = "Test product with simulated prices"
    elif deal.model or deal.subcategory:
        # Real products: call eBay API
        search_term = f"{deal.brand or ''} {deal.model or deal.subcategory}".strip()
        pricing = await get_market_value(search_term, deal.condition)
        if pricing:
            deal.market_value = Decimal(str(pricing.get("avg_price")))
            deal.ebay_sold_data = pricing
            deal.estimated_profit = calculate_estimated_profit(
                asking_price=deal.asking_price,
                market_value=deal.market_value,
            )

            # Determine price status based on data quality
            num_sales = pricing.get("num_sales", 0)
            low_price = pricing.get("low_price", 0)
            high_price = pricing.get("high_price", 0)
            price_range = high_price - low_price if high_price and low_price else 0
            avg_price = float(deal.market_value)

            # Check if prices are too spread out (high variance)
            if num_sales >= 5 and price_range < avg_price * 0.3:
                deal.price_status = "accurate"
                deal.price_note = f"Based on {num_sales} similar listings"
            elif num_sales >= 3:
                deal.price_status = "similar_prices"
                deal.price_note = f"Prices vary (${low_price:.0f}-${high_price:.0f})"
            else:
                deal.price_status = "limited_data"
                deal.price_note = f"Only {num_sales} listings found"
        else:
            # No eBay data found
            deal.price_status = "no_data"
            deal.price_note = "Could not find market prices"
    else:
        deal.price_status = "no_data"
        deal.price_note = "Insufficient product info for lookup"

    await db.commit()
    await db.refresh(deal)
    return deal


@router.post("/{deal_id}/market-value", response_model=DealResponse)
async def update_market_value(
    deal_id: int,
    market_value_update: DealMarketValueUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Manually set market value for a deal when auto-lookup fails or is inaccurate."""
    result = await db.execute(select(Deal).where(Deal.id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    deal.market_value = market_value_update.market_value
    deal.estimated_profit = calculate_estimated_profit(
        asking_price=deal.asking_price,
        market_value=deal.market_value,
    )
    deal.price_status = "user_set"
    deal.price_note = "Manually entered by user"

    await db.commit()
    await db.refresh(deal)
    return deal


@router.post("/{deal_id}/purchase", response_model=FlipResponse)
async def purchase_deal(
    deal_id: int,
    purchase_data: FlipFromDeal,
    db: AsyncSession = Depends(get_db),
):
    """Create a flip from a purchased deal."""
    result = await db.execute(select(Deal).where(Deal.id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    if deal.status == "purchased":
        raise HTTPException(status_code=400, detail="Deal already purchased")

    # Create flip from deal
    flip = Flip(
        deal_id=deal.id,
        item_name=deal.title,
        image_url=deal.image_url,
        category=deal.category,
        buy_price=purchase_data.buy_price,
        buy_date=purchase_data.buy_date,
        buy_source=deal.source,
        notes=purchase_data.notes,
        status="active",
        # Track planned repairs for items needing repair
        planned_repairs=purchase_data.planned_repairs,
    )
    db.add(flip)

    # Update deal status
    deal.status = "purchased"

    await db.commit()
    await db.refresh(flip)
    return flip


@router.get("/{deal_id}/listing-suggestion")
async def get_listing_suggestion(deal_id: int, db: AsyncSession = Depends(get_db)):
    """
    Generate an eBay listing suggestion for a deal.

    Returns optimized title, description, category, and testing checklist.
    """
    result = await db.execute(select(Deal).where(Deal.id == deal_id))
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    suggestion = generate_listing_suggestion(
        title=deal.title,
        brand=deal.brand,
        model=deal.model,
        category=deal.category,
        subcategory=deal.subcategory,
        condition=deal.condition,
        item_details=deal.item_details,
        repair_notes=deal.repair_notes,
        accessory_completeness=deal.accessory_completeness,
        bundle_items=deal.bundle_items,
        variants=deal.variants,
        part_numbers=deal.part_numbers,
    )

    return {
        "deal_id": deal_id,
        **suggestion,
    }
