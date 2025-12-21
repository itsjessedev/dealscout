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
    source: Mapped[Optional[str]] = mapped_column(String(50))  # facebook, craigslist, etc.
    location: Mapped[Optional[str]] = mapped_column(String(200))

    # AI classification (works for any item type)
    category: Mapped[Optional[str]] = mapped_column(String(100))  # electronics, furniture, clothing, etc.
    subcategory: Mapped[Optional[str]] = mapped_column(String(100))  # gpu, couch, jacket, etc.
    brand: Mapped[Optional[str]] = mapped_column(String(100))
    model: Mapped[Optional[str]] = mapped_column(String(200))
    item_details: Mapped[Optional[dict]] = mapped_column(JSON)  # flexible specs/attributes

    # Condition detection
    condition: Mapped[Optional[str]] = mapped_column(String(20))  # new, used, unknown
    condition_confidence: Mapped[Optional[str]] = mapped_column(String(20))  # explicit, unclear

    # Price analysis
    market_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    estimated_profit: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    ebay_sold_data: Mapped[Optional[dict]] = mapped_column(JSON)

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
    category: Mapped[Optional[str]] = mapped_column(String(100))
    buy_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    buy_date: Mapped[date] = mapped_column(Date)
    buy_source: Mapped[Optional[str]] = mapped_column(String(50))

    # Status: active = Current Flips, sold = Profits
    status: Mapped[str] = mapped_column(String(20), default="active")

    # Sale info (filled when sold)
    sell_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    sell_date: Mapped[Optional[date]] = mapped_column(Date)
    sell_platform: Mapped[Optional[str]] = mapped_column(String(50))  # ebay, local, facebook
    fees_paid: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    shipping_cost: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)

    # Calculated profit (sell_price - buy_price - fees - shipping)
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
