import json

import httpx
from geopy.geocoders import Nominatim
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Location


PROMPT = """
You are a GIS expert. Generate a comprehensive JSON array of ALL major locations,
bus stops, landmarks, markets, hospitals, colleges, railway stations, airports,
residential areas, and key points in Bhubaneswar, Odisha, India.

Include at least 200 entries. Format exactly as:
[
  {"name": "Master Canteen", "description": "Central bus hub", "type": "bus_stop"}
]
Focus on real names from Mo Bus routes if possible.
""".strip()


async def generate_locations_from_gemma(limit: int = 200) -> list[dict]:
    if settings.gemma_provider != "ollama":
        raise ValueError("Only ollama provider is configured in this scaffold")

    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            settings.ollama_url,
            json={"model": settings.gemma_model_name, "prompt": PROMPT, "stream": False},
        )
        response.raise_for_status()

    raw = response.json().get("response", "[]")
    parsed = json.loads(raw)
    return parsed[:limit]


def geocode_location(name: str) -> tuple[float, float] | None:
    geolocator = Nominatim(user_agent="nexus_transit_geocoder")
    result = geolocator.geocode(f"{name}, Bhubaneswar, Odisha, India", timeout=10)
    if not result:
        return None
    return float(result.latitude), float(result.longitude)


async def save_generated_locations(db: AsyncSession, generated: list[dict]) -> int:
    inserted = 0
    for item in generated:
        name = item.get("name")
        place_type = item.get("type", "landmark")
        if not name:
            continue

        existing = await db.scalar(select(Location.id).where(func.lower(Location.name) == name.lower()))
        if existing:
            continue

        geo = geocode_location(name)
        if not geo:
            continue

        lat, lng = geo
        location = Location(
            name=name,
            lat=lat,
            lng=lng,
            type=place_type,
            geom=f"SRID=4326;POINT({lng} {lat})",
        )
        db.add(location)
        inserted += 1

    await db.commit()
    return inserted
