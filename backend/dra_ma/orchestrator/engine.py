"""DRA-MA Engine — integrates all four layers with the four collaboration dimensions.

Four-Dimensional Collaboration:
  1. Vertical (Doer-Healer):  Layer2 Planner → Layer3 Compiler → Layer3 Healer
  2. Horizontal (Consensus):  Multi-beam Planners → Layer4 Reward → Layer4 Aggregator
  3. Cross-Layer (Semantic Anchor): Layer1 IntentAgent → Layer4 Aggregator (Post-Filter)
  4. Virtual-Real (Probe-Plan): Layer2 Probe → Layer2 Planner

Skill System:
  Pluggable skills can be registered at pipeline hook points to enhance
  reasoning accuracy and efficiency. See dra_ma/skills/ for available skills.
"""

import logging
import asyncio
import re
import json
import time
from dataclasses import dataclass
from typing import Dict, Any, AsyncGenerator, List

from core.models import TraceContext

from dra_ma.skills.base import SkillContext, SkillHook
from dra_ma.skills.registry import SkillManager
from dra_ma.skills.perception.entity_resolver import EntityResolver
from dra_ma.skills.execution.failure_pattern_db import FailurePatternDB
from dra_ma.skills.consensus.persona_selector import PersonaSelector
from dra_ma.skills.consensus.entity_cleaner import EntityCleaner

from dra_ma.agents.layer1_perception.intent_agent import IntentAgent
from dra_ma.agents.layer1_perception.gating_router import GatingRouter
from dra_ma.agents.layer2_beam_search.planner import PlannerAgent, IntentPlannerAgent
from dra_ma.agents.layer2_beam_search.probe import get_adjacent_relations
from dra_ma.agents.layer3_execution.compiler import ExecutorAgent
from dra_ma.agents.layer3_execution.healer import SmashAgent
from dra_ma.agents.layer3_execution.cypher_utils import db_client
from dra_ma.agents.layer4_consensus.verifier import VerifierAgent
from dra_ma.agents.layer4_consensus.aggregator import AggregatorAgent
from dra_ma.agents.layer4_consensus.reward import calculate_total_reward
from dra_ma.risk_engine.risk_engine import RiskAnalysisEngine

logger = logging.getLogger(__name__)

# ── Risk relation priority for Planner re-ranking ──────────────────────────

RISK_RELATION_PRIORITY = {
    "INVEST": 1.00, "GUARANTEE": 0.98, "CONTROL": 0.95,
    "CONTROLLER": 0.95, "MENTION": 0.92, "REFLECTS": 0.90,
    "WORK": 0.82, "SERVE": 0.82, "TRANSACTION": 0.88, "WARNING": 0.90,
}


def _extract_relation_name(dec: dict) -> str:
    """从 Planner 决策中提取标准化关系名。

    Planner 返回的 relation 字段格式不稳定，可能是：
      - "INVEST"
      - "`INVEST`"
      - "INVEST (Samples: ...)"
      - "鑫达投资 - INVEST - Target"
    """
    raw = (
        dec.get("relation") or dec.get("rel")
        or dec.get("relation_type") or dec.get("path")
        or dec.get("path_text") or ""
    )
    text = str(raw).replace("`", "").upper()
    for rel in RISK_RELATION_PRIORITY:
        if rel in text:
            return rel
    return text.split()[0] if text else ""


def _fallback_relation_decisions(probe_relations: list[str]) -> list[dict]:
    """Build deterministic relation decisions from real KG probe output.

    This keeps risk subgraph retrieval alive when the LLM planner is slow,
    rate-limited, or returns malformed JSON.
    """
    decisions: list[dict] = []
    seen: set[str] = set()
    for raw in probe_relations:
        rel = str(raw).split(" (Samples:")[0].replace("`", "").strip().upper()
        if not rel or rel in seen:
            continue
        seen.add(rel)
        decisions.append({
            "relation": rel,
            "score": RISK_RELATION_PRIORITY.get(rel, 0.5),
            "reason": "deterministic fallback from Probe relations",
            "source": "probe_fallback",
        })
    decisions.sort(key=lambda d: float(d.get("score", 0.0) or 0.0), reverse=True)
    return decisions


# ── Subgraph Normalization ───────────────────────────────────────────────────


def _normalize_subgraph_node(node: dict) -> dict:
    """Normalize a node from Shape A {id, label, type} or Shape B
    {id, labels, properties} into a unified dict.

    Every node is guaranteed to have: id, name, entity_type, type, labels, properties.
    """
    if not isinstance(node, dict):
        return {
            "id": str(node),
            "name": str(node),
            "entity_type": "Unknown",
            "type": "Unknown",
            "labels": [],
            "properties": {},
            "score": 1,
            "title": str(node),
        }

    props = node.get("properties", {}) if isinstance(node.get("properties"), dict) else {}
    labels_list = node.get("labels", []) or []

    # Resolve entity_type: entity_type > type (non-empty/non-Resource) > labels first > props heuristics > "Unknown"
    raw_type = node.get("entity_type") or node.get("type") or ""
    entity_type = raw_type if (raw_type and raw_type != "Resource") else ""

    if not entity_type and labels_list:
        for lbl in labels_list:
            if lbl and lbl != "Resource":
                entity_type = lbl
                break

    if not entity_type and props:
        if props.get("COMPANY_NM"):
            entity_type = "COMPANY"
        elif props.get("PERSON_NM"):
            entity_type = "PERSON"
        elif props.get("factor_nm") or props.get("feature_nm"):
            entity_type = "RiskFactor"

    if not entity_type:
        preview_name = str(
            node.get("name") or node.get("label")
            or props.get("name") or props.get("COMPANY_NM")
            or props.get("zh_name") or props.get("title") or ""
        )
        from dra_ma.utils.entity_heuristics import infer_entity_type_from_name
        inferred = infer_entity_type_from_name(preview_name)
        if inferred:
            entity_type = inferred

    if not entity_type:
        entity_type = "Unknown"

    # Resolve name
    name = str(
        node.get("name") or node.get("label")
        or props.get("name") or props.get("COMPANY_NM")
        or props.get("zh_name") or props.get("title")
        or node.get("id") or ""
    )

    node_id = str(node.get("id") or props.get("element_id") or name or "")

    return {
        "id": node_id,
        "name": name,
        "entity_type": entity_type,
        "type": entity_type,
        "labels": labels_list,
        "properties": props,
        "score": props.get("score", node.get("score", 1)),
        "title": props.get("title") or name,
        "zh_name": props.get("zh_name"),
        "overview": props.get("overview") or props.get("RISK_INFO", ""),
        "risk_level": props.get("risk_level", node.get("risk_level")),
        "popularity": props.get("popularity", node.get("popularity")),
        "rating": props.get("rating", node.get("rating")),
        "year": props.get("year", node.get("year")),
    }


def _normalize_subgraph_edge(edge: dict) -> dict:
    """Normalize an edge from Shape A {source, target, type} or Shape B
    {source, target, label} into a unified dict.

    Every edge is guaranteed to have: id, source, target, relation, type, label, raw_type.
    """
    src = str(edge.get("source", edge.get("start", "")))
    tgt = str(edge.get("target", edge.get("end", "")))
    raw = edge.get("raw_type") or edge.get("relation") or edge.get("label") or edge.get("type")
    rel = str(raw or "RELATED")
    logger.info(
        "[EdgeNormalize] before=(raw_type=%s relation=%s label=%s type=%s) after=%s src=%.20s tgt=%.20s",
        edge.get("raw_type"), edge.get("relation"), edge.get("label"), edge.get("type"),
        rel, src, tgt,
    )
    return {
        "id": str(edge.get("id") or edge.get("element_id", "")),
        "source": src,
        "target": tgt,
        "relation": rel,
        "label": rel,
        "type": rel,
        "raw_type": str(raw) if raw else "",
        "properties": edge.get("properties", {}) if isinstance(edge.get("properties"), dict) else {},
        "confidence": edge.get("confidence"),
    }


# ── DRAEngine ───────────────────────────────────────────────────────────────

def _node_name_candidates(node: dict) -> list[str]:
    props = node.get("properties", {}) if isinstance(node.get("properties"), dict) else {}
    raw_values = [
        node.get("name"),
        node.get("title"),
        node.get("label"),
        node.get("id"),
        props.get("name"),
        props.get("COMPANY_NM"),
        props.get("PERSON_NM"),
        props.get("title"),
        props.get("zh_name"),
    ]
    seen: set[str] = set()
    candidates: list[str] = []
    for value in raw_values:
        text = str(value or "").strip()
        if text and text not in seen:
            seen.add(text)
            candidates.append(text)
    return candidates


