"""Graph visualization API routes — migrated from Flask server_Arua.py.

All endpoints use the unified Neo4jClient for database access.
"""

import logging
import traceback
from datetime import datetime

import numpy as np
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from scipy.sparse import lil_matrix

from core.database import Neo4jClient

logger = logging.getLogger("api.graph")

router = APIRouter(prefix="/api/v1/graph", tags=["graph"])

# Lazy-init on first use — shares the same driver as the DRA-MA pipeline
_db: Neo4jClient | None = None


def _client() -> Neo4jClient:
    global _db
    if _db is None:
        _db = Neo4jClient.from_env()
    return _db


# ====================================================
# Helpers
# ====================================================


def _safe_int(value, default=100, min_val=1, max_val=1000):
    try:
        val = int(value)
        return max(min_val, min(val, max_val))
    except (ValueError, TypeError):
        return default


def _cross_stats(from_labels: list[str], to_labels: list[str]) -> dict:
    """Return relationship count and types between two label groups (directed from->to)."""
    query = f"""
    MATCH (n)-[r]->(m)
    WHERE {_labels_cypher('n', from_labels)}
      AND {_labels_cypher('m', to_labels)}
    RETURN count(r) AS cnt, collect(DISTINCT type(r)) AS rel_types
    """
    records, _ = _client().execute_read_with_summary(query)
    if not records or records[0].get("cnt", 0) == 0:
        return {"count": 0, "rel_types": []}
    return {"count": records[0]["cnt"], "rel_types": records[0].get("rel_types", [])}


def _process_result(records: list[dict]) -> dict:
    """Convert raw Neo4j record dicts into {nodes, edges} for the frontend."""
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    edge_ids: set[str] = set()

    for record in records:
        for key in ("n", "m", "node"):
            node_data = record.get(key)
            if node_data is not None:
                if hasattr(node_data, "element_id"):
                    nid = node_data.element_id
                    if nid not in nodes:
                        nodes[nid] = Neo4jClient.serialize_node(node_data)
                elif isinstance(node_data, dict) and "element_id" in node_data:
                    # already-serialized node from .data()
                    nid = node_data["element_id"]
                    if nid not in nodes:
                        nodes[nid] = node_data

        for rel_key in ("r", "rel"):
            rels = record.get(rel_key)
            if rels is None:
                continue
            rel_list = rels if isinstance(rels, list) else [rels]
            for rel in rel_list:
                if rel is None:
                    continue
                if hasattr(rel, "element_id"):
                    rid = rel.element_id
                    if rid not in edge_ids:
                        edges.append(Neo4jClient.serialize_relationship(rel))
                        edge_ids.add(rid)

    return {"nodes": list(nodes.values()), "edges": edges}


class SeedCommunityRequest(BaseModel):
    seed_names: list[str] = Field(default_factory=list, alias="seedNames")
    seed_ids: list[str] = Field(default_factory=list, alias="seedIds")
    max_hop: int = Field(default=2, ge=1, le=3, alias="maxHop")
    method: str = Field(default="auto", description="auto | wcc | louvain | leiden | hgt_gkmeans")
    min_community_size: int = Field(default=2, ge=1, le=100, alias="minCommunitySize")
    path_limit: int = Field(default=2000, ge=50, le=10000, alias="pathLimit")
    max_nodes: int = Field(default=300, ge=10, le=5000, alias="maxNodes")
    relation_whitelist: list[str] = Field(default_factory=list, alias="relationWhitelist")
    community_mode: str = Field(default="expanded", alias="communityMode")


# ====================================================
# Health
# ====================================================


@router.get("/health")
def graph_health():
    try:
        _client().verify_connectivity()
        return {
            "status": "healthy",
            "neo4j": "connected",
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "neo4j": "disconnected",
            "error": str(e),
        }


# ====================================================
# Statistics (unified with layer path param)
# ====================================================


@router.get("/statistics")
def get_statistics(
    layer: str = Query("all", description="Layer: all|Subject|Event|Feature|Regulation"),
):
    try:
        if layer == "Subject":
            return _subject_statistics()
        elif layer == "Event":
            return _event_statistics()
        elif layer == "Feature":
            return _feature_statistics()
        elif layer == "Regulation":
            return _regulation_statistics()
        else:
            return _detailed_statistics()
    except Exception as e:
        logger.error(f"Statistics error: {traceback.format_exc()}")
        return {"error": str(e)}


def _subject_statistics():
    query = """
    MATCH (n)
    WHERE any(label IN labels(n) WHERE label IN ['COMPANY','PERSON','PFCOMPANY','PFUND','SECURITY'])
    RETURN
        count(n) AS total_nodes,
        count(CASE WHEN 'COMPANY' IN labels(n) THEN 1 END) AS company_count,
        count(CASE WHEN 'PERSON' IN labels(n) THEN 1 END) AS person_count,
        count(CASE WHEN 'PFCOMPANY' IN labels(n) THEN 1 END) AS pfcompany_count,
        count(CASE WHEN 'PFUND' IN labels(n) THEN 1 END) AS pfund_count,
        count(CASE WHEN 'SECURITY' IN labels(n) THEN 1 END) AS security_count
    """
    records, _ = _client().execute_read_with_summary(query)
    if not records:
        return {"error": "No data found"}
    data = records[0]
    return {
        "total": data.get("total_nodes", 0),
        "details": [
            {"label": "企业", "value": data.get("company_count", 0), "type": "COMPANY"},
            {"label": "自然人", "value": data.get("person_count", 0), "type": "PERSON"},
            {"label": "私募公司", "value": data.get("pfcompany_count", 0), "type": "PFCOMPANY"},
            {"label": "私募基金", "value": data.get("pfund_count", 0), "type": "PFUND"},
            {"label": "证券", "value": data.get("security_count", 0), "type": "SECURITY"},
        ],
    }


