"""Construct online responsibility / violation / regulatory perspectives."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import re
from typing import Any

from kg_query.analytics.risk_path_enumeration import _cn_rel_name

from .online_report_context_builder import OnlineReportContext, OnlineReportContextBuilder


@dataclass
class PerspectiveBundle:
    responsibility: dict[str, Any]
    violation: dict[str, Any]
    regulatory: dict[str, Any]
    cross_links: list[dict[str, Any]]


def _display_name(node: dict[str, Any]) -> str:
    props = node.get("properties") if isinstance(node.get("properties"), dict) else {}
    return str(
        node.get("name")
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
        or node.get("label")
        or node.get("id")
        or ""
    )


def _display_type(node: dict[str, Any]) -> str:
    return str(node.get("type") or node.get("entityType") or node.get("entity_type") or node.get("label") or "").upper()


def _looks_like_graph_id(text: str) -> bool:
    value = str(text or "").strip()
    if not value:
        return False
    if re.fullmatch(r"\d+:[0-9a-fA-F-]+:\d+", value):
        return True
    if re.fullmatch(r"[0-9a-fA-F-]{24,}", value):
        return True
    return value.count(":") >= 2 and len(value) > 20


def _safe_display_name(node: dict[str, Any]) -> str:
    name = _display_name(node).strip()
    return "" if _looks_like_graph_id(name) else name


def _friendly_type_name(node: dict[str, Any]) -> str:
    props = node.get("properties") if isinstance(node.get("properties"), dict) else {}
    labels = [str(label).upper() for label in (node.get("labels") or [])]
    node_type = _display_type(node)
    kind = node_type or (labels[-1] if labels else "")
    if kind == "SECURITY":
        security_type = str(props.get("SECURITYType") or "").strip()
        return f"未命名{security_type}" if security_type else "未命名证券"
    if kind in {"COMPANY", "PFCOMPANY"}:
        return "未命名公司主体"
    if kind == "BANK":
        return "未命名银行机构"
    if kind == "PFUND":
        return "未命名基金产品"
    if kind in {"PERSON", "LEGAL_REP", "DIRECTOR", "SUPERVISOR", "EXECUTIVE"}:
        return "未命名人员"
    if kind in {"REGULATOR", "REGULATORYAUTHORITY"}:
        return "未命名监管机构"
    if kind in {"LAW", "SECTION", "CHAPTER", "REGULATION"}:
        return "未命名法规节点"
    if kind in {"EVENT", "SUB_EVENT", "ACTION", "RISKFEATURE", "RISKFACTOR"}:
        return "未命名风险事件"
    if "COMPANY" in labels:
        return "未命名公司主体"
    if "SECURITY" in labels:
        security_type = str(props.get("SECURITYType") or "").strip()
        return f"未命名{security_type}" if security_type else "未命名证券"
    if "PERSON" in labels:
        return "未命名人员"
    return "未命名关联节点"


def _node_meta_map(nodes: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_id = str(node.get("id") or "")
        if not node_id:
            continue
        name = _safe_display_name(node)
        result[node_id] = {
            "name": name,
            "placeholder": _friendly_type_name(node),
            "type": _display_type(node),
        }
    return result


def _best_node_name(node_id: str, node_meta_map: dict[str, dict[str, str]]) -> str:
    meta = node_meta_map.get(str(node_id), {})
    return str(meta.get("name") or meta.get("placeholder") or "未命名关联节点")


def _render_path_description(path: dict[str, Any], node_meta_map: dict[str, dict[str, str]]) -> str:
    raw_description = str(
        path.get("pathDescription")
        or path.get("path_description")
        or path.get("description")
        or ""
    ).strip()
    if raw_description and "未命名节点" not in raw_description and not _looks_like_graph_id(raw_description):
        return raw_description

    node_ids = [str(item) for item in (path.get("nodeIds") or path.get("node_ids") or [])]
    relations = [str(item) for item in (path.get("relations") or path.get("mainRelations") or [])]
    names = [_best_node_name(node_id, node_meta_map) for node_id in node_ids]
    if len(names) >= 2:
        parts: list[str] = []
        for idx in range(len(names) - 1):
            relation = _cn_rel_name(relations[idx]) if idx < len(relations) else "关联"
            prefix = names[idx] if idx == 0 else f"随后 {names[idx]}"
            parts.append(f"{prefix} 通过{relation}关系关联至 {names[idx + 1]}")
        description = "，".join(parts)
        community_path = path.get("communityPath") or path.get("community_path") or []
        if isinstance(community_path, list) and len(set(community_path)) > 1:
            description += "，该路径跨越不同风险群体，表明存在跨社区风险传导。"
        return description

    return raw_description or str(path.get("pathId") or path.get("path_id") or "未命名风险路径")


def _top_nodes(nodes: list[dict[str, Any]], limit: int = 8) -> list[dict[str, Any]]:
    scored: list[tuple[float, dict[str, Any]]] = []
    for node in nodes:
        props = node.get("properties") if isinstance(node.get("properties"), dict) else {}
        score = float(
            node.get("score")
            or node.get("degree")
            or node.get("centrality")
            or props.get("degree")
            or props.get("warning_num")
            or 0
        )
        scored.append((score, {
            "id": str(node.get("id", "")),
            "name": _safe_display_name(node),
            "type": _display_type(node),
            "score": score,
        }))
    scored.sort(key=lambda item: (item[0], item[1]["name"]), reverse=True)
    filtered = [item[1] for item in scored if item[1]["name"]]
    return filtered[:limit]


class OnlinePerspectiveBuilder:
    """Build view-specific summaries from a local connected subgraph."""

    def build(self, context: OnlineReportContext) -> PerspectiveBundle:
        buckets = OnlineReportContextBuilder.classify_nodes(context.subgraph_nodes)
        node_meta_map = _node_meta_map(context.subgraph_nodes)

        responsibility = self._build_responsibility(context, buckets["responsibility"])
        violation = self._build_violation(context, buckets["violation"], node_meta_map)
        regulatory = self._build_regulatory(context, buckets["regulatory"])
        cross_links = self._build_cross_links(context, node_meta_map)

        return PerspectiveBundle(
            responsibility=responsibility,
            violation=violation,
            regulatory=regulatory,
            cross_links=cross_links,
        )

    def _build_responsibility(self, context: OnlineReportContext, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        type_counter = Counter(_display_type(node) for node in nodes)
        members = _top_nodes(nodes, limit=10)
        key_persons = [node for node in members if node["type"] == "PERSON"][:6]
        key_subjects = [node for node in members if node["type"] != "PERSON"][:8]

        summary = (
            f"围绕主体“{context.subject_name}”识别出 {len(nodes)} 个责任方相关节点，"
            f"其中公司/机构 {sum(count for t, count in type_counter.items() if t != 'PERSON')} 个，"
            f"人员 {type_counter.get('PERSON', 0)} 个。"
        )
        return {
            "summary": summary,
            "coreSubjects": key_subjects,
            "keyPersons": key_persons,
            "typeCounts": dict(type_counter),
        }

    def _build_violation(
        self,
        context: OnlineReportContext,
        nodes: list[dict[str, Any]],
        node_meta_map: dict[str, dict[str, str]],
    ) -> dict[str, Any]:
        type_counter = Counter(_display_type(node) for node in nodes)
        top_paths = sorted(
            context.risk_paths,
            key=lambda item: int(item.get("score") or item.get("risk_score") or 0),
            reverse=True,
        )[:8]
        normalized_paths: list[dict[str, Any]] = []
        for path in top_paths:
            copied = dict(path)
            copied["renderedDescription"] = _render_path_description(path, node_meta_map)
            normalized_paths.append(copied)
        summary = (
            f"当前局部图中识别到 {len(context.risk_paths)} 条风险传导路径，"
            f"高风险路径 {sum(1 for item in context.risk_paths if str(item.get('riskLevel') or item.get('risk_level') or '').lower() == 'high')} 条。"
        )
        return {
            "summary": summary,
            "keyEvents": _top_nodes([node for node in nodes if _display_type(node) in {"EVENT", "SUB_EVENT"}], limit=8),
            "riskFeatures": _top_nodes([node for node in nodes if _display_type(node) in {"RISKFEATURE", "RISKFACTOR", "ACTION"}], limit=8),
            "topRiskPaths": normalized_paths,
            "typeCounts": dict(type_counter),
        }

    def _build_regulatory(self, context: OnlineReportContext, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        type_counter = Counter(_display_type(node) for node in nodes)
        laws = _top_nodes([node for node in nodes if _display_type(node) in {"LAW", "SECTION", "CHAPTER", "REGULATION"}], limit=8)
        regulators = _top_nodes([node for node in nodes if _display_type(node) in {"REGULATOR", "REGULATORYAUTHORITY"}], limit=6)
        summary = (
            f"当前局部图中涉及 {len(laws)} 个法规条款节点、{len(regulators)} 个监管机构节点，"
            f"可为风险路径和治理动作提供规则依据。"
        )
        return {
            "summary": summary,
            "laws": laws,
            "regulators": regulators,
            "typeCounts": dict(type_counter),
        }

    def _build_cross_links(self, context: OnlineReportContext, node_meta_map: dict[str, dict[str, str]]) -> list[dict[str, Any]]:
        links: list[dict[str, Any]] = []
        for idx, path in enumerate(context.risk_paths[:8], start=1):
            node_ids = [str(item) for item in (path.get("nodeIds") or path.get("node_ids") or [])]
            edge_ids = [str(item) for item in (path.get("edgeIds") or path.get("edge_ids") or [])]
            relations = [str(item) for item in (path.get("relations") or path.get("mainRelations") or [])]
            rendered_description = _render_path_description(path, node_meta_map)
            links.append({
                "id": f"link-{idx}",
                "sourcePerspective": "responsibility",
                "targetPerspective": "violation",
                "relationType": "PROPAGATES_TO",
                "score": float(path.get("confidence") or 0.8),
                "description": rendered_description,
                "evidenceNodeIds": node_ids,
                "evidenceEdgeIds": edge_ids,
                "relations": relations,
            })
            if relations:
                links.append({
                    "id": f"reg-link-{idx}",
                    "sourcePerspective": "violation",
                    "targetPerspective": "regulatory",
                    "relationType": "SUPPORTED_BY",
                    "score": max(0.5, float(path.get("confidence") or 0.75) - 0.1),
                    "description": "风险路径与法规/监管约束存在潜在关联",
                    "evidenceNodeIds": node_ids,
                    "evidenceEdgeIds": edge_ids,
                    "relations": relations[:4],
                })
        return links[:12]
