"""SQLAlchemy database models."""

from datetime import datetime, date
from decimal import Decimal
from typing import Optional
from sqlalchemy import (
    String,
    Text,
    Numeric,
    DateTime,
    Date,
    ForeignKey,
    JSON,
    create_engine,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


class Deal(Base):
    """Deals found from Swoopa alerts."""

    __tablename__ = "deals"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    asking_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    listing_url: Mapped[Optional[str]] = mapped_column(Text)
    image_url: Mapped[Optional[str]] = mapped_column(Text)  # Thumbnail image URL
    image_urls: Mapped[Optional[list]] = mapped_column(JSON)  # Multiple images for carousel
    source: Mapped[Optional[str]] = mapped_column(String(50))  # facebook, craigslist, etc.
    location: Mapped[Optional[str]] = mapped_column(String(200))

    # AI classification (works for any item type)
    category: Mapped[Optional[str]] = mapped_column(String(100))  # electronics, furniture, clothing, etc.
    subcategory: Mapped[Optional[str]] = mapped_column(String(100))  # gpu, couch, jacket, etc.
    brand: Mapped[Optional[str]] = mapped_column(String(100))
    model: Mapped[Optional[str]] = mapped_column(String(200))
    item_details: Mapped[Optional[dict]] = mapped_column(JSON)  # flexible specs/attributes

    # Condition detection
    condition: Mapped[Optional[str]] = mapped_column(String(20))  # new, used, needs_repair, unknown
    condition_confidence: Mapped[Optional[str]] = mapped_column(String(20))  # explicit, unclear

    # Price analysis
    market_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))  # Value if working/repaired
    as_is_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))  # Value in current broken state
    estimated_profit: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    ebay_sold_data: Mapped[Optional[dict]] = mapped_column(JSON)
    # Price status: accurate, similar_prices, no_data, mock_data, user_set
    price_status: Mapped[Optional[str]] = mapped_column(String(30))
    price_note: Mapped[Optional[str]] = mapped_column(String(200))  # Explanation for user

    # Local pickup availability (for eBay and platforms that support it)
    local_pickup_available: Mapped[Optional[bool]] = mapped_column(default=None)
    distance_miles: Mapped[Optional[int]] = mapped_column(default=None)  # Distance from home

    # Repair intelligence
    repair_needed: Mapped[Optional[bool]] = mapped_column(default=None)
    repair_keywords: Mapped[Optional[list]] = mapped_column(JSON)  # Keywords found: "broken", "as-is", etc.
    repair_feasibility: Mapped[Optional[str]] = mapped_column(String(20))  # easy/moderate/difficult/professional
    repair_notes: Mapped[Optional[str]] = mapped_column(Text)  # AI description of repairs needed

    # Multiple repair options (toggleable by user)
    # Format: [{"id": "screen", "name": "Screen Replacement", "part_cost": 89.99, "labor_hours": 2, "part_url": "..."}]
    repair_options: Mapped[Optional[list]] = mapped_column(JSON)

    # Legacy single repair fields (kept for backwards compatibility)
    repair_part_needed: Mapped[Optional[str]] = mapped_column(String(200))  # "iPhone 14 Pro Max screen"
    repair_part_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    repair_part_url: Mapped[Optional[str]] = mapped_column(Text)  # Clickable eBay link to part
    repair_labor_estimate: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    repair_total_estimate: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))  # part + labor
    true_profit: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))  # profit - repair_total

    # Enhanced classification
    part_numbers: Mapped[Optional[list]] = mapped_column(JSON)  # Extracted SKUs, MPNs
    variants: Mapped[Optional[str]] = mapped_column(String(200))  # "Disc Edition", "512GB", etc.
    is_bundle: Mapped[Optional[bool]] = mapped_column(default=None)
    bundle_items: Mapped[Optional[list]] = mapped_column(JSON)  # List of items in bundle
    bundle_value_per_item: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    accessory_completeness: Mapped[Optional[str]] = mapped_column(String(100))  # "complete", "missing controller"

    # Deal scoring
    deal_score: Mapped[Optional[int]] = mapped_column(default=None)  # 0-100
    flip_speed_prediction: Mapped[Optional[str]] = mapped_column(String(20))  # fast/medium/slow
    demand_indicator: Mapped[Optional[str]] = mapped_column(String(20))  # high/medium/low
    risk_level: Mapped[Optional[str]] = mapped_column(String(20))  # low/medium/high
    effort_level: Mapped[Optional[str]] = mapped_column(String(20))  # low/medium/high

    # Price intelligence
    price_trend: Mapped[Optional[str]] = mapped_column(String(20))  # up/down/stable
    price_trend_note: Mapped[Optional[str]] = mapped_column(String(200))

    # Image intelligence
    has_product_photos: Mapped[Optional[bool]] = mapped_column(default=None)
    photo_quality: Mapped[Optional[str]] = mapped_column(String(20))  # good/fair/poor/none

    # Seller intelligence
    seller_username: Mapped[Optional[str]] = mapped_column(String(100))
    seller_rating: Mapped[Optional[str]] = mapped_column(String(50))
    seller_reputation: Mapped[Optional[str]] = mapped_column(String(50))  # excellent/good/fair/poor

    # Status
    status: Mapped[str] = mapped_column(String(20), default="new")
    # new, needs_condition, dismissed, purchased

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # Relationship to flip (if purchased)
    flip: Mapped[Optional["Flip"]] = relationship(back_populates="deal")

    def __repr__(self) -> str:
        return f"<Deal {self.id}: {self.title[:50]}>"