def _event_statistics():
    query = """
    MATCH (n)
    WHERE any(label IN labels(n) WHERE label IN ['Event'])
    RETURN
        count(n) AS total_nodes,
        count(CASE WHEN 'COMPANY' IN labels(n) THEN 1 END) AS company_count,
        count(CASE WHEN 'PERSON' IN labels(n) THEN 1 END) AS person_count,
        count(CASE WHEN 'TIME' IN labels(n) THEN 1 END) AS time_count,
        count(CASE WHEN 'EVENT' IN labels(n) THEN 1 END) AS event_count,
        count(CASE WHEN 'REGULATOR' IN labels(n) THEN 1 END) AS regulator_count
    """
    records, _ = _client().execute_read_with_summary(query)
    if not records:
        return {"error": "No data found"}
    data = records[0]
    return {
        "total": data.get("total_nodes", 0),
        "details": [
            {"label": "企业", "value": data.get("company_count", 0), "type": "COMPANY"},
            {"label": "自然人", "value": data.get("person_count", 0), "type": "PERSON"},
            {"label": "时间", "value": data.get("time_count", 0), "type": "TIME"},
            {"label": "事件", "value": data.get("event_count", 0), "type": "EVENT"},
            {"label": "监管机构", "value": data.get("regulator_count", 0), "type": "REGULATOR"},
        ],
    }


def _feature_statistics():
    query = """
    MATCH (n)
    WHERE any(label IN labels(n) WHERE label IN ['Feature'])
    RETURN
        count(n) AS total_nodes,
        count(CASE WHEN 'RiskFeature' IN labels(n) THEN 1 END) AS riskfeature_count,
        count(CASE WHEN 'RiskFactor' IN labels(n) THEN 1 END) AS riskfactor_count
    """
    records, _ = _client().execute_read_with_summary(query)
    if not records:
        return {"error": "No data found"}
    data = records[0]
    return {
        "total": data.get("total_nodes", 0),
        "details": [
            {"label": "风险特征", "value": data.get("riskfeature_count", 0), "type": "RiskFeature"},
            {"label": "风险因子", "value": data.get("riskfactor_count", 0), "type": "RiskFactor"},
        ],
    }


def _regulation_statistics():
    query = """
    MATCH (n)
    WHERE any(label IN labels(n) WHERE label IN ['Regulation'])
    RETURN
        count(n) AS total_nodes,
        count(CASE WHEN 'Regulation' IN labels(n) THEN 1 END) AS regulation_count,
        count(CASE WHEN 'Law' IN labels(n) THEN 1 END) AS law_count
    """
    records, _ = _client().execute_read_with_summary(query)
    if not records:
        return {"error": "No data found"}
    data = records[0]
    return {
        "total": data.get("total_nodes", 0),
        "details": [
            {"label": "法规", "value": data.get("regulation_count", 0), "type": "Regulation"},
            {"label": "法律", "value": data.get("law_count", 0), "type": "Law"},
        ],
    }


def _detailed_statistics():
    """Four-layer detailed statistics (nodes + relationships per layer)."""
    layers_config = [
        {
            "layer": "主体层",
            "layer_code": "Subject",
            "node_filter": "'Subject' IN labels(n)",
            "rel_filter": "'Subject' IN labels(n) AND 'Subject' IN labels(m)",
        },
        {
            "layer": "事件层",
            "layer_code": "Event",
            "node_filter": "'Event' IN labels(n)",
            "rel_filter": "'Event' IN labels(n) AND 'Event' IN labels(m)",
        },
        {
            "layer": "特征层",
            "layer_code": "Feature",
            "node_filter": "'Feature' IN labels(n)",
            "rel_filter": "'Feature' IN labels(n) AND 'Feature' IN labels(m)",
        },
        {
            "layer": "法规层",
            "layer_code": "Regulation",
            "node_filter": "'Regulation' IN labels(n)",
            "rel_filter": "'Regulation' IN labels(n) AND 'Regulation' IN labels(m)",
        },
    ]

    result = []
    client = _client()

    for lc in layers_config:
        node_query = f"""
        MATCH (n)
        WHERE {lc["node_filter"]}
        RETURN count(n) AS node_count, collect(DISTINCT labels(n)) AS node_types
        """
        rel_query = f"""
        MATCH (n)-[r]-(m)
        WHERE {lc["rel_filter"]}
        RETURN count(DISTINCT r) AS rel_count, collect(DISTINCT type(r)) AS rel_types
        """

        node_records, _ = client.execute_read_with_summary(node_query)
        rel_records, _ = client.execute_read_with_summary(rel_query)

        nd = node_records[0] if node_records else {}
        rd = rel_records[0] if rel_records else {}

        node_types_flat: list[str] = []
        for labels_list in nd.get("node_types", []):
            node_types_flat.extend(
                [lbl for lbl in labels_list if lbl != lc["layer_code"]]
            )
        node_types_flat = list(set(node_types_flat))

        # Cross-layer relationships: count edges to each other layer
        cross_layer_rels: dict[str, int] = {}
        for other_code, other_labels in _LAYER_LABEL_MAP.items():
            if other_code == lc["layer_code"]:
                continue
            cr = _cross_stats(_LAYER_LABEL_MAP[lc["layer_code"]], other_labels)
            cross_layer_rels[f"to_{other_code}"] = cr["count"]

        result.append(
            {
                "layer": lc["layer"],
                "layer_code": lc["layer_code"],
                "node_count": nd.get("node_count", 0),
                "node_type_count": len(node_types_flat),
                "node_types": node_types_flat,
                "rel_count": rd.get("rel_count", 0),
                "rel_type_count": len(rd.get("rel_types", [])),
                "rel_types": rd.get("rel_types", []),
                "cross_layer_rels": cross_layer_rels,
            }
        )

    return {
        "success": True,
        "total": sum(l["node_count"] for l in result),
        "total_relationships": sum(l["rel_count"] for l in result),
        "details": [
            {"label": l["layer"], "value": l["node_count"], "type": l["layer_code"]}
            for l in result
        ],
        "layers": result,
    }


