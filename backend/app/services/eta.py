from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bus, Trip


def heuristic_eta_minutes(remaining_km: float, speed_kmph: float | None) -> float:
    effective_speed = max(8.0, speed_kmph or 22.0)
    return max(1.0, (remaining_km / effective_speed) * 60)


def eta_score(eta_minutes: float, seats_left: int, is_full: bool) -> float:
    return eta_minutes * 2.0 + (12 if is_full else 0) - seats_left * 0.3


async def fetch_bus_options(db: AsyncSession) -> list[dict]:
    query = (
        select(Trip.id, Trip.route_name, Trip.occupied_seats, Bus.bus_number, Bus.capacity)
        .join(Bus, Bus.id == Trip.bus_id)
        .where(Trip.current_status == "running")
    )
    rows = (await db.execute(query)).all()

    now_factor = (datetime.utcnow().minute % 7) / 10
    options = []
    for idx, row in enumerate(rows):
        capacity = int(row.capacity)
        occupied = int(row.occupied_seats)
        seats_left = max(0, capacity - occupied)
        is_full = seats_left <= 0

        remaining_km = 1.5 + idx * 0.8 + now_factor
        speed_kmph = 18 + (idx % 4) * 4
        eta = heuristic_eta_minutes(remaining_km=remaining_km, speed_kmph=speed_kmph)

        options.append(
            {
                "trip_id": int(row.id),
                "bus_number": row.bus_number,
                "route_name": row.route_name,
                "eta_minutes": round(eta, 1),
                "seats_left": seats_left,
                "is_full": is_full,
            }
        )

    options.sort(key=lambda item: eta_score(item["eta_minutes"], item["seats_left"], item["is_full"]))
    return options


async def estimate_edge_speeds_from_logs(db: AsyncSession) -> None:
    # Placeholder for Celery scheduled model update. Extend with XGBoost features.
    await db.execute(
        select(func.count()).select_from(Trip)
    )
