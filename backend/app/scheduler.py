"""Background scheduler for email checking and notifications."""

import asyncio
from datetime import datetime
from decimal import Decimal

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .database import async_session
from .models import Deal, DeviceToken
from .services.email_ingestion import get_email_service
from .services.gemini_classifier import get_classifier
from .services.ebay_lookup import (
    get_market_value,
    check_local_pickup_available,
    get_part_cost,
    get_parts_market_value,
    analyze_price_trends,
)
from .services.profit_calculator import (
    calculate_estimated_profit,
    is_profitable_deal,
    calculate_repair_estimate,
    calculate_true_profit,
    calculate_deal_score,
)
from .services.notifications import get_notification_service
from .services.location import calculate_distance_from_home, is_within_pickup_range, LOCAL_RADIUS_MILES
from .services.ebay_orders import sync_sold_items

settings = get_settings()
scheduler = AsyncIOScheduler()


async def process_new_emails() -> None:
    """
    Check for new Swoopa emails and process them.

    This runs periodically to:
    1. Fetch new emails from Gmail
    2. Parse deal information
    3. Classify items with Gemini
    4. Look up eBay prices
    5. Calculate profit
    6. Send notifications for good deals
    """
    print(f"[{datetime.now()}] Checking for new emails...")

    try:
        email_service = get_email_service()
        classifier = get_classifier()
        notification_service = get_notification_service()

        # Get recent emails
        raw_deals = email_service.get_swoopa_emails(max_results=20)

        async with async_session() as db:
            # Get all device tokens for notifications
            result = await db.execute(select(DeviceToken))
            tokens = [t.token for t in result.scalars().all()]

            for raw_deal in raw_deals:
                # Check if we already processed this email
                existing = await db.execute(
                    select(Deal).where(Deal.listing_url == raw_deal.get("listing_url"))
                )
                if existing.scalar_one_or_none():
                    continue

                # Create deal record
                deal = Deal(
                    title=raw_deal.get("title", "Unknown"),
                    asking_price=raw_deal.get("asking_price"),
                    listing_url=raw_deal.get("listing_url"),
                    source=raw_deal.get("source"),
                    location=raw_deal.get("location"),
                )

                # Calculate distance from home for all deals
                if deal.location:
                    deal.distance_miles = calculate_distance_from_home(deal.location)

                db.add(deal)
                await db.flush()  # Get the ID

                # Classify with Gemini
                classification = await classifier.classify(deal.title)
                if classification:
                    # Basic classification
                    deal.category = classification.category
                    deal.subcategory = classification.subcategory
                    deal.brand = classification.brand
                    deal.model = classification.model
                    deal.item_details = classification.item_details
                    deal.condition = classification.condition
                    deal.condition_confidence = classification.condition_confidence

                    # Repair intelligence
                    deal.repair_needed = classification.repair_needed
                    deal.repair_keywords = classification.repair_keywords
                    deal.repair_feasibility = classification.repair_feasibility
                    deal.repair_notes = classification.repair_notes
                    deal.repair_part_needed = classification.repair_part_needed

                    # Enhanced classification
                    deal.part_numbers = classification.part_numbers
                    deal.variants = classification.variants
                    deal.is_bundle = classification.is_bundle
                    deal.bundle_items = classification.bundle_items
                    deal.accessory_completeness = classification.accessory_completeness

                    # Image intelligence
                    deal.has_product_photos = classification.has_product_photos
                    deal.photo_quality = classification.photo_quality

                    # Seller intelligence
                    deal.seller_username = classification.seller_username
                    deal.seller_rating = classification.seller_rating
                    deal.seller_reputation = classification.seller_reputation

                    # AUTO-DISMISS NO-PHOTO DEALS
                    if classification.has_product_photos is False:
                        deal.status = "dismissed"
                        print(f"Auto-dismissed no-photo deal: {deal.title[:50]}")
                        continue  # Skip further processing

                    # NEEDS_REPAIR ALWAYS goes to review (never auto-notified)
                    if classification.condition == "needs_repair" or classification.repair_needed:
                        deal.status = "needs_condition"
                    elif classification.condition == "unknown":
                        deal.status = "needs_condition"
                    else:
                        # Look up eBay prices for non-repair items
                        search_term = f"{classification.brand or ''} {classification.model or classification.subcategory}".strip()
                        if search_term:
                            # Use part numbers for more accurate search if available
                            if classification.part_numbers:
                                search_term = f"{search_term} {classification.part_numbers[0]}"

                            pricing = await get_market_value(search_term, classification.condition)
                            if pricing:
                                deal.market_value = Decimal(str(pricing["avg_price"]))
                                deal.ebay_sold_data = pricing
                                deal.price_status = "accurate"
                                deal.estimated_profit = calculate_estimated_profit(
                                    deal.asking_price,
                                    deal.market_value,
                                )

                                # Get price trend analysis
                                try:
                                    trend_data = await analyze_price_trends(search_term, classification.condition)
                                    if trend_data:
                                        deal.price_trend = trend_data.get("trend")
                                        deal.price_trend_note = trend_data.get("note")
                                except Exception as e:
                                    print(f"Error getting price trends: {e}")

                                # Calculate deal score
                                score_data = calculate_deal_score(
                                    estimated_profit=deal.estimated_profit,
                                    market_value=deal.market_value,
                                    condition=deal.condition,
                                    repair_needed=deal.repair_needed,
                                    repair_feasibility=deal.repair_feasibility,
                                    has_photos=deal.has_product_photos,
                                    photo_quality=deal.photo_quality,
                                    price_data_quality=deal.price_status,
                                    num_listings=pricing.get("num_sales"),
                                )
                                deal.deal_score = score_data["deal_score"]
                                deal.risk_level = score_data["risk_level"]
                                deal.effort_level = score_data["effort_level"]
                                deal.demand_indicator = score_data["demand_indicator"]
                                deal.flip_speed_prediction = score_data["flip_speed_prediction"]

                                # Send notification if profitable
                                if is_profitable_deal(deal.asking_price, deal.market_value):
                                    deal.notified_at = datetime.utcnow()
                                    for token in tokens:
                                        await notification_service.send_deal_notification(
                                            token=token,
                                            deal_title=deal.title,
                                            estimated_profit=float(deal.estimated_profit or 0),
                                            deal_id=deal.id,
                                        )

                            # For eBay source deals within 100mi, check local pickup availability
                            if deal.source and deal.source.lower() == "ebay":
                                # Only check pickup if within reasonable range
                                if deal.distance_miles is None or deal.distance_miles <= LOCAL_RADIUS_MILES:
                                    try:
                                        pickup_result = await check_local_pickup_available(
                                            search_term, classification.condition
                                        )
                                        if pickup_result and pickup_result.get("found"):
                                            deal.local_pickup_available = True
                                        else:
                                            deal.local_pickup_available = False
                                    except Exception as e:
                                        print(f"Error checking eBay local pickup: {e}")
                                        deal.local_pickup_available = None

                    # For needs_repair items, get parts pricing and repair estimate
                    if deal.condition == "needs_repair" or deal.repair_needed:
                        search_term = f"{classification.brand or ''} {classification.model or classification.subcategory}".strip()

                        # Get parts/broken market value
                        if search_term:
                            try:
                                parts_pricing = await get_parts_market_value(search_term)
                                if parts_pricing:
                                    deal.market_value = Decimal(str(parts_pricing["avg_price"]))
                                    deal.ebay_sold_data = parts_pricing
                                    deal.price_status = "similar_prices"
                                    deal.price_note = "Based on similar broken/parts listings"
                            except Exception as e:
                                print(f"Error getting parts market value: {e}")

                        # Get repair part cost if specific part identified
                        if deal.repair_part_needed:
                            try:
                                part_data = await get_part_cost(deal.repair_part_needed)
                                if part_data:
                                    deal.repair_part_cost = Decimal(str(part_data["part_cost"]))
                                    deal.repair_part_url = part_data["part_url"]

                                    # Calculate repair estimate
                                    repair_estimate = calculate_repair_estimate(
                                        part_cost=deal.repair_part_cost,
                                        repair_feasibility=deal.repair_feasibility,
                                        repair_type=deal.repair_part_needed,
                                    )
                                    deal.repair_labor_estimate = repair_estimate["labor_estimate"]
                                    deal.repair_total_estimate = repair_estimate["total_estimate"]

                                    # Calculate true profit (profit - repair costs)
                                    if deal.estimated_profit:
                                        deal.true_profit = calculate_true_profit(
                                            deal.estimated_profit,
                                            deal.repair_total_estimate,
                                        )
                            except Exception as e:
                                print(f"Error getting repair part cost: {e}")

                        # Calculate deal score for repair items
                        if deal.market_value:
                            deal.estimated_profit = calculate_estimated_profit(
                                deal.asking_price,
                                deal.market_value,
                            )
                            score_data = calculate_deal_score(
                                estimated_profit=deal.estimated_profit,
                                market_value=deal.market_value,
                                condition=deal.condition,
                                repair_needed=deal.repair_needed,
                                repair_feasibility=deal.repair_feasibility,
                                has_photos=deal.has_product_photos,
                                photo_quality=deal.photo_quality,
                                price_data_quality=deal.price_status,
                                num_listings=deal.ebay_sold_data.get("num_sales") if deal.ebay_sold_data else None,
                            )
                            deal.deal_score = score_data["deal_score"]
                            deal.risk_level = score_data["risk_level"]
                            deal.effort_level = score_data["effort_level"]
                            deal.demand_indicator = score_data["demand_indicator"]
                            deal.flip_speed_prediction = score_data["flip_speed_prediction"]

            await db.commit()
            print(f"[{datetime.now()}] Processed {len(raw_deals)} emails")

    except Exception as e:
        print(f"[{datetime.now()}] Error processing emails: {e}")