def _hydrate_subgraph_node_properties(nodes: list[dict]) -> list[dict]:
    """Attach full Neo4j properties to simplified ExecutorAgent graph nodes."""
    names: list[str] = []
    seen: set[str] = set()
    for node in nodes:
        for name in _node_name_candidates(node):
            if name not in seen:
                seen.add(name)
                names.append(name)

    if not names:
        return nodes

    cypher = """
    MATCH (n)
    WHERE coalesce(n.name, n.PERSON_NM, n.COMPANY_NM, n.title) IN $names
    RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS properties
    LIMIT 200
    """
    try:
        rows = db_client.execute_read(cypher, {"names": names}, 10.0)
    except Exception as exc:
        logger.warning("[hydrate_subgraph_node_properties] lookup failed: %s", exc)
        return nodes

    hydrated_by_name: dict[str, dict] = {}
    for row in rows or []:
        raw = {
            "id": row.get("id"),
            "labels": row.get("labels", []) or [],
            "properties": row.get("properties", {}) or {},
        }
        normalized = _normalize_subgraph_node(raw)
        for name in _node_name_candidates(normalized):
            hydrated_by_name[name] = normalized

    if not hydrated_by_name:
        return nodes

    hydrated_nodes: list[dict] = []
    for node in nodes:
        match = next(
            (hydrated_by_name.get(name) for name in _node_name_candidates(node) if hydrated_by_name.get(name)),
            None,
        )
        if not match:
            hydrated_nodes.append(node)
            continue

        node_props = node.get("properties", {}) if isinstance(node.get("properties"), dict) else {}
        match_props = match.get("properties", {}) if isinstance(match.get("properties"), dict) else {}
        hydrated_nodes.append({
            **match,
            **node,
            "labels": node.get("labels") or match.get("labels", []),
            "properties": {**match_props, **node_props},
            "overview": node.get("overview") or match.get("overview", ""),
            "risk_level": node.get("risk_level") or match.get("risk_level"),
        })

    return hydrated_nodes


