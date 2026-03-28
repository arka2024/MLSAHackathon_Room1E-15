from datetime import datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bus, PositionLog, Trip
from app.schemas import GPSIn
from app.services.realtime import ws_manager


async def find_nearest_location_name(db: AsyncSession, lat: float, lng: float, within_meters: int = 50) -> str | None:
    sql = text(
        """
        SELECT name
        FROM locations
        WHERE ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
            :within_meters
        )
        ORDER BY ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
        )
        LIMIT 1;
        """
    )
    row = (await db.execute(sql, {"lat": lat, "lng": lng, "within_meters": within_meters})).first()
    return row[0] if row else None


async def process_gps_update(db: AsyncSession, gps: GPSIn) -> dict:
    bus = await db.scalar(select(Bus).where(Bus.id == gps.bus_id))
    if not bus or not bus.current_trip_id:
        raise ValueError("No active trip for bus")

    db_trip = await db.scalar(select(Trip).where(Trip.id == bus.current_trip_id))
    if not db_trip:
        raise ValueError("Trip not found")

    nearest_name = await find_nearest_location_name(db, gps.lat, gps.lng)

    db_trip.current_lat = gps.lat
    db_trip.current_lng = gps.lng
    db_trip.last_updated = datetime.utcnow()

    log = PositionLog(trip_id=db_trip.id, lat=gps.lat, lng=gps.lng, speed=gps.speed)
    db.add(log)
    await db.commit()

    payload = {
        "trip_id": db_trip.id,
        "bus_id": gps.bus_id,
        "lat": gps.lat,
        "lng": gps.lng,
        "speed": gps.speed,
        "nearest_location": nearest_name,
        "timestamp": db_trip.last_updated.isoformat(),
    }

    await ws_manager.broadcast("bus_live", payload)
    return payload