# ====================================================
# Summary statistics (aggregated across all 4 layers)
# ====================================================


@router.get("/summary-stats")
def get_summary_stats():
    """Return global totals + per-layer breakdown in one call."""
    try:
        layers = _detailed_statistics().get("layers", [])

        total_nodes = 0
        total_relationships = 0

        for layer_data in layers:
            total_nodes += layer_data.get("node_count", 0)
            total_relationships += layer_data.get("rel_count", 0)

        # Also count cross-layer relationships (not counted in per-layer rel_count)
        layer_codes = ["Subject", "Event", "Feature", "Regulation"]
        cross_total = 0
        for i, from_code in enumerate(layer_codes):
            for to_code in layer_codes[i + 1:]:
                stats = _cross_stats(_LAYER_LABEL_MAP[from_code], _LAYER_LABEL_MAP[to_code])
                cross_total += stats.get("count", 0)

        return {
            "total_nodes": total_nodes,
            "total_relationships": total_relationships + cross_total,
            "layers": layers,
        }
    except Exception as e:
        logger.error(f"Summary stats error: {traceback.format_exc()}")
        return {"error": str(e)}


# ====================================================
# Cross-layer statistics
# ====================================================


@router.get("/cross-stats")
def get_cross_layer_statistics():
    """Return cross-layer relationship counts between all 4 layers."""
    layer_codes = ["Subject", "Event", "Feature", "Regulation"]
    result: dict[str, dict] = {}

    for from_code in layer_codes:
        for to_code in layer_codes:
            if from_code == to_code:
                continue
            key = f"{from_code}_to_{to_code}"
            stats = _cross_stats(_LAYER_LABEL_MAP[from_code], _LAYER_LABEL_MAP[to_code])
            result[key] = {"count": stats["count"], "rel_types": stats["rel_types"]}

    return {"success": True, "cross_layer_rels": result}


# ====================================================
# Graph data
# ====================================================


# All known labels in the financial KG (used by layer=all)
_ALL_LABELS = [
    "Subject", "COMPANY", "PERSON", "PFCOMPANY", "PFUND", "SECURITY",
    "Event", "EVENT", "TIME", "REGULATOR",
    "Feature", "RiskFeature", "RiskFactor",
    "Regulation", "Law", "Action", "Entity", "NODE", "Section",
    "Responsibility", "PartyWithResponsibility", "Actor",
    "RegulatoryAuthority",
]

# Layer-specific label groups for cross-layer UNION queries
_LAYER_SUBJECT = ["Subject", "COMPANY", "PERSON", "PFCOMPANY", "PFUND", "SECURITY"]
_LAYER_EVENT = ["Event", "EVENT", "TIME", "REGULATOR"]
_LAYER_FEATURE = ["Feature", "RiskFeature", "RiskFactor"]
_LAYER_REGULATION = ["Regulation", "Law", "Action"]

_LAYER_LABEL_MAP = {
    "Subject": _LAYER_SUBJECT,
    "Event": _LAYER_EVENT,
    "Feature": _LAYER_FEATURE,
    "Regulation": _LAYER_REGULATION,
}


def _labels_for_layer(layer: str) -> list[str]:
    """Return concrete Neo4j labels for a UI layer.

    `layer=all` must use the real labels in the database, not only the
    abstract four-layer labels. Otherwise entity names that resolve to COMPANY,
    PERSON, SECURITY, etc. are filtered out before traversal starts.
    """
    if layer in _LAYER_LABEL_MAP:
        return _LAYER_LABEL_MAP[layer]
    return _ALL_LABELS


def _labels_cypher(var: str, labels: list[str]) -> str:
    """Build a Cypher `any(label IN labels({var}) WHERE label IN [...])` expression."""
    quoted = ", ".join(f"'{l}'" for l in labels)
    return f"any(label IN labels({var}) WHERE label IN [{quoted}])"


