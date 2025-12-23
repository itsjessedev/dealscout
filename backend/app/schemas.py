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
    image_url: Optional[str] = None
    source: Optional[str] = None
    location: Optional[str] = None


class DealCreate(DealBase):
    """Schema for creating a deal (from email parser)."""
    pass


class DealClassification(BaseModel):
    """AI classification result - enhanced with repair/bundle/variant detection."""
    category: Optional[str] = None  # electronics, furniture, clothing, vehicles, etc.
    subcategory: Optional[str] = None  # gpu, couch, jacket, truck, etc.
    brand: Optional[str] = None
    model: Optional[str] = None
    item_details: Optional[dict] = None  # flexible attributes
    condition: Optional[str] = None  # new, used, needs_repair, unknown
    condition_confidence: Optional[str] = None  # explicit, unclear

    # Repair detection
    repair_needed: Optional[bool] = None
    repair_keywords: Optional[list[str]] = None  # as-is, broken, for parts, etc.
    repair_feasibility: Optional[str] = None  # easy/moderate/difficult/professional
    repair_notes: Optional[str] = None  # AI description of repairs needed
    repair_part_needed: Optional[str] = None  # "iPhone 14 Pro Max screen"

    # Enhanced classification
    part_numbers: Optional[list[str]] = None  # Extracted SKUs, MPNs
    variants: Optional[str] = None  # "Disc Edition", "512GB", etc.
    is_bundle: Optional[bool] = None
    bundle_items: Optional[list[str]] = None  # List of items in bundle
    accessory_completeness: Optional[str] = None  # "complete", "missing controller"

    # Image intelligence
    has_product_photos: Optional[bool] = None
    photo_quality: Optional[str] = None  # good/fair/poor/none

    # Seller intelligence
    seller_username: Optional[str] = None
    seller_rating: Optional[str] = None
    seller_reputation: Optional[str] = None


class DealPricing(BaseModel):
    """Price analysis result."""
    market_value: Optional[Decimal] = None
    estimated_profit: Optional[Decimal] = None
    ebay_sold_data: Optional[dict] = None


class DealResponse(DealBase):
    """Full deal response with AI enhancements."""
    id: int
    image_urls: Optional[list[str]] = None  # Multiple images for carousel
    category: Optional[str] = None
    subcategory: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    item_details: Optional[dict] = None
    condition: Optional[str] = None  # new, used, needs_repair, unknown
    condition_confidence: Optional[str] = None
    market_value: Optional[Decimal] = None  # Value if working/repaired
    as_is_value: Optional[Decimal] = None  # Value in current broken state (for repair items)
    estimated_profit: Optional[Decimal] = None
    ebay_sold_data: Optional[dict] = None
    price_status: Optional[str] = None  # accurate, similar_prices, no_data, mock_data, user_set
    price_note: Optional[str] = None  # Explanation for user
    local_pickup_available: Optional[bool] = None  # True if local pickup within 100mi
    distance_miles: Optional[int] = None  # Distance from home location

    # Repair intelligence
    repair_needed: Optional[bool] = None
    repair_keywords: Optional[list[str]] = None
    repair_feasibility: Optional[str] = None  # easy/moderate/difficult/professional
    repair_notes: Optional[str] = None

    # Multiple repair options (toggleable)
    # Format: [{"id": "screen", "name": "Screen Replacement", "part_cost": 89.99, "labor_hours": 2, "part_url": "..."}]
    repair_options: Optional[list[dict]] = None

    # Legacy single repair fields
    repair_part_needed: Optional[str] = None  # "iPhone 14 Pro Max screen"
    repair_part_cost: Optional[Decimal] = None
    repair_part_url: Optional[str] = None  # Clickable eBay link to part
    repair_labor_estimate: Optional[Decimal] = None
    repair_total_estimate: Optional[Decimal] = None  # part + labor
    true_profit: Optional[Decimal] = None  # profit - repair_total

    # Enhanced classification
    part_numbers: Optional[list[str]] = None  # Extracted SKUs, MPNs
    variants: Optional[str] = None  # "Disc Edition", "512GB", etc.
    is_bundle: Optional[bool] = None
    bundle_items: Optional[list[str]] = None
    bundle_value_per_item: Optional[Decimal] = None
    accessory_completeness: Optional[str] = None

    # Deal scoring
    deal_score: Optional[int] = None  # 0-100
    flip_speed_prediction: Optional[str] = None  # fast/medium/slow
    demand_indicator: Optional[str] = None  # high/medium/low
    risk_level: Optional[str] = None  # low/medium/high
    effort_level: Optional[str] = None  # low/medium/high

    # Price intelligence
    price_trend: Optional[str] = None  # up/down/stable
    price_trend_note: Optional[str] = None

    # Image intelligence
    has_product_photos: Optional[bool] = None
    photo_quality: Optional[str] = None  # good/fair/poor/none

    # Seller intelligence
    seller_username: Optional[str] = None
    seller_rating: Optional[str] = None
    seller_reputation: Optional[str] = None

    status: str
    created_at: datetime
    notified_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DealConditionUpdate(BaseModel):
    """Update condition for a deal."""
    condition: str  # new, used, or needs_repair


class DealMarketValueUpdate(BaseModel):
    """Manually set market value for a deal."""
    market_value: Decimal


# ============ Flip Schemas ============

class FlipBase(BaseModel):
    """Base flip schema."""
    item_name: str
    image_url: Optional[str] = None
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
    # For repair items: which repairs do you plan to do?
    planned_repairs: Optional[list[dict]] = None  # [{"id": "screen", "name": "...", "part_cost": X, "labor_hours": Y}]


class FlipSell(BaseModel):
    """Mark a flip as sold."""
    sell_price: Decimal
    sell_date: date
    sell_platform: str  # ebay, local, facebook, etc.
    fees_paid: Decimal = Decimal("0")
    shipping_cost: Decimal = Decimal("0")
    # For repair items: did you repair it or sell as-is?
    sold_as_repaired: Optional[bool] = None  # True=repaired (sell as used), False=as-is (sell for parts)
    completed_repairs: Optional[list[dict]] = None  # Which repairs were actually done
    actual_repair_cost: Optional[Decimal] = None  # What repairs actually cost


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
    # eBay listing tracking
    listed_at: Optional[datetime] = None
    ebay_listing_id: Optional[str] = None
    listing_status: Optional[str] = None  # draft, active, ended
    # Repair tracking
    planned_repairs: Optional[list[dict]] = None
    completed_repairs: Optional[list[dict]] = None
    sold_as_repaired: Optional[bool] = None
    actual_repair_cost: Optional[Decimal] = None
    # Sale info
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
