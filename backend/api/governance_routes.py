"""Governance API routes — community discovery and risk path analysis.

All endpoints use the unified Neo4jClient for database access and
GraphAnalytics for community detection.
"""

import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from core.database import Neo4jClient
from kg_query.analytics import risk_path_enumeration as rpe

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
    sessionId: str = Field(default="")
    roundId: int = Field(default=1)


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
    report_dir = Path(__file__).resolve().parents[1] / "report" / "community_reports"
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

    output_dir = Path(__file__).resolve().parents[1] / "report_outputs"
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
    }


def _build_compliance_report(req: ComplianceReportRequest) -> dict[str, Any]:
    inputs = _extract_report_inputs(req)
    seed_nodes = inputs["seedNodes"]
    risk_paths = inputs["riskPaths"]
    communities = inputs["communities"]
    community = inputs["communityDiscovery"]
    subgraph = inputs["subgraph"]

    subject = _node_name(seed_nodes[0]) if seed_nodes else (req.focusEntities[0] if req.focusEntities else "未指定主体")
    community_count = 0
    if isinstance(community, dict):
        summary = community.get("summary") if isinstance(community.get("summary"), dict) else {}
        community_count = int(summary.get("communityCount") or community.get("communityCount") or 0)
    if not community_count:
        community_count = len(communities)

    indicators = _build_compliance_indicators(risk_paths, community_count)
    risk_level = indicators["riskLevel"]
    high_paths = [p for p in risk_paths if str(p.get("riskLevel", "")).lower() == "high"]
    top_paths = sorted(risk_paths, key=lambda p: int(p.get("score") or 0), reverse=True)[:5]
    offline_reports = _load_offline_community_reports()
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    report_id = f"WIND-COMP-{int(time.time() * 1000)}"

    matched_rules = [
        {"code": "GRAPH-RISK-PATH", "name": "风险传导路径监测", "matched": bool(risk_paths)},
        {"code": "COMMUNITY-GOV", "name": "风险主体群体治理", "matched": community_count > 0},
        {"code": "REPORT-EVIDENCE", "name": "证据子图与社区报告留痕", "matched": bool(subgraph or offline_reports)},
    ]
    actions = [
        {
            "actionId": "GOV-001",
            "title": "核验高分风险路径",
            "priority": "high" if high_paths else "medium",
            "owner": "风险管理部门",
            "description": f"重点复核 {len(high_paths)} 条高风险路径及相关主体、事件、法规节点。",
        },
        {
            "actionId": "GOV-002",
            "title": "按社区拆分治理责任",
            "priority": "medium",
            "owner": "协同治理专班",
            "description": f"围绕 {community_count} 个社区建立责任台账，优先处理种子主体所在社区和跨社区路径。",
        },
        {
            "actionId": "GOV-003",
            "title": "沉淀社区报告证据",
            "priority": "medium",
            "owner": "合规管理部门",
            "description": "将离线社区报告、路径证据和处置记录归档，支持后续审计和复盘。",
        },
    ]

    path_lines = []
    for idx, path in enumerate(top_paths, start=1):
        relations = " -> ".join(str(rel) for rel in path.get("relations", [])[:5])
        node_count = len(path.get("nodeIds", []) or [])
        path_lines.append(
            f"{idx}. {path.get('pathId', 'path')}：{path.get('riskLevel', '')}，"
            f"score={path.get('score', 0)}，节点数={node_count}，关系={relations or 'N/A'}"
        )
    offline_lines = [
        f"- [{item.get('perspective')}] {item.get('title')}（rank={item.get('rank')}）"
        for item in offline_reports[:3]
    ]
    markdown = "\n".join([
        f"# {subject}协同治理社区报告",
        "",
        f"生成时间：{generated_at}",
        "",
        "## 一、摘要",
        f"本报告基于群体发现结果和风险传导路径生成。当前识别社区 {community_count} 个，"
        f"风险路径 {len(risk_paths)} 条，综合合规评分 {indicators['totalScore']}，风险等级为 {risk_level}。",
        "",
        "## 二、重点风险路径",
        "\n".join(path_lines) if path_lines else "未提供风险路径。",
        "",
        "## 三、社区报告来源",
        "\n".join(offline_lines) if offline_lines else "未加载到离线社区报告，已基于实时 JSON 生成基础报告。",
        "",
        "## 四、治理建议",
        "\n".join(f"- {action['title']}：{action['description']}" for action in actions),
    ])

    highlight_nodes = sorted({
        str(node_id)
        for path in top_paths
        for node_id in (path.get("nodeIds") or [])
    })
    highlight_edges = sorted({
        str(edge_id)
        for path in top_paths
        for edge_id in (path.get("edgeIds") or [])
    })
    highlight_communities = sorted({
        int(cid)
        for path in top_paths
        for cid in (path.get("communityPath") or [])
        if isinstance(cid, int)
    })

    return {
        "success": True,
        "apiVersion": "v1",
        "traceId": f"trc-{int(time.time() * 1000)}",
        "reportId": report_id,
        "generatedAt": generated_at,
        "subject": subject,
        "compliance": {
            "status": "warning" if risk_level in ("high", "medium") else "pass",
            "riskLevel": risk_level,
            "score": indicators["totalScore"],
            "summary": f"识别到 {len(risk_paths)} 条风险路径、{community_count} 个社区，建议进行协同治理闭环。",
            "matchedRules": matched_rules,
            "violations": [
                {
                    "pathId": path.get("pathId"),
                    "riskLevel": path.get("riskLevel"),
                    "score": path.get("score"),
                    "description": path.get("pathDescription", ""),
                }
                for path in high_paths[:10]
            ],
        },
        "complianceIndicators": indicators,
        "governance": {
            "priority": "high" if risk_level == "high" else "medium",
            "actions": actions,
            "timeline": [
                {"stage": "T+1", "task": "确认高风险路径和责任主体"},
                {"stage": "T+3", "task": "形成社区治理分工与处置台账"},
                {"stage": "T+7", "task": "完成复核、报告归档和后续监测配置"},
            ],
        },
        "report": {
            "reportId": report_id,
            "title": f"{subject}协同治理社区报告",
            "executiveSummary": f"{subject}存在 {len(risk_paths)} 条可解释风险路径，涉及 {community_count} 个风险社区。",
            "markdownReport": markdown,
            "recommendations": [action["description"] for action in actions],
        },
        "communityReportSources": offline_reports,
        "viewModel": {
            "reportPanel": "compliance-report",
            "compliancePanel": True,
            "ticketEnabled": True,
            "exportEnabled": True,
            "highlightNodeIds": highlight_nodes,
            "highlightEdgeIds": highlight_edges,
            "highlightCommunityIds": highlight_communities,
            "defaultSelectedPathId": top_paths[0].get("pathId") if top_paths else None,
        },
        "warnings": [],
    }


