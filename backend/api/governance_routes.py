"""Governance API routes — community discovery and risk path analysis.

All endpoints use the unified Neo4jClient for database access and
GraphAnalytics for community detection.
"""

import asyncio
import base64
import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from core.database import Neo4jClient
from kg_query.analytics import risk_path_enumeration as rpe
from new_report.code.online_community_report_engine import OnlineCommunityReportEngine
from new_report.code.online_perspective_builder import OnlinePerspectiveBuilder
from new_report.code.online_report_context_builder import OnlineReportContextBuilder

logger = logging.getLogger("api.governance")

router = APIRouter(prefix="/api/v1/governance", tags=["governance"])
public_router = APIRouter(prefix="/api/v1/public/governance", tags=["public-governance"])
REPORT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "report_outputs"

# Lazy-init on first use
_db: Neo4jClient | None = None


def _client() -> Neo4jClient:
    global _db
    if _db is None:
        _db = Neo4jClient.from_env()
    return _db


# ── Pydantic models ─────────────────────────────────────────────────


class RiskConstraints(BaseModel):
    includeSubjectRelations: bool = Field(default=True)
    includeEventRelations: bool = Field(default=True)
    includeFeatureRelations: bool = Field(default=True)
    includeRegulationRelations: bool = Field(default=False)


class CommunityDiscoveryRequest(BaseModel):
    seedNames: list[str] = Field(default_factory=list)
    seedIds: list[str] = Field(default_factory=list)
    autoSelectSeeds: bool = Field(default=False)
    topKSeeds: int = Field(default=5)
    seedSelectionMode: str = Field(default="risk_score")
    riskConstraints: RiskConstraints = Field(default_factory=RiskConstraints)
    maxHop: int = Field(default=3, ge=1, le=5)
    method: str = Field(default="auto")
    communityMode: str = Field(default="expanded")
    minCommunitySize: int = Field(default=2, ge=1)
    pathLimit: int = Field(default=5000, ge=50, le=10000)
    maxNodes: int = Field(default=1000, ge=10, le=5000)
    relationWhitelist: list[str] = Field(default_factory=list)
    responseMode: str = Field(default="full")
    includeRawSubgraph: bool = Field(default=True)
    includeCommunityGraph: bool = Field(default=True)
    includeHgtEmbedding: bool = Field(default=False)


class RiskPathsRequest(BaseModel):
    seedNames: list[str] = Field(default_factory=list)
    seedIds: list[str] = Field(default_factory=list)
    maxHop: int = Field(default=3, ge=1, le=5)
    maxPathLength: int = Field(default=4, ge=2, le=8)
    method: str = Field(default="auto")
    communityMode: str = Field(default="expanded")
    includeCommunityDiscovery: bool = Field(default=True)
    includeCommunityPath: bool = Field(default=True)
    includeNodePath: bool = Field(default=True)
    riskRelationWhitelist: list[str] = Field(default_factory=list)
    subgraphPathLimit: int = Field(default=5000, ge=50, le=10000)
    riskPathLimit: int = Field(default=20, ge=1, le=100)
    maxBranchPerNode: int = Field(default=20, ge=1, le=50)
    minRiskScore: int = Field(default=50, ge=0, le=100)
    responseMode: str = Field(default="full")


class ComplianceReportRequest(BaseModel):
    subjectName: str = Field(default="")
    subjectId: str = Field(default="")
    query: str = Field(default="")
    seedNames: list[str] = Field(default_factory=list)
    seedIds: list[str] = Field(default_factory=list)
    seedNodes: list[dict[str, Any]] = Field(default_factory=list)
    subgraph: dict[str, Any] | None = Field(default=None)
    communities: list[dict[str, Any]] | dict[str, Any] | None = Field(default=None)
    communityDiscovery: dict[str, Any] | None = Field(default=None)
    riskPaths: list[dict[str, Any]] | dict[str, Any] | None = Field(default=None)
    anomalyFindings: list[dict[str, Any]] = Field(default_factory=list)
    complianceIndicatorConfig: dict[str, Any] = Field(default_factory=dict)
    reportOptions: dict[str, Any] = Field(default_factory=dict)
    focusEntities: list[str] = Field(default_factory=list)
    maxHop: int = Field(default=2, ge=1, le=5)
    maxPathLength: int = Field(default=4, ge=2, le=8)
    method: str = Field(default="auto")
    communityMode: str = Field(default="expanded")
    minCommunitySize: int = Field(default=2, ge=1)
    pathLimit: int = Field(default=5000, ge=50, le=10000)
    maxNodes: int = Field(default=1000, ge=10, le=5000)
    riskPathLimit: int = Field(default=10, ge=1, le=100)
    maxBranchPerNode: int = Field(default=10, ge=1, le=50)
    minRiskScore: int = Field(default=0, ge=0, le=100)
    relationWhitelist: list[str] = Field(default_factory=list)
    riskRelationWhitelist: list[str] = Field(default_factory=list)
    includeRawSubgraph: bool = Field(default=True)
    includeCommunityGraph: bool = Field(default=True)
    includeCommunityPath: bool = Field(default=True)
    includeNodePath: bool = Field(default=True)
    exportFormats: list[str] = Field(default_factory=list)
    exportWord: bool | None = Field(default=None)
    depth: int | None = Field(default=None, ge=1, le=5)
    responseMode: str = Field(default="summary")
    sessionId: str = Field(default="")
    roundId: int = Field(default=1)


class PublicGovernanceBaseRequest(BaseModel):
    subjectName: str = Field(default="")
    subjectId: str = Field(default="")
    depth: int = Field(default=3, ge=1, le=5)
    responseMode: str = Field(default="summary")


class PublicCommunityDiscoveryRequest(PublicGovernanceBaseRequest):
    pass


class PublicRiskPathsRequest(PublicGovernanceBaseRequest):
    maxPaths: int = Field(default=10, ge=1, le=50)
    minRiskLevel: str = Field(default="medium")


class PublicComplianceReportRequest(PublicGovernanceBaseRequest):
    query: str = Field(default="")
    maxPaths: int = Field(default=10, ge=1, le=50)
    includeDocx: bool = Field(default=True)


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
            "id": str(node_id),
            "name": entry.get("name", ""),
            "type": member_type,
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


def _node_name(node: dict[str, Any]) -> str:
    props = node.get("properties") if isinstance(node.get("properties"), dict) else {}
    return str(
        node.get("name")
        or node.get("label")
        or props.get("name")
        or props.get("COMPANYNm")
        or props.get("COMPANY_NM")
        or props.get("PERSON_NM")
        or props.get("title")
        or node.get("id")
        or ""
    )


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("riskPaths", "interpretedPaths", "mergedPaths", "paths", "nodes"):
            nested = value.get(key)
            if isinstance(nested, list):
                return nested
    return []


def _run_async(coro: Any) -> Any:
    try:
        return asyncio.run(coro)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()


def _new_trace_id(prefix: str) -> str:
    return f"trc-{prefix}-{int(time.time() * 1000)}"


def _public_error(message: str, *, code: str = "INVALID_REQUEST") -> dict[str, Any]:
    return {
        "success": False,
        "traceId": _new_trace_id("public"),
        "errorCode": code,
        "message": message,
    }


def _normalize_public_response_mode(value: str) -> str:
    normalized = str(value or "summary").strip().lower()
    return "full" if normalized == "full" else "summary"


def _normalize_public_risk_level(value: str) -> str:
    normalized = str(value or "medium").strip().lower()
    return normalized if normalized in {"low", "medium", "high"} else "medium"


def _public_subject_inputs(req: PublicGovernanceBaseRequest) -> tuple[list[str], list[str]]:
    subject_name = str(req.subjectName or "").strip()
    subject_id = str(req.subjectId or "").strip()
    seed_names = [subject_name] if subject_name else []
    seed_ids = [subject_id] if subject_id else []
    return seed_names, seed_ids


def _pick_subject(payload: dict[str, Any], fallback_name: str = "", fallback_id: str = "") -> dict[str, Any]:
    seed_nodes = payload.get("seedNodes", []) if isinstance(payload.get("seedNodes"), list) else []
    if seed_nodes:
        first = seed_nodes[0] if isinstance(seed_nodes[0], dict) else {}
        labels = first.get("labels") if isinstance(first.get("labels"), list) else []
        props = first.get("properties") if isinstance(first.get("properties"), dict) else {}
        return {
            "id": str(first.get("id") or fallback_id or ""),
            "name": str(
                first.get("name")
                or props.get("name")
                or props.get("COMPANY_NM")
                or props.get("PERSON_NM")
                or props.get("title")
                or fallback_name
                or ""
            ),
            "type": str(labels[0] if labels else props.get("type") or "UNKNOWN"),
        }

    resolution = payload.get("entityResolution") if isinstance(payload.get("entityResolution"), dict) else {}
    resolved_entities = resolution.get("resolvedEntities", []) if isinstance(resolution.get("resolvedEntities"), list) else []
    if resolved_entities:
        first = resolved_entities[0] if isinstance(resolved_entities[0], dict) else {}
        return {
            "id": str(first.get("kgNodeId") or fallback_id or ""),
            "name": str(first.get("canonicalName") or first.get("raw") or fallback_name or ""),
            "type": str(first.get("entityType") or "UNKNOWN"),
        }

    return {
        "id": fallback_id,
        "name": fallback_name,
        "type": "UNKNOWN",
    }


