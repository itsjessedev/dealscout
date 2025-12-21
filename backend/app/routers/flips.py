"""Flips API router."""

from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Flip
from ..schemas import (
    FlipCreate,
    FlipUpdate,
    FlipSell,
    FlipResponse,
)
from ..config import get_settings

router = APIRouter(prefix="/flips", tags=["flips"])
settings = get_settings()


@router.get("", response_model=list[FlipResponse])
async def list_flips(
    status: Optional[str] = Query(None, description="Filter: active (current) or sold (profits)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    platform: Optional[str] = Query(None, description="Filter by sell platform"),
    date_from: Optional[date] = Query(None, description="Filter by date range start"),
    date_to: Optional[date] = Query(None, description="Filter by date range end"),
    db: AsyncSession = Depends(get_db),
):
    """List flips with optional filters."""
    query = select(Flip).order_by(Flip.created_at.desc())

    if status:
        query = query.where(Flip.status == status)
    if category:
        query = query.where(Flip.category == category)
    if platform:
        query = query.where(Flip.sell_platform == platform)
    if date_from:
        # For active flips, filter by buy_date; for sold, by sell_date
        query = query.where(
            (Flip.buy_date >= date_from) | (Flip.sell_date >= date_from)
        )
    if date_to:
        query = query.where(
            (Flip.buy_date <= date_to) | (Flip.sell_date <= date_to)
        )

    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=FlipResponse)
async def create_flip(flip_data: FlipCreate, db: AsyncSession = Depends(get_db)):
    """Create a new flip manually (not from a deal)."""
    flip = Flip(
        item_name=flip_data.item_name,
        category=flip_data.category,
        buy_price=flip_data.buy_price,
        buy_date=flip_data.buy_date,
        buy_source=flip_data.buy_source,
        notes=flip_data.notes,
        status="active",
    )
    db.add(flip)
    await db.commit()
    await db.refresh(flip)
    return flip


@router.get("/{flip_id}", response_model=FlipResponse)
async def get_flip(flip_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single flip by ID."""
    result = await db.execute(select(Flip).where(Flip.id == flip_id))
    flip = result.scalar_one_or_none()
    if not flip:
        raise HTTPException(status_code=404, detail="Flip not found")
    return flip


@router.put("/{flip_id}", response_model=FlipResponse)
async def update_flip(
    flip_id: int,
    flip_update: FlipUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update flip details."""
    result = await db.execute(select(Flip).where(Flip.id == flip_id))
    flip = result.scalar_one_or_none()
    if not flip:
        raise HTTPException(status_code=404, detail="Flip not found")

    # Update only provided fields
    update_data = flip_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(flip, field, value)

    await db.commit()
    await db.refresh(flip)
    return flip


@router.post("/{flip_id}/sell", response_model=FlipResponse)
async def sell_flip(
    flip_id: int,
    sell_data: FlipSell,
    db: AsyncSession = Depends(get_db),
):
    """Mark a flip as sold and calculate profit."""
    result = await db.execute(select(Flip).where(Flip.id == flip_id))
    flip = result.scalar_one_or_none()
    if not flip:
        raise HTTPException(status_code=404, detail="Flip not found")

    if flip.status == "sold":
        raise HTTPException(status_code=400, detail="Flip already sold")

    # Update sale info
    flip.sell_price = sell_data.sell_price
    flip.sell_date = sell_data.sell_date
    flip.sell_platform = sell_data.sell_platform
    flip.fees_paid = sell_data.fees_paid
    flip.shipping_cost = sell_data.shipping_cost
    flip.status = "sold"

    # Calculate profit
    flip.profit = flip.calculate_profit()

    await db.commit()
    await db.refresh(flip)
    return flip


@router.delete("/{flip_id}")
async def delete_flip(flip_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a flip."""
    result = await db.execute(select(Flip).where(Flip.id == flip_id))
    flip = result.scalar_one_or_none()
    if not flip:
        raise HTTPException(status_code=404, detail="Flip not found")

    await db.delete(flip)
    await db.commit()
    return {"status": "deleted", "flip_id": flip_id}
