from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.realtime import ws_manager

router = APIRouter()


@router.websocket("/ws/bus-live")
async def bus_live_socket(websocket: WebSocket) -> None:
    channel = "bus_live"
    await ws_manager.connect(channel, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(channel, websocket)
