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
from .services.ebay_lookup import get_market_value
from .services.profit_calculator import calculate_estimated_profit, is_profitable_deal
from .services.notifications import get_notification_service

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
                db.add(deal)
                await db.flush()  # Get the ID

                # Classify with Gemini
                classification = await classifier.classify(deal.title)
                if classification:
                    deal.category = classification.category
                    deal.subcategory = classification.subcategory
                    deal.brand = classification.brand
                    deal.model = classification.model
                    deal.item_details = classification.item_details
                    deal.condition = classification.condition
                    deal.condition_confidence = classification.condition_confidence

                    # If condition is unknown, mark for review
                    if classification.condition == "unknown":
                        deal.status = "needs_condition"
                    else:
                        # Look up eBay prices
                        search_term = f"{classification.brand or ''} {classification.model or classification.subcategory}".strip()
                        if search_term:
                            pricing = await get_market_value(search_term, classification.condition)
                            if pricing:
                                deal.market_value = Decimal(str(pricing["avg_price"]))
                                deal.ebay_sold_data = pricing
                                deal.estimated_profit = calculate_estimated_profit(
                                    deal.asking_price,
                                    deal.market_value,
                                )

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

            await db.commit()
            print(f"[{datetime.now()}] Processed {len(raw_deals)} emails")

    except Exception as e:
        print(f"[{datetime.now()}] Error processing emails: {e}")


async def check_needs_review() -> None:
    """
    Check for deals needing condition review and notify.

    Runs every 15 minutes per user preference.
    """
    print(f"[{datetime.now()}] Checking for items needing review...")

    try:
        async with async_session() as db:
            # Count items needing review
            result = await db.execute(
                select(Deal).where(Deal.condition == "unknown")
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

    scheduler.start()
    print("Background scheduler started")


def stop_scheduler() -> None:
    """Stop the background scheduler."""
    scheduler.shutdown()
    print("Background scheduler stopped")