class DRAEngine:
    """DRA-MA orchestration engine with seven-stage pipeline.

    Args:
        feature_flags: Optional dict controlling which collaboration dimensions
                       are active. When None, all dimensions are enabled (full DRA-MA).
    """

    def __init__(self, feature_flags: dict = None):
        from types import SimpleNamespace
        default_flags = {
            "no_smash": False,
            "no_ensemble": False,
            "no_semantic_anchor": False,
            "no_probe": False,
            "no_r_scale": False
        }
        if feature_flags:
            default_flags.update(feature_flags)
        self.ablation = SimpleNamespace(**default_flags)
        planner_count = 1 if self.ablation.no_ensemble else 3
        self.planners = [PlannerAgent(agent_id=i) for i in range(planner_count)]

        # ── Skill System ──
        self.skills = SkillManager(feature_flags)
        self._register_default_skills()

    @staticmethod
    def _make_stage(stage_id: str, stage_name: str, stage_index: int,
                    total_stages: int = 5, agent: str = "", agent_action: str = "",
                    progress: float = 0.0, **kwargs) -> Dict[str, Any]:
        """Build a structured stage event for SSE streaming.

        The frontend PipelineProgress component consumes these to render
        the 5-stage progress bar with per-agent status bubbles.
        """
        stage = {
            "stage_id": stage_id,
            "stage_name": stage_name,
            "stage_index": stage_index,
            "total_stages": total_stages,
            "agent": agent,
            "agent_action": agent_action,
            "progress": progress,
            "timestamp": time.time(),
        }
        result: Dict[str, Any] = {"stage": stage}
        result.update(kwargs)
        return result

    def _register_default_skills(self) -> None:
        """Register the default Phase 1 skills.

        Skills can be individually disabled via feature flags:
          - no_entity_resolver: skip entity canonicalization
          - no_failure_pattern_db: skip failure pattern lookup
          - no_persona_selector: skip persona selection
          - no_entity_cleaner: skip entity cleaning chain
        """
        self.skills.register(EntityResolver())
        self.skills.register(FailurePatternDB())

        # PersonaSelector: register for multiple hooks (idempotent — sets once)
        ps_verify = PersonaSelector()
        ps_verify.hook = SkillHook.PRE_VERIFY
        self.skills.register(ps_verify)

        ps_nlg = PersonaSelector()
        ps_nlg.hook = SkillHook.PRE_NLG
        ps_nlg.name = "persona_selector_nlg"
        self.skills.register(ps_nlg)

        ps_agg = PersonaSelector()
        ps_agg.hook = SkillHook.PRE_AGGREGATE
        ps_agg.name = "persona_selector_agg"
        self.skills.register(ps_agg)

        self.skills.register(EntityCleaner())
        logger.info(
            f"[DRAEngine] Skill system initialized:\n{self.skills.summary()}"
        )

    def expand_node(self, node_id: str, node_type: str) -> Dict[str, Any]:
        from kg_construction.ontology.ontology_registry import OntologyRegistry
        node_label = OntologyRegistry.get_node_label()
        label_str = f":{node_label}" if node_label else ""
        prop_key = OntologyRegistry.get_entity_matching_strategy().get("property_key", "name")
        cypher = f"MATCH (n{label_str} {{{prop_key}: '{node_id}'}})-[r]-(m) RETURN labels(m) as labels, m.{prop_key} as name, type(r) as rel_type LIMIT 30"
        try:
            res = db_client.execute_read(cypher)
            nodes = [{"id": node_id, "label": node_id, "type": node_type}]
            edges = []
            for row in res:
                lbl = row["labels"][0] if row["labels"] else node_label
                target_name = row["name"]
                rel_type = row["rel_type"]
                nodes.append({"id": target_name, "label": target_name, "type": lbl})
                edges.append({"source": node_id, "target": target_name, "type": rel_type})
            return {"nodes": nodes, "edges": edges}
        except Exception as e:
            logger.error(f"expand_node failed: {e}")
            return {"nodes": [], "edges": []}

    async def retrieve_evidence_subgraph(
        self,
        query: str,
        entities: list[str] | None = None,
        max_hops: int = 3,
        intent_type: str = "graph_qa",
        relation_focus: list[str] | None = None,
        intent_obj=None,
    ) -> Dict[str, Any]:
        """Run full DRA pipeline but stop after Aggregator — return evidence-rich subgraph.

        relation_focus: risk analysis focus relations, e.g.
          ["INVEST","CONTROL","GUARANTEE","SERVE","TRANSACTION","WARNING"]
          Pass None for graph_qa.

        intent_obj: Pre-parsed IntentAgent result. When provided, skips the
          duplicate IntentAgent.parse() call — UnifiedEngine passes this from
          its Stage 1 classification.

        Returns EvidenceSubgraph dict:
            {nodes, edges, evidence_paths, cypher_records, verified_claims,
             failed_queries, graph_summary, confidence, insufficient_entities}
        """
        from dra_ma.agents.layer1_perception.intent_agent import IntentAgent
        from dra_ma.agents.layer2_beam_search.probe import get_adjacent_relations
        from dra_ma.agents.layer2_beam_search.planner import IntentPlannerAgent
        from dra_ma.agents.layer3_execution.compiler import ExecutorAgent
        from dra_ma.agents.layer3_execution.healer import SmashAgent
        from dra_ma.agents.layer4_consensus.verifier import VerifierAgent
        from dra_ma.agents.layer4_consensus.aggregator import AggregatorAgent
        from kg_construction.ontology.ontology_registry import OntologyRegistry

        result: Dict[str, Any] = {
            "nodes": [],
            "edges": [],
            "evidence_paths": [],
            "cypher_records": [],
            "verified_claims": [],
            "failed_queries": [],
            "graph_summary": {},
            "confidence": 0.0,
            "insufficient_entities": False,
        }

        if not entities or len(entities) == 0:
            result["insufficient_entities"] = True
            logger.info("[retrieve_evidence_subgraph] No entities provided, insufficient data")
            return result

        # Limit to first 5 entities for performance
        focus_entities = entities[:5]
        all_nodes: dict[str, dict] = {}
        all_edges: dict[str, dict] = {}
        evidence_paths: list[dict] = []
        cypher_records: list[dict] = []
        verified_claims: list[dict] = []
        failed_queries: list[dict] = []

        intent = intent_obj or await IntentAgent.parse(query, intent_hint=intent_type)
        entity = focus_entities[0]

        # Probe real KG schema
        adj = await asyncio.to_thread(get_adjacent_relations, [entity])
        probe_relations = adj if adj else []

        relation_hint = relation_focus or []

        if not probe_relations:
            result["insufficient_entities"] = True
            logger.info("[retrieve_evidence_subgraph] Probe returned empty for '%s'", entity)
            return result

        try:
            # Beam search: plan Cypher paths for each focus entity
            for ent_name in focus_entities:
                decisions = await IntentPlannerAgent.dynamic_step_plan(
                    query, ent_name, probe_relations, temperature=0.2,
                )
                planner_relations = [_extract_relation_name(dec) for dec in decisions]
                only_stop = not decisions or all(rel in ("<END_OF_SEARCH>", "<BACKTRACK>", "") for rel in planner_relations)
                if only_stop:
                    decisions = _fallback_relation_decisions(probe_relations)
                    logger.warning(
                        "[retrieve_evidence_subgraph] Planner produced no usable relation for '%s'; "
                        "using probe fallback relations=%s",
                        ent_name,
                        json.dumps([d["relation"] for d in decisions], ensure_ascii=False),
                    )
                if not decisions:
                    continue

                # ── Risk mode: filter + re-rank by relation priority ──
                if intent_type == "risk_analysis" and relation_focus:
                    focused = []
                    others = []

                    for dec in decisions:
                        rel_name = _extract_relation_name(dec)
                        base = float(dec.get("score", 0.0) or 0.0)
                        dec["risk_boosted_score"] = base + RISK_RELATION_PRIORITY.get(rel_name, 0.0)
                        if rel_name in RISK_RELATION_PRIORITY:
                            focused.append(dec)
                        else:
                            others.append(dec)

                    decisions = sorted(
                        focused + others[:2],
                        key=lambda d: float(d.get("risk_boosted_score", d.get("score", 0.0)) or 0.0),
                        reverse=True,
                    )

                top_k = 5 if intent_type == "risk_analysis" else 3
                top_decisions = decisions[:top_k]
                for dec in top_decisions:
                    rel = dec.get("relation", "")
                    if rel == "<END_OF_SEARCH>":
                        continue

                    path_str = f"{ent_name} - {rel} - Target"
                    cypher = ExecutorAgent.translate_to_cypher(
                        path_str, expected_type=intent.Expected_Answer_Type,
                    )

                    try:
                        db_res = await ExecutorAgent.execute(cypher, ent_name)
                        if db_res and db_res.results:
                            # Call Verifier to get confidence score
                            if intent_type == "risk_analysis":
                                # 风险模式：语义锚改为 "risk_evidence"，避免
                                # organization 锚过滤掉 MENTION/WORK/REFLECTS
                                original_type = intent.Expected_Answer_Type
                                intent.Expected_Answer_Type = "risk_evidence"
                                gnn_score = await VerifierAgent.verify(
                                    intent, cypher, db_res.results,
                                )
                                intent.Expected_Answer_Type = original_type
                                keep_path = True
                                verifier_confidence = max(0.3, float(gnn_score or 0.0))
                                kept_by = "risk_mode_result_exists"
                            else:
                                # 图谱问答模式：Verifier 作为硬过滤器
                                gnn_score = await VerifierAgent.verify(
                                    intent, cypher, db_res.results,
                                )
                                gnn_valid = float(gnn_score or 0.0) >= 0.4
                                keep_path = bool(gnn_valid)
                                verifier_confidence = float(gnn_score or 0.0)
                                kept_by = "verifier"

                            if keep_path:
                                # Merge nodes/edges directly from db_res.subgraph
                                sg = db_res.subgraph if db_res.subgraph else {"nodes": [], "edges": []}
                                for node in sg.get("nodes", []):
                                    node_id = str(node.get("id") or node.get("name") or node.get("label") or "")
                                    if node_id and node_id not in all_nodes:
                                        all_nodes[node_id] = node
                                for edge in sg.get("edges", []):
                                    # Inject the real relation type from the planner decision
                                    # if the executor left the edge type empty
                                    existing_type = (
                                        edge.get("relation") or edge.get("type")
                                        or edge.get("label") or edge.get("raw_type")
                                    )
                                    if not existing_type:
                                        edge["relation"] = rel
                                        edge["type"] = rel
                                        edge["label"] = rel
                                        edge["raw_type"] = rel
                                    edge_key = (
                                        str(edge.get("source") or ""),
                                        str(edge.get("target") or ""),
                                        str(edge.get("relation") or edge.get("type") or edge.get("label") or ""),
                                    )
                                    if edge_key not in all_edges:
                                        all_edges[edge_key] = edge

                                # Also try the broad Cypher expansion for richer subgraph
                                try:
                                    broad_cypher = self._build_subgraph_cypher(
                                        ent_name, rel, max_hops,
                                    )
                                    broad_rows = await asyncio.to_thread(
                                        db_client.execute_read, broad_cypher, None, 15.0,
                                    )
                                    n, e = RiskAnalysisEngine._collect_subgraph(broad_rows)
                                    all_nodes.update(n)
                                    all_edges.update(e)
                                except Exception as broad_exc:
                                    logger.warning(
                                        "[retrieve_evidence_subgraph] Broad Cypher expansion failed "
                                        "for entity='%s' rel='%s': %s", ent_name, rel, broad_exc
                                    )

                                cypher_records.append({
                                    "entity": ent_name,
                                    "cypher": cypher,
                                    "relation": rel,
                                    "result_count": len(db_res.results),
                                    "is_valid": db_res.is_valid,
                                    "is_empty": db_res.is_empty,
                                    "verifier_score": verifier_confidence,
                                })

                                evidence_paths.append({
                                    "entity": ent_name,
                                    "relation": rel,
                                    "path": path_str,
                                    "cypher": cypher,
                                    "result_count": len(db_res.results),
                                    "score": dec.get("score", 0.0),
                                    "verifier_score": verifier_confidence,
                                    "confidence": verifier_confidence,
                                    "kept_by": kept_by,
                                })

                            verified_claims.append({
                                "claim": f"{ent_name} 通过 {rel} 关联到 {len(db_res.results)} 个节点",
                                "cypher": cypher,
                                "verifier_score": gnn_score,
                                "confidence": min(0.9, 0.5 + verifier_confidence),
                                "kept_by": kept_by,
                            })
                        else:
                            failed_queries.append({
                                "entity": ent_name,
                                "cypher": cypher,
                                "error": db_res.error_log if db_res else "No results",
                            })
                    except Exception as exc:
                        failed_queries.append({
                            "entity": ent_name,
                            "cypher": cypher if 'cypher' in dir() else "N/A",
                            "error": str(exc),
                        })

            raw_node_list = list(all_nodes.values())
            raw_edge_list = list(all_edges.values())
            node_list = [_normalize_subgraph_node(n) for n in raw_node_list]
            node_list = _hydrate_subgraph_node_properties(node_list)
            edge_list = [_normalize_subgraph_edge(e) for e in raw_edge_list]

            # 防御性 fallback：如果 all_nodes 为空但有过成功的 db_res，
            # 说明 _collect_subgraph 可能未正确提取，用 db_res.subgraph 兜底
            if not node_list and not edge_list:
                result["insufficient_entities"] = True
                logger.warning(
                    "[retrieve_evidence_subgraph] nodes=%d edges=%d — insufficient evidence",
                    len(node_list), len(edge_list),
                )
                return result

            # Compute Aggregator overall confidence
            confidence = (
                sum(c.get("confidence", 0.0) for c in verified_claims) / max(len(verified_claims), 1)
                if verified_claims else 0.5
            )

            # Build subgraph summary
            type_counts: dict[str, int] = {}
            for n in node_list:
                et = n.get("entity_type", "")
                if et and et != "Resource" and et != "Unknown":
                    type_counts[et] = type_counts.get(et, 0) + 1

            graph_summary = {
                "node_count": len(node_list),
                "edge_count": len(edge_list),
                "entity_count": len(focus_entities),
                "evidence_path_count": len(evidence_paths),
                "verified_claim_count": len(verified_claims),
                "failed_query_count": len(failed_queries),
                "node_types": type_counts,
            }

            result.update({
                "nodes": node_list,
                "edges": edge_list,
                "evidence_paths": evidence_paths,
                "cypher_records": cypher_records,
                "verified_claims": verified_claims,
                "failed_queries": failed_queries,
                "graph_summary": graph_summary,
                "confidence": round(confidence, 3),
            })

            logger.info(
                "[retrieve_evidence_subgraph] Complete: %d nodes, %d edges, "
                "confidence=%.3f, verified=%d, failed=%d",
                len(node_list), len(edge_list), confidence,
                len(verified_claims), len(failed_queries),
            )

        except Exception as exc:
            logger.exception("[retrieve_evidence_subgraph] Failed: %s", exc)
            result["insufficient_entities"] = not bool(all_nodes)
            if not all_nodes:
                result["graph_summary"] = {"error": str(exc)}

        return result

    @staticmethod
    def _build_subgraph_cypher(entity_name: str, relation: str, max_hops: int) -> str:
        """Build a Cypher query to retrieve the subgraph around an entity."""
        from kg_construction.ontology.ontology_registry import OntologyRegistry
        escaped = entity_name.replace("'", "\\'")
        node_label = OntologyRegistry.get_node_label()
        label_str = f":{node_label}" if node_label else ""
        prop_key = OntologyRegistry.get_entity_matching_strategy().get("property_key", "name")

        return (
            f"MATCH (n{label_str} {{{prop_key}: '{escaped}'}})"
            f"-[r*1..{max_hops}]-(m)"
            f"RETURN n, r, m LIMIT 200"
        )

    async def _community_sidecar(
        self, entity_names: list[str],
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Run community discovery as a side-channel on the retrieved entities.

        Queries Neo4j for the full subgraph between the entity names,
        then runs entity stats, community detection, and entity-community mapping.
        Results are yielded as SSE-compatible events.
        """
        if len(entity_names) < 1:
            return

        try:
            # Use coalesce to match across multiple name properties:
            # name, PERSON_NM, COMPANY_NM, title — covering all entity types
            if len(entity_names) >= 2:
                cypher = """
                MATCH (n) WHERE coalesce(n.name, n.PERSON_NM, n.COMPANY_NM, n.title) IN $names
                OPTIONAL MATCH (n)-[r]-(m) WHERE coalesce(m.name, m.PERSON_NM, m.COMPANY_NM, m.title) IN $names
                RETURN n, r, m LIMIT 200
                """
            else:
                # Single entity: expand to find its neighbors
                cypher = """
                MATCH (n) WHERE coalesce(n.name, n.PERSON_NM, n.COMPANY_NM, n.title) IN $names
                OPTIONAL MATCH (n)-[r]-(m)
                RETURN n, r, m LIMIT 200
                """
            records, _ = await asyncio.to_thread(
                db_client.execute_read_with_summary, cypher, {"names": entity_names}, 10.0,
            )

            nodes, edges = RiskAnalysisEngine._collect_subgraph(records)
            node_list = list(nodes.values())
            edge_list = list(edges.values())

            if len(node_list) < 2:
                return

            entity_stats = RiskAnalysisEngine._compute_entity_stats(node_list)
            community_info = RiskAnalysisEngine._compute_community_discovery(node_list, edge_list)
            entity_comm_map = RiskAnalysisEngine._compute_entity_community_map(
                entity_stats, community_info, node_list, edge_list,
            )

            yield {"entity_stats": entity_stats}
            yield {"community": community_info}
            yield {"entity_community_map": entity_comm_map}

            logger.info(
                "[community-sidecar] Done: %d nodes, %d edges, %d communities, %d entities mapped",
                len(node_list), len(edge_list),
                len(community_info.get("communities", [])),
                len(entity_comm_map.get("entities", [])),
            )
        except Exception as exc:
            logger.exception("[community-sidecar] Failed: %s", exc)

    async def handle_request(
        self, query: str, history: List[str] = None, trace: TraceContext = None,
        hop: int = None, skip_nlg: bool = False
    ) -> AsyncGenerator[Dict[str, Any], None]:
        logger.info(f"[DRAEngine] Handling request: '{query}', hop={hop}, skip_nlg={skip_nlg}")

        # ── Skill Context Initialization ──
        ctx = SkillContext(query=query, history=history or [])
        ctx = await self.skills.execute_hook(SkillHook.PRE_INTENT, ctx)

        yield self._make_stage(
            "intent_parsing", "意图解析", 0, agent="IntentAgent",
            agent_action="提取起点实体与探索限制...", progress=0.0,
        )

        bracket_match = re.search(r"\[(.*?)\]", query)
        bracket_entity = bracket_match.group(1) if bracket_match else ""

        intent = await IntentAgent.parse(query)
        # Bracket entity (from eval data) takes priority over LLM-extracted entity.
        # IntentAgent may hallucinate wrong entity names (e.g. "Theodore Lesieg" for "Dr. Seuss").
        entity = bracket_entity if bracket_entity else (intent.Start_Entities[0] if intent.Start_Entities else "")
        logger.info(f"[DRAEngine] Initial entity: '{entity}' (bracket='{bracket_entity}', llm={intent.Start_Entities})")

        # Normalize Expected_Answer_Type for type filtering
        if intent.Expected_Answer_Type:
            raw_type = intent.Expected_Answer_Type
            normalized = raw_type.replace("/", ".").strip(".")
            intent.Expected_Answer_Type = normalized.split(".")[-1] if "." in normalized else normalized
            logger.info(f"[TypeNorm] Normalized Expected_Answer_Type: '{raw_type}' -> '{intent.Expected_Answer_Type}'")
            logger.info(f"[SemanticAnchor] Cross-layer anchor established: '{intent.Expected_Answer_Type}' (L1 IntentAgent → L4 Aggregator/Verifier)")

        # Ablation D3: disable semantic anchor
        if self.ablation.no_semantic_anchor:
            logger.info("[Ablation:D3] Semantic anchor disabled — clearing Expected_Answer_Type")
            intent.Expected_Answer_Type = ""

        hop = intent.Expected_Hop if hop is None else hop

        # ── Skill: POST_INTENT (EntityResolver cross-validation) ──
        ctx.intent = intent
        ctx.expected_answer_type = intent.Expected_Answer_Type
        ctx = await self.skills.execute_hook(SkillHook.POST_INTENT, ctx)
        # Re-read intent in case EntityResolver modified Start_Entities
        intent = ctx.intent
        # Update entity to use canonicalized form from EntityResolver
        if intent.Start_Entities:
            canonical_entity = intent.Start_Entities[0]
            if canonical_entity and canonical_entity != entity:
                logger.info(
                    f"[DRAEngine] Entity canonicalized by skill: "
                    f"'{entity}' -> '{canonical_entity}'"
                )
                entity = canonical_entity

        # PoG subgoal tracking: convert Constraint_Filters into a checklist
        subgoals = intent.Constraint_Filters if intent.Constraint_Filters else []
        logger.info(f"[PoG] Subgoals from intent: {subgoals}")

        # ── Adaptive Complexity Gating ──
        # Single-hop queries bypass the full multi-agent pipeline. The GatingRouter
        # classifies query complexity from IntentAgent output; 1-hop takes the fast
        # Probe → Classify → Execute path, skipping Planner Ensemble, Verifier, and
        # Aggregator consensus — all unnecessary for direct property lookups.
        gated_mode = GatingRouter.route(intent)
        ctx.gated_mode = gated_mode
        ctx = await self.skills.execute_hook(SkillHook.POST_GATING, ctx)
        gated_mode = ctx.gated_mode  # ComplexityClassifier may override

        if gated_mode == "simple" and entity:
            yield self._make_stage(
                "path_planning", "路径规划", 1, agent="GatingRouter",
                agent_action="自适应门控判定为简单查询，跳过完整多智能体管道...", progress=0.0,
            )

            # Probe real KG schema
            chosen_rel = ""
            cypher = ""
            final_results = []
            probe_detail = ""
            planner_decisions_detail = ""

            adj = await asyncio.to_thread(get_adjacent_relations, [entity])
            probe_detail = f"探针发现 {len(adj)} 个相邻关系:\n" + "\n".join(f"  - {r}" for r in adj[:30]) if adj else "探针未发现任何相邻关系"
            if adj:
                # Single PlannerAgent with low temperature for deterministic classification
                decisions = await IntentPlannerAgent.dynamic_step_plan(
                    query, entity, adj, temperature=0.1
                )
                top = decisions[0] if decisions else {"relation": "<END_OF_SEARCH>", "score": 0.0}
                chosen_rel = top.get("relation", "")
                score = top.get("score", 0.0)
                logger.info(f"[GatingRouter:1Hop] Top relation: '{chosen_rel}' (score={score:.3f})")

                # Capture all planner decisions with reasons for debugging
                planner_decisions_detail = "规划器评分结果:\n"
                for i, d in enumerate(decisions[:10]):
                    rel = d.get("relation", "?")
                    s = d.get("score", 0.0)
                    reason = d.get("reason", "")
                    marker = " ← 选中" if i == 0 else ""
                    planner_decisions_detail += f"  [{i+1}] {rel} (score={s:.3f}){marker}\n"
                    if reason:
                        planner_decisions_detail += f"      理由: {reason}\n"

                if chosen_rel and chosen_rel != "<END_OF_SEARCH>":
                    cypher = ExecutorAgent.translate_to_cypher(
                        f"{entity} - {chosen_rel} - Target",
                        expected_type=intent.Expected_Answer_Type
                    )
                    db_res = await ExecutorAgent.execute(cypher, entity)
                    if db_res and db_res.is_valid and db_res.results:
                        final_results = db_res.results
            else:
                logger.warning("[GatingRouter:1Hop] Probe returned empty — falling back to wildcard")
                from kg_construction.ontology.ontology_registry import OntologyRegistry
                node_label = OntologyRegistry.get_node_label()
                label_str = f":{node_label}" if node_label else ""
                prop_key = OntologyRegistry.get_entity_matching_strategy().get("property_key", "name")
                cypher = f"MATCH (n{label_str} {{{prop_key}: '{entity}'}})-[r]-(m) RETURN DISTINCT m.{prop_key} LIMIT 50"
                try:
                    res = db_client.execute_read(cypher, {"entity": entity})
                    final_results = [row.get(f"m.{prop_key}", "") for row in res] if res else []
                except Exception:
                    final_results = []

            # 1-hop SMASH healing (D1 Vertical closed-loop)
            smash_fixed = False
            if not final_results and not getattr(self.ablation, "no_smash", False):
                logger.warning("[GatingRouter:1Hop] Empty results or Planner failure. Triggering SMASH self-healing...")
                if not cypher:
                    from kg_construction.ontology.ontology_registry import OntologyRegistry
                    node_label = OntologyRegistry.get_node_label()
                    label_str = f":{node_label}" if node_label else ""
                    prop_key = OntologyRegistry.get_entity_matching_strategy().get("property_key", "name")
                    cypher = f"MATCH (n{label_str} {{{prop_key}: '{entity}'}})-[r]-(m{label_str}) RETURN DISTINCT m.{prop_key} LIMIT 50"

                # ── Skill: PRE_HEAL (FailurePatternDB lookup) ──
                ctx.cypher = cypher
                ctx.error_log = "Result is empty or IntentPlanner failed to select a valid relation. Please generate a Cypher query directly based on the user's question."
                ctx = await self.skills.execute_hook(SkillHook.PRE_HEAL, ctx)
                fp_info = ctx.metadata.get("failure_pattern", {})

                error_log = ctx.error_log
                if fp_info.get("skip_llm") and fp_info.get("fix_strategy"):
                    # Apply known fix directly, skip SmashAgent LLM call
                    healed_cypher = fp_info["fix_strategy"]
                    logger.info(f"[FailurePatternDB:1Hop] Applying cached fix, skipping LLM")
                else:
                    healed_cypher = await SmashAgent.reconstruct(query, "1-hop Fast Path", cypher, "EmptyResult/ExtractionFailed", error_log, entity)
                    # Record the pattern for future reuse
                    if healed_cypher and healed_cypher != cypher:
                        self.skills.registry.get("failure_pattern_db")
                        for skill in self.skills.registry.get_for_hook(SkillHook.PRE_HEAL):
                            if hasattr(skill, "store"):
                                skill.store.save(cypher, "empty_result", healed_cypher, error_log)

                if healed_cypher and healed_cypher != cypher:
                    db_res = await ExecutorAgent.execute(healed_cypher, entity)
                    if db_res and db_res.is_valid and db_res.results:
                        final_results = db_res.results
                        cypher = healed_cypher
                        smash_fixed = True

            yield self._make_stage(
                "graph_retrieval", "图谱检索", 2, agent="ExecutorAgent",
                agent_action=f"1-hop 快速通道完成: 关系='{chosen_rel}', 结果数={len(final_results)}",
                progress=1.0,
                trace={
                    "gated_mode": "1hop_fast",
                    "planner_count": 1,
                    "ensemble_temps": [0.1],
                    "smash_fixed": smash_fixed,
                    "semantic_anchor": intent.Expected_Answer_Type,
                    "ablation": {k: v for k, v in self.ablation.__dict__.items() if v},
                }
            )

            best_cypher = cypher
            paths = [f"{entity} - {chosen_rel} - Target"] if chosen_rel else []

            # ── Stage 3: Fact Verification ──
            yield self._make_stage(
                "fact_verification", "事实校验", 3, agent="EntityCleaner",
                agent_action="多层清洗链: 规则过滤 → 类型一致性检查...", progress=0.0,
            )

            # ── Skill: POST_AGGREGATE (EntityCleaner) ──
            ctx.results = final_results
            ctx = await self.skills.execute_hook(SkillHook.POST_AGGREGATE, ctx)
            final_results = ctx.results

            ec_meta = ctx.metadata.get("entity_cleaner", {})
            yield self._make_stage(
                "fact_verification", "事实校验", 3, agent="EntityCleaner",
                agent_action=f"清洗完成: {ec_meta.get('original_count', 0)} → {ec_meta.get('final_count', 0)} 个实体",
                progress=1.0,
            )

            # ── Stage 4: Answer Generation ──
            yield self._make_stage(
                "answer_generation", "答案生成", 4, agent="AggregatorAgent",
                agent_action="生成自然语言回答...", progress=0.0,
            )

            # ── Skill: PRE_NLG (PersonaSelector for NLG persona) ──
            ctx = await self.skills.execute_hook(SkillHook.PRE_NLG, ctx)
            nlg_persona = ctx.metadata.get("persona", {}).get("aggregator_persona", "")

            if skip_nlg:
                final_reasoning = f"最佳路径: {paths[0] if paths else 'N/A'}"
            else:
                final_reasoning = await AggregatorAgent.generate_response(
                    query, final_results, [p for p in paths],
                    system_prompt=nlg_persona
                )

            yield self._make_stage(
                "answer_generation", "答案生成", 4, agent="AggregatorAgent",
                agent_action="回答生成完成", progress=1.0,
            )

            reasoning_log = f"## 多智能体对齐推理日志\n\n"
            reasoning_log += f"### 1. 意图解析 (IntentAgent)\n"
            reasoning_log += f"- **起点实体**: {entity}\n"
            reasoning_log += f"- **预期跳数**: {intent.Expected_Hop}\n"
            reasoning_log += f"- **预期答案类型**: {intent.Expected_Answer_Type or '(未指定)'}\n"
            reasoning_log += f"- **语义约束**: {intent.Constraint_Filters if intent.Constraint_Filters else '(无)'}\n"
            if intent.reasoning:
                reasoning_log += f"- **LLM 思维链**:\n```\n{intent.reasoning}\n```\n"
            reasoning_log += f"\n### 2. 实体规范化 (EntityResolver)\n"
            reasoning_log += f"- 最终使用实体: '{entity}'\n"
            reasoning_log += f"\n### 3. 图谱探测 (Probe)\n"
            reasoning_log += f"{probe_detail}\n"
            reasoning_log += f"\n### 4. 关系规划 (IntentPlannerAgent)\n"
            reasoning_log += f"{planner_decisions_detail}\n"
            reasoning_log += f"\n### 5. 门控路由: 1-hop 快速通道\n"
            reasoning_log += f"- **选择关系**: {chosen_rel}\n"
            reasoning_log += f"- **结果数量**: {len(final_results)} 个实体\n"
            if best_cypher:
                reasoning_log += f"- **执行 Cypher**:\n```cypher\n{best_cypher}\n```\n"
            if smash_fixed:
                reasoning_log += f"- **SMASH 自愈**: 已触发并修复\n"
            reasoning_log += f"\n### 6. 实体清洗 (EntityCleaner)\n"
            reasoning_log += f"- 清洗结果: {ec_meta.get('original_count', 0)} → {ec_meta.get('final_count', 0)} 个实体\n"
            reasoning_log += f"\n### 7. 最终回答 (AggregatorAgent)\n"
            reasoning_log += f"{final_reasoning[:500]}{'...' if len(final_reasoning) > 500 else ''}"

            recommendations = [{"itemId": r, "title": r, "highlight": "Exact Match Entity"} for r in final_results]

            # ── Build subgraph visualization ──
            nodes_viz = []
            edges_viz = []
            if entity:
                from kg_construction.ontology.ontology_registry import OntologyRegistry
                default_type = OntologyRegistry.get_node_label()
                prop_key = OntologyRegistry.get_entity_matching_strategy().get("property_key", "name")

                # Batch-query Neo4j for actual node labels (so PERSON vs COMPANY is distinguished)
                all_names = [entity] + [r for r in final_results[:20] if r != entity]
                name_to_type: dict[str, str] = {}
                try:
                    label_query = f"MATCH (n) WHERE n.{prop_key} IN $names RETURN n.{prop_key} as name, labels(n) as labels"
                    label_res = db_client.execute_read(label_query, {"names": all_names})
                    for row in (label_res or []):
                        n = row.get("name", "")
                        lbls = row.get("labels", [])
                        for lbl in lbls:
                            upper = lbl.upper() if isinstance(lbl, str) else ""
                            if upper in ("COMPANY", "PERSON", "EVENT", "TIME"):
                                name_to_type[n] = upper; break
                            if lbl in ("RiskFeature", "RiskFactor", "Action", "Regulation", "Law"):
                                name_to_type[n] = lbl; break
                except Exception:
                    pass

                entity_type = name_to_type.get(entity, default_type)
                nodes_viz.append({"id": entity, "label": entity, "type": entity_type})
                added_nodes = {entity}
                for res_item in final_results[:20]:
                    if res_item not in added_nodes:
                        item_type = name_to_type.get(res_item, default_type)
                        nodes_viz.append({"id": res_item, "label": res_item, "type": item_type})
                        added_nodes.add(res_item)
                    edges_viz.append({"source": entity, "target": res_item, "type": chosen_rel})

            # ── Community discovery side-channel ──
            entity_names = [entity] + final_results[:20] if entity else final_results[:20]
            async for event in self._community_sidecar(entity_names):
                yield event

            final_output = {
                "data": {
                    "output": {
                        "recommendations": recommendations,
                        "overallReasoning": final_reasoning
                    },
                    "subgraph": {
                        "nodes": nodes_viz,
                        "edges": edges_viz
                    }
                },
                "metadata": {
                    "llm_cypher": best_cypher,
                    "smash_fixed": smash_fixed,
                    "paths": paths,
                    "reasoning_log": reasoning_log
                }
            }
            yield {"output": final_output}
            return

        # ── Multi-hop: Full DRA-MA Pipeline ──
        yield self._make_stage(
            "path_planning", "路径规划", 1, agent="Planner",
            agent_action=f"启动动态拓扑探索，最大跳数={hop}，束宽=3 (门控模式: {gated_mode})...",
            progress=0.0,
        )

        BEAM_SIZE = 3
        beams = [{"path": entity, "current_nodes": [entity], "score": 1.0, "is_frozen": False,
                   "cypher": "", "results": [entity], "healed_flag": 0,
                   "met_subgoals": set(), "subgoals": subgoals, "step_count": 0}]

        for step in range(hop):
            active_beams = [b for b in beams if not b["is_frozen"]]
            if not active_beams:
                break

            yield self._make_stage(
                "path_planning", "路径规划", 1, agent="Probe",
                agent_action=f"[Step {step+1}/{hop}] 并发探针扫描 {len(active_beams)} 个活跃分支的底层 Schema...",
                progress=min(0.3 + step * 0.15, 0.8),
            )

            async def get_cands(b):
                return get_adjacent_relations(b["current_nodes"])

            cands_list = await asyncio.gather(*[get_cands(b) for b in active_beams])

            # ── Dynamic Ensemble (Opt 1): Two-phase confidence-gated planning ──
            # Phase 1: most deterministic planner (temp=0.20) scores all beams.
            # Phase 2: only ambiguous beams (top-1 score < threshold) wake up
            #          the other two planners for full ensemble voting.
            async def plan_step(b, cands, planner):
                prefix = b["path"]
                if b.get("current_nodes"):
                    samples = [str(n) for n in b["current_nodes"][:5] if n]
                    if samples:
                        prefix = f"{b['path']} [中间实体: {', '.join(samples)}]"
                return await planner.score_relations(query, prefix, cands)

            CONFIDENCE_THRESHOLD = 0.85

            # Phase 1: Planner[0] for all beams
            p0_decisions_list = await asyncio.gather(*[
                plan_step(b, cands, self.planners[0])
                for b, cands in zip(active_beams, cands_list)
            ])

            beam_decisions = []
            need_ensemble = []

            for beam_idx, p0_decisions in enumerate(p0_decisions_list):
                top1_score = p0_decisions[0].get("score", 0.0) if p0_decisions else 0.0
                if top1_score >= CONFIDENCE_THRESHOLD or self.ablation.no_ensemble:
                    beam_decisions.append(p0_decisions)
                    logger.info(
                        f"[DynamicEnsemble] Beam {beam_idx} confident "
                        f"(score={top1_score:.3f}), skipping ensemble"
                    )
                else:
                    beam_decisions.append(p0_decisions)  # placeholder
                    need_ensemble.append((beam_idx, active_beams[beam_idx], cands_list[beam_idx]))

            # Phase 2: Full ensemble for ambiguous beams
            if need_ensemble:
                async def ensemble_for_beam(beam_idx, b, cands):
                    p1 = await plan_step(b, cands, self.planners[1])
                    p2 = await plan_step(b, cands, self.planners[2])
                    merged = IntentPlannerAgent.aggregate_ensemble_decisions(
                        [p0_decisions_list[beam_idx], p1, p2]
                    )
                    return beam_idx, merged

                ensemble_results = await asyncio.gather(*[
                    ensemble_for_beam(idx, b, cands) for idx, b, cands in need_ensemble
                ])
                for beam_idx, merged in ensemble_results:
                    beam_decisions[beam_idx] = merged
                    logger.info(
                        f"[DynamicEnsemble] Beam {beam_idx} used full ensemble (3 planners)"
                    )

            yield self._make_stage(
                "path_planning", "路径规划", 1, agent="Planner Ensemble",
                agent_action=f"[Step {step+1}/{hop}] LLM 意图剪枝与全局打分 (Dynamic Ensemble, {len(need_ensemble)}/{len(active_beams)} beams escalated)...",
                progress=min(0.5 + step * 0.15, 0.9),
                trace={
                    "planner_count": len(self.planners),
                    "ensemble_temps": [p.temperature for p in self.planners],
                    "active_beams": len(active_beams),
                    "ensembled_beams": len(need_ensemble),
                    "step": step + 1,
                }
            )

            new_branches = [b for b in beams if b["is_frozen"]]

            for beam, decisions in zip(active_beams, beam_decisions):
                for decision in decisions:
                    rel = decision.get("relation")
                    score = decision.get("score", 0.0)

                    if rel == "<END_OF_SEARCH>":
                        new_beam = beam.copy()
                        new_beam["is_frozen"] = True
                        new_beam["score"] *= score
                        new_branches.append(new_beam)
                    else:
                        new_path = f"{beam['path']} - {rel} - Target"
                        new_cypher = ExecutorAgent.translate_to_cypher(new_path)
                        step_count = beam.get("step_count", 0) + 1
                        # Length-normalized scoring: geometric mean prevents deep-path penalty
                        if beam["score"] > 0 and score > 0:
                            normalized = (beam["score"] ** step_count * score) ** (1.0 / (step_count + 1))
                        else:
                            normalized = beam["score"] * score
                        new_branches.append({
                            "path": new_path,
                            "current_nodes": [],
                            "score": normalized,
                            "is_frozen": False,
                            "cypher": new_cypher,
                            "results": [],
                            "healed_flag": beam["healed_flag"],
                            "met_subgoals": beam.get("met_subgoals", set()).copy(),
                            "subgoals": beam.get("subgoals", []),
                            "step_count": step_count,
                            "backtrack_count": beam.get("backtrack_count", 0),
                            "failed_relations": beam.get("failed_relations", set()).copy(),
                            "_last_top_score": score,
                        })

            new_branches.sort(key=lambda x: x["score"], reverse=True)
            beams_to_fetch = new_branches[:BEAM_SIZE]

            yield self._make_stage(
                "graph_retrieval", "图谱检索", 2, agent="ExecutorAgent",
                agent_action=f"[Step {step+1}/{hop}] 并发执行物理跃迁并提取下一跳中间实体...",
                progress=0.3 + step * 0.2,
            )

            async def fetch_nodes(b):
                """Execute cypher for one beam. On failure, heal once and retry.
                Ablation D1 (no_smash): skip healing, return empty on first failure."""
                if b["is_frozen"]:
                    return b

                db_res = await ExecutorAgent.execute(b["cypher"], entity)
                if db_res and db_res.is_valid and db_res.results:
                    b["results"] = db_res.results
                    b["current_nodes"] = db_res.results
                    b["path"] = b["path"].replace(" - Target", " - Node")
                    for sg in b.get("subgoals", []):
                        if any(sg.lower() in str(r).lower() for r in b["results"]):
                            b["met_subgoals"].add(sg)

                    # ── Adaptive Hop-Termination (Opt 4) ──
                    # Only auto-freeze when the beam has completed its planned hops
                    # (step_count >= hop) OR all subgoals are met. Never freeze on the
                    # first hop of a multi-hop query — intermediate results aren't answers.
                    all_subgoals_met = (
                        len(b.get("subgoals", [])) > 0
                        and b.get("met_subgoals", set()) == set(b.get("subgoals", []))
                    )
                    if all_subgoals_met or b.get("step_count", 0) >= hop:
                        logger.info(
                            f"[AdaptiveTerm] Auto-freezing beam (step={b.get('step_count', 0)}/{hop}, "
                            f"results={len(b['results'])}, subgoals_met={all_subgoals_met})"
                        )
                        b["is_frozen"] = True

                    return b

                # Ablation D1: skip SmashAgent healing
                if self.ablation.no_smash:
                    logger.info(f"[Ablation:D1] SMASH disabled — skipping heal for: {b['cypher'][:80]}")
                    b["current_nodes"] = []
                    return b

                # Tier 1: heal and retry once
                b["healed_flag"] += 1
                error_log = db_res.error_log if db_res and not db_res.is_valid else "Empty results or query"
                b["cypher"] = await SmashAgent.heal(query, b["cypher"], error_log, entity)
                db_res = await ExecutorAgent.execute(b["cypher"], entity)
                if db_res and db_res.is_valid and db_res.results:
                    b["results"] = db_res.results
                    b["current_nodes"] = db_res.results
                    b["path"] = b["path"].replace(" - Target", " - Node")
                    for sg in b.get("subgoals", []):
                        if any(sg.lower() in str(r).lower() for r in b["results"]):
                            b["met_subgoals"].add(sg)

                    # ── Adaptive Hop-Termination (Opt 4) ──
                    # Only auto-freeze when the beam has completed its planned hops
                    # (step_count >= hop) OR all subgoals are met. Never freeze on the
                    # first hop of a multi-hop query — intermediate results aren't answers.
                    all_subgoals_met = (
                        len(b.get("subgoals", [])) > 0
                        and b.get("met_subgoals", set()) == set(b.get("subgoals", []))
                    )
                    if all_subgoals_met or b.get("step_count", 0) >= hop:
                        logger.info(
                            f"[AdaptiveTerm] Auto-freezing beam (step={b.get('step_count', 0)}/{hop}, "
                            f"results={len(b['results'])}, subgoals_met={all_subgoals_met})"
                        )
                        b["is_frozen"] = True

                    return b

                b["current_nodes"] = []
                return b

            fetched_beams = await asyncio.gather(*[fetch_nodes(b) for b in beams_to_fetch])
            beams = [b for b in fetched_beams if b["current_nodes"] or b["is_frozen"]]

            if not beams:
                logger.info(f"[BeamSearch] Early stop at step {step+1}: all beams empty")
                break
            if all(b.get("is_frozen", False) for b in beams):
                logger.info(f"[BeamSearch] Early stop at step {step+1}: all beams frozen")
                break

        yield self._make_stage(
            "fact_verification", "事实校验", 3, agent="VerifierAgent",
            agent_action="完成束搜索，执行最终事实校验...", progress=0.0,
        )

        branch_results = []
        paths = []
        gated_mode = "Dynamic Hop-by-Hop Exploration"

        # ── Skill: PRE_VERIFY (PersonaSelector — inject dataset-aware persona) ──
        ctx = await self.skills.execute_hook(SkillHook.PRE_VERIFY, ctx)

        for b in beams:
            final_path = b["path"]
            if final_path.endswith(" - Node"):
                final_path = final_path[:-len(" - Node")] + " - Target"
            elif not final_path.endswith("Target"):
                final_path += " - Target"

            # 4A.2: Detect entity self-return — paths with no actual relation step
            # produce `MATCH (n) RETURN n`, returning the entity itself instead of answers.
            path_parts = final_path.split(" - ")
            if len(path_parts) <= 2:
                logger.info(f"[SelfReturn] Path '{final_path}' has no relation step, replacing with 1-hop wildcard")
                from kg_construction.ontology.ontology_registry import OntologyRegistry
                node_label = OntologyRegistry.get_node_label()
                label_str = f":{node_label}" if node_label else ""
                prop_key = OntologyRegistry.get_entity_matching_strategy().get("property_key", "name")
                escaped = entity.replace("'", "\\'")
                final_cypher = f"MATCH (n{label_str} {{{prop_key}: '{escaped}'}})-[r]-(m{label_str}) RETURN DISTINCT m.{prop_key} LIMIT 50"
                final_path = f"{entity} - * - Target"
            else:
                final_cypher = ExecutorAgent.translate_to_cypher(final_path, expected_type=intent.Expected_Answer_Type)
            paths.append(final_path)

            db_res = await ExecutorAgent.execute(final_cypher, entity)
            if not (db_res and db_res.is_valid and db_res.results) and len(path_parts) > 2 and intent.Expected_Answer_Type:
                fallback_cypher = ExecutorAgent.translate_to_cypher(final_path, expected_type="")
                if fallback_cypher != final_cypher:
                    logger.info(f"[Fallback] Type-filtered Cypher returned empty, retrying without type constraint")
                    db_res = await ExecutorAgent.execute(fallback_cypher, entity)
                    if db_res and db_res.is_valid and db_res.results:
                        final_cypher = fallback_cypher

            if db_res and db_res.is_valid and db_res.results:
                # ── Skill: use persona-selected system prompt for VerifierAgent ──
                verifier_persona = ctx.metadata.get("persona", {}).get("verifier_persona", "")
                gnn_score = await VerifierAgent.verify(intent, final_cypher, db_res.results, system_prompt=verifier_persona)
                # PoG subgoal bonus: reward branches that satisfy more constraints
                subgoal_bonus = 0.0
                if b.get("subgoals"):
                    subgoal_bonus = 0.1 * (len(b.get("met_subgoals", set())) / len(b["subgoals"]))
                branch_results.append({
                    "path": final_path,
                    "cypher": final_cypher,
                    "results": db_res.results,
                    "is_valid": True,
                    "score": b["score"] + gnn_score + subgoal_bonus,
                    "healed_flag": b["healed_flag"]
                })

        yield self._make_stage(
            "fact_verification", "事实校验", 3, agent="VerifierAgent",
            agent_action="所有分支校验已完成，选中最佳推理路径...", progress=0.7,
        )

        # ── Skill: POST_VERIFY (FeedbackLoop — trigger re-plan on low scores) ──
        ctx.beams = branch_results
        ctx = await self.skills.execute_hook(SkillHook.POST_VERIFY, ctx)

        valid_branches = [b for b in branch_results if b["is_valid"] and b["results"]]
        if not valid_branches:
            yield self._make_stage(
                "fact_verification", "事实校验", 3, agent="SmashAgent",
                agent_action="所有推理分支均未返回结果，启动1-Hop直接关系兜底...", progress=0.85,
            )

            # 1-Hop fallback: single broad query returning ALL adjacent entities
            if entity:
                from kg_construction.ontology.ontology_registry import OntologyRegistry
                node_label = OntologyRegistry.get_node_label()
                label_str = f":{node_label}" if node_label else ""
                prop_key = OntologyRegistry.get_entity_matching_strategy().get("property_key", "name")
                onehop_cypher = (
                    f"MATCH (n{label_str} {{{prop_key}: $entity}})-[r]-(m{label_str}) "
                    f"RETURN DISTINCT m.{prop_key} LIMIT 200"
                )
                try:
                    onehop_res = db_client.execute_read(onehop_cypher, {"entity": entity})
                    if onehop_res:
                        results = [row[f"m.{prop_key}"] for row in onehop_res if row.get(f"m.{prop_key}")]
                        if results:
                            gnn_score = await VerifierAgent.verify(intent, onehop_cypher, results)
                            branch_results.append({
                                "path": f"{entity} - * - Target",
                                "cypher": onehop_cypher,
                                "results": results,
                                "is_valid": True,
                                "score": 0.5 + gnn_score,
                                "healed_flag": 0
                            })
                            logger.info(f"[1Hop-Fallback] Broad 1-hop returned {len(results)} entities")
                except Exception as e:
                    logger.error(f"[1Hop-Fallback] Failed: {e}")

            valid_branches = [b for b in branch_results if b["is_valid"] and b["results"]]
            if not valid_branches:
                yield self._make_stage(
                    "fact_verification", "事实校验", 3, agent="SmashAgent",
                    agent_action="1-Hop兜底也未返回结果，采用原始空分支...", progress=0.95,
                )
                valid_branches = branch_results

        valid_branches = sorted(valid_branches, key=lambda x: x.get("score", 0.0), reverse=True)

        # ── Skill: PRE_AGGREGATE ──
        ctx = await self.skills.execute_hook(SkillHook.PRE_AGGREGATE, ctx)

        yield self._make_stage(
            "answer_generation", "答案生成", 4, agent="AggregatorAgent",
            agent_action="融合多路径证据，最佳路径优先+共识补充策略，终极语义定锚清洗...",
            progress=0.0,
            trace={
                "gated_mode": gated_mode,
                "total_branches": len(branch_results),
                "valid_branches": len(valid_branches),
                "smash_fixed": any(b.get("healed_flag", 0) > 0 for b in branch_results),
                "semantic_anchor": intent.Expected_Answer_Type if not self.ablation.no_semantic_anchor else "",
                "planner_count": len(self.planners),
                "ensemble_temps": [p.temperature for p in self.planners],
                "ablation": {k: v for k, v in self.ablation.__dict__.items() if v},
            }
        )
        final_results = await AggregatorAgent.aggregate_results(
            query, valid_branches,
            expected_answer_type=intent.Expected_Answer_Type
        )

        # ── Skill: POST_AGGREGATE (EntityCleaner — multi-strategy entity cleaning) ──
        ctx.results = final_results
        ctx = await self.skills.execute_hook(SkillHook.POST_AGGREGATE, ctx)
        final_results = ctx.results

        ec_meta = ctx.metadata.get("entity_cleaner", {})
        yield self._make_stage(
            "fact_verification", "事实校验", 3, agent="EntityCleaner",
            agent_action=f"清洗完成: {ec_meta.get('original_count', 0)} → {ec_meta.get('final_count', 0)} 个实体",
            progress=1.0,
        )

        best_cyphers = [b["cypher"] for b in valid_branches if b.get("results")]
        best_cypher = best_cyphers[0] if best_cyphers else ""

        if skip_nlg:
            final_reasoning = f"最佳路径: {valid_branches[0]['path'] if valid_branches else 'N/A'}"
        else:
            # ── Skill: PRE_NLG (PersonaSelector for NLG persona) ──
            ctx = await self.skills.execute_hook(SkillHook.PRE_NLG, ctx)
            nlg_persona = ctx.metadata.get("persona", {}).get("aggregator_persona", "")

            all_paths_used = [b["path"] for b in valid_branches if b.get("results")]
            final_reasoning = await AggregatorAgent.generate_response(
                query, final_results, all_paths_used,
                system_prompt=nlg_persona
            )

        yield self._make_stage(
            "answer_generation", "答案生成", 4, agent="AggregatorAgent",
            agent_action="回答生成完成", progress=1.0,
        )

        reasoning_log = f"## 多智能体对齐推理日志\n\n"
        reasoning_log += f"### 1. 意图解析 (IntentAgent)\n"
        reasoning_log += f"- **起点实体**: {entity}\n"
        reasoning_log += f"- **预期跳数**: {intent.Expected_Hop}\n"
        reasoning_log += f"- **预期答案类型**: {intent.Expected_Answer_Type or '(未指定)'}\n"
        reasoning_log += f"- **语义约束**: {intent.Constraint_Filters if intent.Constraint_Filters else '(无)'}\n"
        if intent.reasoning:
            reasoning_log += f"- **LLM 思维链**:\n```\n{intent.reasoning}\n```\n"
        reasoning_log += f"\n### 2. 实体规范化 (EntityResolver)\n"
        reasoning_log += f"- 最终使用实体: '{entity}'\n"
        reasoning_log += f"\n### 3. 门控路由: {gated_mode}\n"
        reasoning_log += f"- **探索路径数**: {len(paths)} 条\n"
        reasoning_log += f"- **有效分支数**: {len([b for b in branch_results if b['is_valid']])} / {len(branch_results)}\n"
        for i, b in enumerate(valid_branches[:5]):
            reasoning_log += f"- **分支{i+1}**: {b.get('path', '?')} (score={b.get('score', 0):.3f}, results={len(b.get('results', []))})\n"
        reasoning_log += f"\n### 4. 实体清洗 (EntityCleaner)\n"
        reasoning_log += f"- 清洗结果: {ec_meta.get('original_count', 0)} → {ec_meta.get('final_count', 0)} 个实体\n"
        if best_cypher:
            reasoning_log += f"\n### 5. 执行 Cypher:\n```cypher\n{best_cypher}\n```\n"
        reasoning_log += f"\n### 6. 最终回答 (AggregatorAgent)\n"
        reasoning_log += f"{final_reasoning[:500]}{'...' if len(final_reasoning) > 500 else ''}"

        recommendations = [{"itemId": r, "title": r, "highlight": "Exact Match Entity"} for r in final_results]

        nodes_viz = []
        edges_viz = []
        if entity:
            from kg_construction.ontology.ontology_registry import OntologyRegistry
            default_type = OntologyRegistry.get_node_label()
            prop_key = OntologyRegistry.get_entity_matching_strategy().get("property_key", "name")

            # Batch-query Neo4j for actual node labels
            all_res_items: list[str] = []
            for b in valid_branches:
                for res_item in b.get("results", [])[:10]:
                    if res_item not in all_res_items and res_item != entity:
                        all_res_items.append(res_item)
            all_names = [entity] + all_res_items
            name_to_type: dict[str, str] = {}
            try:
                label_query = f"MATCH (n) WHERE n.{prop_key} IN $names RETURN n.{prop_key} as name, labels(n) as labels"
                label_res = db_client.execute_read(label_query, {"names": all_names})
                for row in (label_res or []):
                    n = row.get("name", "")
                    lbls = row.get("labels", [])
                    for lbl in lbls:
                        upper = lbl.upper() if isinstance(lbl, str) else ""
                        if upper in ("COMPANY", "PERSON", "EVENT", "TIME"):
                            name_to_type[n] = upper; break
                        if lbl in ("RiskFeature", "RiskFactor", "Action", "Regulation", "Law"):
                            name_to_type[n] = lbl; break
            except Exception:
                pass

            entity_type = name_to_type.get(entity, default_type)
            nodes_viz.append({"id": entity, "label": entity, "type": entity_type})
            added_nodes = {entity}
            for b in valid_branches:
                for res_item in b.get("results", [])[:10]:
                    if res_item not in added_nodes:
                        item_type = name_to_type.get(res_item, default_type)
                        nodes_viz.append({"id": res_item, "label": res_item, "type": item_type})
                        added_nodes.add(res_item)
                    r_type = "connected_to"
                    parts = b["path"].split(" - ")
                    if len(parts) >= 2:
                        r_type = parts[-2]
                    edges_viz.append({"source": entity, "target": res_item, "type": r_type})

        # ── Community discovery side-channel ──
        mh_entity_names: list[str] = [entity] if entity else []
        for b in valid_branches:
            for res_item in b.get("results", [])[:10]:
                if res_item not in mh_entity_names:
                    mh_entity_names.append(res_item)
        async for event in self._community_sidecar(mh_entity_names):
            yield event

        final_output = {
            "data": {
                "output": {
                    "recommendations": recommendations,
                    "overallReasoning": final_reasoning
                },
                "subgraph": {
                    "nodes": nodes_viz,
                    "edges": edges_viz
                }
            },
            "metadata": {
                "llm_cypher": best_cypher,
                "smash_fixed": any(b.get("healed_flag", 0) > 0 for b in branch_results),
                "paths": paths,
                "reasoning_log": reasoning_log
            }
        }

        yield {"output": final_output}
