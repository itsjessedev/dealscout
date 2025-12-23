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

    # Ensure Decimal types
    if not isinstance(asking_price, Decimal):
        asking_price = Decimal(str(asking_price))
    if not isinstance(market_value, Decimal):
        market_value = Decimal(str(market_value))

    # Calculate: sell_price - buy_price - fees - shipping
    fees = market_value * Decimal(str(fee_percentage / 100))
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


# ============ Repair Cost Estimation ============

# Labor cost estimates by repair feasibility level
# These are realistic DIY costs (time * value) or shop quotes
LABOR_ESTIMATES = {
    "easy": Decimal("15"),        # Cosmetic fixes, cleaning, minor adjustments
    "moderate": Decimal("35"),    # Screen replacement, battery swap, straightforward parts
    "difficult": Decimal("75"),   # Soldering, port repair, multiple components
    "professional": Decimal("150"),  # Board-level repair, water damage, complex issues
}

# Default labor if feasibility not specified
DEFAULT_LABOR = Decimal("50")


def estimate_labor_cost(
    repair_feasibility: Optional[str],
    repair_type: Optional[str] = None,
) -> Decimal:
    """
    Estimate labor cost based on repair difficulty.

    Args:
        repair_feasibility: easy/moderate/difficult/professional
        repair_type: Optional specific repair type for more accurate estimates

    Returns:
        Estimated labor cost in dollars
    """
    if repair_feasibility and repair_feasibility.lower() in LABOR_ESTIMATES:
        return LABOR_ESTIMATES[repair_feasibility.lower()]

    # Fallback based on repair type keywords if feasibility not available
    if repair_type:
        repair_lower = repair_type.lower()
        if any(k in repair_lower for k in ["screen", "battery", "back glass"]):
            return LABOR_ESTIMATES["moderate"]
        if any(k in repair_lower for k in ["port", "charging", "button"]):
            return LABOR_ESTIMATES["difficult"]
        if any(k in repair_lower for k in ["board", "water", "motherboard"]):
            return LABOR_ESTIMATES["professional"]
        if any(k in repair_lower for k in ["cosmetic", "scratch", "dent"]):
            return LABOR_ESTIMATES["easy"]

    return DEFAULT_LABOR


def calculate_repair_estimate(
    part_cost: Optional[Decimal],
    repair_feasibility: Optional[str] = None,
    repair_type: Optional[str] = None,
) -> dict:
    """
    Calculate total repair cost estimate.

    Args:
        part_cost: Cost of replacement part from eBay lookup
        repair_feasibility: easy/moderate/difficult/professional
        repair_type: Specific repair needed (for labor estimation)

    Returns:
        Dict with part_cost, labor_estimate, total_estimate
    """
    labor = estimate_labor_cost(repair_feasibility, repair_type)

    # Handle missing part cost
    if part_cost is None:
        part_cost = Decimal("0")
    elif not isinstance(part_cost, Decimal):
        part_cost = Decimal(str(part_cost))

    total = part_cost + labor

    return {
        "part_cost": part_cost.quantize(Decimal("0.01")),
        "labor_estimate": labor.quantize(Decimal("0.01")),
        "total_estimate": total.quantize(Decimal("0.01")),
    }


def calculate_true_profit(
    estimated_profit: Optional[Decimal],
    repair_total: Optional[Decimal],
) -> Optional[Decimal]:
    """
    Calculate true profit after accounting for repair costs.

    Args:
        estimated_profit: Base profit (market_value - asking_price - fees)
        repair_total: Total repair cost (parts + labor)

    Returns:
        True profit after repair costs, or None if not calculable
    """
    if estimated_profit is None:
        return None

    if not isinstance(estimated_profit, Decimal):
        estimated_profit = Decimal(str(estimated_profit))

    if repair_total is None:
        return estimated_profit

    if not isinstance(repair_total, Decimal):
        repair_total = Decimal(str(repair_total))

    return (estimated_profit - repair_total).quantize(Decimal("0.01"))


# ============ Deal Scoring ============

