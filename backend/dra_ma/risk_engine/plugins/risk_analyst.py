"""Risk Analyst Plugin — interpret, filter, and grade risk paths.

Input:  EvidenceSubgraph + GraphAnalyticsResult.candidate_risk_paths
Output: {interpreted_risk_paths, anomalies, risk_explanations}
SSE:    event: risk_paths (distinct from candidate_risk_paths)
"""

from __future__ import annotations

import json
import logging
from typing import Any

from dra_ma.agents.layer3_execution.cypher_utils import call_llm
from dra_ma.prompts import PromptLoader
from dra_ma.utils.agent_trace import agent_trace

logger = logging.getLogger(__name__)

# ── Normalized interpreted path schema ──────────────────────────────────
# Every path (LLM or demo) is post-processed into this shape:
#   path_id, node_ids, edge_ids, path_text, risk_level, confidence, description


def _resolve_path_ids(
    paths: list[dict],
    nodes: list[dict],
    edges: list[dict],
) -> list[dict]:
    """Post-process interpreted paths: map node names → node_ids, infer edge_ids.

    If the LLM only returns node names (e.g. "鑫达投资管理有限公司"), this
    function matches them against subgraph.nodes (by name/label/title) and
    fills in node_ids.  It then looks up subgraph.edges for source-target
    pairs between adjacent node_ids to fill edge_ids.
    """
    if not paths:
        return []

    # Build name→id lookup from subgraph nodes
    name_to_id: dict[str, str] = {}
    id_to_names: dict[str, list[str]] = {}
    for n in nodes:
        nid = str(n.get("id", "") or n.get("element_id", ""))
        if not nid:
            continue
        props = n.get("properties", {}) if isinstance(n.get("properties"), dict) else {}
        candidates = [
            str(props.get("name", "")),
            str(props.get("COMPANY_NM", "")),
            str(n.get("name", "")),
            str(n.get("label", "")),
            str(n.get("title", "")),
            str(props.get("zh_name", "")),
        ]
        names = [c for c in candidates if c]
        id_to_names[nid] = names
        for c in names:
            name_to_id[c] = nid

    # Build edge lookup: (src, tgt) → edge_id
    edge_lookup: dict[tuple[str, str], str] = {}
    for e in edges:
        src = str(e.get("source", ""))
        tgt = str(e.get("target", ""))
        eid = str(e.get("id", "") or e.get("element_id", ""))
        if src and tgt:
            edge_lookup[(src, tgt)] = eid
            edge_lookup[(tgt, src)] = eid  # undirected lookup too

    resolved: list[dict] = []
    for p in paths:
        # ── Node IDs ─────────────────────────────────────────────────
        node_ids: list[str] = []

        # Prefer explicit node_ids if already present
        raw_ids = p.get("node_ids") or p.get("entity_ids") or []
        if raw_ids and all(isinstance(x, str) and x for x in raw_ids):
            node_ids = [str(x) for x in raw_ids]
        else:
            # Resolve from node names (LLM returns "nodes", demo returns "affected_entities")
            node_names = p.get("nodes") or p.get("affected_entities") or []
            for name in node_names:
                name_str = str(name).strip()
                nid = name_to_id.get(name_str, "")
                if not nid:
                    # Fuzzy: try partial match
                    for key, val in name_to_id.items():
                        if name_str in key or key in name_str:
                            nid = val
                            break
                if nid:
                    node_ids.append(nid)
                else:
                    logger.debug("[RiskAnalyst] Could not resolve node name to id: %s", name_str)

        # ── Edge IDs ─────────────────────────────────────────────────
        edge_ids: list[str] = []

        raw_eids = p.get("edge_ids") or p.get("relation_ids") or []
        if raw_eids and all(isinstance(x, str) and x for x in raw_eids):
            edge_ids = [str(x) for x in raw_eids]
        else:
            # Infer from adjacent node pairs
            for i in range(len(node_ids) - 1):
                pair = (node_ids[i], node_ids[i + 1])
                eid = edge_lookup.get(pair, "")
                if eid:
                    edge_ids.append(eid)
                else:
                    logger.debug("[RiskAnalyst] Could not find edge for pair: %s", pair)

        # ── Normalized fields ─────────────────────────────────────────
        path_text = str(
            p.get("path_text")
            or p.get("risk_description")
            or p.get("path_description")
            or p.get("description", "")
        )
        description = str(
            p.get("description")
            or p.get("risk_description")
            or p.get("path_description", "")
        )
        risk_level = str(p.get("risk_level", "medium")).lower()
        confidence = float(p.get("confidence", 0.5))

        resolved.append({
            "path_id": str(p.get("path_id", "")),
            "node_ids": node_ids,
            "edge_ids": edge_ids,
            "path_text": path_text,
            "risk_level": risk_level,
            "confidence": confidence,
            "description": description,
            # Backward-compatible fields for frontend RiskPath interface
            "affected_entities": [
                id_to_names.get(nid, [nid])[0] for nid in node_ids
            ],
            "path_description": path_text,
        })

    return resolved


