"""DealScout API - Main FastAPI application."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .routers import deals_router, flips_router, stats_router, ebay_router, auth_router
from .scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    # Startup
    await init_db()
    start_scheduler()
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(
    title="DealScout API",
    description="API for tracking marketplace deals and flip profits",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for mobile app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(deals_router)
app.include_router(flips_router)
app.include_router(stats_router)
app.include_router(ebay_router)
app.include_router(auth_router)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "app": "DealScout",
        "version": "1.0.0",
    }


@app.get("/health")
async def health():
    """Health check for monitoring."""
    return {"status": "healthy"}


@app.post("/dev/reset-test-data")
async def reset_test_data():
    """
    DEV ONLY: Reset database with test data.
    This endpoint should be disabled in production.
    """
    from datetime import datetime
    from decimal import Decimal
    from sqlalchemy import delete
    from .database import get_db_session
    from .models import Deal, Flip

    async with get_db_session() as db:
        # Clear existing data
        await db.execute(delete(Flip))
        await db.execute(delete(Deal))

        # Add test deals with various conditions
        test_deals = [
            Deal(
                title="NVIDIA RTX 4070 Ti Super 16GB - New in Box",
                asking_price=Decimal("650.00"),
                listing_url="https://facebook.com/marketplace/item/123",
                image_url="https://images.unsplash.com/photo-1591488320449-011701bb6704?w=400",
                image_urls=[
                    "https://images.unsplash.com/photo-1591488320449-011701bb6704?w=800",
                    "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=800",
                    "https://images.unsplash.com/photo-1555618254-5e06252cc4ce?w=800",
                ],
                source="facebook",
                location="Austin, TX",
                category="electronics",
                subcategory="gpu",
                brand="NVIDIA",
                model="RTX 4070 Ti Super",
                condition="new",
                condition_confidence="explicit",
                market_value=Decimal("799.00"),
                estimated_profit=Decimal("89.00"),
                status="new",
                created_at=datetime.utcnow(),
            ),
            Deal(
                title="AMD Ryzen 9 7950X - Used, Works Great",
                asking_price=Decimal("350.00"),
                listing_url="https://craigslist.org/item/456",
                image_url="https://images.unsplash.com/photo-1555617778-02518510b9fa?w=400",
                image_urls=[
                    "https://images.unsplash.com/photo-1555617778-02518510b9fa?w=800",
                    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800",
                ],
                source="craigslist",
                location="Dallas, TX",
                category="electronics",
                subcategory="cpu",
                brand="AMD",
                model="Ryzen 9 7950X",
                condition="used",
                condition_confidence="explicit",
                market_value=Decimal("450.00"),
                estimated_profit=Decimal("55.00"),
                status="new",
                created_at=datetime.utcnow(),
            ),
            Deal(
                title="Sony WH-1000XM5 Headphones",
                asking_price=Decimal("200.00"),
                listing_url="https://offerup.com/item/789",
                image_url="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
                image_urls=[
                    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
                    "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800",
                    "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800",
                    "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800",
                ],
                source="offerup",
                location="Houston, TX",
                category="electronics",
                subcategory="headphones",
                brand="Sony",
                model="WH-1000XM5",
                condition="unknown",
                condition_confidence="unclear",
                market_value=None,
                estimated_profit=None,
                status="new",
                created_at=datetime.utcnow(),
            ),
            Deal(
                title="Nintendo Switch OLED",
                asking_price=Decimal("250.00"),
                listing_url="https://facebook.com/marketplace/item/switch1",
                image_url="https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=400",
                image_urls=[
                    "https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=800",
                    "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=800",
                    "https://images.unsplash.com/photo-1617096200347-cb04ae810b1d?w=800",
                ],
                source="facebook",
                location="Austin, TX",
                category="electronics",
                subcategory="gaming console",
                brand="Nintendo",
                model="Switch OLED",
                condition="unknown",
                condition_confidence="unclear",
                market_value=None,
                estimated_profit=None,
                status="new",
                created_at=datetime.utcnow(),
            ),
            Deal(
                title="DJI Mini 3 Pro Drone",
                asking_price=Decimal("500.00"),
                listing_url="https://craigslist.org/item/drone1",
                image_url="https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=400",
                image_urls=[
                    "https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=800",
                    "https://images.unsplash.com/photo-1507582020474-9a35b7d455d9?w=800",
                    "https://images.unsplash.com/photo-1527977966376-1c8408f9f108?w=800",
                    "https://images.unsplash.com/photo-1579829366248-204fe8413f31?w=800",
                    "https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800",
                ],
                source="craigslist",
                location="Dallas, TX",
                category="electronics",
                subcategory="drone",
                brand="DJI",
                model="Mini 3 Pro",
                condition="unknown",
                condition_confidence="unclear",
                market_value=None,
                estimated_profit=None,
                status="new",
                created_at=datetime.utcnow(),
            ),
            Deal(
                title="Canon EOS R6 Camera Body",
                asking_price=Decimal("1200.00"),
                listing_url="https://offerup.com/item/camera1",
                image_url="https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400",
                image_urls=[
                    "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800",
                    "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800",
                    "https://images.unsplash.com/photo-1510127034890-ba27508e9f1c?w=800",
                ],
                source="offerup",
                location="Houston, TX",
                category="electronics",
                subcategory="camera",
                brand="Canon",
                model="EOS R6",
                condition="unknown",
                condition_confidence="unclear",
                market_value=None,
                estimated_profit=None,
                status="new",
                created_at=datetime.utcnow(),
            ),
            Deal(
                title="Bose QuietComfort Ultra Earbuds",
                asking_price=Decimal("180.00"),
                listing_url="https://facebook.com/marketplace/item/bose1",
                image_url="https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=200",
                source="facebook",
                location="San Antonio, TX",
                category="electronics",
                subcategory="earbuds",
                brand="Bose",
                model="QuietComfort Ultra",
                condition="unknown",
                condition_confidence="unclear",
                market_value=None,
                estimated_profit=None,
                status="new",
                created_at=datetime.utcnow(),
            ),
            Deal(
                title="Apple MacBook Pro M3 14\" - Like New",
                asking_price=Decimal("1200.00"),
                listing_url="https://facebook.com/marketplace/item/abc",
                image_url="https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=200",
                source="facebook",
                location="San Antonio, TX",
                category="electronics",
                subcategory="laptop",
                brand="Apple",
                model="MacBook Pro M3 14",
                condition="used",
                condition_confidence="explicit",
                market_value=Decimal("1499.00"),
                estimated_profit=Decimal("104.00"),
                status="new",
                created_at=datetime.utcnow(),
            ),
            Deal(
                title="Herman Miller Aeron Chair - Size C",
                asking_price=Decimal("400.00"),
                listing_url="https://craigslist.org/item/def",
                image_url="https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=200",
                source="craigslist",
                location="Austin, TX",
                category="furniture",
                subcategory="office chair",
                brand="Herman Miller",
                model="Aeron Size C",
                condition="used",
                condition_confidence="explicit",
                market_value=Decimal("650.00"),
                estimated_profit=Decimal("165.00"),
                status="new",
                created_at=datetime.utcnow(),
            ),
            # === CONDITION CHANGE TEST PRODUCTS ===
            # TEST 1: PS5 - Currently NEW and profitable. If changed to USED → becomes unprofitable → REMOVED
            # Asking: $400, New market: $499 (profit ~$49), Used market: $350 (loss ~$85)
            Deal(
                title="[TEST 1] PS5 Console - New Sealed (Change to USED = REMOVED)",
                asking_price=Decimal("400.00"),
                listing_url="https://facebook.com/marketplace/item/ps5test",
                image_url="https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=400",
                image_urls=[
                    "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=800",
                    "https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=800",
                    "https://images.unsplash.com/photo-1622297845775-5ff3fef71d13?w=800",
                ],
                source="facebook",
                location="Austin, TX",
                category="electronics",
                subcategory="gaming console",
                brand="Sony",
                model="PlayStation 5",
                condition="new",
                condition_confidence="explicit",
                market_value=Decimal("499.00"),
                estimated_profit=Decimal("49.00"),
                status="new",
                created_at=datetime.utcnow(),
            ),
            # TEST 2: iPhone - Currently USED and profitable. If changed to NEW → becomes unprofitable → REMOVED
            # Asking: $700, Used market: $850 (profit ~$59), New market: $650 (loss ~$91)
            Deal(
                title="[TEST 2] iPhone 14 Pro 256GB (Change to NEW = REMOVED)",
                asking_price=Decimal("700.00"),
                listing_url="https://craigslist.org/item/iphonetest",
                image_url="https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=400",
                image_urls=[
                    "https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=800",
                    "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800",
                ],
                source="craigslist",
                location="Dallas, TX",
                category="electronics",
                subcategory="smartphone",
                brand="Apple",
                model="iPhone 14 Pro",
                condition="used",
                condition_confidence="explicit",
                market_value=Decimal("850.00"),
                estimated_profit=Decimal("59.00"),
                status="new",
                created_at=datetime.utcnow(),
            ),
            # TEST 3: Steam Deck - Currently NEW. Stays profitable either way (numbers update)
            # Asking: $400, New market: $549 (profit ~$78), Used market: $480 (profit ~$25)
            Deal(
                title="[TEST 3] Steam Deck OLED 512GB (Change = STAYS, numbers update)",
                asking_price=Decimal("400.00"),
                listing_url="https://offerup.com/item/steamdecktest",
                image_url="https://images.unsplash.com/photo-1640955014216-75201056c829?w=400",
                image_urls=[
                    "https://images.unsplash.com/photo-1640955014216-75201056c829?w=800",
                    "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=800",
                    "https://images.unsplash.com/photo-1605901309584-818e25960a8f?w=800",
                    "https://images.unsplash.com/photo-1551103782-8ab07afd45c1?w=800",
                ],
                source="offerup",
                location="Houston, TX",
                category="electronics",
                subcategory="handheld console",
                brand="Valve",
                model="Steam Deck OLED",
                condition="new",
                condition_confidence="explicit",
                market_value=Decimal("549.00"),
                estimated_profit=Decimal("78.00"),
                status="new",
                created_at=datetime.utcnow(),
            ),
            # === FACEBOOK-ONLY TEST PRODUCTS ===
            # TEST 4: Already FB-only in deals list (blue badge)
            # Asking: $200, Market: $220 → eBay: -$8.60, Facebook: +$20
            Deal(
                title="[TEST 4] AirPods Pro 2 - FB ONLY (Blue Badge)",
                asking_price=Decimal("200.00"),
                listing_url="https://facebook.com/marketplace/item/airpods",
                image_url="https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=400",
                image_urls=[
                    "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800",
                    "https://images.unsplash.com/photo-1606741965326-cb990ae01bb2?w=800",
                ],
                source="facebook",
                location="Austin, TX",
                category="electronics",
                subcategory="earbuds",
                brand="Apple",
                model="AirPods Pro 2",
                condition="used",
                condition_confidence="explicit",
                market_value=Decimal("220.00"),
                estimated_profit=Decimal("20.00"),  # FB profit
                status="new",
                created_at=datetime.utcnow(),
            ),
            # TEST 5: In review - becomes FB-only when set to NEW
            # Mock prices: NEW market $330 (FB +$30, eBay -$13), USED market $400 (both profitable)
            Deal(
                title="[TEST 5] iPad Mini 6 (Set NEW = FB ONLY)",
                asking_price=Decimal("300.00"),
                listing_url="https://offerup.com/item/ipadmini",
                image_url="https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400",
                image_urls=[
                    "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=800",
                    "https://images.unsplash.com/photo-1561154464-82e9adf32764?w=800",
                ],
                source="offerup",
                location="Dallas, TX",
                category="electronics",
                subcategory="tablet",
                brand="Apple",
                model="iPad Mini 6",
                condition="unknown",
                condition_confidence="unclear",
                market_value=None,
                estimated_profit=None,
                status="new",
                created_at=datetime.utcnow(),
            ),
            # TEST 6: Currently eBay profitable, change to USED = FB-only
            # Asking: $500, NEW market: $650 (eBay +$65, FB +$150), USED market: $550 (eBay -$21, FB +$50)
            Deal(
                title="[TEST 6] Apple Watch Ultra 2 (Change USED = FB ONLY)",
                asking_price=Decimal("500.00"),
                listing_url="https://craigslist.org/item/watchultra",
                image_url="https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=400",
                image_urls=[
                    "https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=800",
                    "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=800",
                ],
                source="craigslist",
                location="Houston, TX",
                category="electronics",
                subcategory="smartwatch",
                brand="Apple",
                model="Apple Watch Ultra 2",
                condition="new",
                condition_confidence="explicit",
                market_value=Decimal("650.00"),
                estimated_profit=Decimal("65.50"),
                status="new",
                created_at=datetime.utcnow(),
            ),
            # === PRICE TRANSPARENCY TEST PRODUCTS ===
            # PRICE TEST 1: Accurate pricing (green status)
            Deal(
                title="[PRICE TEST] Samsung 970 EVO Plus 2TB - ACCURATE",
                asking_price=Decimal("120.00"),
                listing_url="https://facebook.com/marketplace/item/ssd1",
                image_url="https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=400",
                source="facebook",
                location="Austin, TX",
                category="electronics",
                subcategory="ssd",
                brand="Samsung",
                model="970 EVO Plus 2TB",
                condition="used",
                condition_confidence="explicit",
                market_value=Decimal("180.00"),
                estimated_profit=Decimal("36.60"),
                price_status="accurate",
                price_note="Based on 12 similar listings",
                status="new",
                created_at=datetime.utcnow(),
            ),
            # PRICE TEST 2: Similar prices (yellow warning)
            Deal(
                title="[PRICE TEST] Logitech MX Master 3S - PRICES VARY",
                asking_price=Decimal("60.00"),
                listing_url="https://craigslist.org/item/mouse1",
                image_url="https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400",
                source="craigslist",
                location="Dallas, TX",
                category="electronics",
                subcategory="mouse",
                brand="Logitech",
                model="MX Master 3S",
                condition="used",
                condition_confidence="explicit",
                market_value=Decimal("85.00"),
                estimated_profit=Decimal("13.95"),
                price_status="similar_prices",
                price_note="Prices vary ($65-$110)",
                status="new",
                created_at=datetime.utcnow(),
            ),
            # PRICE TEST 3: Limited data (yellow warning)
            Deal(
                title="[PRICE TEST] Rare Audio Interface - LIMITED DATA",
                asking_price=Decimal("250.00"),
                listing_url="https://offerup.com/item/audio1",
                image_url="https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400",
                source="offerup",
                location="Houston, TX",
                category="electronics",
                subcategory="audio interface",
                brand="Focusrite",
                model="Scarlett 4i4 3rd Gen",
                condition="used",
                condition_confidence="explicit",
                market_value=Decimal("320.00"),
                estimated_profit=Decimal("28.40"),
                price_status="limited_data",
                price_note="Only 2 listings found",
                status="new",
                created_at=datetime.utcnow(),
            ),
            # PRICE TEST 4: No data (red warning - needs custom input)
            Deal(
                title="[PRICE TEST] Vintage Synthesizer - NO DATA",
                asking_price=Decimal("800.00"),
                listing_url="https://facebook.com/marketplace/item/synth1",
                image_url="https://images.unsplash.com/photo-1558584673-c834fb1cc3b1?w=400",
                source="facebook",
                location="Austin, TX",
                category="electronics",
                subcategory="synthesizer",
                brand="Roland",
                model="Juno-106",
                condition="used",
                condition_confidence="explicit",
                market_value=Decimal("1200.00"),  # User would need to set this
                estimated_profit=Decimal("244.00"),
                price_status="no_data",
                price_note="Could not find market prices",
                status="new",
                created_at=datetime.utcnow(),
            ),
            # PRICE TEST 5: Mock data (red - test mode)
            Deal(
                title="[PRICE TEST] Test Product - MOCK DATA",
                asking_price=Decimal("100.00"),
                listing_url="https://test.com/item/test1",
                image_url="https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400",
                source="facebook",
                location="Test City, TX",
                category="test",
                subcategory="test",
                brand="Test",
                model="Test Product",
                condition="new",
                condition_confidence="explicit",
                market_value=Decimal("150.00"),
                estimated_profit=Decimal("30.50"),
                price_status="mock_data",
                price_note="Test product with simulated prices",
                status="new",
                created_at=datetime.utcnow(),
            ),
            # === LOCAL TEST PRODUCTS (within 100mi of Rickman, TN) ===
            Deal(
                title="[LOCAL] Yamaha P-125 Digital Piano",
                asking_price=Decimal("400.00"),
                listing_url="https://facebook.com/marketplace/item/piano1",
                image_url="https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=400",
                source="facebook",
                location="Nashville, TN",
                category="instruments",
                subcategory="piano",
                brand="Yamaha",
                model="P-125",
                condition="used",
                condition_confidence="explicit",
                market_value=Decimal("550.00"),
                estimated_profit=Decimal("78.50"),
                price_status="accurate",
                price_note="Based on 8 similar listings",
                status="new",
                created_at=datetime.utcnow(),
            ),
            Deal(
                title="[LOCAL] Trek Marlin 7 Mountain Bike",
                asking_price=Decimal("500.00"),
                listing_url="https://craigslist.org/item/bike1",
                image_url="https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?w=400",
                source="craigslist",
                location="Cookeville, TN",
                category="sports",
                subcategory="bicycle",
                brand="Trek",
                model="Marlin 7",
                condition="used",
                condition_confidence="explicit",
                market_value=Decimal("700.00"),
                estimated_profit=Decimal("109.00"),
                price_status="accurate",
                price_note="Based on 6 similar listings",
                status="new",
                created_at=datetime.utcnow(),
            ),
            Deal(
                title="[LOCAL] KitchenAid Artisan Stand Mixer",
                asking_price=Decimal("150.00"),
                listing_url="https://facebook.com/marketplace/item/mixer1",
                image_url="https://images.unsplash.com/photo-1594385208974-2e75f8d7bb48?w=400",
                source="facebook",
                location="Bowling Green, KY",
                category="appliances",
                subcategory="mixer",
                brand="KitchenAid",
                model="Artisan",
                condition="used",
                condition_confidence="explicit",
                market_value=Decimal("250.00"),
                estimated_profit=Decimal("67.50"),
                price_status="accurate",
                price_note="Based on 15 similar listings",
                status="new",
                created_at=datetime.utcnow(),
            ),
        ]

        for deal in test_deals:
            db.add(deal)

        await db.commit()

    return {
        "status": "ok",
        "message": "Test data reset complete",
        "deals_created": len(test_deals),
    }