def _risk_level_rank(level: str) -> int:
    return {"low": 1, "medium": 2, "high": 3}.get(str(level or "").lower(), 0)


def _coerce_risk_level(score: float | int | None) -> str:
    value = float(score or 0)
    if value >= 80:
        return "high"
    if value >= 60:
        return "medium"
    return "low"


def _find_community(communities: list[dict[str, Any]], community_id: Any) -> dict[str, Any] | None:
    for item in communities:
        if not isinstance(item, dict):
            continue
        if item.get("communityId") == community_id or item.get("community_id") == community_id or item.get("id") == community_id:
            return item
    return None


def _community_member_count(community: dict[str, Any]) -> int:
    for key in ("memberCount", "member_count", "size"):
        value = community.get(key)
        if isinstance(value, int):
            return value
    member_ids = community.get("memberNodeIds") or community.get("member_node_ids") or []
    if isinstance(member_ids, list):
        return len(member_ids)
    members = community.get("members")
    return len(members) if isinstance(members, list) else 0


def _community_risk_score(community: dict[str, Any], summary: dict[str, Any]) -> float:
    for key in ("riskScore", "risk_score", "score"):
        value = community.get(key)
        if isinstance(value, (int, float)):
            return round(float(value), 2)
    high_count = int(summary.get("highRiskCount") or 0)
    medium_count = int(summary.get("mediumRiskCount") or 0)
    derived = min(100.0, 55.0 + high_count * 12 + medium_count * 6)
    return round(derived, 2)


def _community_risk_level(community: dict[str, Any], summary: dict[str, Any]) -> str:
    for key in ("riskLevel", "risk_level"):
        value = str(community.get(key) or "").lower()
        if value in {"low", "medium", "high"}:
            return value
    return _coerce_risk_level(_community_risk_score(community, summary))


def _collect_key_members(entity_map: dict[str, Any], community_id: Any, limit: int = 8) -> list[dict[str, Any]]:
    if not isinstance(entity_map, dict):
        return []
    role_order = {"core": 0, "bridge": 1, "member": 2}
    members: list[dict[str, Any]] = []
    for value in entity_map.values():
        if not isinstance(value, dict):
            continue
        if value.get("communityId") != community_id:
            continue
        role = str(value.get("role") or "member")
        members.append({
            "id": str(value.get("id") or ""),
            "name": str(value.get("name") or ""),
            "type": str(value.get("type") or "UNKNOWN"),
            "role": role,
        })
    members.sort(key=lambda item: (role_order.get(item["role"], 99), item["name"]))
    return members[:limit]


def _extract_path_nodes(path: dict[str, Any]) -> list[dict[str, Any]]:
    nodes = path.get("nodes")
    if isinstance(nodes, list):
        result: list[dict[str, Any]] = []
        for node in nodes:
            if not isinstance(node, dict):
                continue
            result.append({
                "id": str(node.get("id") or ""),
                "name": str(node.get("name") or node.get("label") or ""),
                "type": str(node.get("type") or "UNKNOWN"),
            })
        return result
    node_ids = path.get("nodeIds") if isinstance(path.get("nodeIds"), list) else []
    return [{"id": str(node_id), "name": str(node_id), "type": "UNKNOWN"} for node_id in node_ids]


def _extract_path_relations(path: dict[str, Any]) -> list[str]:
    relations = path.get("relations")
    if isinstance(relations, list):
        return [str(item) for item in relations]
    edges = path.get("edges")
    if isinstance(edges, list):
        return [str(edge.get("type") or "") for edge in edges if isinstance(edge, dict)]
    edge_ids = path.get("edgeIds")
    return [str(item) for item in edge_ids] if isinstance(edge_ids, list) else []


def _simplify_risk_path(path: dict[str, Any]) -> dict[str, Any]:
    score = float(path.get("riskScore") or path.get("score") or 0)
    risk_level = str(path.get("riskLevel") or path.get("risk_level") or _coerce_risk_level(score)).lower()
    return {
        "pathId": str(path.get("pathId") or path.get("id") or ""),
        "riskLevel": risk_level,
        "riskScore": round(score, 2),
        "description": str(
            path.get("description")
            or path.get("pathDescription")
            or path.get("path_description")
            or ""
        ),
        "nodes": _extract_path_nodes(path),
        "relations": _extract_path_relations(path),
        "evidence": path.get("evidence") if isinstance(path.get("evidence"), list) else [],
    }


def _serialize_resolved_entity(item: Any) -> dict[str, Any]:
    return {
        "raw": getattr(item, "raw", ""),
        "canonicalName": getattr(item, "canonical_name", None),
        "kgNodeId": getattr(item, "kg_node_id", None),
        "matchType": getattr(item, "match_type", "unresolved"),
        "matchScore": getattr(item, "match_score", 0.0),
        "confidence": getattr(item, "confidence", 0.0),
    }


def _serialize_candidate_entity(item: Any) -> dict[str, Any]:
    return {
        "raw": getattr(item, "raw", ""),
        "canonicalName": getattr(item, "canonical_name", ""),
        "kgNodeId": getattr(item, "kg_node_id", ""),
        "entityType": getattr(item, "entity_type", "UNKNOWN"),
        "labels": getattr(item, "labels", []),
        "matchType": getattr(item, "match_type", "candidate"),
        "matchScore": getattr(item, "match_score", 0.0),
        "confidence": getattr(item, "confidence", 0.0),
        "reason": getattr(item, "reason", ""),
        "properties": getattr(item, "properties", {}) or {},
    }


def _seed_normalize_company_name(name: str) -> str:
    text = str(name or "").strip()
    text = text.replace("（", "(").replace("）", ")")
    for suffix in (
        "股份有限公司", "集团有限公司", "有限责任公司", "控股集团有限公司",
        "投资管理有限公司", "投资有限公司", "有限公司", "股份公司",
    ):
        if text.endswith(suffix):
            text = text[: -len(suffix)]
            break
    for suffix in ("公司", "集团", "股份", "有限"):
        if text.endswith(suffix):
            text = text[: -len(suffix)]
            break
    return text


def _seed_candidate_keywords(raw: str) -> list[str]:
    core = _seed_normalize_company_name(raw)
    keywords: list[str] = []
    if len(core) >= 4:
        keywords.append(core[:4])
    if len(core) >= 3:
        keywords.append(core[:3])
    for piece in core.replace("(", " ").replace(")", " ").split():
        if len(piece) >= 2:
            keywords.append(piece)
    return list(dict.fromkeys([kw for kw in keywords if kw]))


def _local_search_seed_candidates(
    raw: str,
    *,
    preferred_type: str = "COMPANY",
    limit: int = 5,
) -> list[dict[str, Any]]:
    keywords = _seed_candidate_keywords(raw)
    query = """
    MATCH (n)
    WITH n,
         labels(n) AS node_labels,
         coalesce(n.name, n.COMPANY_NM, n.PERSON_NM, n.SECURITY_NM, n.title, '') AS display_name,
         coalesce(n.alias, '') AS alias_name,
         coalesce(n.ALIAS, '') AS alias_value
    WHERE display_name <> ''
      AND (
           toLower(display_name) = toLower($raw)
        OR toLower(display_name) CONTAINS toLower($raw)
        OR toLower($raw) CONTAINS toLower(display_name)
        OR toLower(alias_name) CONTAINS toLower($raw)
        OR toLower(alias_value) CONTAINS toLower($raw)
        OR any(keyword IN $keywords WHERE keyword <> '' AND (
               toLower(display_name) CONTAINS toLower(keyword)
            OR toLower(alias_name) CONTAINS toLower(keyword)
            OR toLower(alias_value) CONTAINS toLower(keyword)
        ))
      )
    RETURN n, node_labels AS labels, elementId(n) AS elem_id
    LIMIT $limit
    """
    try:
        rows, _ = _client().execute_read_with_summary(
            query,
            {"raw": raw, "keywords": keywords, "limit": int(limit)},
            timeout_seconds=10.0,
        )
    except Exception as exc:
        logger.warning("[SeedResolver] local fallback query failed for %s: %s", raw, exc)
        return []

    scored: list[dict[str, Any]] = []
    raw_core = _seed_normalize_company_name(raw)
    raw_chars = set(raw_core or raw)
    for row in rows:
        node = row.get("n")
        props = dict(node) if node is not None and hasattr(node, "items") else {}
        name = str(
            props.get("name")
            or props.get("COMPANY_NM")
            or props.get("PERSON_NM")
            or props.get("SECURITY_NM")
            or props.get("title")
            or ""
        ).strip()
        node_id = str(row.get("elem_id") or "")
        labels = [str(label) for label in (row.get("labels") or [])]
        if not name or not node_id:
            continue
        name_core = _seed_normalize_company_name(name)
        name_chars = set(name_core or name)
        overlap = len(raw_chars & name_chars)
        union = len(raw_chars | name_chars) or 1
        score = overlap / union
        if raw in name or name in raw:
            score = max(score, min(len(raw), len(name)) / max(len(raw), len(name), 1))
        if raw_core and name_core and (raw_core in name_core or name_core in raw_core):
            score = max(score, min(len(raw_core), len(name_core)) / max(len(raw_core), len(name_core), 1))
        entity_type = next((label for label in labels if label.upper() in {"COMPANY", "PERSON", "SECURITY", "PFUND", "PFCOMPANY"}), labels[0] if labels else "UNKNOWN")
        if preferred_type and entity_type.upper() == preferred_type.upper():
            score += 0.08
        if preferred_type == "COMPANY" and any(token in name for token in ("公司", "集团", "股份", "机械", "工程")):
            score += 0.08
        score = round(max(0.0, min(1.0, score)), 4)
        scored.append({
            "raw": raw,
            "canonicalName": name,
            "kgNodeId": node_id,
            "entityType": entity_type,
            "labels": labels,
            "matchType": "local_fallback",
            "matchScore": score,
            "confidence": round(score * 0.9, 4),
            "reason": "local_neo4j_candidate",
            "properties": {k: v for k, v in props.items() if k in {"name", "COMPANY_NM", "PERSON_NM", "SECURITY_NM", "title", "ORGNUM", "STATUS"}},
        })
    scored.sort(key=lambda item: (item["matchScore"], item["confidence"]), reverse=True)
    return scored[: max(1, limit)]


