from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import BookingCreateIn, BookingCreateOut
from app.services.payments import create_booking_with_payment

router = APIRouter()


@router.post("", response_model=BookingCreateOut)
async def create_booking(payload: BookingCreateIn, db: AsyncSession = Depends(get_db)) -> BookingCreateOut:
    try:
        booking, payment = await create_booking_with_payment(
            db=db,
            user_id=payload.user_id,
            trip_id=payload.trip_id,
            seats=payload.seats,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return BookingCreateOut(
        booking_id=booking.id,
        payment_id=payment.id,
        razorpay_order_id=payment.razorpay_order_id or "",
        amount=float(payment.amount),
        status=booking.status,
    )