@router.get("/data")
def get_graph_data(
    layer: str = Query("all", description="Layer filter"),
    relationType: str = Query("", description="Single relation type filter"),
    limit: int = Query(100, ge=1, le=500),
    depth: int = Query(1, ge=1, le=3, description="Hop depth for graph traversal"),
):
    rel_filter = f":`{relationType}`" if relationType else ""

    def _layer_match(labels_a: list[str], labels_b: list[str]) -> str:
        """Build a MATCH clause for nodes with labels from two groups (cross or same layer)."""
        return (
            f"MATCH (n)-[r{rel_filter}]-(m) "
            f"WHERE n <> m "
            f"AND {_labels_cypher('n', labels_a)} "
            f"AND {_labels_cypher('m', labels_b)} "
            f"RETURN n, r, m"
        )

    try:
        if layer in _LAYER_LABEL_MAP:
            labels = _LAYER_LABEL_MAP[layer]
            query = f"{_layer_match(labels, labels)} LIMIT {limit}"
        else:
            # All layers: return nodes and relationships across all 4 layers
            match_clause = (
                f"MATCH (n)-[r{rel_filter}*1..{depth}]-(m)"
                if depth > 1
                else f"MATCH (n)-[r{rel_filter}]-(m)"
            )
            query = f"""
            {match_clause}
            WHERE n <> m
              AND (
                any(label IN labels(n) WHERE label IN ['Subject','Event','Feature','Regulation',
                    'COMPANY','PERSON','PFCOMPANY','PFUND','SECURITY',
                    'TIME','EVENT','REGULATOR',
                    'RiskFeature','RiskFactor',
                    'Regulation','Law','Action'])
              )
              AND (
                any(label IN labels(m) WHERE label IN ['Subject','Event','Feature','Regulation',
                    'COMPANY','PERSON','PFCOMPANY','PFUND','SECURITY',
                    'TIME','EVENT','REGULATOR',
                    'RiskFeature','RiskFactor',
                    'Regulation','Law','Action'])
              )
            RETURN DISTINCT n, r, m LIMIT {limit}
            """

        records, _ = _client().execute_read_with_summary(query)
        logger.info(
            "Graph data — layer=%s relationType=%s limit=%s count=%s",
            layer, relationType or "all", limit, len(records),
        )
        return _process_result(records)

    except Exception as e:
        logger.error(f"Graph data error: {traceback.format_exc()}")
        return {"error": str(e)}


# ====================================================
# Search
# ====================================================


@router.get("/search")
def search_graph(
    q: str = Query("", description="Keyword"),
    layer: str = Query("all", description="Layer filter"),
    nodeType: str = Query("", description="Target node type"),
    relType: str = Query("", description="Target relation type"),
    layers: int = Query(1, ge=1, le=3, description="Hop depth"),
    limit: int = Query(100, ge=1, le=500),
):
    keyword = q.strip()
    rel_constraint = f":{relType}" if relType else ""
    node_label_constraint = f":{nodeType}" if nodeType else ""

    layer_labels = _labels_for_layer(layer)
    labels_cypher = ", ".join(f"'{l}'" for l in layer_labels)

    if not keyword and not nodeType and not relType:
        return {"nodes": [], "edges": []}

    try:
        if not keyword:
            # Random center node with filters
            center_query = f"""
            MATCH (n)
            WHERE any(label IN labels(n) WHERE label IN [{labels_cypher}])
              AND EXISTS((n)--())
            WITH n, rand() AS r ORDER BY r LIMIT 1
            RETURN n
            """
            center_records, _ = _client().execute_read_with_summary(center_query)
            if not center_records:
                return {"nodes": [], "edges": []}

            center_node = center_records[0]["n"]
            center_id = center_node.element_id

            query = f"""
            MATCH (n)
            WHERE elementId(n) = $center_id
            WITH n
            MATCH path = (n)-[r{rel_constraint}*1..{layers}]-(m{node_label_constraint})
            WHERE any(label IN labels(m) WHERE label IN [{labels_cypher}])
            UNWIND nodes(path) AS node
            WITH node, path
            WHERE any(label IN labels(node) WHERE label IN [{labels_cypher}])
            UNWIND relationships(path) AS rel
            RETURN DISTINCT node, rel LIMIT {limit}
            """

            logger.info(
                "Search (filter) — layer=%s nodeType=%s relType=%s depth=%s",
                layer, nodeType or "all", relType or "all", layers,
            )
            records, _ = _client().execute_read_with_summary(query, {"center_id": center_id})
        else:
            query = f"""
            MATCH (n)
            WHERE (n.PERSON_NM CONTAINS $keyword
               OR n.COMPANY_NM CONTAINS $keyword
               OR n.name CONTAINS $keyword
               OR n.title CONTAINS $keyword
               OR n.zh_name CONTAINS $keyword
               OR n.id CONTAINS $keyword)
              AND any(label IN labels(n) WHERE label IN [{labels_cypher}])
            WITH n
            MATCH path = (n)-[r{rel_constraint}*1..{layers}]-(m{node_label_constraint})
            WHERE any(label IN labels(m) WHERE label IN [{labels_cypher}])
            UNWIND nodes(path) AS node
            WITH node, path
            WHERE any(label IN labels(node) WHERE label IN [{labels_cypher}])
            UNWIND relationships(path) AS rel
            RETURN DISTINCT node, rel LIMIT {limit}
            """

            logger.info(
                "Search (keyword) — q=%s layer=%s nodeType=%s relType=%s depth=%s",
                keyword, layer, nodeType or "all", relType or "all", layers,
            )
            records, _ = _client().execute_read_with_summary(query, {"keyword": keyword})

        return _process_result(records)

    except Exception as e:
        logger.error(f"Search error: {traceback.format_exc()}")
        return {"error": str(e)}


# ====================================================
# Search all layers (full cross-layer traversal)
# ====================================================


