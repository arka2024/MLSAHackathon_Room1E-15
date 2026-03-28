from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def find_nearest_road_node(db: AsyncSession, lat: float, lng: float) -> int | None:
    sql = text(
        """
        SELECT source
        FROM road_edges
        ORDER BY ST_Distance(
          geom::geography,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
        )
        LIMIT 1;
        """
    )
    row = (await db.execute(sql, {"lat": lat, "lng": lng})).first()
    return int(row[0]) if row else None


async def run_pgr_dijkstra(
    db: AsyncSession, start_node: int, end_node: int, fastest: bool = False
) -> tuple[list[int], float]:
    cost_column = "cost_time" if fastest else "cost"
    sql = text(
        f"""
        SELECT *
        FROM pgr_dijkstra(
            'SELECT id, source, target, {cost_column} AS cost FROM road_edges',
            :start_node,
            :end_node,
            directed := true
        );
        """
    )

    rows = (await db.execute(sql, {"start_node": start_node, "end_node": end_node})).all()
    if not rows:
        return [], 0.0

    path_node_ids = [int(row.node) for row in rows if row.node != -1]
    total_cost = float(sum(float(row.cost) for row in rows if row.edge != -1))
    return path_node_ids, total_cost
