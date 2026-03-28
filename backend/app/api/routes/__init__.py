from fastapi import APIRouter

from app.api.routes.buses import router as buses_router
from app.api.routes.booking import router as booking_router
from app.api.routes.gps import router as gps_router
from app.api.routes.locations import router as locations_router
from app.api.routes.routing import router as routing_router
from app.api.routes.webhooks import router as webhooks_router
from app.api.routes.ws import router as ws_router

router = APIRouter()
router.include_router(locations_router, prefix="/locations", tags=["locations"])
router.include_router(gps_router, prefix="/gps", tags=["gps"])
router.include_router(routing_router, prefix="/routing", tags=["routing"])
router.include_router(buses_router, prefix="/buses", tags=["buses"])
router.include_router(booking_router, prefix="/booking", tags=["booking"])
router.include_router(webhooks_router, prefix="/payments", tags=["payments"])
router.include_router(ws_router, tags=["websocket"])
