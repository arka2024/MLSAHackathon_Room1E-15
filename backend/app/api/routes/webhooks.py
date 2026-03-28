from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.payments import handle_razorpay_success

router = APIRouter()


@router.post("/razorpay-webhook")
async def razorpay_webhook(
    request: Request,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    x_razorpay_signature: str = Header(default=""),
) -> dict:
    raw_body = await request.body()
    ok = await handle_razorpay_success(db, payload, x_razorpay_signature, raw_body)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid webhook signature or payload")
    return {"status": "processed"}
