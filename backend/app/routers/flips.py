"""Flips API router."""

from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Flip, Deal
from ..schemas import (
    FlipCreate,
    FlipUpdate,
    FlipSell,
    FlipResponse,
)
from ..config import get_settings
from ..services.ebay_listing import create_ebay_listing
from ..services.listing_generator import generate_listing_suggestion
from ..services.ebay_orders import sync_sold_items

router = APIRouter(prefix="/flips", tags=["flips"])
settings = get_settings()


class CreateListingRequest(BaseModel):
    """Request to create an eBay listing."""
    title: str
    description: str
    category_id: str
    price: float
    condition: str = "used"
    image_urls: list[str] = []


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


@router.get("/{flip_id}/listing-suggestion")
async def get_flip_listing_suggestion(flip_id: int, db: AsyncSession = Depends(get_db)):
    """
    Get a listing suggestion for a flip.
    Uses the original deal data if available.
    """
    result = await db.execute(select(Flip).where(Flip.id == flip_id))
    flip = result.scalar_one_or_none()
    if not flip:
        raise HTTPException(status_code=404, detail="Flip not found")

    # If flip came from a deal, get deal data for better suggestions
    deal = None
    if flip.deal_id:
        deal_result = await db.execute(select(Deal).where(Deal.id == flip.deal_id))
        deal = deal_result.scalar_one_or_none()

    if deal:
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
    else:
        # Generate basic suggestion from flip data
        suggestion = generate_listing_suggestion(
            title=flip.item_name,
            brand=None,
            model=None,
            category=flip.category,
            subcategory=None,
            condition="used",
            item_details=None,
            repair_notes=None,
            accessory_completeness=None,
            bundle_items=None,
            variants=None,
            part_numbers=None,
        )

    return {
        "flip_id": flip_id,
        **suggestion,
    }


@router.post("/{flip_id}/list")
async def create_flip_listing(
    flip_id: int,
    listing_data: CreateListingRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Create an eBay listing for a flip.
    Requires eBay account to be linked with sell.inventory scope.
    """
    result = await db.execute(select(Flip).where(Flip.id == flip_id))
    flip = result.scalar_one_or_none()
    if not flip:
        raise HTTPException(status_code=404, detail="Flip not found")

    if flip.ebay_listing_id:
        raise HTTPException(status_code=400, detail="Item already listed on eBay")

    try:
        listing_result = await create_ebay_listing(
            db=db,
            flip_id=flip_id,
            title=listing_data.title,
            description=listing_data.description,
            category_id=listing_data.category_id,
            condition=listing_data.condition,
            price=listing_data.price,
            image_urls=listing_data.image_urls,
        )

        if listing_result.get("success"):
            # Update flip with listing info
            flip.ebay_listing_id = listing_result.get("listing_id")
            flip.listed_at = datetime.utcnow()
            flip.listing_status = "active"
            await db.commit()
            await db.refresh(flip)

            return {
                "success": True,
                "flip_id": flip_id,
                "ebay_listing_id": flip.ebay_listing_id,
                "ebay_url": listing_result.get("ebay_url"),
                "message": "Successfully listed on eBay!",
            }
        else:
            return {
                "success": False,
                "flip_id": flip_id,
                "error": listing_result.get("error"),
                "requires_manual_listing": listing_result.get("requires_manual_listing", False),
            }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"eBay listing error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create eBay listing")


@router.post("/sync-ebay-orders")
async def sync_ebay_orders(db: AsyncSession = Depends(get_db)):
    """
    Manually trigger eBay order sync to detect sold items.

    This checks recent eBay orders and marks matching flips as sold
    with the actual sale price.
    """
    try:
        result = await sync_sold_items(db)
        return result
    except Exception as e:
        print(f"eBay sync error: {e}")
        raise HTTPException(status_code=500, detail="Failed to sync eBay orders")
