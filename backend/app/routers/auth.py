"""Authentication endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User
from ..services.auth import get_current_user, get_optional_user, logout_user
from ..services import ebay_seller

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def get_current_user_info(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current authenticated user info."""
    # Get eBay status
    ebay_status = await ebay_seller.get_ebay_account_status(db)

    return {
        "user": {
            "id": user.id,
            "username": user.ebay_username,
            "display_name": user.display_name,
        },
        "ebay": ebay_status,
    }


@router.get("/status")
async def get_auth_status(
    user: User = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if user is authenticated."""
    if not user:
        try:
            login_url = ebay_seller.get_auth_url()
        except ValueError:
            login_url = None
        return {
            "authenticated": False,
            "login_url": login_url,
        }

    ebay_status = await ebay_seller.get_ebay_account_status(db)

    return {
        "authenticated": True,
        "user": {
            "id": user.id,
            "username": user.ebay_username,
            "display_name": user.display_name,
        },
        "ebay": ebay_status,
    }


@router.post("/logout")
async def logout(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Log out current user."""
    await logout_user(db, user)
    return {"success": True, "message": "Logged out"}


@router.get("/login")
async def get_login_url(state: str = "mobile"):
    """Get eBay OAuth login URL."""
    try:
        auth_url = ebay_seller.get_auth_url()
        # Add state parameter for identifying web vs mobile
        if "?" in auth_url:
            auth_url += f"&state={state}"
        else:
            auth_url += f"?state={state}"
        return {"auth_url": auth_url}
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))
