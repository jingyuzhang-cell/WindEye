"""Governance API routes — community discovery and risk path analysis.

All endpoints use the unified Neo4jClient for database access and
GraphAnalytics for community detection.
"""

import logging
import time
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from core.database import Neo4jClient

logger = logging.getLogger("api.governance")

router = APIRouter(prefix="/api/v1/governance", tags=["governance"])

# Lazy-init on first use
_db: Neo4jClient | None = None


def _client() -> Neo4jClient:
    global _db
    if _db is None:
        _db = Neo4jClient.from_env()
    return _db


# ── Pydantic models ─────────────────────────────────────────────────


class CommunityDiscoveryRequest(BaseModel):
    seedNames: list[str] = Field(default_factory=list)
    seedIds: list[str] = Field(default_factory=list)
    maxHop: int = Field(default=3, ge=1, le=5)
    method: str = Field(default="auto")
    communityMode: str = Field(default="expanded")
    minCommunitySize: int = Field(default=2, ge=1)
    pathLimit: int = Field(default=5000, ge=50, le=10000)
    maxNodes: int = Field(default=300, ge=10, le=5000)
    relationWhitelist: list[str] = Field(default_factory=list)
    includeHgtEmbedding: bool = Field(default=False)


# ── Helpers ─────────────────────────────────────────────────────────


def _snake_to_camel(name: str) -> str:
    parts = name.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def _to_camel(obj: Any) -> Any:
    """Recursively convert dict keys from snake_case to camelCase."""
    if isinstance(obj, dict):
        result: dict[str, Any] = {}
        for key, value in obj.items():
            camel_key = _snake_to_camel(key)
            # Keep special keys that should stay snake_case
            if key in ("by_id",):
                result[key] = _to_camel(value)
            else:
                result[camel_key] = _to_camel(value)
        return result
    if isinstance(obj, list):
        return [_to_camel(item) for item in obj]
    return obj


def _flatten_entity_community_map(entity_map: dict, seed_ids: list[str]) -> dict[str, dict]:
    """Flatten entity_community_map to {node_id: {communityId, role, isSeed, riskLevel}}.

    The existing _build_entity_community_map returns:
        {"entities": [...], "by_id": {node_id: {..., communities: [...]}}}

    We flatten to a format suitable for frontend consumption and risk_path
    community_path mapping.
    """
    seed_set = set(seed_ids)
    by_id: dict[str, dict] = entity_map.get("by_id", {}) if isinstance(entity_map, dict) else {}
    result: dict[str, dict] = {}

    for node_id, entry in by_id.items():
        communities = entry.get("communities", [])
        if not communities:
            continue
        primary = communities[0]
        member_type = entry.get("type", "Unknown")
        result[str(node_id)] = {
            "communityId": primary.get("community_id", 0),
            "role": primary.get("role", "member"),
            "isSeed": str(node_id) in seed_set,
            "riskLevel": _derive_risk_level(entry, member_type),
        }

    return result


def _derive_risk_level(entry: dict, member_type: str) -> str:
    """Derive risk level from entity properties."""
    risk = str(entry.get("risk_level", "") or entry.get("riskLevel", "") or "").lower()
    if risk in ("high", "medium", "low"):
        return risk
    return ""


def _build_response(result: dict) -> dict:
    """Transform discover_seeded_communities() output to the API response format."""
    resolved_seed_ids = [
        str(n.get("id", "")) for n in result.get("seed_nodes", []) if n.get("id")
    ]
    entity_map_raw = result.get("entity_community_map", {})

    response = {
        "success": result.get("success", False),
        "traceId": f"trc-{int(time.time() * 1000)}",
        "selectedMethod": result.get("selected_method", ""),
        "fallbackReason": result.get("fallback_reason"),
        "seedCommunityId": result.get("seed_community_id"),
        "seedNodes": result.get("seed_nodes", []),
        "subgraph": {
            "nodeCount": len(result.get("subgraph", {}).get("nodes", [])),
            "edgeCount": len(result.get("subgraph", {}).get("edges", [])),
            "nodes": result.get("subgraph", {}).get("nodes", []),
            "edges": result.get("subgraph", {}).get("edges", []),
        },
        "connectedSubgraph": {
            "nodeCount": result.get("node_count", 0),
            "edgeCount": result.get("edge_count", 0),
            "nodes": result.get("connected_subgraph", {}).get("nodes", []),
            "edges": result.get("connected_subgraph", {}).get("edges", []),
        },
        "communities": result.get("communities", []),
        "entityCommunityMap": _flatten_entity_community_map(entity_map_raw, resolved_seed_ids),
        "communityEdges": result.get("community_edges", []),
        "communityGraph": result.get("community_graph", {}),
        "visualization": {
            "defaultView": "community_graph",
            "suggestedLayout": "clustered_force",
            "highlightCommunityId": result.get("seed_community_id"),
        },
    }

    return _to_camel(response)


# ── Route handlers ───────────────────────────────────────────────────


@router.post("/community-discovery")
def community_discovery(req: CommunityDiscoveryRequest):
    """Discover communities from seed entities via k-hop ego network expansion.

    Accepts entity names or Neo4j elementIds, extracts the connected
    subgraph, detects communities (WCC / Louvain / HGT-GKMeans with
    fallback chain), and returns a community graph suitable for
    two-level zoom visualization.
    """
    from kg_query.analytics.graph_analytics import GraphAnalytics

    seed_names = [s.strip() for s in req.seedNames if s and s.strip()]
    seed_ids = [s.strip() for s in req.seedIds if s and s.strip()]

    logger.info(
        "[CommunityAPI] seedNames=%s seedIds=%s method=%s maxHop=%s mode=%s",
        seed_names, seed_ids, req.method, req.maxHop, req.communityMode,
    )

    analytics = GraphAnalytics(db_client=_client())
    result = analytics.discover_seeded_communities(
        seed_names=seed_names,
        seed_ids=seed_ids,
        max_hop=req.maxHop,
        method=req.method,
        min_community_size=req.minCommunitySize,
        path_limit=req.pathLimit,
        max_nodes=req.maxNodes,
        relation_whitelist=req.relationWhitelist,
        community_mode=req.communityMode,
    )

    # Log key metrics
    logger.info(
        "[CommunityExpanded] nodes=%s edges=%s mode=%s",
        result.get("node_count"), result.get("edge_count"), req.communityMode,
    )
    logger.info(
        "[CommunityDetection] selected_method=%s community_count=%s fallback_reason=%s",
        result.get("selected_method"),
        result.get("community_count"),
        result.get("fallback_reason"),
    )
    seed_cid = result.get("seed_community_id")
    if seed_cid is not None:
        seed_members = [
            str(n.get("id", ""))
            for n in result.get("seed_nodes", [])
            if n.get("id")
        ]
        logger.info(
            "[CommunitySeed] seedCommunityId=%s seedNodeIds=%s",
            seed_cid, seed_members[:10],
        )
    cg = result.get("community_graph", {})
    logger.info(
        "[CommunityGraph] nodes=%s edges=%s",
        len(cg.get("nodes", [])), len(cg.get("edges", [])),
    )

    return _build_response(result)
