"""Build normalized online report context from governance API results."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


SUBJECT_TYPES = {
    "SUBJECT", "COMPANY", "PERSON", "PFCOMPANY", "PFUND", "SECURITY",
    "ACCOUNT", "ACTOR", "BANK", "LEGAL_REP", "DIRECTOR", "SUPERVISOR", "EXECUTIVE",
}
VIOLATION_TYPES = {"EVENT", "SUB_EVENT", "ACTION", "RISKFEATURE", "RISKFACTOR", "TIME"}
REGULATION_TYPES = {"REGULATION", "LAW", "SECTION", "CHAPTER", "REGULATOR", "REGULATORYAUTHORITY"}


@dataclass
class OnlineReportContext:
    seed_nodes: list[dict[str, Any]]
    subject_name: str
    query: str
    subgraph: dict[str, Any]
    subgraph_nodes: list[dict[str, Any]]
    subgraph_edges: list[dict[str, Any]]
    communities: list[dict[str, Any]]
    seed_community_id: int | None
    entity_community_map: dict[str, dict[str, Any]]
    community_graph: dict[str, Any]
    risk_paths: list[dict[str, Any]]
    community_risk_paths: list[dict[str, Any]]
    anomaly_findings: list[dict[str, Any]]
    summary: dict[str, Any]
    warnings: list[str] = field(default_factory=list)


def _as_list(value: Any, *keys: str) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in keys:
            nested = value.get(key)
            if isinstance(nested, list):
                return nested
    return []


def _as_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except Exception:
        return None


def _node_name(node: dict[str, Any]) -> str:
    props = node.get("properties") if isinstance(node.get("properties"), dict) else {}
    return str(
        node.get("name")
        or node.get("label")
        or node.get("title")
        or props.get("name")
        or props.get("title")
        or props.get("COMPANY_NM")
        or props.get("COMPANYNm")
        or props.get("PERSON_NM")
        or props.get("PERSONNm")
        or props.get("SECURITY_NM")
        or props.get("SECURITYNm")
        or props.get("SECURITY_NAME")
        or props.get("SECURITYName")
        or props.get("FUND_NM")
        or props.get("FUNDNm")
        or props.get("BANK_NM")
        or props.get("BANKNm")
        or props.get("ORG_NAME")
        or props.get("ORG_NM")
        or props.get("ORGNm")
        or props.get("short_name")
        or props.get("SHORT_NAME")
        or props.get("abbr")
        or props.get("ALIAS")
        or node.get("id")
        or ""
    )


def _node_type(node: dict[str, Any]) -> str:
    node_type = node.get("type") or node.get("entityType") or node.get("entity_type") or node.get("label")
    if not node_type:
        labels = node.get("labels")
        if isinstance(labels, list) and labels:
            node_type = labels[-1]
    return str(node_type or "").upper()


class OnlineReportContextBuilder:
    """Normalize community-discovery + risk-paths payloads for online reporting."""

    def build(
        self,
        seed_nodes: list[dict[str, Any]],
        community_payload: dict[str, Any],
        risk_payload: dict[str, Any],
        report_req: Any,
    ) -> OnlineReportContext:
        community_payload = community_payload if isinstance(community_payload, dict) else {}
        risk_payload = risk_payload if isinstance(risk_payload, dict) else {}

        subject_name = _node_name(seed_nodes[0]) if seed_nodes else (
            report_req.focusEntities[0]
            if getattr(report_req, "focusEntities", None)
            else (report_req.seedNames[0] if getattr(report_req, "seedNames", None) else "未指定主体")
        )

        subgraph = {}
        for candidate in (
            community_payload.get("subgraph"),
            community_payload.get("connectedSubgraph"),
            risk_payload.get("subgraph"),
            getattr(report_req, "subgraph", None),
        ):
            if isinstance(candidate, dict) and candidate:
                subgraph = candidate
                break

        subgraph_nodes = _as_list(subgraph, "nodes")
        subgraph_edges = _as_list(subgraph, "edges")

        communities = _as_list(
            community_payload.get("communities")
            if community_payload.get("communities") is not None
            else community_payload.get("communityGraph"),
            "communities",
            "nodes",
        )
        if not communities and isinstance(getattr(report_req, "communities", None), list):
            communities = getattr(report_req, "communities")

        community_graph = community_payload.get("communityGraph") if isinstance(community_payload.get("communityGraph"), dict) else {}
        entity_community_map_raw = community_payload.get("entityCommunityMap")
        entity_community_map = entity_community_map_raw if isinstance(entity_community_map_raw, dict) else {}

        risk_paths = _as_list(
            risk_payload,
            "riskPaths",
            "interpretedPaths",
            "mergedPaths",
            "paths",
        )
        if not risk_paths and isinstance(getattr(report_req, "riskPaths", None), list):
            risk_paths = getattr(report_req, "riskPaths")

        community_risk_paths = _as_list(risk_payload, "communityRiskPaths")
        anomaly_findings = getattr(report_req, "anomalyFindings", None)
        if not isinstance(anomaly_findings, list):
            anomaly_findings = []

        summary_source = community_payload.get("summary") if isinstance(community_payload.get("summary"), dict) else {}
        risk_summary = risk_payload.get("summary") if isinstance(risk_payload.get("summary"), dict) else {}
        seed_community_id = _as_int(summary_source.get("seedCommunityId") or community_payload.get("seedCommunityId"))
        summary = {
            "communityCount": _as_int(summary_source.get("communityCount")) or len(communities),
            "nodeCount": _as_int(summary_source.get("nodeCount")) or len(subgraph_nodes),
            "edgeCount": _as_int(summary_source.get("edgeCount")) or len(subgraph_edges),
            "riskPathCount": _as_int(risk_summary.get("riskPathCount")) or len(risk_paths),
            "highRiskCount": _as_int(risk_summary.get("highRiskCount")) or sum(
                1 for path in risk_paths if str(path.get("riskLevel") or path.get("risk_level") or "").lower() == "high"
            ),
        }

        warnings: list[str] = []
        if not subgraph_nodes:
            warnings.append("未提取到有效子图节点")
        if not risk_paths:
            warnings.append("未识别到可解释风险路径")
        if not communities:
            warnings.append("未发现明确风险社区")

        return OnlineReportContext(
            seed_nodes=seed_nodes,
            subject_name=subject_name,
            query=getattr(report_req, "query", "") or subject_name,
            subgraph=subgraph,
            subgraph_nodes=subgraph_nodes,
            subgraph_edges=subgraph_edges,
            communities=communities,
            seed_community_id=seed_community_id,
            entity_community_map=entity_community_map,
            community_graph=community_graph,
            risk_paths=risk_paths,
            community_risk_paths=community_risk_paths,
            anomaly_findings=anomaly_findings,
            summary=summary,
            warnings=warnings,
        )

    @staticmethod
    def classify_nodes(nodes: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
        buckets = {"responsibility": [], "violation": [], "regulatory": [], "other": []}
        for node in nodes:
            node_type = _node_type(node)
            if node_type in SUBJECT_TYPES:
                buckets["responsibility"].append(node)
            elif node_type in VIOLATION_TYPES:
                buckets["violation"].append(node)
            elif node_type in REGULATION_TYPES:
                buckets["regulatory"].append(node)
            else:
                buckets["other"].append(node)
        return buckets
