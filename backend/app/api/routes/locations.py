from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Location
from app.schemas import LocationOut
from app.services.gemma_location_generator import generate_locations_from_gemma, save_generated_locations

router = APIRouter()


@router.get("", response_model=list[LocationOut])
async def list_locations(db: AsyncSession = Depends(get_db)) -> list[LocationOut]:
    rows = (await db.execute(select(Location).order_by(Location.name.asc()))).scalars().all()
    return [LocationOut(id=row.id, name=row.name, lat=row.lat, lng=row.lng, type=row.type) for row in rows]


@router.post("/generate")
async def generate_locations(limit: int = 200, db: AsyncSession = Depends(get_db)) -> dict:
    generated = await generate_locations_from_gemma(limit=limit)
    inserted = await save_generated_locations(db, generated)
    return {"generated": len(generated), "inserted": inserted}
