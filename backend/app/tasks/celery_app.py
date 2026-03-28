from celery import Celery

from app.config import settings

celery_app = Celery("nexus_transit", broker=settings.rabbitmq_url, backend=settings.redis_url)


@celery_app.task
def refresh_dynamic_edge_costs() -> str:
    # Placeholder task. Wire this to update road_edges.cost_time from recent logs.
    return "dynamic edge costs refreshed"