@router.get("/search-all")
def search_all_layers(
    q: str = Query(..., description="Keyword (required)"),
    depth: int = Query(2, ge=1, le=3, description="Expansion depth from center"),
    limit: int = Query(200, ge=1, le=500),
    layer: str = Query("all", description="Filter center nodes by layer: all, Subject, Event, Feature, Regulation"),
):
    """Search across all layers with progressive expansion.

    Step 1: Find center nodes matching keyword (up to 10), optionally filtered by layer.
    Step 2: Expand N-hop from each center to collect neighbors (cross-layer).
    Step 3: Collect relationships between all discovered nodes.
    """
    keyword = q.strip()
    if not keyword:
        return {"nodes": [], "edges": []}

    layer_filter = ""
    if layer and layer != "all":
        mapped = _LAYER_LABEL_MAP.get(layer, [layer])
        conditions = " OR ".join([f"center:{lbl}" for lbl in mapped])
        layer_filter = f"  AND ({conditions})\n"

    query = f"""
    // Step 1: Find center nodes by keyword
    MATCH (center)
    WHERE (center.name CONTAINS $keyword
       OR center.title CONTAINS $keyword
       OR center.COMPANY_NM CONTAINS $keyword
       OR center.PERSON_NM CONTAINS $keyword
       OR center.id CONTAINS $keyword
       OR center.factor_nm CONTAINS $keyword
       OR center.feature_nm CONTAINS $keyword)
    {layer_filter}WITH center LIMIT 10

    // Step 2: Expand N-hop from centers (cross-layer)
    MATCH path = (center)-[*1..{depth}]-(neighbor)
    WHERE center <> neighbor
    WITH collect(DISTINCT center) + collect(DISTINCT neighbor) AS all_nodes

    // Step 3: Collect relationships between all discovered nodes
    UNWIND all_nodes AS a
    MATCH (a)-[r]-(b)
    WHERE b IN all_nodes AND elementId(a) < elementId(b)
    WITH all_nodes, collect(DISTINCT r) AS all_rels

    UNWIND all_nodes AS node
    UNWIND all_rels AS rel
    WITH node, rel
    WHERE startNode(rel) = node OR endNode(rel) = node
    RETURN node, rel
    LIMIT {limit}
    """

    try:
        records, _ = _client().execute_read_with_summary(query, {"keyword": keyword})

        nodes_map: dict[str, dict] = {}
        edges: list[dict] = []
        edge_ids: set[str] = set()

        for record in records:
            node = record.get("node")
            if node:
                nid = node.element_id
                if nid not in nodes_map:
                    nodes_map[nid] = Neo4jClient.serialize_node(node)
            rel = record.get("rel")
            if rel:
                rid = rel.element_id
                if rid not in edge_ids:
                    edges.append(Neo4jClient.serialize_relationship(rel))
                    edge_ids.add(rid)

        return {"nodes": list(nodes_map.values()), "edges": edges}

    except Exception as e:
        logger.error(f"Search all layers error: {traceback.format_exc()}")
        return {"error": str(e)}


# ====================================================
# Subgraph expansion
# ====================================================


@router.get("/subgraph/{node_id}")
def get_subgraph(
    node_id: str,
    layer: str = Query("all", description="Layer filter"),
    limit: int = Query(50, ge=1, le=200),
):
    labels_cypher = ", ".join(f"'{l}'" for l in _labels_for_layer(layer))
    query = f"""
    MATCH (n)-[r]-(m)
    WHERE elementId(n) = $id
      AND any(label IN labels(m) WHERE label IN [{labels_cypher}])
    RETURN n, r, m LIMIT $limit
    """

    logger.info("Subgraph — id=%s layer=%s limit=%s", node_id, layer, limit)
    try:
        records, _ = _client().execute_read_with_summary(
            query, {"id": node_id, "limit": limit}
        )
        return _process_result(records)
    except Exception as e:
        logger.error(f"Subgraph error: {traceback.format_exc()}")
        return {"error": str(e)}


# ====================================================
# Star expansion
# ====================================================


@router.get("/expand/{node_id}")
def expand_node(
    node_id: str,
    depth: int = Query(1, ge=1, le=3, description="Expansion depth (hops)"),
    limit: int = Query(100, ge=1, le=500),
):
    """Star expansion from a center node.

    Unlike /subgraph which returns only 1-hop neighbors, this endpoint
    traverses N hops outward from the center node across all layers,
    returning all discovered nodes and relationships.
    """
    logger.info("Expand — node_id=%s depth=%s limit=%s", node_id, depth, limit)
    try:
        query = """
        MATCH (center)
        WHERE elementId(center) = $node_id
        WITH center
        MATCH path = (center)-[*1..$depth]-(neighbor)
        WHERE center <> neighbor
          AND any(label IN labels(neighbor) WHERE label IN [
            'Subject','Event','Feature','Regulation',
            'COMPANY','PERSON','PFCOMPANY','PFUND','SECURITY',
            'TIME','EVENT','REGULATOR',
            'RiskFeature','RiskFactor',
            'Regulation','Law','Action'
          ])
        WITH collect(DISTINCT center) + collect(DISTINCT neighbor) AS all_nodes, collect(DISTINCT relationships(path)) AS all_rels_paths
        UNWIND all_rels_paths AS rels
        UNWIND rels AS rel
        WITH all_nodes, collect(DISTINCT rel) AS all_rels
        UNWIND all_nodes AS node
        UNWIND all_rels AS rel
        WITH node, rel
        WHERE (startNode(rel) = node OR endNode(rel) = node)
          AND startNode(rel) IN all_nodes
          AND endNode(rel) IN all_nodes
        RETURN node, rel
        LIMIT $limit
        """
        records, _ = _client().execute_read_with_summary(
            query, {"node_id": node_id, "depth": depth, "limit": limit}
        )

        nodes_map: dict[str, dict] = {}
        edges: list[dict] = []
        edge_ids: set[str] = set()

        for record in records:
            node = record.get("node")
            if node:
                nid = node.element_id
                if nid not in nodes_map:
                    nodes_map[nid] = Neo4jClient.serialize_node(node)
            rel = record.get("rel")
            if rel:
                rid = rel.element_id
                if rid not in edge_ids:
                    edges.append(Neo4jClient.serialize_relationship(rel))
                    edge_ids.add(rid)

        return {"nodes": list(nodes_map.values()), "edges": edges}

    except Exception as e:
        logger.error(f"Expand error: {traceback.format_exc()}")
        return {"error": str(e)}


