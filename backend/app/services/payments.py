import hashlib
import hmac
from decimal import Decimal

import razorpay
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Booking, Payment, Trip


client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))


async def create_booking_with_payment(db: AsyncSession, user_id: int, trip_id: int, seats: int) -> tuple[Booking, Payment]:
    trip = await db.scalar(select(Trip).where(Trip.id == trip_id).with_for_update())
    if not trip:
        raise ValueError("Trip not found")

    bus_capacity = trip.bus.capacity if trip.bus else 0
    if trip.occupied_seats + seats > bus_capacity:
        raise ValueError("Insufficient seats")

    base_fare = Decimal("30.00")
    amount = base_fare * seats

    order = client.order.create({"amount": int(amount * 100), "currency": "INR", "payment_capture": 1})

    payment = Payment(
        amount=float(amount),
        razorpay_order_id=order["id"],
        status="created",
        commission=Decimal("0.10"),
    )
    db.add(payment)
    await db.flush()

    booking = Booking(
        user_id=user_id,
        trip_id=trip_id,
        seats=seats,
        status="pending",
        payment_id=payment.id,
    )
    db.add(booking)
    await db.commit()
    await db.refresh(booking)
    await db.refresh(payment)
    return booking, payment


async def handle_razorpay_success(db: AsyncSession, payload: dict, signature: str, raw_body: bytes) -> bool:
    order_id = payload.get("payload", {}).get("payment", {}).get("entity", {}).get("order_id", "")
    payment_id = payload.get("payload", {}).get("payment", {}).get("entity", {}).get("id", "")

    expected = hmac.new(settings.razorpay_webhook_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return False

    payment = await db.scalar(select(Payment).where(Payment.razorpay_order_id == order_id))
    if not payment:
        return False

    payment.razorpay_payment_id = payment_id
    payment.status = "paid"

    booking = await db.scalar(select(Booking).where(Booking.payment_id == payment.id))
    if booking:
        booking.status = "confirmed"
        trip = await db.scalar(select(Trip).where(Trip.id == booking.trip_id).with_for_update())
        if trip:
            trip.occupied_seats += booking.seats

    await db.commit()
    return True
