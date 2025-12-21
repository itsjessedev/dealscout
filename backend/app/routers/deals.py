"""Deals API router."""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Deal, Flip
from ..schemas import (
    DealResponse,
    DealConditionUpdate,
    FlipFromDeal,
    FlipResponse,
)
from ..services.ebay_lookup import get_market_value
from ..services.profit_calculator import calculate_estimated_profit

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
        query = query.where(Deal.condition == "unknown")

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

    if condition_update.condition not in ("new", "used"):
        raise HTTPException(status_code=400, detail="Condition must be 'new' or 'used'")

    deal.condition = condition_update.condition
    deal.condition_confidence = "user_confirmed"
    deal.status = "new"  # Now it can be processed

    # Recalculate market value with confirmed condition
    if deal.model or deal.subcategory:
        search_term = f"{deal.brand or ''} {deal.model or deal.subcategory}".strip()
        pricing = await get_market_value(search_term, deal.condition)
        if pricing:
            deal.market_value = pricing.get("avg_price")
            deal.ebay_sold_data = pricing
            deal.estimated_profit = calculate_estimated_profit(
                asking_price=deal.asking_price,
                market_value=deal.market_value,
            )

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
        category=deal.category,
        buy_price=purchase_data.buy_price,
        buy_date=purchase_data.buy_date,
        buy_source=deal.source,
        notes=purchase_data.notes,
        status="active",
    )
    db.add(flip)

    # Update deal status
    deal.status = "purchased"

    await db.commit()
    await db.refresh(flip)
    return flip