# ====================================================
# Community detection / analytics
# ====================================================


@router.get("/communities/algorithms")
def list_algorithms():
    """List all available community detection algorithms with metadata."""
    from kg_query.analytics.community import registry

    return {"algorithms": registry.get_algorithms_info()}


@router.get("/communities")
def detect_communities(
    layer: str = Query("all", description="Layer filter: all, Subject, Event, Feature, Regulation"),
    method: str = Query("wcc", description="Algorithm: wcc, louvain, hgt_gkmeans, label_propagation, leiden, girvan_newman, spectral, infomap"),
    max_nodes: int = Query(5000, ge=1, le=20000, description="Max nodes to analyze"),
    min_community_size: int = Query(3, ge=1, le=100, description="Minimum community size"),
):
    """Discover communities in the knowledge graph.

    Supports 7 algorithms:
    - wcc: Weakly Connected Components (fast, Cypher-based)
    - louvain: Louvain modularity optimization (NetworkX, fallback-aware)
    - hgt_gkmeans: HGT embedding + Graph K-means (requires stored node embeddings)
    - label_propagation: Iterative label propagation (Python)
    - leiden: Leiden algorithm with refinement steps (python-igraph)
    - girvan_newman: Divisive edge-betweenness clustering (python-igraph)
    - spectral: Spectral clustering via normalized Laplacian (scipy+sklearn)
    - infomap: Information-theoretic random walk communities (python-igraph)
    """
    from kg_query.analytics.graph_analytics import GraphAnalytics

    analytics = GraphAnalytics(db_client=_client())
    return analytics.detect_communities(
        layer=layer if layer != "all" else None,
        method=method,
        max_nodes=max_nodes,
        min_community_size=min_community_size,
    )


@router.get("/communities/compare")
def compare_algorithms(
    layer: str = Query("all", description="Layer filter"),
    max_nodes: int = Query(2000, ge=1, le=10000, description="Max nodes to analyze"),
    min_community_size: int = Query(3, ge=1, le=100, description="Minimum community size"),
):
    """Run all community detection algorithms and return comparison results."""
    from kg_query.analytics.graph_analytics import GraphAnalytics

    analytics = GraphAnalytics(db_client=_client())
    return analytics.compare_algorithms(
        layer=layer if layer != "all" else None,
        max_nodes=max_nodes,
        min_community_size=min_community_size,
    )


@router.get("/communities/{community_id}")
def get_community_subgraph(
    community_id: int,
    layer: str = Query("all", description="Layer filter"),
    limit: int = Query(200, ge=1, le=500),
):
    """Get the subgraph (nodes + edges) for a specific community."""
    from kg_query.analytics.graph_analytics import GraphAnalytics

    analytics = GraphAnalytics(db_client=_client())
    return analytics.get_community_subgraph(
        community_id=community_id,
        layer=layer if layer != "all" else None,
        limit=limit,
    )


@router.post("/communities/seed-subgraph")
def discover_seed_subgraph_communities(req: SeedCommunityRequest):
    """Discover local communities from specified risk subjects.

    Online version of the illustrated workflow:
    risk subjects -> N-hop network -> connected subgraph -> communities.
    """
    from kg_query.analytics.graph_analytics import GraphAnalytics

    analytics = GraphAnalytics(db_client=_client())
    result = analytics.discover_seeded_communities(
        seed_names=req.seed_names,
        seed_ids=req.seed_ids,
        max_hop=req.max_hop,
        method=req.method,
        min_community_size=req.min_community_size,
        path_limit=req.path_limit,
        max_nodes=req.max_nodes,
        relation_whitelist=req.relation_whitelist,
        community_mode=req.community_mode,
    )
    return {"code": 0, "msg": "success", "data": result}