def _candidate_paths_to_interpreted(
    candidate_risk_paths: list[dict],
    nodes: list[dict],
    edges: list[dict],
) -> list[dict]:
    """Convert deterministic graph candidates into interpreted risk paths.

    The LLM is useful for narrative filtering, but the downstream compliance
    and report modules need a stable path schema. When the LLM returns no
    paths, keep the governance chain alive with structural candidates.
    """
    if not candidate_risk_paths:
        return []

    edge_by_id: dict[str, dict] = {}
    for edge in edges:
        eid = str(edge.get("id") or edge.get("element_id") or "")
        if eid:
            edge_by_id[eid] = edge

    interpreted: list[dict] = []
    for idx, candidate in enumerate(candidate_risk_paths, 1):
        if not isinstance(candidate, dict):
            continue

        entities = [
            str(item) for item in candidate.get("entities", [])
            if str(item).strip()
        ]
        relation = str(candidate.get("relation", "")).upper()
        if not relation:
            edge_ids = candidate.get("edge_ids") or []
            first_edge = edge_by_id.get(str(edge_ids[0]), {}) if edge_ids else {}
            relation = str(
                first_edge.get("relation")
                or first_edge.get("type")
                or first_edge.get("label")
                or first_edge.get("raw_type")
                or "RELATED"
            ).upper()

        risk_level = str(candidate.get("risk_level_hint") or "medium").lower()
        confidence = float(candidate.get("confidence") or 0.68)
        if relation in {"WARNING", "GUARANTEE", "TRIGGERS", "SUE", "监管", "触发"}:
            risk_level = "high"
        elif relation in {
            "INVEST", "CONTROL", "CONTROLLER", "CONTROLL", "CAUSE", "MENTION",
            "WORK", "JOINDER", "MANAGER", "TRUSTEE", "CUSTOMER", "SUPPLIER",
            "ISSUE", "BRANCH", "REGULATE", "映射法规",
        }:
            risk_level = "medium"

        if len(entities) >= 2:
            path_text = f"{entities[0]} 通过 {relation} 关系关联至 {entities[-1]}，存在潜在风险传导链路。"
        elif entities:
            path_text = f"{entities[0]} 关联关系 {relation} 形成潜在风险暴露。"
        else:
            path_text = f"图谱中发现 {relation} 关系形成潜在风险传导链路。"

        interpreted.append({
            "path_id": str(candidate.get("path_id") or f"RP-FB-{idx:03d}"),
            "node_ids": [str(x) for x in candidate.get("node_ids", []) if str(x)],
            "edge_ids": [str(x) for x in candidate.get("edge_ids", []) if str(x)],
            "path_text": path_text,
            "path_description": path_text,
            "description": path_text,
            "risk_level": risk_level,
            "confidence": confidence,
            "affected_entities": entities,
            "relation": relation,
            "source": "candidate_path_fallback",
        })

    return _resolve_path_ids(interpreted, nodes, edges)


