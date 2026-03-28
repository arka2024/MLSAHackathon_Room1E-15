# Nexus Transit Backend (FastAPI + PostGIS + pgRouting)

This backend implements the architecture you requested for Bhubaneswar real-time bus tracking, routing, booking, and payments.

## Included Capabilities

- FastAPI async backend with REST + WebSocket
- PostgreSQL + PostGIS + pgRouting schema
- Live GPS ingestion and nearest-location match
- Shortest and fastest path APIs via `pgr_dijkstra`
- Bus option ranking with ETA + seat visibility (shows full buses too)
- Booking transaction flow and Razorpay order/webhook support
- Gemma 3B one-time location generation scaffold (Ollama)
- Celery task scaffold for dynamic edge-cost refresh

## Project Structure

- `app/main.py`: FastAPI app startup
- `app/models.py`: SQLAlchemy ORM data models
- `app/api/routes/*`: API endpoints
- `app/services/*`: domain services (routing, ETA, GPS, payments, Gemma)
- `app/tasks/celery_app.py`: Celery worker and scheduled task hooks
- `sql/bootstrap.sql`: DB extensions + base schema

## 1) Start Infra

```bash
cd backend
docker compose up -d
```

## 2) Python Setup

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
copy .env.example .env
```

## 3) Prepare Database

Use `sql/bootstrap.sql` in Postgres:

```bash
psql -h localhost -U postgres -d nexus_transit -f sql/bootstrap.sql
```

Import Bhubaneswar OSM road network into `road_edges` using `osm2pgrouting` or your preferred import pipeline.

## 4) Run API

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 5) Run Celery Worker

```bash
celery -A app.tasks.celery_app.celery_app worker --loglevel=info
```

## Core Endpoints

- `GET /health`
- `GET /api/v1/locations`
- `POST /api/v1/locations/generate?limit=200`
- `POST /api/v1/gps`
- `POST /api/v1/routing/shortest`
- `POST /api/v1/routing/fastest`
- `GET /api/v1/buses/options`
- `POST /api/v1/booking`
- `POST /api/v1/payments/razorpay-webhook`
- `WS /api/v1/ws/bus-live`

## Notes

- Gemma generation is one-time; call `POST /locations/generate` and persist to DB.
- For production, replace simple ETA heuristics with XGBoost/LSTM using `position_logs`.
- Use Razorpay Route/payout flows for operator settlements when you enable disbursements.
- Add JWT auth and API rate limits before deployment.
