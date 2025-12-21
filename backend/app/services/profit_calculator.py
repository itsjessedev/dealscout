"""Profit calculation utilities."""

from decimal import Decimal
from typing import Optional

from ..config import get_settings

settings = get_settings()


def calculate_estimated_profit(
    asking_price: Optional[Decimal],
    market_value: Optional[Decimal],
    fee_percentage: Optional[float] = None,
    shipping_estimate: Decimal = Decimal("0"),
) -> Optional[Decimal]:
    """
    Calculate estimated profit from a deal.

    Args:
        asking_price: What the seller is asking
        market_value: Estimated sell price (from eBay data)
        fee_percentage: Platform fees (default from settings, ~13% for eBay)
        shipping_estimate: Estimated shipping cost

    Returns:
        Estimated profit or None if calculation not possible
    """
    if asking_price is None or market_value is None:
        return None

    if fee_percentage is None:
        fee_percentage = settings.ebay_fee_percentage

    # Calculate: sell_price - buy_price - fees - shipping
    fees = market_value * Decimal(fee_percentage / 100)
    profit = market_value - asking_price - fees - shipping_estimate

    return profit.quantize(Decimal("0.01"))


def calculate_actual_profit(
    buy_price: Decimal,
    sell_price: Decimal,
    fees_paid: Decimal = Decimal("0"),
    shipping_cost: Decimal = Decimal("0"),
) -> Decimal:
    """
    Calculate actual profit from a completed sale.

    Args:
        buy_price: What you paid
        sell_price: What you sold it for
        fees_paid: Platform fees paid
        shipping_cost: Shipping cost paid

    Returns:
        Actual profit
    """
    profit = sell_price - buy_price - fees_paid - shipping_cost
    return profit.quantize(Decimal("0.01"))


def estimate_ebay_fees(sell_price: Decimal) -> Decimal:
    """
    Estimate eBay fees for a sale.

    eBay fee structure (simplified):
    - ~13% final value fee for most categories
    - PayPal/payment processing: ~3%

    Total: ~13% (already included in our default)
    """
    fee_percentage = Decimal(settings.ebay_fee_percentage / 100)
    return (sell_price * fee_percentage).quantize(Decimal("0.01"))


def is_profitable_deal(
    asking_price: Optional[Decimal],
    market_value: Optional[Decimal],
    min_profit: Optional[float] = None,
) -> bool:
    """
    Check if a deal meets the minimum profit threshold.

    Args:
        asking_price: What the seller is asking
        market_value: Estimated sell price
        min_profit: Minimum profit required (default from settings)

    Returns:
        True if deal is profitable enough
    """
    profit = calculate_estimated_profit(asking_price, market_value)
    if profit is None:
        return False

    if min_profit is None:
        min_profit = settings.profit_threshold

    return float(profit) >= min_profit
