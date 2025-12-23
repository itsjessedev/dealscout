"""eBay seller account integration endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services import ebay_seller
from ..config import get_settings

router = APIRouter(prefix="/ebay", tags=["ebay"])
settings = get_settings()


@router.get("/status")
async def get_ebay_status(db: AsyncSession = Depends(get_db)):
    """Get current eBay account linking status and fee info."""
    return await ebay_seller.get_ebay_account_status(db)


@router.get("/auth")
async def start_ebay_auth():
    """Get eBay OAuth authorization URL to start linking."""
    try:
        auth_url = ebay_seller.get_auth_url()
        return {"auth_url": auth_url}
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/callback")
async def ebay_oauth_callback(
    code: str = Query(..., description="Authorization code from eBay"),
    db: AsyncSession = Depends(get_db),
):
    """Handle OAuth callback from eBay after user authorization."""
    try:
        # Exchange code for tokens
        token_data = await ebay_seller.exchange_code_for_tokens(code)

        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in", 7200)

        if not access_token or not refresh_token:
            raise ValueError("Missing tokens in response")

        # Get account info
        account_info = await ebay_seller.get_seller_account_info(access_token)

        # Save credentials
        creds = await ebay_seller.save_credentials(
            db,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            account_info=account_info,
        )

        # Redirect to success page or back to app
        # For now, return JSON (mobile app will handle this via deep link)
        return {
            "success": True,
            "store_tier": creds.store_subscription_tier,
            "fee_percentage": float(creds.fee_percentage) if creds.fee_percentage else 13.0,
            "message": f"eBay account linked! Your fee rate is {creds.fee_percentage}%",
        }

    except Exception as e:
        print(f"eBay callback error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to link eBay account: {str(e)}")


@router.post("/refresh")
async def refresh_ebay_info(db: AsyncSession = Depends(get_db)):
    """Manually refresh eBay account info and fee rates."""
    account_info = await ebay_seller.refresh_account_info(db)
    if not account_info:
        raise HTTPException(status_code=400, detail="No eBay account linked or refresh failed")

    status = await ebay_seller.get_ebay_account_status(db)
    return status


@router.delete("/unlink")
async def unlink_ebay_account(db: AsyncSession = Depends(get_db)):
    """Unlink eBay account (remove stored credentials)."""
    from sqlalchemy import delete
    from ..models import EbayCredentials

    await db.execute(delete(EbayCredentials))
    await db.commit()

    return {"success": True, "message": "eBay account unlinked"}


@router.get("/fee")
async def get_current_fee(db: AsyncSession = Depends(get_db)):
    """Get current eBay fee percentage."""
    fee = await ebay_seller.get_current_fee_percentage(db)
    return {"fee_percentage": float(fee)}


@router.get("/local-pickup")
async def search_local_pickup(
    q: str,
    condition: str = "used",
):
    """
    Test endpoint: Search for items with local pickup within 100mi of Rickman, TN.

    Example: /ebay/local-pickup?q=RTX+3080&condition=used
    """
    from ..services.ebay_lookup import check_local_pickup_available

    result = await check_local_pickup_available(q, condition)
    if not result:
        return {"found": False, "message": "No local pickup items found within 100mi"}

    return {"found": True, **result}
