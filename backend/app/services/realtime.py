import json
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, channel: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[channel].add(websocket)

    def disconnect(self, channel: str, websocket: WebSocket) -> None:
        if channel in self._connections:
            self._connections[channel].discard(websocket)

    async def broadcast(self, channel: str, payload: dict) -> None:
        dead: list[WebSocket] = []
        message = json.dumps(payload, default=str)
        for websocket in self._connections.get(channel, set()):
            try:
                await websocket.send_text(message)
            except Exception:
                dead.append(websocket)

        for websocket in dead:
            self.disconnect(channel, websocket)


ws_manager = ConnectionManager()