def _resolve_seed_entities(
    seed_names: list[str],
    seed_ids: list[str],
    *,
    preferred_type: str = "COMPANY",
) -> dict[str, Any]:
    normalized_names = [str(s).strip() for s in seed_names if str(s or "").strip()]
    normalized_ids = [str(s).strip() for s in seed_ids if str(s or "").strip()]
    resolution = {
        "requestedSeedNames": normalized_names,
        "requestedSeedIds": normalized_ids,
        "resolvedSeedNames": list(normalized_names),
        "resolvedSeedIds": list(normalized_ids),
        "resolvedEntities": [],
        "candidateEntities": [],
        "unresolvedSeedNames": [],
        "usedResolver": False,
    }
    if not normalized_names:
        return resolution

    try:
        from dra_ma.tools.entity_resolver import EntityResolver

        resolver = EntityResolver(enable_llm_fallback=False)
        resolved_items = _run_async(resolver.resolve(normalized_names)) or []
        resolution["usedResolver"] = True
        resolution["resolvedEntities"] = [_serialize_resolved_entity(item) for item in resolved_items]

        final_names: list[str] = []
        final_ids = list(normalized_ids)
        candidate_entities: list[dict[str, Any]] = []
        unresolved_names: list[str] = []

        for raw_name, item in zip(normalized_names, resolved_items):
            canonical_name = str(getattr(item, "canonical_name", "") or "").strip()
            kg_node_id = str(getattr(item, "kg_node_id", "") or "").strip()
            match_type = str(getattr(item, "match_type", "") or "")

            if canonical_name:
                final_names.append(canonical_name)
            else:
                final_names.append(raw_name)

            if kg_node_id:
                final_ids.append(kg_node_id)
                continue

            unresolved_names.append(raw_name)
            candidates = _run_async(
                resolver.search_candidates(raw_name, limit=5, preferred_type=preferred_type)
            ) or []
            serialized_candidates = [_serialize_candidate_entity(candidate) for candidate in candidates]
            if not serialized_candidates:
                serialized_candidates = _local_search_seed_candidates(
                    raw_name,
                    preferred_type=preferred_type,
                    limit=5,
                )
            candidate_entities.extend(serialized_candidates)

            if serialized_candidates:
                best = serialized_candidates[0]
                best_score = float(best.get("matchScore") or 0.0)
                if best_score >= 0.72:
                    final_names[-1] = str(best.get("canonicalName") or raw_name)
                    best_id = str(best.get("kgNodeId") or "")
                    if best_id:
                        final_ids.append(best_id)
                    unresolved_names.pop()
                    logger.info(
                        "[SeedResolver] fallback candidate matched raw=%s canonical=%s score=%.3f",
                        raw_name,
                        best.get("canonicalName"),
                        best_score,
                    )
                else:
                    logger.info(
                        "[SeedResolver] candidate below threshold raw=%s best=%s score=%.3f",
                        raw_name,
                        best.get("canonicalName"),
                        best_score,
                    )
            elif match_type != "unresolved":
                logger.info(
                    "[SeedResolver] resolver returned non-terminal match without kg id raw=%s type=%s",
                    raw_name,
                    match_type,
                )

        dedup_names = list(dict.fromkeys([name for name in final_names if name]))
        dedup_ids = list(dict.fromkeys([node_id for node_id in final_ids if node_id]))

        resolution["resolvedSeedNames"] = dedup_names
        resolution["resolvedSeedIds"] = dedup_ids
        resolution["candidateEntities"] = candidate_entities
        resolution["unresolvedSeedNames"] = unresolved_names
        return resolution
    except Exception as exc:
        logger.exception("[SeedResolver] failed, switching to local fallback: %s", exc)
        fallback_candidates: list[dict[str, Any]] = []
        fallback_names: list[str] = []
        fallback_ids = list(normalized_ids)
        unresolved_names: list[str] = []
        for raw_name in normalized_names:
            candidates = _local_search_seed_candidates(
                raw_name,
                preferred_type=preferred_type,
                limit=5,
            )
            fallback_candidates.extend(candidates)
            if candidates and float(candidates[0].get("matchScore") or 0.0) >= 0.72:
                fallback_names.append(str(candidates[0].get("canonicalName") or raw_name))
                best_id = str(candidates[0].get("kgNodeId") or "")
                if best_id:
                    fallback_ids.append(best_id)
            else:
                fallback_names.append(raw_name)
                unresolved_names.append(raw_name)
        resolution["resolvedSeedNames"] = list(dict.fromkeys([name for name in fallback_names if name]))
        resolution["resolvedSeedIds"] = list(dict.fromkeys([node_id for node_id in fallback_ids if node_id]))
        resolution["candidateEntities"] = fallback_candidates
        resolution["unresolvedSeedNames"] = unresolved_names
        resolution["warnings"] = [f"seed resolver failed: {exc}"]
        return resolution


def _extract_report_inputs(req: ComplianceReportRequest) -> dict[str, Any]:
    community = req.communityDiscovery or {}
    if not community and isinstance(req.communities, dict):
        community = req.communities

    seed_nodes = req.seedNodes
    if not seed_nodes and isinstance(community, dict):
        seed_nodes = community.get("seedNodes", []) if isinstance(community.get("seedNodes"), list) else []
    if not seed_nodes and req.focusEntities:
        seed_nodes = [{"id": "", "labels": ["COMPANY"], "properties": {"name": req.focusEntities[0]}}]

    risk_paths = _as_list(req.riskPaths)
    community_risk_paths = []
    if isinstance(req.riskPaths, dict):
        community_risk_paths = req.riskPaths.get("communityRiskPaths", [])
    if not isinstance(community_risk_paths, list):
        community_risk_paths = []

    communities = req.communities
    if communities is None and isinstance(community, dict):
        communities = community.get("communities")
    if communities is None and isinstance(community, dict):
        graph = community.get("communityGraph") or {}
        communities = graph.get("nodes") if isinstance(graph, dict) else []
    community_list = communities if isinstance(communities, list) else []

    subgraph = req.subgraph or {}
    if not subgraph and isinstance(community, dict):
        subgraph = community.get("subgraph") or community.get("connectedSubgraph") or {}

    return {
        "seedNodes": seed_nodes,
        "riskPaths": risk_paths,
        "communityRiskPaths": community_risk_paths,
        "communities": community_list,
        "communityDiscovery": community,
        "subgraph": subgraph if isinstance(subgraph, dict) else {},
    }


def _load_offline_community_reports(limit: int = 6) -> list[dict[str, Any]]:
    report_dir = Path(__file__).resolve().parents[1] / "report_outputs" / "community_reports"
    if not report_dir.exists():
        return []
    try:
        import openpyxl
    except Exception:
        return []

    items: list[dict[str, Any]] = []
    for path in sorted(report_dir.glob("*.xlsx")):
        perspective = path.stem.replace("社区报告", "")
        try:
            workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
            sheet = workbook.active
            rows = list(sheet.iter_rows(values_only=True))
        except Exception:
            continue
        if not rows:
            continue
        headers = [str(h or "") for h in rows[0]]
        for row in rows[1:]:
            data = {headers[idx]: row[idx] for idx in range(min(len(headers), len(row)))}
            title = str(data.get("title") or "")
            summary = str(data.get("summary") or "")
            if not title and not summary:
                continue
            keywords: list[str] = []
            raw_keywords = data.get("key_words")
            if isinstance(raw_keywords, str):
                try:
                    parsed = json.loads(raw_keywords)
                    keywords = [str(item) for item in parsed[:8]] if isinstance(parsed, list) else []
                except Exception:
                    keywords = [part.strip() for part in raw_keywords.split(",") if part.strip()][:8]
            items.append({
                "perspective": perspective,
                "communityId": data.get("community"),
                "title": title,
                "summary": summary[:500],
                "keywords": keywords,
                "rank": data.get("rank"),
                "sourceFile": path.name,
            })
            if len(items) >= limit:
                return items
    return items[:limit]


