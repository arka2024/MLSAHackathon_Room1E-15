from datetime import datetime

from pydantic import BaseModel, Field


class LocationOut(BaseModel):
    id: int
    name: str
    lat: float
    lng: float
    type: str


class GPSIn(BaseModel):
    bus_id: int
    lat: float
    lng: float
    speed: float | None = None


class PathRequest(BaseModel):
    start_location_id: int
    end_location_id: int


class PathResponse(BaseModel):
    path_node_ids: list[int]
    total_cost: float
    metric: str


class BusOptionOut(BaseModel):
    trip_id: int
    bus_number: str
    route_name: str
    eta_minutes: float
    seats_left: int
    is_full: bool


class BookingCreateIn(BaseModel):
    user_id: int
    trip_id: int
    seats: int = Field(ge=1, le=8)


class BookingCreateOut(BaseModel):
    booking_id: int
    payment_id: int
    razorpay_order_id: str
    amount: float
    status: str


class RazorpayWebhookIn(BaseModel):
    event: str
    payload: dict


class GPSBroadcast(BaseModel):
    trip_id: int
    bus_id: int
    lat: float
    lng: float
    speed: float | None
    nearest_location: str | None
    timestamp: datetime
