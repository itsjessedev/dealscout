"""Authentication service using eBay OAuth."""

import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User, EbayCredentials

# Session token validity (30 days)
SESSION_DURATION_DAYS = 30


def generate_session_token() -> str:
    """Generate a secure random session token."""
    return secrets.token_urlsafe(64)


async def create_or_update_user(
    db: AsyncSession,
    ebay_username: str,
    display_name: Optional[str] = None,
) -> tuple[User, str]:
    """
    Create or update a user based on eBay username.
    Returns the user and a new session token.
    """
    # Find existing user
    result = await db.execute(
        select(User).where(User.ebay_username == ebay_username)
    )
    user = result.scalar_one_or_none()

    # Generate new session token
    session_token = generate_session_token()
    session_expiry = datetime.utcnow() + timedelta(days=SESSION_DURATION_DAYS)

    if user:
        # Update existing user
        user.session_token = session_token
        user.session_expiry = session_expiry
        user.last_login = datetime.utcnow()
        if display_name:
            user.display_name = display_name
    else:
        # Create new user
        user = User(
            ebay_username=ebay_username,
            display_name=display_name or ebay_username,
            session_token=session_token,
            session_expiry=session_expiry,
            last_login=datetime.utcnow(),
        )
        db.add(user)

    await db.commit()
    await db.refresh(user)

    return user, session_token


async def get_user_by_token(
    db: AsyncSession,
    token: str,
) -> Optional[User]:
    """Get user by session token if valid."""
    result = await db.execute(
        select(User).where(
            User.session_token == token,
            User.session_expiry > datetime.utcnow(),
        )
    )
    return result.scalar_one_or_none()


async def logout_user(db: AsyncSession, user: User) -> None:
    """Invalidate user's session token."""
    user.session_token = None
    user.session_expiry = None
    await db.commit()


# Dependency for protected routes
async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get current authenticated user from Authorization header."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Extract token from "Bearer <token>" format
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    else:
        token = authorization

    user = await get_user_by_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return user


# Optional auth - returns None if not authenticated
async def get_optional_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Get current user if authenticated, None otherwise."""
    if not authorization:
        return None

    if authorization.startswith("Bearer "):
        token = authorization[7:]
    else:
        token = authorization

    return await get_user_by_token(db, token)
