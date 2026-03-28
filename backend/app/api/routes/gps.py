from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import GPSIn
from app.services.live_tracking import process_gps_update

router = APIRouter()


@router.post("")
async def ingest_gps(payload: GPSIn, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await process_gps_update(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
