"""Gemini Flash AI classifier for items."""

import json
from typing import Optional

import google.generativeai as genai

from ..config import get_settings
from ..schemas import DealClassification

settings = get_settings()

# System prompt for item classification
CLASSIFICATION_PROMPT = """You are an expert at identifying items from marketplace listings.
Analyze the listing text and extract structured information.

Your response must be valid JSON with these fields:
- category: broad category (electronics, furniture, clothing, vehicles, tools, sports, toys, etc.)
- subcategory: specific type within category (gpu, couch, jacket, truck, drill, etc.)
- brand: manufacturer/brand name if identifiable
- model: specific model name/number if identifiable
- item_details: object with any relevant specs/attributes extracted
- condition: "new" if explicitly stated (sealed, BNIB, brand new, unopened, NIB, factory sealed),
             "used" if explicitly stated (used, like new, excellent condition, works great, tested, refurbished),
             "unknown" if condition is not explicitly mentioned
- condition_confidence: "explicit" if condition was clearly stated, "unclear" if you had to guess or couldn't determine

CRITICAL: For condition, only mark as "new" or "used" if it is EXPLICITLY stated in the listing.
If there's any ambiguity or the condition is not mentioned, use "unknown".
Never guess the condition.

Example input: "RTX 3080 graphics card barely used works great $400"
Example output:
{
  "category": "electronics",
  "subcategory": "gpu",
  "brand": "NVIDIA",
  "model": "RTX 3080",
  "item_details": {"type": "graphics card"},
  "condition": "used",
  "condition_confidence": "explicit"
}

Example input: "iPhone 14 Pro 256GB $800"
Example output:
{
  "category": "electronics",
  "subcategory": "smartphone",
  "brand": "Apple",
  "model": "iPhone 14 Pro",
  "item_details": {"storage": "256GB"},
  "condition": "unknown",
  "condition_confidence": "unclear"
}
"""


class GeminiClassifier:
    """Classifies items using Gemini Flash AI."""

    def __init__(self):
        if settings.gemini_api_key:
            genai.configure(api_key=settings.gemini_api_key)
        self.model = genai.GenerativeModel("gemini-1.5-flash")

    async def classify(self, listing_text: str) -> Optional[DealClassification]:
        """
        Classify an item from its listing text.

        Args:
            listing_text: The raw listing title/description

        Returns:
            DealClassification with extracted fields, or None on error
        """
        try:
            prompt = f"{CLASSIFICATION_PROMPT}\n\nListing to analyze:\n{listing_text}\n\nRespond with JSON only:"

            response = self.model.generate_content(prompt)
            text = response.text.strip()

            # Extract JSON from response (handle markdown code blocks)
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            text = text.strip()

            data = json.loads(text)

            return DealClassification(
                category=data.get("category"),
                subcategory=data.get("subcategory"),
                brand=data.get("brand"),
                model=data.get("model"),
                item_details=data.get("item_details"),
                condition=data.get("condition", "unknown"),
                condition_confidence=data.get("condition_confidence", "unclear"),
            )

        except Exception as e:
            print(f"Error classifying item: {e}")
            return None


# Singleton instance
_classifier: Optional[GeminiClassifier] = None


def get_classifier() -> GeminiClassifier:
    """Get or create classifier instance."""
    global _classifier
    if _classifier is None:
        _classifier = GeminiClassifier()
    return _classifier