def _build_compliance_indicators(risk_paths: list[dict[str, Any]], community_count: int) -> dict[str, Any]:
    high = sum(1 for path in risk_paths if str(path.get("riskLevel", "")).lower() == "high")
    medium = sum(1 for path in risk_paths if str(path.get("riskLevel", "")).lower() == "medium")
    low = sum(1 for path in risk_paths if str(path.get("riskLevel", "")).lower() == "low")
    max_score = max([int(path.get("score") or 0) for path in risk_paths] or [0])
    total_score = max(0, 100 - min(45, high * 4 + medium * 2 + max_score // 10))
    return {
        "totalScore": total_score,
        "riskLevel": "high" if high or max_score >= 80 else ("medium" if medium or max_score >= 60 else "low"),
        "level1": [
            {"name": "风险路径可解释性", "weight": 0.35, "score": max(60, total_score - 5)},
            {"name": "社区结构稳定性", "weight": 0.30, "score": max(55, total_score - min(20, community_count // 2))},
            {"name": "治理闭环充分性", "weight": 0.35, "score": total_score},
        ],
        "level2": [
            {"parent": "风险路径可解释性", "name": "高风险路径识别", "score": max(50, 100 - high * 5)},
            {"parent": "风险路径可解释性", "name": "跨社区传导识别", "score": max(50, 100 - community_count)},
            {"parent": "社区结构稳定性", "name": "主体群体覆盖", "score": min(100, 70 + community_count)},
            {"parent": "治理闭环充分性", "name": "治理动作可执行性", "score": total_score},
        ],
        "level3": [
            {"name": "高风险路径数量", "value": high},
            {"name": "中风险路径数量", "value": medium},
            {"name": "低风险路径数量", "value": low},
            {"name": "最高路径分数", "value": max_score},
            {"name": "社区数量", "value": community_count},
        ],
    }


def _subgraph_counts(subgraph: dict[str, Any]) -> tuple[int, int]:
    nodes = subgraph.get("nodes") if isinstance(subgraph.get("nodes"), list) else []
    edges = subgraph.get("edges") if isinstance(subgraph.get("edges"), list) else []
    if not nodes and isinstance(subgraph.get("subgraph"), dict):
        nested = subgraph.get("subgraph") or {}
        nodes = nested.get("nodes") if isinstance(nested.get("nodes"), list) else []
        edges = nested.get("edges") if isinstance(nested.get("edges"), list) else []
    return len(nodes), len(edges)


def _build_docx_export_payload(response: dict[str, Any], report_req: ComplianceReportRequest) -> dict[str, Any]:
    inputs = _extract_report_inputs(report_req)
    report = response.get("report") if isinstance(response.get("report"), dict) else {}
    compliance = response.get("compliance") if isinstance(response.get("compliance"), dict) else {}
    indicators = response.get("complianceIndicators") if isinstance(response.get("complianceIndicators"), dict) else {}
    governance = response.get("governance") if isinstance(response.get("governance"), dict) else {}
    risk_paths = inputs.get("riskPaths") if isinstance(inputs.get("riskPaths"), list) else []
    subgraph = inputs.get("subgraph") if isinstance(inputs.get("subgraph"), dict) else {}
    node_count, edge_count = _subgraph_counts(subgraph)

    score_items = []
    for item in indicators.get("level1", []) if isinstance(indicators.get("level1"), list) else []:
        if not isinstance(item, dict):
            continue
        weight = item.get("weight", "")
        if isinstance(weight, (int, float)) and weight <= 1:
            weight = round(weight * 100)
        score_items.append({
            "dimension": item.get("name"),
            "score": item.get("score"),
            "weight": weight,
            "explanation": f"{item.get('name', '指标')}得分 {item.get('score', '-')}",
        })

    exported_paths = []
    for path in risk_paths[:20]:
        if not isinstance(path, dict):
            continue
        exported_paths.append({
            "risk_level": path.get("riskLevel") or path.get("risk_level"),
            "path_text": path.get("pathDescription") or path.get("path_description") or path.get("description"),
            "path_description": path.get("pathDescription") or path.get("path_description") or path.get("description"),
            "affected_entities": path.get("affectedEntities") or path.get("affected_entities") or [],
        })

    compliance_matches = []
    for rule in compliance.get("matchedRules", []) if isinstance(compliance.get("matchedRules"), list) else []:
        if not isinstance(rule, dict):
            continue
        compliance_matches.append({
            "regulation": rule.get("code"),
            "article": rule.get("name"),
            "violation": "已命中" if rule.get("matched") else "未命中",
            "suggested_action": "纳入协同治理报告留痕并持续监测" if rule.get("matched") else "保留规则但本次不触发处置",
        })
    for violation in compliance.get("violations", []) if isinstance(compliance.get("violations"), list) else []:
        if not isinstance(violation, dict):
            continue
        compliance_matches.append({
            "regulation": "风险路径核验",
            "article": violation.get("pathId"),
            "violation": violation.get("description"),
            "suggested_action": f"按 {violation.get('riskLevel', '风险')} 等级复核，路径分数 {violation.get('score', '-')}",
        })

    governance_actions = []
    for action in governance.get("actions", []) if isinstance(governance.get("actions"), list) else []:
        if not isinstance(action, dict):
            continue
        priority = str(action.get("priority") or "normal").lower()
        urgency = "urgent" if priority == "high" else ("normal" if priority in ("medium", "normal") else "low")
        governance_actions.append({
            "target": action.get("title"),
            "risk_issue": action.get("description"),
            "measure": action.get("description"),
            "priority": urgency,
            "department": action.get("owner"),
        })

    recommendations = []
    for action in governance.get("actions", []) if isinstance(governance.get("actions"), list) else []:
        if not isinstance(action, dict):
            continue
        recommendations.append({
            "action": action.get("title"),
            "reasoning": action.get("description"),
            "urgency": "urgent" if str(action.get("priority")).lower() == "high" else "normal",
            "department": action.get("owner"),
        })

    evidence_chains = [
        {
            "claim": item.get("description") or item.get("pathId"),
            "confidence": 0.8,
        }
        for item in compliance.get("violations", [])[:12]
        if isinstance(item, dict)
    ] if isinstance(compliance.get("violations"), list) else []

    return {
        "report_id": response.get("reportId"),
        "generated_at": response.get("generatedAt"),
        "query_summary": report_req.query or response.get("subject") or "-",
        "executive_summary": report.get("executiveSummary"),
        "markdown_report": report.get("markdownReport"),
        "integrated_report": report.get("markdownReport"),
        "overall_risk_level": compliance.get("riskLevel"),
        "risk_scores": {
            "base_overall": compliance.get("score"),
            "final_overall": indicators.get("totalScore") or compliance.get("score"),
            "overall": indicators.get("totalScore") or compliance.get("score"),
            "level": compliance.get("riskLevel"),
            "scores": score_items,
            "llm_adjustment": 0,
            "llm_adjustment_reason": "本接口基于图谱风险路径、群体发现结果和规则指标生成评分，未进行额外人工调整。",
        },
        "risk_paths": exported_paths,
        "anomaly_findings": report_req.anomalyFindings,
        "compliance_matches": compliance_matches,
        "governance_plan": {
            "actions": governance_actions,
            "monitoring_checklist": [
                item.get("task")
                for item in governance.get("timeline", [])
                if isinstance(item, dict) and item.get("task")
            ],
            "escalation_rules": [
                {"condition": "出现高风险跨社区路径", "action": "升级至协同治理专班", "timeline": "T+1"},
                {"condition": "社区报告证据不足", "action": "补充离线社区报告和路径证据", "timeline": "T+3"},
            ],
        },
        "recommendations": recommendations,
        "evidence_chains": {"chains": evidence_chains},
        "subgraph_summary": {"node_count": node_count, "edge_count": edge_count},
    }

def _export_compliance_report_docx(
    response: dict[str, Any],
    report_req: ComplianceReportRequest,
) -> dict[str, Any]:
    from dra_ma.reporting import DocxExporter

    output_dir = REPORT_OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    report_id = str(response.get("reportId") or f"WIND-COMP-{int(time.time() * 1000)}")
    filename = f"{report_id}.docx"
    output_path = output_dir / filename
    export_payload = _build_docx_export_payload(response, report_req)
    docx_bytes = DocxExporter().export(
        export_payload,
        metadata={
            "report_id": report_id,
            "query_text": report_req.query or response.get("subject") or "-",
            "generated_at": response.get("generatedAt"),
        },
    )
    output_path.write_bytes(docx_bytes)
    stat = output_path.stat()
    return {
        "format": "docx",
        "fileName": filename,
        "filePath": str(output_path),
        "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "sizeBytes": stat.st_size,
        "generatedAt": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
        "downloadUrl": f"/api/v1/governance/compliance-report/files/{filename}",
    }


def _apply_export_delivery_options(
    export_file: dict[str, Any],
    report_req: ComplianceReportRequest,
) -> dict[str, Any]:
    """Shape exported file metadata for API consumers.

    The server still writes the DOCX under REPORT_OUTPUT_DIR, but callers can
    request a download URL or base64 payload and save the file on their side.
    """
    result = dict(export_file)
    options = report_req.reportOptions if isinstance(report_req.reportOptions, dict) else {}
    delivery = options.get("delivery", "metadata")
    delivery_modes = {str(delivery).lower()} if isinstance(delivery, str) else {
        str(item).lower() for item in delivery if item is not None
    } if isinstance(delivery, list) else {"metadata"}

    include_download_url = options.get("includeDownloadUrl", True)
    if not include_download_url:
        result.pop("downloadUrl", None)

    include_server_path = options.get("includeServerPath", True)
    if not include_server_path:
        result.pop("filePath", None)

    if options.get("includeBase64") or "base64" in delivery_modes:
        path = Path(str(export_file.get("filePath", "")))
        result["base64"] = base64.b64encode(path.read_bytes()).decode("ascii")
        result["encoding"] = "base64"

    return result


def _build_compliance_report(req: ComplianceReportRequest) -> dict[str, Any]:
    inputs = _extract_report_inputs(req)
    community = inputs["communityDiscovery"] if isinstance(inputs["communityDiscovery"], dict) else {}
    risk_paths_payload: dict[str, Any] | list[dict[str, Any]]
    if isinstance(req.riskPaths, dict):
        risk_paths_payload = req.riskPaths
    else:
        risk_paths_payload = {
            "riskPaths": inputs["riskPaths"],
            "communityRiskPaths": inputs["communityRiskPaths"],
            "summary": {
                "riskPathCount": len(inputs["riskPaths"]),
                "highRiskCount": sum(
                    1 for path in inputs["riskPaths"]
                    if str(path.get("riskLevel") or path.get("risk_level") or "").lower() == "high"
                ),
            },
        }
    context = OnlineReportContextBuilder().build(
        seed_nodes=inputs["seedNodes"],
        community_payload=community,
        risk_payload=risk_paths_payload if isinstance(risk_paths_payload, dict) else {"riskPaths": risk_paths_payload},
        report_req=req,
    )
    bundle = OnlinePerspectiveBuilder().build(context)
    return OnlineCommunityReportEngine().generate(context, bundle, req)


def _build_response(
    result: dict,
    req: CommunityDiscoveryRequest,
    elapsed_ms: int,
    entity_resolution: dict[str, Any] | None = None,
) -> dict:
    """Transform discover_seeded_communities() output to the API response format."""
    resolved_seed_ids = [
        str(n.get("id", "")) for n in result.get("seed_nodes", []) if n.get("id")
    ]
    entity_map_raw = result.get("entity_community_map", {})

    warnings = []
    fallback_reason = result.get("fallback_reason")
    if fallback_reason:
        warnings.append(fallback_reason)

    response = {
        "success": result.get("success", False),
        "apiVersion": "v1",
        "traceId": f"trc-{int(time.time() * 1000)}",
        "elapsedMs": elapsed_ms,
        "selectedMethod": result.get("selected_method", ""),
        "fallbackReason": fallback_reason,
        "seedNodes": result.get("seed_nodes", []),
        "candidateSeeds": result.get("candidate_seeds", []),
        "selectedSeedIds": result.get("selected_seed_ids", []),
        "seedSelection": result.get("seed_selection", {}),
        "summary": {
            "seedNodeCount": len(result.get("seed_nodes", [])),
            "nodeCount": result.get("node_count", 0),
            "edgeCount": result.get("edge_count", 0),
            "communityCount": result.get("community_count", 0),
            "seedCommunityId": result.get("seed_community_id"),
        },
        "warnings": warnings,
        "entityResolution": entity_resolution or {},
    }

    # If full mode, populate detailed fields
    if req.responseMode == "full":
        response.update({
            "communities": result.get("communities", []),
            "entityCommunityMap": _flatten_entity_community_map(entity_map_raw, resolved_seed_ids),
            "visualization": {
                "defaultView": "community_graph",
                "suggestedLayout": "clustered_force",
                "highlightCommunityId": result.get("seed_community_id"),
            },
            "connectedSubgraph": {
                "nodeCount": result.get("node_count", 0),
                "edgeCount": result.get("edge_count", 0),
                "nodes": result.get("connected_subgraph", {}).get("nodes", []),
                "edges": result.get("connected_subgraph", {}).get("edges", []),
            },
        })

        if req.includeRawSubgraph:
            response["subgraph"] = {
                "nodeCount": len(result.get("subgraph", {}).get("nodes", [])),
                "edgeCount": len(result.get("subgraph", {}).get("edges", [])),
                "nodes": result.get("subgraph", {}).get("nodes", []),
                "edges": result.get("subgraph", {}).get("edges", []),
            }
        else:
            response["subgraph"] = None

        if req.includeCommunityGraph:
            response.update({
                "communityEdges": result.get("community_edges", []),
                "communityGraph": result.get("community_graph", {}),
            })
        else:
            response.update({
                "communityEdges": [],
                "communityGraph": {},
            })

    return _to_camel(response)


def _simplify_public_community_response(
    payload: dict[str, Any],
    req: PublicCommunityDiscoveryRequest,
) -> dict[str, Any]:
    if not payload.get("success"):
        return {
            "success": False,
            "traceId": str(payload.get("traceId") or _new_trace_id("community")),
            "errorCode": "COMMUNITY_DISCOVERY_FAILED",
            "message": str(payload.get("error") or "群体发现失败"),
        }

    response_mode = _normalize_public_response_mode(req.responseMode)
    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    communities = payload.get("communities") if isinstance(payload.get("communities"), list) else []
    entity_map = payload.get("entityCommunityMap") if isinstance(payload.get("entityCommunityMap"), dict) else {}
    subject = _pick_subject(payload, req.subjectName, req.subjectId)
    target_community_id = summary.get("seedCommunityId")
    target_community = _find_community(communities, target_community_id) or {}
    risk_score = _community_risk_score(target_community, summary)
    risk_level = _community_risk_level(target_community, summary)
    community_name = str(
        target_community.get("name")
        or target_community.get("title")
        or (f"{subject['name']}关联群体" if subject.get("name") else f"社区 {target_community_id}")
    )
    key_members = _collect_key_members(entity_map, target_community_id)

    data: dict[str, Any] = {
        "subject": subject,
        "targetCommunity": {
            "communityId": target_community_id,
            "name": community_name,
            "size": _community_member_count(target_community),
            "riskScore": risk_score,
            "riskLevel": risk_level,
        },
        "keyMembers": key_members,
    }
    if response_mode == "full":
        data["graph"] = payload.get("subgraph") or {}
        data["communities"] = communities

    bridge_count = sum(1 for item in key_members if item.get("role") == "bridge")
    core_count = sum(1 for item in key_members if item.get("role") == "core")
    return {
        "success": True,
        "traceId": str(payload.get("traceId") or _new_trace_id("community")),
        "data": data,
        "summary": {
            "communityCount": int(summary.get("communityCount") or 0),
            "memberCount": int(summary.get("nodeCount") or _community_member_count(target_community)),
            "coreNodeCount": core_count,
            "bridgeNodeCount": bridge_count,
        },
        "warnings": payload.get("warnings") if isinstance(payload.get("warnings"), list) else [],
    }


def _simplify_public_risk_paths_response(
    payload: dict[str, Any],
    req: PublicRiskPathsRequest,
) -> dict[str, Any]:
    if not payload.get("success"):
        return {
            "success": False,
            "traceId": str(payload.get("traceId") or _new_trace_id("risk")),
            "errorCode": "RISK_PATHS_FAILED",
            "message": str(payload.get("error") or "风险传导路径分析失败"),
        }

    response_mode = _normalize_public_response_mode(req.responseMode)
    min_level = _normalize_public_risk_level(req.minRiskLevel)
    subject = _pick_subject(payload, req.subjectName, req.subjectId)
    raw_paths = payload.get("riskPaths") if isinstance(payload.get("riskPaths"), list) else []
    simplified_paths = [_simplify_risk_path(path) for path in raw_paths if isinstance(path, dict)]
    simplified_paths = [
        path for path in simplified_paths
        if _risk_level_rank(path.get("riskLevel", "")) >= _risk_level_rank(min_level)
    ][: req.maxPaths]

    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    data: dict[str, Any] = {
        "subject": subject,
        "paths": simplified_paths,
    }
    if response_mode == "full":
        data["communityDiscovery"] = payload.get("communityDiscovery") or {}
        data["communityPaths"] = payload.get("communityRiskPaths") or []
        data["viewModel"] = payload.get("viewModel") or {}

    high_count = sum(1 for item in simplified_paths if item.get("riskLevel") == "high")
    medium_count = sum(1 for item in simplified_paths if item.get("riskLevel") == "medium")
    low_count = sum(1 for item in simplified_paths if item.get("riskLevel") == "low")
    return {
        "success": True,
        "traceId": str(payload.get("traceId") or _new_trace_id("risk")),
        "data": data,
        "summary": {
            "pathCount": len(simplified_paths),
            "highRiskCount": high_count,
            "mediumRiskCount": medium_count,
            "lowRiskCount": low_count,
            "communityCount": int(summary.get("communityCount") or 0),
        },
        "warnings": payload.get("warnings") if isinstance(payload.get("warnings"), list) else [],
    }


def _extract_report_download(export_files: dict[str, Any]) -> dict[str, Any]:
    docx_meta = export_files.get("docx") if isinstance(export_files.get("docx"), dict) else {}
    return {
        "fileName": docx_meta.get("fileName"),
        "downloadUrl": docx_meta.get("downloadUrl"),
        "mimeType": docx_meta.get("mimeType"),
    }


def _simplify_main_compliance_response(
    payload: dict[str, Any],
    req: ComplianceReportRequest,
    entity_resolution: dict[str, Any],
) -> dict[str, Any]:
    if not payload.get("success"):
        return {
            "success": False,
            "traceId": str(payload.get("traceId") or _new_trace_id("report")),
            "errorCode": "COMPLIANCE_REPORT_FAILED",
            "message": str(payload.get("message") or payload.get("error") or "社区报告生成失败"),
        }

    requested_name = str(req.subjectName or "").strip()
    if not requested_name and req.seedNames:
        requested_name = str(req.seedNames[0] or "").strip()
    requested_id = str(req.subjectId or "").strip()
    if not requested_id and req.seedIds:
        requested_id = str(req.seedIds[0] or "").strip()

    subject = _pick_subject(payload, requested_name, requested_id)
    report = payload.get("report") if isinstance(payload.get("report"), dict) else {}
    compliance = payload.get("compliance") if isinstance(payload.get("compliance"), dict) else {}
    indicators = payload.get("complianceIndicators") if isinstance(payload.get("complianceIndicators"), dict) else {}
    governance = payload.get("governance") if isinstance(payload.get("governance"), dict) else {}
    export_files = payload.get("exportFiles") if isinstance(payload.get("exportFiles"), dict) else {}
    pipeline_trace = payload.get("pipelineTrace") if isinstance(payload.get("pipelineTrace"), dict) else {}

    key_findings = report.get("keyFindings") if isinstance(report.get("keyFindings"), list) else []
    if not key_findings and isinstance(report.get("reportSections"), list):
        key_findings = [
            item.get("summary")
            for item in report.get("reportSections", [])
            if isinstance(item, dict) and item.get("summary")
        ][:5]

    risk_paths = payload.get("riskPaths") if isinstance(payload.get("riskPaths"), list) else []
    matched_rules = compliance.get("matchedRules") if isinstance(compliance.get("matchedRules"), list) else []
    violations = compliance.get("violations") if isinstance(compliance.get("violations"), list) else []

    return {
        "success": True,
        "traceId": str(payload.get("traceId") or _new_trace_id("report")),
        "subject": subject,
        "riskLevel": str(compliance.get("riskLevel") or indicators.get("riskLevel") or "unknown"),
        "totalScore": indicators.get("totalScore") or compliance.get("score"),
        "report": {
            "reportId": payload.get("reportId"),
            "title": report.get("title"),
            "generatedAt": payload.get("generatedAt"),
            "executiveSummary": report.get("executiveSummary"),
            "keyFindings": key_findings,
            "governanceActions": governance.get("actions", []) if isinstance(governance.get("actions"), list) else [],
            "responsibleEntities": governance.get("responsibleEntities", []) if isinstance(governance.get("responsibleEntities"), list) else [],
            "download": _extract_report_download(export_files),
        },
        "stats": {
            "communityCount": pipeline_trace.get("communityCount"),
            "pathCount": len(risk_paths),
            "matchedRuleCount": len(matched_rules),
            "violationCount": len(violations),
        },
        "entityResolution": entity_resolution,
        "warnings": payload.get("warnings") if isinstance(payload.get("warnings"), list) else [],
    }


def _simplify_public_compliance_response(
    payload: dict[str, Any],
    req: PublicComplianceReportRequest,
) -> dict[str, Any]:
    if not payload.get("success"):
        return {
            "success": False,
            "traceId": str(payload.get("traceId") or _new_trace_id("report")),
            "errorCode": "COMPLIANCE_REPORT_FAILED",
            "message": str(payload.get("message") or payload.get("error") or "社区报告生成失败"),
        }

    response_mode = _normalize_public_response_mode(req.responseMode)
    subject_name = str(payload.get("subject") or req.subjectName or "")
    subject = {
        "id": str(payload.get("primaryEntityId") or req.subjectId or ""),
        "name": subject_name,
        "type": "COMPANY",
    }
    report = payload.get("report") if isinstance(payload.get("report"), dict) else {}
    compliance = payload.get("compliance") if isinstance(payload.get("compliance"), dict) else {}
    indicators = payload.get("complianceIndicators") if isinstance(payload.get("complianceIndicators"), dict) else {}
    governance = payload.get("governance") if isinstance(payload.get("governance"), dict) else {}
    export_files = payload.get("exportFiles") if isinstance(payload.get("exportFiles"), dict) else {}
    key_findings = report.get("keyFindings") if isinstance(report.get("keyFindings"), list) else []
    if not key_findings:
        key_findings = [
            item.get("summary")
            for item in report.get("reportSections", [])
            if isinstance(item, dict) and item.get("summary")
        ][:6] if isinstance(report.get("reportSections"), list) else []

    data: dict[str, Any] = {
        "subject": subject,
        "riskAssessment": {
            "riskLevel": str(compliance.get("riskLevel") or indicators.get("riskLevel") or "unknown"),
            "totalScore": indicators.get("totalScore") or compliance.get("score"),
            "summary": report.get("executiveSummary"),
        },
        "complianceAssessment": {
            "matchedRuleCount": len(compliance.get("matchedRules", [])) if isinstance(compliance.get("matchedRules"), list) else 0,
            "violationCount": len(compliance.get("violations", [])) if isinstance(compliance.get("violations"), list) else 0,
        },
        "keyFindings": key_findings,
        "responsibleEntities": governance.get("responsibleEntities", []) if isinstance(governance.get("responsibleEntities"), list) else [],
        "governanceActions": governance.get("actions", []) if isinstance(governance.get("actions"), list) else [],
        "report": {
            "reportId": payload.get("reportId"),
            "title": report.get("title"),
            "generatedAt": payload.get("generatedAt"),
            "download": _extract_report_download(export_files),
        },
    }
    if response_mode == "full":
        data["pipelineTrace"] = payload.get("pipelineTrace") or {}
        data["reportSections"] = report.get("reportSections") or []
        data["riskPaths"] = payload.get("riskPaths") or []
        data["communityRiskPaths"] = payload.get("communityRiskPaths") or []

    return {
        "success": True,
        "traceId": str(payload.get("traceId") or _new_trace_id("report")),
        "data": data,
        "summary": {
            "riskLevel": data["riskAssessment"]["riskLevel"],
            "totalScore": data["riskAssessment"]["totalScore"],
            "pathCount": len(payload.get("riskPaths", [])) if isinstance(payload.get("riskPaths"), list) else 0,
            "exported": bool(export_files.get("docx")),
        },
        "warnings": payload.get("warnings") if isinstance(payload.get("warnings"), list) else [],
    }


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

    t0 = time.perf_counter()

    seed_names = [s.strip() for s in req.seedNames if s and s.strip()]
    seed_ids = [s.strip() for s in req.seedIds if s and s.strip()]
    entity_resolution = _resolve_seed_entities(seed_names, seed_ids, preferred_type="COMPANY")
    seed_names = entity_resolution["resolvedSeedNames"]
    seed_ids = entity_resolution["resolvedSeedIds"]

    logger.info(
        "[CommunityAPI] requestedSeedNames=%s resolvedSeedNames=%s seedIds=%s method=%s maxHop=%s mode=%s",
        entity_resolution.get("requestedSeedNames", []),
        seed_names,
        seed_ids,
        req.method,
        req.maxHop,
        req.communityMode,
    )

    analytics = GraphAnalytics(db_client=_client())
    result = analytics.discover_seeded_communities(
        seed_names=seed_names,
        seed_ids=seed_ids,
        auto_select_seeds=req.autoSelectSeeds,
        top_k_seeds=req.topKSeeds,
        seed_selection_mode=req.seedSelectionMode,
        risk_constraints=req.riskConstraints.model_dump() if req.riskConstraints else None,
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

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    return _build_response(result, req, elapsed_ms, entity_resolution=entity_resolution)


@router.post("/risk-paths")
def risk_paths(req: RiskPathsRequest):
    """Discover risk transmission paths from seed entities.

    Extracts the k-hop connected subgraph, optionally detects communities,
    enumerates multi-hop risk paths via BFS, scores and ranks them, and
    returns node-level paths, community-level paths, and a frontend
    view model for highlighting.
    """
    from kg_query.analytics.graph_analytics import GraphAnalytics

    t0 = time.perf_counter()

    seed_names = [s.strip() for s in req.seedNames if s and s.strip()]
    seed_ids = [s.strip() for s in req.seedIds if s and s.strip()]
    entity_resolution = _resolve_seed_entities(seed_names, seed_ids, preferred_type="COMPANY")
    seed_names = entity_resolution["resolvedSeedNames"]
    seed_ids = entity_resolution["resolvedSeedIds"]

    if not seed_names and not seed_ids:
        return {
            "success": False,
            "traceId": f"trc-{int(time.time() * 1000)}",
            "error": "seedNames or seedIds is required",
            "entityResolution": entity_resolution,
        }

    logger.info(
        "[RiskPathAPI] requestedSeedNames=%s resolvedSeedNames=%s seedIds=%s maxHop=%s maxPathLength=%s "
        "includeCommDisc=%s method=%s",
        entity_resolution.get("requestedSeedNames", []),
        seed_names,
        seed_ids,
        req.maxHop,
        req.maxPathLength,
        req.includeCommunityDiscovery, req.method,
    )

    analytics = GraphAnalytics(db_client=_client())

    # ── 1. Subgraph extraction + optional community discovery ──
    comm_result = analytics.discover_seeded_communities(
        seed_names=seed_names,
        seed_ids=seed_ids,
        max_hop=req.maxHop,
        method=req.method,
        min_community_size=2,
        path_limit=req.subgraphPathLimit,
        max_nodes=500,  # generous cap for path enumeration
        relation_whitelist=req.riskRelationWhitelist,
        community_mode=req.communityMode,
    )

    if not comm_result.get("success"):
        return {
            "success": False,
            "traceId": f"trc-{int(time.time() * 1000)}",
            "error": comm_result.get("error", "Subgraph extraction failed"),
            "entityResolution": entity_resolution,
        }

    connected = comm_result.get("connected_subgraph", {})
    subgraph_nodes = connected.get("nodes", [])
    subgraph_edges = connected.get("edges", [])
    seed_nodes = comm_result.get("seed_nodes", [])

    if not subgraph_nodes:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "success": True,
            "traceId": f"trc-{int(time.time() * 1000)}",
            "elapsedMs": elapsed_ms,
            "summary": {
                "seedNodeCount": len(seed_nodes),
                "nodeCount": 0,
                "edgeCount": 0,
                "communityCount": comm_result.get("community_count", 0),
                "candidatePathCount": 0,
                "riskPathCount": 0,
                "highRiskCount": 0,
                "mediumRiskCount": 0,
                "lowRiskCount": 0,
            },
            "seedNodes": seed_nodes,
            "communityDiscovery": None,
            "riskPaths": [],
            "communityRiskPaths": [],
            "viewModel": {},
            "warnings": ["No connected subgraph found for seed nodes"],
            "entityResolution": entity_resolution,
        }

    # ── 2. Resolve seed IDs ──
    resolved_seed_ids = [
        str(n.get("id", "")) for n in seed_nodes if n.get("id")
    ]
    if not resolved_seed_ids:
        # Fallback: use connected subgraph node IDs that match seed names
        resolved_seed_ids = [
            str(n.get("id", ""))
            for n in subgraph_nodes
            if n.get("id")
        ][:10]

    # ── 3. Build node_map for path description ──
    node_map = rpe.build_node_map(subgraph_nodes)

    # ── 4. Build entity_community_map ──
    entity_map_raw = comm_result.get("entity_community_map", {})
    entity_community_map = _flatten_entity_community_map(entity_map_raw, resolved_seed_ids)

    # ── 5. Enumerate multi-hop risk paths ──
    raw_paths = rpe.enumerate_multi_hop_risk_paths(
        nodes=subgraph_nodes,
        edges=subgraph_edges,
        seed_ids=resolved_seed_ids,
        max_path_length=req.maxPathLength,
        max_branch=req.maxBranchPerNode,
        relation_whitelist=req.riskRelationWhitelist if req.riskRelationWhitelist else None,
    )

    # ── 6. Score and enrich paths ──
    scored_paths = rpe.score_risk_paths(
        raw_paths=raw_paths,
        node_map=node_map,
        entity_community_map=entity_community_map,
        max_path_length=req.maxPathLength,
    )

    # ── 7. Filter and limit ──
    filtered = [p for p in scored_paths if p["score"] >= req.minRiskScore]
    limited = filtered[:req.riskPathLimit]

    # ── 8. Build community risk paths ──
    community_risk_paths: list[dict] = []
    if req.includeCommunityPath:
        community_risk_paths = rpe.build_community_risk_paths(limited)

    # ── 9. Build view model ──
    view_model = rpe.build_view_model(limited)

    # ── 10. Build summary ──
    high_count = sum(1 for p in limited if p["risk_level"] == "high")
    med_count = sum(1 for p in limited if p["risk_level"] == "medium")
    low_count = sum(1 for p in limited if p["risk_level"] == "low")

    summary = {
        "seedNodeCount": len(seed_nodes),
        "nodeCount": len(subgraph_nodes),
        "edgeCount": len(subgraph_edges),
        "communityCount": comm_result.get("community_count", 0),
        "candidatePathCount": len(raw_paths),
        "riskPathCount": len(limited),
        "highRiskCount": high_count,
        "mediumRiskCount": med_count,
        "lowRiskCount": low_count,
    }

    # ── 11. Build community discovery summary ──
    community_discovery: dict | None = None
    if req.includeCommunityDiscovery:
        community_discovery = {
            "seedCommunityId": comm_result.get("seed_community_id"),
            "selectedMethod": comm_result.get("selected_method", ""),
            "communityCount": comm_result.get("community_count", 0),
            "communityGraph": _to_camel(comm_result.get("community_graph", {})),
            "entityCommunityMap": entity_community_map,
        }

    # ── 12. Build warnings ──
    warnings: list[str] = []
    fallback = comm_result.get("fallback_reason")
    if fallback:
        warnings.append(fallback)
    if len(raw_paths) == 0:
        warnings.append("未找到任何风险传导路径，可能是子图节点过少或关系类型不在风险白名单中。")
    if len(filtered) < len(scored_paths):
        warnings.append(
            f"已过滤 {len(scored_paths) - len(filtered)} 条低分路径 (minRiskScore={req.minRiskScore})"
        )

    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    response_data = {
        "success": True,
        "traceId": f"trc-{int(time.time() * 1000)}",
        "elapsedMs": elapsed_ms,
        "summary": summary,
        "seedNodes": seed_nodes,
        "communityDiscovery": community_discovery,
        "riskPaths": _to_camel(limited) if req.includeNodePath else [],
        "communityRiskPaths": _to_camel(community_risk_paths),
        "viewModel": _to_camel(view_model),
        "warnings": warnings,
        "entityResolution": entity_resolution,
    }

    logger.info(
        "[RiskPathAPI] response_paths=%d community_paths=%d elapsed_ms=%d",
        len(limited), len(community_risk_paths), elapsed_ms,
    )

    return response_data


@router.get("/compliance-report/files/{filename}")
def download_compliance_report_file(filename: str):
    """Download a generated compliance report from the server output folder."""
    if Path(filename).name != filename or not filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Invalid report filename")
    path = (REPORT_OUTPUT_DIR / filename).resolve()
    output_root = REPORT_OUTPUT_DIR.resolve()
    if output_root not in path.parents or not path.exists():
        raise HTTPException(status_code=404, detail="Report file not found")
    return FileResponse(
        str(path),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
    )


@router.post("/compliance-report")
def compliance_report(req: ComplianceReportRequest):
    """Generate a collaborative governance community report for a seed node.

    The open API entrypoint orchestrates the full chain internally:
    community-discovery -> risk-paths -> compliance report. Precomputed
    community/risk JSON can still be supplied and will be reused.
    """
    t0 = time.perf_counter()
    response_mode = _normalize_public_response_mode(req.responseMode)
    effective_max_hop = req.depth or req.maxHop
    seed_names = [s.strip() for s in req.seedNames if s and s.strip()]
    seed_ids = [s.strip() for s in req.seedIds if s and s.strip()]
    if not seed_names and req.subjectName.strip():
        seed_names = [req.subjectName.strip()]
    if not seed_ids and req.subjectId.strip():
        seed_ids = [req.subjectId.strip()]
    if not seed_names and req.focusEntities:
        seed_names = [s.strip() for s in req.focusEntities if s and s.strip()]
    if not seed_ids and req.seedNodes:
        seed_ids = [str(n.get("id", "")).strip() for n in req.seedNodes if n.get("id")]
    if not seed_names and not seed_ids:
        return _public_error("subjectName、subjectId、seedNames、seedIds 至少填写一个", code="SUBJECT_REQUIRED")
    entity_resolution = _resolve_seed_entities(seed_names, seed_ids, preferred_type="COMPANY")
    seed_names = entity_resolution["resolvedSeedNames"]
    seed_ids = entity_resolution["resolvedSeedIds"]
    if not req.query.strip():
        subject_name = seed_names[0] if seed_names else (seed_ids[0] if seed_ids else "目标主体")
        req = req.model_copy(update={"query": f"请分析{subject_name}的协同治理社区报告"})

    community_payload = req.communityDiscovery or {}
    if not community_payload:
        community_payload = community_discovery(
            CommunityDiscoveryRequest(
                seedNames=seed_names,
                seedIds=seed_ids,
                maxHop=effective_max_hop,
                method=req.method,
                communityMode=req.communityMode,
                minCommunitySize=req.minCommunitySize,
                pathLimit=req.pathLimit,
                maxNodes=req.maxNodes,
                relationWhitelist=req.relationWhitelist,
                responseMode="full",
                includeRawSubgraph=req.includeRawSubgraph,
                includeCommunityGraph=req.includeCommunityGraph,
            )
        )

    risk_payload = req.riskPaths or {}
    if not risk_payload:
        risk_payload = risk_paths(
            RiskPathsRequest(
                seedNames=seed_names,
                seedIds=seed_ids,
                maxHop=effective_max_hop,
                maxPathLength=req.maxPathLength,
                method=req.method,
                communityMode=req.communityMode,
                includeCommunityDiscovery=True,
                includeCommunityPath=req.includeCommunityPath,
                includeNodePath=req.includeNodePath,
                riskRelationWhitelist=req.riskRelationWhitelist,
                subgraphPathLimit=req.pathLimit,
                riskPathLimit=req.riskPathLimit,
                maxBranchPerNode=req.maxBranchPerNode,
                minRiskScore=req.minRiskScore,
                responseMode="full",
            )
        )

    report_req = req.model_copy(update={
        "seedNodes": req.seedNodes or (
            community_payload.get("seedNodes", [])
            if isinstance(community_payload, dict)
            else []
        ),
        "subgraph": req.subgraph or (
            community_payload.get("subgraph")
            or community_payload.get("connectedSubgraph")
            or {}
            if isinstance(community_payload, dict)
            else {}
        ),
        "communities": req.communities if req.communities is not None else (
            community_payload.get("communities", [])
            if isinstance(community_payload, dict)
            else []
        ),
        "communityDiscovery": community_payload if isinstance(community_payload, dict) else {},
        "riskPaths": risk_payload if isinstance(risk_payload, (dict, list)) else {},
    })

    response = _build_compliance_report(report_req)
    should_export_docx = (
        req.exportWord
        if req.exportWord is not None
        else ("docx" in req.exportFormats if req.exportFormats else True)
    )
    if should_export_docx:
        try:
            docx_file = _export_compliance_report_docx(response, report_req)
            public_docx_file = _apply_export_delivery_options(docx_file, report_req)
            report_meta = response.get("report") if isinstance(response.get("report"), dict) else {}
            report_meta.update({
                "format": "docx",
                "fileName": public_docx_file["fileName"],
                "filePath": public_docx_file.get("filePath"),
                "downloadUrl": public_docx_file.get("downloadUrl"),
                "mimeType": public_docx_file["mimeType"],
                "sizeBytes": public_docx_file["sizeBytes"],
            })
            if "base64" in public_docx_file:
                report_meta["encoding"] = public_docx_file["encoding"]
            response["report"] = report_meta
            response["defaultFormat"] = "docx"
            response["exportFiles"] = {
                "default": "docx",
                "docx": public_docx_file,
            }
            response["export_files"] = response["exportFiles"]
            response["report_download_url"] = public_docx_file.get("downloadUrl")
        except Exception as exc:
            logger.exception("[ComplianceReportAPI] docx export failed")
            response.setdefault("warnings", []).append(f"DOCX报告生成失败：{exc}")
            response["defaultFormat"] = "docx"
            response["exportFiles"] = {"default": "docx", "docx": None}
            response["export_files"] = response["exportFiles"]
    else:
        response["defaultFormat"] = None
        response["exportFiles"] = {"default": None, "docx": None}
        response["export_files"] = response["exportFiles"]
        response["report_download_url"] = None
    response["pipelineTrace"] = {
        "mode": "internal_orchestration",
        "engineMode": "online_new_report",
        "seedNames": seed_names,
        "seedIds": seed_ids,
        "requestedSeedNames": entity_resolution.get("requestedSeedNames", []),
        "resolvedSeedNames": entity_resolution.get("resolvedSeedNames", []),
        "communityDiscoveryGenerated": not bool(req.communityDiscovery),
        "riskPathsGenerated": not bool(req.riskPaths),
        "contextBuilt": True,
        "perspectivesBuilt": ["responsibility", "violation", "regulatory"],
        "communitySuccess": bool(community_payload.get("success")) if isinstance(community_payload, dict) else False,
        "riskSuccess": bool(risk_payload.get("success")) if isinstance(risk_payload, dict) else False,
        "communityCount": (
            (community_payload.get("summary") or {}).get("communityCount")
            if isinstance(community_payload, dict) and isinstance(community_payload.get("summary"), dict)
            else None
        ),
        "riskPathCount": (
            (risk_payload.get("summary") or {}).get("riskPathCount")
            if isinstance(risk_payload, dict) and isinstance(risk_payload.get("summary"), dict)
            else len(_as_list(risk_payload))
        ),
        "reportSections": len(
            ((response.get("report") or {}).get("reportSections") or [])
            if isinstance(response.get("report"), dict)
            else []
        ),
    }
    response["entityResolution"] = entity_resolution
    response["elapsedMs"] = int((time.perf_counter() - t0) * 1000)
    logger.info(
        "[ComplianceReportAPI] subject=%s risk_paths=%d elapsed_ms=%d",
        response.get("subject"),
        len(_as_list(report_req.riskPaths)),
        response["elapsedMs"],
    )
    if response_mode == "summary":
        return _simplify_main_compliance_response(response, req, entity_resolution)
    return response


@public_router.post("/community-discovery")
def public_community_discovery(req: PublicCommunityDiscoveryRequest):
    seed_names, seed_ids = _public_subject_inputs(req)
    if not seed_names and not seed_ids:
        return _public_error("subjectName 和 subjectId 至少填写一个", code="SUBJECT_REQUIRED")

    internal = community_discovery(
        CommunityDiscoveryRequest(
            seedNames=seed_names,
            seedIds=seed_ids,
            maxHop=req.depth,
            responseMode="full",
            includeRawSubgraph=_normalize_public_response_mode(req.responseMode) == "full",
            includeCommunityGraph=True,
        )
    )
    return _simplify_public_community_response(internal, req)


@public_router.post("/risk-paths")
def public_risk_paths(req: PublicRiskPathsRequest):
    seed_names, seed_ids = _public_subject_inputs(req)
    if not seed_names and not seed_ids:
        return _public_error("subjectName 和 subjectId 至少填写一个", code="SUBJECT_REQUIRED")

    internal = risk_paths(
        RiskPathsRequest(
            seedNames=seed_names,
            seedIds=seed_ids,
            maxHop=req.depth,
            maxPathLength=min(6, max(3, req.depth + 1)),
            riskPathLimit=max(req.maxPaths * 3, req.maxPaths),
            responseMode="full",
        )
    )
    return _simplify_public_risk_paths_response(internal, req)


@public_router.post("/compliance-report")
def public_compliance_report(req: PublicComplianceReportRequest):
    seed_names, seed_ids = _public_subject_inputs(req)
    if not seed_names and not seed_ids:
        return _public_error("subjectName 和 subjectId 至少填写一个", code="SUBJECT_REQUIRED")

    subject_name = seed_names[0] if seed_names else seed_ids[0]
    query = str(req.query or "").strip() or f"请分析{subject_name}的协同治理社区报告"
    internal = compliance_report(
        ComplianceReportRequest(
            query=query,
            seedNames=seed_names,
            seedIds=seed_ids,
            maxHop=req.depth,
            maxPathLength=min(6, max(3, req.depth + 1)),
            riskPathLimit=req.maxPaths,
            exportFormats=["docx"] if req.includeDocx else [],
            exportWord=req.includeDocx,
            responseMode="full",
            reportOptions={
                "includeDownloadUrl": True,
                "includeServerPath": False,
            },
        )
    )
    return _simplify_public_compliance_response(internal, req)