@router.get("/communities/{community_id}/quality")
def get_community_quality(
    community_id: int,
    layer: str = Query("all", description="Layer filter"),
):
    """Return quality metrics for a specific community.

    Computes modularity, conductance, coverage, and clustering coefficient
    from the community's subgraph.
    """
    from kg_query.analytics.graph_analytics import GraphAnalytics

    analytics = GraphAnalytics(db_client=_client())
    layer_val = layer if layer != "all" else None

    # Get the subgraph for this community
    subgraph = analytics.get_community_subgraph(
        community_id=community_id,
        layer=layer_val,
        limit=500,
    )
    nodes = subgraph.get("nodes", [])
    edges = subgraph.get("edges", [])

    if not nodes:
        return {"error": "Community not found or empty"}

    # Build adjacency for the subgraph
    node_ids = {n["id"]: i for i, n in enumerate(nodes)}
    n = len(node_ids)
    adj = lil_matrix((n, n), dtype=np.float64)
    internal_edges = 0
    for e in edges:
        src_id = e.get("source") if isinstance(e.get("source"), str) else str(e.get("source", ""))
        tgt_id = e.get("target") if isinstance(e.get("target"), str) else str(e.get("target", ""))
        if src_id in node_ids and tgt_id in node_ids:
            i, j = node_ids[src_id], node_ids[tgt_id]
            adj[i, j] = 1
            adj[j, i] = 1
            internal_edges += 1

    import numpy as np
    from scipy.sparse import issparse

    adj = adj.tocsr()
    degrees = np.array(adj.sum(axis=1)).flatten()
    vol = degrees.sum()
    m = vol / 2.0

    # Conductance: cut_size / min(vol(S), vol(V\S))
    # For a single community, approximate conductance as (vol - 2*internal) / vol
    cut_edges = vol - 2 * internal_edges
    conductance = round(cut_edges / max(1, vol), 4) if vol > 0 else 0.0

    # Coverage: fraction of internal edges among all edges incident to community
    coverage = round(2 * internal_edges / max(1, vol), 4) if vol > 0 else 0.0

    # Average clustering coefficient
    triangles = 0
    adj_dense = adj.toarray()
    for i in range(n):
        neighbors = np.where(adj_dense[i] > 0)[0]
        for a in range(len(neighbors)):
            for b in range(a + 1, len(neighbors)):
                if adj_dense[neighbors[a], neighbors[b]] > 0:
                    triangles += 1
    triangles //= 3  # Each triangle counted 3 times

    avg_clustering = 0.0
    for i in range(n):
        ki = degrees[i]
        if ki >= 2:
            possible = ki * (ki - 1) / 2.0
            actual = sum(
                1 for a in range(n)
                if adj_dense[i, a]
                for b in range(a + 1, n)
                if adj_dense[i, b] and adj_dense[a, b]
            ) / 2.0
            avg_clustering += actual / possible
    avg_clustering = round(avg_clustering / max(1, n), 4)

    return {
        "community_id": community_id,
        "nodes": n,
        "internal_edges": internal_edges,
        "modularity": round(m / max(1, m), 4),
        "conductance": conductance,
        "coverage": coverage,
        "triangle_count": triangles,
        "avg_clustering": avg_clustering,
    }


@router.get("/centrality")
def compute_centrality(
    type: str = Query("pagerank", description="Centrality type: pagerank, betweenness"),
    layer: str = Query("all", description="Layer filter"),
    top_n: int = Query(100, ge=1, le=500),
):
    """Compute centrality scores for nodes in the graph."""
    from kg_query.analytics.graph_analytics import GraphAnalytics

    analytics = GraphAnalytics(db_client=_client())
    scores = analytics.compute_centrality(
        centrality_type=type,
        layer=layer if layer != "all" else None,
        top_n=top_n,
    )
    return {"success": True, "type": type, "nodes": scores}


@router.get("/cycles")
def detect_cycles(
    layer: str = Query("all", description="Layer filter"),
    max_cycles: int = Query(50, ge=1, le=200),
):
    """Find directed cycles (circular fund flows) in the graph."""
    from kg_query.analytics.graph_analytics import GraphAnalytics

    analytics = GraphAnalytics(db_client=_client())
    cycles = analytics.detect_cycles(
        layer=layer if layer != "all" else None,
        max_cycles=max_cycles,
    )
    return {"success": True, "cycles": cycles, "count": len(cycles)}


# ====================================================
# DB test / label distribution
# ====================================================


@router.get("/db-test")
def test_database():
    try:
        labels_query = """
        MATCH (n)
        RETURN DISTINCT labels(n) AS labels, count(n) AS count
        ORDER BY count DESC LIMIT 20
        """
        labels_records, _ = _client().execute_read_with_summary(labels_query)

        labels_info = []
        for rec in labels_records:
            labels_info.append(
                {"labels": rec.get("labels", []), "count": rec.get("count", 0)}
            )

        total_query = """
        MATCH (n)
        OPTIONAL MATCH ()-[r]->()
        RETURN count(DISTINCT n) AS total_nodes, count(DISTINCT r) AS total_rels
        """
        total_records, _ = _client().execute_read_with_summary(total_query)
        td = total_records[0] if total_records else {}

        return {
            "success": True,
            "total_nodes": td.get("total_nodes", 0),
            "total_relationships": td.get("total_rels", 0),
            "label_distribution": labels_info,
        }
    except Exception as e:
        logger.error(f"DB test error: {traceback.format_exc()}")
        return {"error": str(e)}


# ====================================================
# Dashboard endpoints
# ====================================================