def calculate_deal_score(
    estimated_profit: Optional[Decimal],
    market_value: Optional[Decimal],
    condition: Optional[str] = None,
    repair_needed: Optional[bool] = None,
    repair_feasibility: Optional[str] = None,
    has_photos: Optional[bool] = None,
    photo_quality: Optional[str] = None,
    price_data_quality: Optional[str] = None,  # accurate, similar_prices, no_data
    num_listings: Optional[int] = None,
) -> dict:
    """
    Calculate comprehensive deal score (0-100) with risk/effort/demand indicators.

    Scoring breakdown:
    - Profit percentage: 40 points max
    - Risk assessment: 20 points max
    - Effort level: 20 points max
    - Market confidence: 20 points max

    Returns:
        Dict with deal_score, risk_level, effort_level, demand_indicator, flip_speed_prediction
    """
    score = 0

    # ===== PROFIT PERCENTAGE (40 points) =====
    profit_score = 0
    if estimated_profit is not None and market_value is not None and market_value > 0:
        profit_pct = float(estimated_profit) / float(market_value) * 100
        if profit_pct >= 50:
            profit_score = 40
        elif profit_pct >= 35:
            profit_score = 35
        elif profit_pct >= 25:
            profit_score = 30
        elif profit_pct >= 15:
            profit_score = 22
        elif profit_pct >= 10:
            profit_score = 15
        elif profit_pct >= 5:
            profit_score = 8
        else:
            profit_score = 0
    score += profit_score

    # ===== RISK ASSESSMENT (20 points) =====
    # Start with full points, deduct for risk factors
    risk_score = 20
    risk_factors = []

    if repair_needed:
        if repair_feasibility == "professional":
            risk_score -= 15
            risk_factors.append("professional repair")
        elif repair_feasibility == "difficult":
            risk_score -= 10
            risk_factors.append("difficult repair")
        elif repair_feasibility == "moderate":
            risk_score -= 5
            risk_factors.append("moderate repair")
        else:
            risk_score -= 3
            risk_factors.append("easy repair")

    if condition == "unknown":
        risk_score -= 5
        risk_factors.append("unknown condition")

    if not has_photos:
        risk_score -= 8
        risk_factors.append("no photos")
    elif photo_quality == "poor":
        risk_score -= 3
        risk_factors.append("poor photos")

    risk_score = max(0, risk_score)
    score += risk_score

    # Determine risk level
    if risk_score >= 16:
        risk_level = "low"
    elif risk_score >= 10:
        risk_level = "medium"
    else:
        risk_level = "high"

    # ===== EFFORT LEVEL (20 points) =====
    effort_score = 20
    effort_factors = []

    if repair_needed:
        if repair_feasibility in ["professional", "difficult"]:
            effort_score -= 12
            effort_factors.append("complex repair")
        elif repair_feasibility == "moderate":
            effort_score -= 6
            effort_factors.append("repair needed")
        else:
            effort_score -= 3
            effort_factors.append("minor repair")

    effort_score = max(0, effort_score)
    score += effort_score

    # Determine effort level
    if effort_score >= 16:
        effort_level = "low"
    elif effort_score >= 10:
        effort_level = "medium"
    else:
        effort_level = "high"

    # ===== MARKET CONFIDENCE (20 points) =====
    market_score = 10  # Start at 50%

    if price_data_quality == "accurate":
        market_score = 20
    elif price_data_quality == "similar_prices":
        market_score = 15
    elif price_data_quality == "no_data":
        market_score = 5

    if num_listings:
        if num_listings >= 10:
            market_score = min(20, market_score + 5)
        elif num_listings < 3:
            market_score = max(0, market_score - 5)

    score += market_score

    # Determine demand indicator based on market data
    if num_listings and num_listings >= 10:
        demand_indicator = "high"
    elif num_listings and num_listings >= 5:
        demand_indicator = "medium"
    else:
        demand_indicator = "low"

    # ===== FLIP SPEED PREDICTION =====
    if demand_indicator == "high" and risk_level == "low":
        flip_speed = "fast"  # 1-7 days
    elif demand_indicator == "low" or risk_level == "high":
        flip_speed = "slow"  # 3+ weeks
    else:
        flip_speed = "medium"  # 1-3 weeks

    return {
        "deal_score": min(100, max(0, score)),
        "risk_level": risk_level,
        "effort_level": effort_level,
        "demand_indicator": demand_indicator,
        "flip_speed_prediction": flip_speed,
    }
