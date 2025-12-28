"""Tests for the deals API endpoints."""

import pytest


def test_get_deals(client):
    """Test fetching deals list."""
    response = client.get("/api/deals")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_get_deal_stats(client):
    """Test fetching deal statistics."""
    response = client.get("/api/stats")
    assert response.status_code == 200
    data = response.json()
    assert "total_deals" in data


def test_health_check(client):
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