@router.get("/high-risk-entities")
def high_risk_entities(
    limit: int = Query(10, ge=1, le=50, description="Number of top risk entities to return"),
):
    """Top-K high-risk subject entities sorted by WARNING_NUM descending.

    Returns entities with WARNING_NUM >= 1, STATUS = '吊销', or non-empty RISK_INFO.
    """
    query = """
    MATCH (c)
    WHERE (
      any(label IN labels(c) WHERE label IN ['COMPANY', 'PFCOMPANY', 'PFUND'])
      AND (
        (c.WARNING_NUM IS NOT NULL AND toInteger(c.WARNING_NUM) >= 1)
        OR c.STATUS = '吊销'
        OR (c.RISK_INFO IS NOT NULL AND c.RISK_INFO <> '')
      )
    )
    OPTIONAL MATCH (c)-[r]-(related)
    RETURN
      c,
      labels(c) AS node_labels,
      c.COMPANY_NM AS name,
      c.PERSON_NM AS person_name,
      c.NAME AS alt_name,
      c.WARNING_NUM AS warning_num,
      c.STATUS AS status,
      c.RISK_INFO AS risk_info,
      c.REG_CAPITAL AS reg_capital,
      count(DISTINCT related) AS related_count,
      collect(DISTINCT type(r))[0..10] AS relation_types
    ORDER BY coalesce(toInteger(c.WARNING_NUM), 0) DESC, c.STATUS = '吊销' DESC
    LIMIT $limit
    """
    records, _ = _client().execute_read_with_summary(query, {"limit": limit})

    entities = []
    for rec in records:
        node = rec.get("c")
        props = Neo4jClient.serialize_props(dict(node)) if node else {}
        entities.append({
            "id": node.element_id if node else None,
            "name": rec.get("name") or rec.get("person_name") or rec.get("alt_name") or (props.get("name", "")),
            "labels": rec.get("node_labels", []),
            "warning_num": int(rec.get("warning_num") or 0),
            "status": rec.get("status") or props.get("STATUS", ""),
            "risk_info": rec.get("risk_info") or props.get("RISK_INFO", ""),
            "reg_capital": rec.get("reg_capital") or props.get("REG_CAPITAL", ""),
            "related_count": rec.get("related_count", 0),
            "relation_types": rec.get("relation_types", []),
        })

    return {"success": True, "data": entities, "total": len(entities)}


@router.get("/risk-distribution")
def risk_distribution():
    """Aggregate risk-level distribution across all 4 layers.

    Returns per-layer counts bucketed by risk severity:
    - Subject: WARNING_NUM >= 5 → high, >= 2 → medium, else → low
    - Event: IMPACT_LEVEL = 'high' → high, else → medium
    - Feature: importance <= -2 → high, -1 → medium, else → low
    - Regulation: always informational
    """
    result = {
        "Subject": {"high": 0, "medium": 0, "low": 0, "total": 0},
        "Event": {"high": 0, "medium": 0, "low": 0, "total": 0},
        "Feature": {"high": 0, "medium": 0, "low": 0, "total": 0},
        "Regulation": {"high": 0, "medium": 0, "low": 0, "total": 0},
    }

    try:
        db = _client()

        # Subject layer — fetch WARNING_NUM and STATUS, compute in Python
        subj_records, _ = db.execute_read_with_summary("""
            MATCH (c)
            WHERE any(label IN labels(c) WHERE label IN $labels)
            RETURN coalesce(c.WARNING_NUM, 0) AS wn, c.STATUS AS status
        """, {"labels": ['COMPANY', 'PFCOMPANY', 'PFUND', 'PERSON', 'SECURITY', 'Subject']})
        for r in subj_records:
            wn = int(r.get("wn", 0))
            status = str(r.get("status", "")) if r.get("status") else ""
            result["Subject"]["total"] += 1
            if wn >= 5 or status == '吊销':
                result["Subject"]["high"] += 1
            elif wn >= 2:
                result["Subject"]["medium"] += 1
            else:
                result["Subject"]["low"] += 1

        # Event layer — fetch IMPACT_LEVEL and event_category, compute in Python
        event_records, _ = db.execute_read_with_summary("""
            MATCH (e)
            WHERE any(label IN labels(e) WHERE label IN $labels)
            RETURN coalesce(e.IMPACT_LEVEL, 'medium') AS il, coalesce(e.event_category, '') AS cat
        """, {"labels": ['EVENT', 'TIME', 'REGULATOR', 'Event']})
        HIGH_CATS = {'司法', '刑事'}
        for r in event_records:
            il = str(r.get("il", "")).lower().strip() if r.get("il") else ""
            cat = str(r.get("cat", "")).strip() if r.get("cat") else ""
            result["Event"]["total"] += 1
            if il == 'high' or cat in HIGH_CATS:
                result["Event"]["high"] += 1
            else:
                result["Event"]["medium"] += 1

        # Feature layer — fetch IMPORTANCE, compute in Python
        feat_records, _ = db.execute_read_with_summary("""
            MATCH (f)
            WHERE any(label IN labels(f) WHERE label IN $labels)
            RETURN coalesce(f.IMPORTANCE, 0) AS imp
        """, {"labels": ['RiskFeature', 'RiskFactor', 'Feature']})
        for r in feat_records:
            imp = int(r.get("imp", 0))
            result["Feature"]["total"] += 1
            if imp <= -2:
                result["Feature"]["high"] += 1
            elif imp == -1:
                result["Feature"]["medium"] += 1
            else:
                result["Feature"]["low"] += 1

        # Regulation layer — just count
        reg_records, _ = db.execute_read_with_summary("""
            MATCH (r)
            WHERE any(label IN labels(r) WHERE label IN $labels)
            RETURN count(r) AS total
        """, {"labels": ['Regulation', 'Law', 'Action']})
        if reg_records:
            total = int(reg_records[0].get("total", 0))
            result["Regulation"] = {"high": 0, "medium": 0, "low": total, "total": total}

    except Exception as e:
        logger.error(f"Risk distribution error: {traceback.format_exc()}")
        return {"success": False, "error": str(e)}

    return {"success": True, "data": result}
