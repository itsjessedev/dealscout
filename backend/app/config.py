"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings."""

    # Database
    database_url: str = "sqlite+aiosqlite:///./dealscout.db"

    # Gmail API
    gmail_credentials_file: str = "credentials.json"
    gmail_token_file: str = "token.json"
    gmail_scopes: list[str] = ["https://www.googleapis.com/auth/gmail.readonly"]

    # AI Classification (OpenRouter)
    openrouter_api_key: str = ""

    # Gemini AI (legacy, not used)
    gemini_api_key: str = ""

    # eBay API
    ebay_app_id: str = ""
    ebay_cert_id: str = ""
    ebay_dev_id: str = ""
    ebay_redirect_uri: str = "https://dealscout.junipr.io/api/ebay/callback"
    ebay_ru_name: str = ""  # eBay RuName for OAuth
    ebay_sandbox: bool = False  # Use sandbox API for testing

    # Firebase
    firebase_credentials_file: str = "firebase-service-account.json"
    firebase_project_id: str = ""

    # App settings
    profit_threshold: float = 30.0  # Minimum profit to notify
    ebay_fee_percentage: float = 13.0  # Default eBay fee
    needs_review_check_interval: int = 15  # Minutes between checks

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
