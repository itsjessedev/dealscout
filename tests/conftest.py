"""Pytest configuration and fixtures for DealScout tests."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    from backend.app.main import app
    return TestClient(app)


@pytest.fixture
def sample_deal():
    """Sample deal data for testing."""
    return {
        "title": "Test Product - Great Deal",
        "price": 49.99,
        "original_price": 99.99,
        "source": "ebay",
        "url": "https://ebay.com/item/123456",
        "image_url": "https://example.com/image.jpg",
        "category": "electronics"
    }