def _fallback_anomalies_from_candidates(
    candidate_risk_paths: list[dict],
    nodes: list[dict],
    edges: list[dict],
) -> list[dict]:
    """Generate a minimal anomaly finding when structural candidates exist."""
    if not candidate_risk_paths:
        return []

    relation_counts: dict[str, int] = {}
    affected: list[str] = []
    for candidate in candidate_risk_paths:
        if not isinstance(candidate, dict):
            continue
        relation = str(candidate.get("relation", "RELATED")).upper()
        relation_counts[relation] = relation_counts.get(relation, 0) + 1
        for entity in candidate.get("entities", []):
            name = str(entity).strip()
            if name and name not in affected:
                affected.append(name)

    relation_summary = "、".join(f"{rel} {count}条" for rel, count in sorted(relation_counts.items()))
    evidence = (
        f"图谱结构发现 {len(candidate_risk_paths)} 条候选风险关系"
        f"（{relation_summary or '关系类型待识别'}），涉及 {len(affected)} 个主体。"
    )

    return [{
        "anomaly_type": "结构化候选风险链路",
        "affected_entities": affected[:10],
        "evidence": evidence,
        "confidence": 0.62,
        "source": "candidate_path_fallback",
    }]


# ── Plugin ──────────────────────────────────────────────────────────────