def _build_response(result: dict, req: CommunityDiscoveryRequest, elapsed_ms: int) -> dict:
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

    logger.info(
        "[CommunityAPI] seedNames=%s seedIds=%s method=%s maxHop=%s mode=%s",
        seed_names, seed_ids, req.method, req.maxHop, req.communityMode,
    )

    analytics = GraphAnalytics(db_client=_client())
    result = analytics.discover_seeded_communities(
        seed_names=seed_names,
        seed_ids=seed_ids,
        auto_select_seeds=req.autoSelectSeeds,
        top_k_seeds=req.topKSeeds,
        seed_selection_mode=req.seedSelectionMode,
        risk_constraints=req.riskConstraints.dict() if req.riskConstraints else None,
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
    return _build_response(result, req, elapsed_ms)


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

    if not seed_names and not seed_ids:
        return {
            "success": False,
            "traceId": f"trc-{int(time.time() * 1000)}",
            "error": "seedNames or seedIds is required",
        }

    logger.info(
        "[RiskPathAPI] seedNames=%s seedIds=%s maxHop=%s maxPathLength=%s "
        "includeCommDisc=%s method=%s",
        seed_names, seed_ids, req.maxHop, req.maxPathLength,
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
    }

    logger.info(
        "[RiskPathAPI] response_paths=%d community_paths=%d elapsed_ms=%d",
        len(limited), len(community_risk_paths), elapsed_ms,
    )

    return response_data


@router.post("/compliance-report")
def compliance_report(req: ComplianceReportRequest):
    """Generate a collaborative governance community report for a seed node.

    The open API entrypoint orchestrates the full chain internally:
    community-discovery -> risk-paths -> compliance report. Precomputed
    community/risk JSON can still be supplied and will be reused.
    """
    t0 = time.perf_counter()
    seed_names = [s.strip() for s in req.seedNames if s and s.strip()]
    seed_ids = [s.strip() for s in req.seedIds if s and s.strip()]
    if not seed_names and req.focusEntities:
        seed_names = [s.strip() for s in req.focusEntities if s and s.strip()]
    if not seed_ids and req.seedNodes:
        seed_ids = [str(n.get("id", "")).strip() for n in req.seedNodes if n.get("id")]

    community_payload = req.communityDiscovery or {}
    if not community_payload:
        community_payload = community_discovery(
            CommunityDiscoveryRequest(
                seedNames=seed_names,
                seedIds=seed_ids,
                maxHop=req.maxHop,
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
                maxHop=req.maxHop,
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

    report_req = req.copy(update={
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
    try:
        docx_file = _export_compliance_report_docx(response, report_req)
        report_meta = response.get("report") if isinstance(response.get("report"), dict) else {}
        report_meta.update({
            "format": "docx",
            "fileName": docx_file["fileName"],
            "filePath": docx_file["filePath"],
            "mimeType": docx_file["mimeType"],
            "sizeBytes": docx_file["sizeBytes"],
        })
        response["report"] = report_meta
        response["defaultFormat"] = "docx"
        response["exportFiles"] = {
            "default": "docx",
            "docx": docx_file,
        }
    except Exception as exc:
        logger.exception("[ComplianceReportAPI] docx export failed")
        response.setdefault("warnings", []).append(f"DOCX报告生成失败：{exc}")
        response["defaultFormat"] = "docx"
        response["exportFiles"] = {"default": "docx", "docx": None}
    response["pipelineTrace"] = {
        "mode": "internal_orchestration",
        "seedNames": seed_names,
        "seedIds": seed_ids,
        "communityDiscoveryGenerated": not bool(req.communityDiscovery),
        "riskPathsGenerated": not bool(req.riskPaths),
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
    }
    response["elapsedMs"] = int((time.perf_counter() - t0) * 1000)
    logger.info(
        "[ComplianceReportAPI] subject=%s risk_paths=%d elapsed_ms=%d",
        response.get("subject"),
        len(_as_list(report_req.riskPaths)),
        response["elapsedMs"],
    )
    return response
