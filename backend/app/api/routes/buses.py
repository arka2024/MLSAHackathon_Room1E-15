from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import BusOptionOut
from app.services.eta import fetch_bus_options

router = APIRouter()


@router.get("/options", response_model=list[BusOptionOut])
async def bus_options(db: AsyncSession = Depends(get_db)) -> list[BusOptionOut]:
    options = await fetch_bus_options(db)
    return [BusOptionOut(**item) for item in options]