class RiskAnalystPlugin:
    """Analyze candidate risk paths and identify anomalies.

    Can operate with or without LLM. When demo=True, uses rule-based analysis.
    """

    def __init__(self, demo: bool = False):
        self.demo = demo

    async def analyze(
        self,
        nodes: list[dict],
        edges: list[dict],
        candidate_risk_paths: list[dict],
        evidence: dict | None = None,
        trigger_event: str | None = None,
    ) -> dict[str, Any]:
        """Analyze risk paths and produce interpreted results."""
        if self.demo:
            return await self._demo_analyze(nodes, edges)

        if not nodes:
            agent_trace("RiskAnalyst", "DECISION",
                candidate_path_count=len(candidate_risk_paths),
                interpreted_path_count=0,
                anomaly_count=0)
            return {
                "interpreted_risk_paths": [],
                "anomalies": [],
                "risk_explanations": "Insufficient subgraph data for risk analysis",
            }

        try:
            system = PromptLoader.render_analyst_system()
            user = PromptLoader.render_analyst_user(
                node_count=len(nodes),
                nodes=json.dumps(nodes, ensure_ascii=False),
                edge_count=len(edges),
                edges=json.dumps(edges, ensure_ascii=False),
                trigger_event=trigger_event,
            )
            raw = await call_llm(
                system=system, user=user,
                temperature=0.2, response_format={"type": "json_object"},
            )
            result = json.loads(raw) if raw else {}
            raw_interpreted = result.get("risk_paths", [])
            anomalies = result.get("anomalies", [])

            # Post-process: map names → ids, infer edge_ids
            interpreted = _resolve_path_ids(raw_interpreted, nodes, edges)
            if not interpreted and candidate_risk_paths:
                interpreted = _candidate_paths_to_interpreted(candidate_risk_paths, nodes, edges)
            if not anomalies and interpreted:
                anomalies = _fallback_anomalies_from_candidates(candidate_risk_paths, nodes, edges)

            agent_trace("RiskAnalyst", "DECISION",
                candidate_path_count=len(candidate_risk_paths),
                interpreted_path_count=len(interpreted),
                anomaly_count=len(anomalies))
            return {
                "interpreted_risk_paths": interpreted,
                "anomalies": anomalies,
                "risk_explanations": result.get("overall_assessment", ""),
            }
        except Exception as exc:
            logger.exception("[RiskAnalyst] Failed: %s", exc)
            interpreted = _candidate_paths_to_interpreted(candidate_risk_paths, nodes, edges)
            anomalies = _fallback_anomalies_from_candidates(candidate_risk_paths, nodes, edges) if interpreted else []
            agent_trace("RiskAnalyst", "DECISION",
                candidate_path_count=len(candidate_risk_paths),
                interpreted_path_count=len(interpreted),
                anomaly_count=len(anomalies))
            return {
                "interpreted_risk_paths": interpreted,
                "anomalies": anomalies,
                "risk_explanations": f"Analysis error: {exc}",
            }

    async def _demo_analyze(
        self, nodes: list[dict], edges: list[dict],
    ) -> dict[str, Any]:
        """Rule-based risk path analysis (no LLM)."""
        raw_paths: list[dict] = []
        anomalies: list[dict] = []
        path_id_counter = [0]

        def _add_path(node_ids, risk_level, description, entities, edge_ids=None):
            path_id_counter[0] += 1
            raw_paths.append({
                "path_id": f"RP-{path_id_counter[0]:03d}",
                "node_ids": node_ids,
                "edge_ids": edge_ids or [],
                "nodes": entities,  # for _resolve_path_ids to use as fallback
                "risk_level": risk_level,
                "description": description,
                "path_text": description,
                "confidence": 0.85 if risk_level == "high" else 0.7 if risk_level == "medium" else 0.6,
            })

        node_map: dict[str, dict] = {n["id"]: n for n in nodes}

        # Company risk detection
        company_nodes = [n for n in nodes if "COMPANY" in n.get("labels", [])]
        for c in company_nodes:
            props = c.get("properties", {})
            warning_num = int(props.get("WARNING_NUM", 0) or 0)
            status = props.get("STATUS", "")
            name = props.get("name", props.get("COMPANY_NM", "??"))

            if warning_num >= 5:
                _add_path([c["id"]], "high", f"{name} 预警 {warning_num} 次，存在重大风险", [name])
            elif warning_num >= 2 or status == "吊销":
                _add_path([c["id"]], "medium", f"{name} 预警 {warning_num} 次，状态: {status}", [name])

        # Cross-shareholding anomaly
        invest_count = sum(1 for e in edges if "INVEST" in str(e.get("label", "")))
        if invest_count >= 3:
            companies = set()
            for e in edges:
                if "INVEST" in str(e.get("label", "")):
                    for nid in (e.get("source", ""), e.get("target", "")):
                        nd = node_map.get(nid, {})
                        nm = nd.get("properties", {}).get("name", "")
                        if nm:
                            companies.add(nm)
            anomalies.append({
                "anomaly_type": "复杂股权网络",
                "affected_entities": list(companies)[:8],
                "evidence": f"{invest_count} 条投资关系，涉及 {len(companies)} 个主体",
                "confidence": 0.82,
            })

        # Guarantee chain anomaly
        guarantee_count = sum(1 for e in edges if "GUARANTEE" in str(e.get("label", "")))
        if guarantee_count >= 2:
            anomalies.append({
                "anomaly_type": "连环担保风险",
                "affected_entities": [],
                "evidence": f"{guarantee_count} 条担保关系，存在或有负债风险",
                "confidence": 0.78,
            })

        if not anomalies:
            anomalies.append({
                "anomaly_type": "图谱结构异常",
                "affected_entities": [],
                "evidence": f"关联网络包含 {len(nodes)} 节点和 {len(edges)} 条关系",
                "confidence": 0.55,
            })

        # Post-process: resolve ids (demo mode already has node_ids but let resolver handle edge_ids)
        interpreted = _resolve_path_ids(raw_paths, nodes, edges)

        agent_trace("RiskAnalyst", "DECISION",
            candidate_path_count=0,
            interpreted_path_count=len(interpreted),
            anomaly_count=len(anomalies))
        return {
            "interpreted_risk_paths": interpreted,
            "anomalies": anomalies,
            "risk_explanations": f"Rule-based analysis: {len(interpreted)} paths, {len(anomalies)} anomalies",
        }