async def check_needs_review() -> None:
    """
    Check for deals needing condition review and notify.

    Includes both unknown condition AND needs_repair items.
    Runs every 15 minutes per user preference.
    """
    print(f"[{datetime.now()}] Checking for items needing review...")

    try:
        async with async_session() as db:
            # Count items needing review (unknown condition OR needs_repair)
            result = await db.execute(
                select(Deal).where(Deal.status == "needs_condition")
            )
            needs_review = result.scalars().all()
            count = len(needs_review)

            if count > 0:
                # Get all device tokens
                result = await db.execute(select(DeviceToken))
                tokens = [t.token for t in result.scalars().all()]

                notification_service = get_notification_service()
                for token in tokens:
                    await notification_service.send_needs_review_notification(
                        token=token,
                        count=count,
                    )

                print(f"[{datetime.now()}] Sent review notifications for {count} items")

    except Exception as e:
        print(f"[{datetime.now()}] Error checking needs review: {e}")


async def sync_ebay_orders() -> None:
    """
    Sync eBay orders to auto-detect sold items.

    Runs every 30 minutes to:
    1. Fetch recent eBay orders
    2. Match with active flips by ebay_listing_id
    3. Mark matched items as sold with actual sale price
    """
    print(f"[{datetime.now()}] Syncing eBay orders...")

    try:
        async with async_session() as db:
            result = await sync_sold_items(db)

            if result["success"]:
                if result["synced"] > 0:
                    print(f"[{datetime.now()}] Synced {result['synced']} sold items from eBay")
                    for item in result.get("items", []):
                        print(f"  - {item['item_name']}: ${item['sell_price']:.2f} (profit: ${item['profit']:.2f})")
                else:
                    print(f"[{datetime.now()}] No new sales to sync")
            else:
                print(f"[{datetime.now()}] eBay sync error: {result.get('error', 'Unknown error')}")

    except Exception as e:
        print(f"[{datetime.now()}] Error syncing eBay orders: {e}")


def start_scheduler() -> None:
    """Start the background scheduler."""
    # Check for new emails every 5 minutes
    scheduler.add_job(
        process_new_emails,
        "interval",
        minutes=5,
        id="process_emails",
        replace_existing=True,
    )

    # Check for items needing review every 15 minutes
    scheduler.add_job(
        check_needs_review,
        "interval",
        minutes=settings.needs_review_check_interval,
        id="check_needs_review",
        replace_existing=True,
    )

    # Sync eBay orders every 30 minutes
    scheduler.add_job(
        sync_ebay_orders,
        "interval",
        minutes=30,
        id="sync_ebay_orders",
        replace_existing=True,
    )

    scheduler.start()
    print("Background scheduler started")


def stop_scheduler() -> None:
    """Stop the background scheduler."""
    scheduler.shutdown()
    print("Background scheduler stopped")