class Flip(Base):
    """Purchased items - both current inventory and completed sales."""

    __tablename__ = "flips"

    id: Mapped[int] = mapped_column(primary_key=True)
    deal_id: Mapped[Optional[int]] = mapped_column(ForeignKey("deals.id"))

    # Purchase info
    item_name: Mapped[str] = mapped_column(String(500))
    image_url: Mapped[Optional[str]] = mapped_column(Text)  # Thumbnail from deal
    category: Mapped[Optional[str]] = mapped_column(String(100))
    buy_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    buy_date: Mapped[date] = mapped_column(Date)
    buy_source: Mapped[Optional[str]] = mapped_column(String(50))

    # Status: active = Current Flips, sold = Profits
    status: Mapped[str] = mapped_column(String(20), default="active")

    # eBay listing tracking
    listed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)  # When listed on eBay
    ebay_listing_id: Mapped[Optional[str]] = mapped_column(String(50))  # eBay item ID
    listing_status: Mapped[Optional[str]] = mapped_column(String(20))  # draft, active, ended

    # Repair tracking (for items that needed repair)
    # Format: [{"id": "screen", "name": "Screen Replacement", "part_cost": 89.99, "labor_hours": 2}]
    planned_repairs: Mapped[Optional[list]] = mapped_column(JSON)  # Repairs intended at purchase
    completed_repairs: Mapped[Optional[list]] = mapped_column(JSON)  # Repairs actually done
    sold_as_repaired: Mapped[Optional[bool]] = mapped_column(default=None)  # True=repaired, False=as-is
    actual_repair_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))  # What repairs actually cost

    # Sale info (filled when sold)
    sell_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    sell_date: Mapped[Optional[date]] = mapped_column(Date)
    sell_platform: Mapped[Optional[str]] = mapped_column(String(50))  # ebay, local, facebook
    fees_paid: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    shipping_cost: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)

    # Calculated profit (sell_price - buy_price - fees - shipping - repair_cost)
    profit: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))

    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationship back to deal
    deal: Mapped[Optional[Deal]] = relationship(back_populates="flip")

    def calculate_profit(self) -> Optional[Decimal]:
        """Calculate profit from sale."""
        if self.sell_price is None:
            return None
        return self.sell_price - self.buy_price - self.fees_paid - self.shipping_cost

    def __repr__(self) -> str:
        return f"<Flip {self.id}: {self.item_name[:50]} ({self.status})>"


class Setting(Base):
    """App settings stored in database."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)

    def __repr__(self) -> str:
        return f"<Setting {self.key}={self.value}>"


class DeviceToken(Base):
    """FCM device tokens for push notifications."""

    __tablename__ = "device_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(500), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_used: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<DeviceToken {self.id}>"


class EbayCredentials(Base):
    """eBay OAuth credentials for seller account access."""

    __tablename__ = "ebay_credentials"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    access_token: Mapped[str] = mapped_column(Text)
    refresh_token: Mapped[str] = mapped_column(Text)
    token_expiry: Mapped[datetime] = mapped_column(DateTime)

    # Account info from eBay
    seller_username: Mapped[Optional[str]] = mapped_column(String(100))
    store_subscription_tier: Mapped[Optional[str]] = mapped_column(String(50))  # NONE, STARTER, BASIC, etc.
    fee_percentage: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))  # Calculated from tier

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship to user
    user: Mapped[Optional["User"]] = relationship(back_populates="ebay_credentials")

    def __repr__(self) -> str:
        return f"<EbayCredentials {self.seller_username or 'unlinked'}>"


class User(Base):
    """User authenticated via eBay OAuth."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    ebay_username: Mapped[str] = mapped_column(String(100), unique=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(200))

    # Session token for API auth
    session_token: Mapped[Optional[str]] = mapped_column(String(500))
    session_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # Relationship to eBay credentials
    ebay_credentials: Mapped[Optional[EbayCredentials]] = relationship(back_populates="user")

    def __repr__(self) -> str:
        return f"<User {self.ebay_username}>"
