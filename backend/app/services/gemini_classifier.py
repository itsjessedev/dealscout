"""AI classifier for items using OpenRouter."""

import json
from typing import Optional

import httpx

from ..config import get_settings
from ..schemas import DealClassification

settings = get_settings()

# System prompt for item classification with enhanced detection
CLASSIFICATION_PROMPT = """You are an expert at identifying items from marketplace listings.
Analyze the listing text and extract structured information.

Your response must be valid JSON with these fields:

BASIC CLASSIFICATION:
- category: broad category (electronics, furniture, clothing, vehicles, tools, sports, toys, etc.)
- subcategory: specific type within category (gpu, laptop, phone, couch, jacket, truck, etc.)
- brand: manufacturer/brand name if identifiable
- model: specific model name/number if identifiable
- item_details: object with any relevant specs/attributes extracted

CONDITION DETECTION:
- condition: ONE of these values:
  * "new" - if explicitly stated (sealed, BNIB, brand new, unopened, NIB, factory sealed)
  * "used" - if explicitly stated (used, like new, excellent condition, works great, tested, refurbished)
  * "needs_repair" - if listing indicates repair needed (as-is, for parts, not working, broken, damaged, cracked screen, won't turn on, boot loop, display issues, dead battery, etc.)
  * "unknown" - if condition is not explicitly mentioned
- condition_confidence: "explicit" if condition was clearly stated, "unclear" if ambiguous

REPAIR DETECTION (if condition is "needs_repair" or issues mentioned):
- repair_needed: true if item needs repair, false otherwise
- repair_keywords: array of repair-related keywords found (e.g., ["broken screen", "as-is", "for parts"])
- repair_feasibility: estimate difficulty:
  * "easy" - cosmetic issues, cleaning, minor fixes
  * "moderate" - screen replacement, battery swap, parts that click in
  * "difficult" - soldering required, port repair, multiple components
  * "professional" - board-level repair, water damage, complex issues
- repair_notes: brief description of what repairs are needed
- repair_part_needed: specific replacement part if identifiable (e.g., "iPhone 14 Pro Max screen", "PS5 HDMI port", "MacBook Pro battery")

ENHANCED CLASSIFICATION:
- part_numbers: array of part/model numbers, SKUs, or MPNs found (e.g., ["A2650", "MQ8F3LL/A"])
- variants: specific variant if mentioned (e.g., "Disc Edition", "512GB", "OLED", "Pro Max", "Wi-Fi only")
- is_bundle: true if multiple items sold together ("lot of 5", "with controller and games", "includes accessories")
- bundle_items: array of items if bundle detected (e.g., ["PS5 console", "2 controllers", "3 games"])
- accessory_completeness: "complete" if all accessories, or describe what's missing (e.g., "missing charger", "no controller")

IMAGE & SELLER INFO:
- has_product_photos: true if listing appears to have actual product photos, false if stock images or no photos mentioned
- photo_quality: "good" (clear, multiple angles), "fair" (limited), "poor" (blurry, single), "none" (no photos)
- seller_username: if mentioned in listing
- seller_rating: if mentioned (e.g., "5 star seller", "97% positive")
- seller_reputation: "excellent", "good", "fair", or "poor" based on any indicators

CRITICAL RULES:
1. For condition, only mark "new" or "used" if EXPLICITLY stated - never guess
2. If ANY repair keywords found, set condition to "needs_repair"
3. Extract ALL part numbers found - these are critical for accurate pricing
4. Identify variants precisely (PS5 Disc vs Digital, iPhone 14 vs 14 Pro vs 14 Pro Max)
5. If condition unclear and no repair keywords, use "unknown"

Respond with JSON only, no markdown formatting."""


class AIClassifier:
    """Classifies items using OpenRouter API."""

    def __init__(self):
        self.api_key = settings.openrouter_api_key
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"
        self.model = "google/gemini-2.0-flash-001"  # Fast and cheap

    async def classify(self, listing_text: str) -> Optional[DealClassification]:
        """
        Classify an item from its listing text.

        Args:
            listing_text: The raw listing title/description

        Returns:
            DealClassification with extracted fields, or None on error
        """
        if not self.api_key:
            print("OpenRouter API key not configured")
            return None

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.base_url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": CLASSIFICATION_PROMPT},
                            {"role": "user", "content": f"Listing to analyze:\n{listing_text}"},
                        ],
                        "temperature": 0.1,
                    },
                    timeout=30.0,
                )

                if response.status_code != 200:
                    print(f"OpenRouter error: {response.status_code} - {response.text}")
                    return None

                data = response.json()
                text = data["choices"][0]["message"]["content"].strip()

                # Extract JSON from response (handle markdown code blocks)
                if text.startswith("```"):
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                text = text.strip()

                result = json.loads(text)

                return DealClassification(
                    # Basic classification
                    category=result.get("category"),
                    subcategory=result.get("subcategory"),
                    brand=result.get("brand"),
                    model=result.get("model"),
                    item_details=result.get("item_details"),
                    condition=result.get("condition", "unknown"),
                    condition_confidence=result.get("condition_confidence", "unclear"),
                    # Repair detection
                    repair_needed=result.get("repair_needed"),
                    repair_keywords=result.get("repair_keywords"),
                    repair_feasibility=result.get("repair_feasibility"),
                    repair_notes=result.get("repair_notes"),
                    repair_part_needed=result.get("repair_part_needed"),
                    # Enhanced classification
                    part_numbers=result.get("part_numbers"),
                    variants=result.get("variants"),
                    is_bundle=result.get("is_bundle"),
                    bundle_items=result.get("bundle_items"),
                    accessory_completeness=result.get("accessory_completeness"),
                    # Image intelligence
                    has_product_photos=result.get("has_product_photos"),
                    photo_quality=result.get("photo_quality"),
                    # Seller intelligence
                    seller_username=result.get("seller_username"),
                    seller_rating=result.get("seller_rating"),
                    seller_reputation=result.get("seller_reputation"),
                )

        except Exception as e:
            print(f"Error classifying item: {e}")
            return None


# Singleton instance
_classifier: Optional[AIClassifier] = None


def get_classifier() -> AIClassifier:
    """Get or create classifier instance."""
    global _classifier
    if _classifier is None:
        _classifier = AIClassifier()
    return _classifier
