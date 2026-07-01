"""
Graph cache service backed by Redis.

Caches global statistics, subgraph snapshots, node degrees, and hub judgments.
All operations degrade gracefully when Redis is disabled.
"""

from __future__ import annotations

import logging
from typing import Any

from core.redis_client import (
    cache_get_json,
    cache_set_json,
    hash_get_all,
    hash_set,
)

logger = logging.getLogger("services.graph_cache")

# ── Key prefixes ─────────────────────────────────────────────────────
PREFIX_STATS = "windeye:graph:stats:global"
PREFIX_LAYER_STATS = "windeye:graph:stats:layer"
PREFIX_SUBGRAPH = "windeye:graph:subgraph"
PREFIX_DEGREE = "windeye:graph:degree"
PREFIX_HUB = "windeye:graph:hub"
PREFIX_HUB_STATS = "windeye:graph:hub-subject-stats"

# TTLs (seconds)
TTL_STATS = 300         # 5 min
TTL_SUBGRAPH = 1800     # 30 min
TTL_DEGREE = 3600       # 1 hour
TTL_HUB = 86400         # 24 hours
TTL_HUB_STATS = 3600    # 1 hour


# ── Global statistics ─────────────────────────────────────────────────

def get_global_stats() -> dict | None:
    return cache_get_json(PREFIX_STATS)


def set_global_stats(data: dict) -> bool:
    return cache_set_json(PREFIX_STATS, data, TTL_STATS)


def get_layer_stats() -> dict | None:
    return cache_get_json(PREFIX_LAYER_STATS)


def set_layer_stats(data: dict) -> bool:
    return cache_set_json(PREFIX_LAYER_STATS, data, TTL_STATS)


# ── Subgraph snapshots ───────────────────────────────────────────────

def _subgraph_key(subgraph_id: str) -> str:
    return f"{PREFIX_SUBGRAPH}:{subgraph_id}"


def get_subgraph(subgraph_id: str) -> dict | None:
    return cache_get_json(_subgraph_key(subgraph_id))


def set_subgraph(subgraph_id: str, data: dict, ttl: int = TTL_SUBGRAPH) -> bool:
    # Guard: don't store subgraphs > 5000 nodes
    nodes = data.get("nodes", [])
    if isinstance(nodes, list) and len(nodes) > 5000:
        data = {**data, "nodes": nodes[:5000], "_truncatedNodes": True}
    return cache_set_json(_subgraph_key(subgraph_id), data, ttl)


def get_subgraph_summary(subgraph_id: str) -> dict | None:
    return cache_get_json(f"{_subgraph_key(subgraph_id)}:summary")


def set_subgraph_summary(subgraph_id: str, summary: dict) -> bool:
    return cache_set_json(f"{_subgraph_key(subgraph_id)}:summary", summary, TTL_SUBGRAPH)


# ── Node degree ──────────────────────────────────────────────────────

def _degree_key(node_id: str) -> str:
    return f"{PREFIX_DEGREE}:{node_id}"


def get_node_degrees_cached(node_ids: list[str]) -> dict[str, int]:
    """Batch lookup degrees from Redis. Returns {nodeId: degree} for hits only."""
    from core.redis_client import get_redis
    r = get_redis()
    if not r:
        return {}
    result: dict[str, int] = {}
    try:
        pipe = r.pipeline()
        for nid in node_ids:
            pipe.get(_degree_key(nid))
        values = pipe.execute()
        for nid, val in zip(node_ids, values):
            if val is not None:
                try:
                    result[nid] = int(val)
                except (ValueError, TypeError):
                    pass
    except Exception:
        pass
    return result


def set_node_degrees_batch(degree_map: dict[str, int]) -> bool:
    """Batch write degrees to Redis."""
    from core.redis_client import get_redis
    r = get_redis()
    if not r:
        return False
    try:
        pipe = r.pipeline()
        for nid, deg in degree_map.items():
            pipe.setex(_degree_key(nid), TTL_DEGREE, str(deg))
        pipe.execute()
        return True
    except Exception:
        return False


# ── Hub judgment ─────────────────────────────────────────────────────

def _hub_key(node_id: str) -> str:
    return f"{PREFIX_HUB}:{node_id}"


def get_hub_cached(node_id: str) -> dict | None:
    return cache_get_json(_hub_key(node_id))


def set_hub_cached(node_id: str, data: dict) -> bool:
    return cache_set_json(_hub_key(node_id), data, TTL_HUB)


def get_hub_subject_stats_cached(node_id: str) -> dict | None:
    return cache_get_json(f"{PREFIX_HUB_STATS}:{node_id}")


def set_hub_subject_stats_cached(node_id: str, data: dict) -> bool:
    return cache_set_json(f"{PREFIX_HUB_STATS}:{node_id}", data, TTL_HUB_STATS)
