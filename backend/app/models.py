from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    type: Mapped[str] = mapped_column(String(50), default="landmark", nullable=False)
    geom: Mapped[object] = mapped_column(Geometry(geometry_type="POINT", srid=4326))


class RoadEdge(Base):
    __tablename__ = "road_edges"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    source: Mapped[int] = mapped_column(BigInteger, index=True)
    target: Mapped[int] = mapped_column(BigInteger, index=True)
    cost: Mapped[float] = mapped_column(Float, nullable=False)
    cost_time: Mapped[float] = mapped_column(Float, nullable=False)
    geom: Mapped[object] = mapped_column(Geometry(geometry_type="LINESTRING", srid=4326))


class Bus(Base):
    __tablename__ = "buses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bus_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    operator_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_trip_id: Mapped[int | None] = mapped_column(ForeignKey("trips.id"), nullable=True)

    active_trip: Mapped["Trip | None"] = relationship(
        "Trip",
        foreign_keys=[current_trip_id],
        lazy="joined",
    )


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bus_id: Mapped[int] = mapped_column(ForeignKey("buses.id"), index=True)
    route_name: Mapped[str] = mapped_column(Text, nullable=False)
    scheduled_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_status: Mapped[str] = mapped_column(String(32), default="running", nullable=False)
    current_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    current_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    occupied_seats: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    bus: Mapped[Bus] = relationship("Bus", foreign_keys=[bus_id], lazy="joined")


class PositionLog(Base):
    __tablename__ = "position_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"), index=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    razorpay_order_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="created", nullable=False)
    commission: Mapped[float] = mapped_column(Numeric(5, 2), default=0.10, nullable=False)


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"), index=True)
    seats: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id"), nullable=True)
