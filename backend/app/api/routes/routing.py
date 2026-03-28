from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Location
from app.schemas import PathRequest, PathResponse
from app.services.routing import find_nearest_road_node, run_pgr_dijkstra

router = APIRouter()


@router.post("/shortest", response_model=PathResponse)
async def shortest_path(req: PathRequest, db: AsyncSession = Depends(get_db)) -> PathResponse:
    start = await db.scalar(select(Location).where(Location.id == req.start_location_id))
    end = await db.scalar(select(Location).where(Location.id == req.end_location_id))
    if not start or not end:
        raise HTTPException(status_code=404, detail="Start or end location not found")

    start_node = await find_nearest_road_node(db, start.lat, start.lng)
    end_node = await find_nearest_road_node(db, end.lat, end.lng)
    if not start_node or not end_node:
        raise HTTPException(status_code=400, detail="Nearest road nodes unavailable")

    node_ids, total_cost = await run_pgr_dijkstra(db, start_node, end_node, fastest=False)
    return PathResponse(path_node_ids=node_ids, total_cost=total_cost, metric="distance")


@router.post("/fastest", response_model=PathResponse)
async def fastest_path(req: PathRequest, db: AsyncSession = Depends(get_db)) -> PathResponse:
    start = await db.scalar(select(Location).where(Location.id == req.start_location_id))
    end = await db.scalar(select(Location).where(Location.id == req.end_location_id))
    if not start or not end:
        raise HTTPException(status_code=404, detail="Start or end location not found")

    start_node = await find_nearest_road_node(db, start.lat, start.lng)
    end_node = await find_nearest_road_node(db, end.lat, end.lng)
    if not start_node or not end_node:
        raise HTTPException(status_code=400, detail="Nearest road nodes unavailable")

    node_ids, total_cost = await run_pgr_dijkstra(db, start_node, end_node, fastest=True)
    return PathResponse(path_node_ids=node_ids, total_cost=total_cost, metric="time")
