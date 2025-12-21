"""Stats API router."""

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Flip, Setting, DeviceToken
from ..schemas import (
    StatsResponse,
    ProfitStats,
    ProfitByPeriod,
    ProfitByCategory,
    SettingsUpdate,
    SettingsResponse,
    DeviceTokenRegister,
)
from ..config import get_settings

router = APIRouter(tags=["stats"])
app_settings = get_settings()


@router.get("/stats", response_model=StatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Get profit statistics and summaries."""
    # Overall stats for sold flips
    sold_query = select(Flip).where(Flip.status == "sold")
    result = await db.execute(sold_query)
    sold_flips = result.scalars().all()

    total_profit = sum(f.profit or Decimal("0") for f in sold_flips)
    total_invested = sum(f.buy_price for f in sold_flips)
    total_revenue = sum(f.sell_price or Decimal("0") for f in sold_flips)
    best_profit = max((f.profit for f in sold_flips if f.profit), default=None)

    overall = ProfitStats(
        total_profit=total_profit,
        total_flips=len(sold_flips),
        avg_profit_per_flip=total_profit / len(sold_flips) if sold_flips else Decimal("0"),
        best_flip_profit=best_profit,
        total_invested=total_invested,
        total_revenue=total_revenue,
    )

    # Profit by period (this week, this month)
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    week_flips = [f for f in sold_flips if f.sell_date and f.sell_date >= week_start]
    month_flips = [f for f in sold_flips if f.sell_date and f.sell_date >= month_start]

    by_period = [
        ProfitByPeriod(
            period="this_week",
            profit=sum(f.profit or Decimal("0") for f in week_flips),
            flip_count=len(week_flips),
        ),
        ProfitByPeriod(
            period="this_month",
            profit=sum(f.profit or Decimal("0") for f in month_flips),
            flip_count=len(month_flips),
        ),
    ]

    # Profit by category
    category_profits: dict[str, dict] = {}
    for flip in sold_flips:
        cat = flip.category or "uncategorized"
        if cat not in category_profits:
            category_profits[cat] = {"profit": Decimal("0"), "count": 0}
        category_profits[cat]["profit"] += flip.profit or Decimal("0")
        category_profits[cat]["count"] += 1

    by_category = [
        ProfitByCategory(
            category=cat,
            profit=data["profit"],
            flip_count=data["count"],
        )
        for cat, data in sorted(category_profits.items(), key=lambda x: x[1]["profit"], reverse=True)
    ]

    return StatsResponse(
        overall=overall,
        by_period=by_period,
        by_category=by_category,
    )


@router.get("/settings", response_model=SettingsResponse)
async def get_app_settings(db: AsyncSession = Depends(get_db)):
    """Get current app settings."""
    # Get settings from database, fall back to defaults
    result = await db.execute(select(Setting))
    db_settings = {s.key: s.value for s in result.scalars().all()}

    return SettingsResponse(
        profit_threshold=float(db_settings.get("profit_threshold", app_settings.profit_threshold)),
        ebay_fee_percentage=float(db_settings.get("ebay_fee_percentage", app_settings.ebay_fee_percentage)),
        notifications_enabled=db_settings.get("notifications_enabled", "true").lower() == "true",
    )


@router.put("/settings", response_model=SettingsResponse)
async def update_app_settings(
    settings_update: SettingsUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update app settings."""
    update_data = settings_update.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        result = await db.execute(select(Setting).where(Setting.key == key))
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = str(value)
        else:
            db.add(Setting(key=key, value=str(value)))

    await db.commit()
    return await get_app_settings(db)


@router.post("/device-token")
async def register_device_token(
    token_data: DeviceTokenRegister,
    db: AsyncSession = Depends(get_db),
):
    """Register a device token for push notifications."""
    result = await db.execute(
        select(DeviceToken).where(DeviceToken.token == token_data.token)
    )
    existing = result.scalar_one_or_none()

    if existing:
        from datetime import datetime
        existing.last_used = datetime.utcnow()
    else:
        db.add(DeviceToken(token=token_data.token))

    await db.commit()
    return {"status": "registered"}
