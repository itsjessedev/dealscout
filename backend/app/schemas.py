"""Pydantic schemas for API requests and responses."""

from datetime import datetime, date
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict


# ============ Deal Schemas ============

class DealBase(BaseModel):
    """Base deal schema."""
    title: str
    asking_price: Optional[Decimal] = None
    listing_url: Optional[str] = None
    source: Optional[str] = None
    location: Optional[str] = None


class DealCreate(DealBase):
    """Schema for creating a deal (from email parser)."""
    pass


class DealClassification(BaseModel):
    """AI classification result - works for any item type."""
    category: Optional[str] = None  # electronics, furniture, clothing, vehicles, etc.
    subcategory: Optional[str] = None  # gpu, couch, jacket, truck, etc.
    brand: Optional[str] = None
    model: Optional[str] = None
    item_details: Optional[dict] = None  # flexible attributes
    condition: Optional[str] = None  # new, used, unknown
    condition_confidence: Optional[str] = None  # explicit, unclear


class DealPricing(BaseModel):
    """Price analysis result."""
    market_value: Optional[Decimal] = None
    estimated_profit: Optional[Decimal] = None
    ebay_sold_data: Optional[dict] = None


class DealResponse(DealBase):
    """Full deal response."""
    id: int
    category: Optional[str] = None
    subcategory: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    item_details: Optional[dict] = None
    condition: Optional[str] = None
    condition_confidence: Optional[str] = None
    market_value: Optional[Decimal] = None
    estimated_profit: Optional[Decimal] = None
    ebay_sold_data: Optional[dict] = None
    status: str
    created_at: datetime
    notified_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DealConditionUpdate(BaseModel):
    """Update condition for a deal."""
    condition: str  # new or used


# ============ Flip Schemas ============

class FlipBase(BaseModel):
    """Base flip schema."""
    item_name: str
    category: Optional[str] = None
    buy_price: Decimal
    buy_date: date
    buy_source: Optional[str] = None
    notes: Optional[str] = None


class FlipCreate(FlipBase):
    """Schema for creating a flip manually."""
    pass


class FlipFromDeal(BaseModel):
    """Create flip from a deal."""
    buy_price: Decimal
    buy_date: date
    notes: Optional[str] = None


class FlipSell(BaseModel):
    """Mark a flip as sold."""
    sell_price: Decimal
    sell_date: date
    sell_platform: str  # ebay, local, facebook, etc.
    fees_paid: Decimal = Decimal("0")
    shipping_cost: Decimal = Decimal("0")


class FlipUpdate(BaseModel):
    """Update flip details."""
    item_name: Optional[str] = None
    category: Optional[str] = None
    buy_price: Optional[Decimal] = None
    buy_date: Optional[date] = None
    buy_source: Optional[str] = None
    notes: Optional[str] = None


class FlipResponse(FlipBase):
    """Full flip response."""
    id: int
    deal_id: Optional[int] = None
    status: str
    sell_price: Optional[Decimal] = None
    sell_date: Optional[date] = None
    sell_platform: Optional[str] = None
    fees_paid: Decimal
    shipping_cost: Decimal
    profit: Optional[Decimal] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============ Stats Schemas ============

class ProfitStats(BaseModel):
    """Profit statistics."""
    total_profit: Decimal
    total_flips: int
    avg_profit_per_flip: Decimal
    best_flip_profit: Optional[Decimal] = None
    total_invested: Decimal
    total_revenue: Decimal


class ProfitByPeriod(BaseModel):
    """Profit breakdown by period."""
    period: str  # week, month, year
    profit: Decimal
    flip_count: int


class ProfitByCategory(BaseModel):
    """Profit breakdown by category."""
    category: str
    profit: Decimal
    flip_count: int


class StatsResponse(BaseModel):
    """Full stats response."""
    overall: ProfitStats
    by_period: list[ProfitByPeriod]
    by_category: list[ProfitByCategory]


# ============ Settings Schemas ============

class SettingsUpdate(BaseModel):
    """Update settings."""
    profit_threshold: Optional[float] = None
    ebay_fee_percentage: Optional[float] = None
    notifications_enabled: Optional[bool] = None


class SettingsResponse(BaseModel):
    """Current settings."""
    profit_threshold: float
    ebay_fee_percentage: float
    notifications_enabled: bool


# ============ Device Token Schemas ============

class DeviceTokenRegister(BaseModel):
    """Register a device for push notifications."""
    token: str
