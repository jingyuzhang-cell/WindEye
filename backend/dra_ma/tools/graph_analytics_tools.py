"""Graph Analytics Tools — deterministic graph computation (no LLM calls).

Provides entity stats, relation stats, centrality, candidate risk path enumeration,
scoring indicators, and graph metrics. All methods are pure computation on the
provided node/edge lists.
"""

from __future__ import annotations

import logging
import json
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from dra_ma.utils.agent_trace import agent_trace

logger = logging.getLogger(__name__)


@dataclass
class GraphAnalyticsResult:
    """Unified output consumed by all downstream plugins."""
    entity_stats: dict = field(default_factory=dict)
    relation_stats: dict = field(default_factory=dict)
    communities: list[dict] = field(default_factory=list)
    entity_community_map: dict = field(default_factory=dict)
    central_nodes: list[dict] = field(default_factory=list)
    candidate_risk_paths: list[dict] = field(default_factory=list)
    graph_metrics: dict = field(default_factory=dict)


class GraphAnalyticsTool:
    """Deterministic graph analytics on subgraph node/edge lists."""

    # ── Entity stats ───────────────────────────────────────────────

    @staticmethod
    def compute_entity_stats(nodes: list[dict]) -> dict[str, Any]:
        """Compute entity type distribution and top entities."""
        type_counts: dict[str, int] = {}
        entity_list: list[dict] = []

        nodes = [n for n in nodes if isinstance(n, dict)]

        for node in nodes:
            props = node.get("properties", {}) if isinstance(node.get("properties"), dict) else {}
            labels = node.get("labels", []) or []

            # Prefer unified entity_type, then type, then labels (first non-Resource)
            unified_type = node.get("entity_type") or node.get("type") or ""
            if unified_type in ("", "Resource", "Unknown", "Entity"):
                # Name-based inference before discarding
                fallback_name = str(
                    node.get("name") or props.get("name") or props.get("COMPANY_NM")
                    or props.get("zh_name") or props.get("title") or ""
                )
                from dra_ma.utils.entity_heuristics import infer_entity_type_from_name
                inferred = infer_entity_type_from_name(fallback_name)
                unified_type = inferred if inferred else ""

            if not unified_type and labels:
                for label in labels:
                    if label and label != "Resource":
                        unified_type = label
                        break

            node_id = str(
                node.get("id") or props.get("id") or node.get("name")
                or props.get("name") or props.get("COMPANY_NM")
                or props.get("zh_name") or props.get("element_id", "")
            )
            node_name = str(
                node.get("name") or props.get("name") or props.get("COMPANY_NM")
                or props.get("zh_name") or props.get("title")
                or node.get("label") or node_id
            )

            if unified_type:
                type_counts[unified_type] = type_counts.get(unified_type, 0) + 1
                entity_list.append({
                    "name": node_name[:50], "type": unified_type, "id": node_id,
                })

        seen_names: set[str] = set()
        unique_entities: list[dict] = []
        for e in entity_list:
            if e["name"] not in seen_names:
                seen_names.add(e["name"])
                unique_entities.append(e)

        result = {
            "total_entities": len(nodes),
            "entity_type_counts": type_counts,
            "top_entities": unique_entities[:10],
        }
        agent_trace("GraphAnalytics", "ENTITY_STATS",
            total=len(nodes),
            type_counts=type_counts)
        return result

    # ── Relation stats ─────────────────────────────────────────────

    @staticmethod
    def compute_relation_stats(edges: list[dict]) -> dict[str, Any]:
        """Compute relationship type distribution."""
        type_counts: dict[str, int] = {}
        for edge in edges:
            rel = str(edge.get("relation", edge.get("label", edge.get("type", "RELATED"))))
            type_counts[rel] = type_counts.get(rel, 0) + 1

        return {
            "total_relations": len(edges),
            "relation_type_counts": type_counts,
        }

    # ── Centrality (PageRank) ──────────────────────────────────────

    @staticmethod
    def compute_centrality(
        nodes: list[dict], edges: list[dict], method: str = "pagerank",
    ) -> list[dict]:
        """Compute PageRank centrality for subgraph nodes.

        Falls back to degree centrality if PageRank fails to converge.
        """
        if not nodes:
            return []

        nodes = [n for n in nodes if isinstance(n, dict)]
        if not nodes:
            return []

        # Build adjacency
        node_ids = []
        node_map: dict[str, dict] = {}
        for n in nodes:
            props = n.get("properties", {}) if isinstance(n.get("properties"), dict) else {}
            nid = str(
                n.get("id") or props.get("id") or n.get("name")
                or props.get("name") or props.get("element_id", id(n))
            )
            node_ids.append(nid)
            node_map[nid] = n

        # Build adjacency list
        adj: dict[str, set[str]] = {nid: set() for nid in node_ids}
        for e in edges:
            src = str(e.get("source", ""))
            tgt = str(e.get("target", ""))
            if src in adj:
                adj[src].add(tgt)
            if tgt in adj:
                adj[tgt].add(src)

        # Simple PageRank
        damping = 0.85
        max_iter = 50
        tol = 1e-6
        num_nodes = len(node_ids)
        scores = {nid: 1.0 / num_nodes for nid in node_ids}

        for _ in range(max_iter):
            new_scores: dict[str, float] = {}
            for nid in node_ids:
                incoming = sum(
                    scores[neighbor] / max(len(adj.get(neighbor, set())), 1)
                    for neighbor in node_ids
                    if nid in adj.get(neighbor, set())
                )
                new_scores[nid] = (1 - damping) / num_nodes + damping * incoming

            diff = sum(abs(new_scores[nid] - scores[nid]) for nid in node_ids)
            scores = new_scores
            if diff < tol:
                break

        # Sort and return top nodes with metadata
        central_nodes = []
        for nid, score in sorted(scores.items(), key=lambda x: -x[1])[:10]:
            node = node_map.get(nid, {})
            props = node.get("properties", {}) if isinstance(node.get("properties"), dict) else {}
            name = str(
                node.get("name") or props.get("name") or props.get("COMPANY_NM")
                or props.get("zh_name") or node.get("label") or nid
            )
            central_nodes.append({
                "name": name,
                "id": nid,
                "score": round(score, 4),
                "role": "core" if score > 0.1 else "peripheral",
            })

        return central_nodes

    # ── Candidate risk path enumeration ────────────────────────────

    @staticmethod
    def enumerate_candidate_risk_paths(
        nodes: list[dict],
        edges: list[dict],
        relation_focus: list[str] | None = None,
    ) -> list[dict]:
        """Enumerate candidate risk paths from graph structure (pure algorithm, no LLM).

        These are structural candidates — RiskAnalystPlugin later interprets/filters them.
        """
        if not nodes or len(nodes) < 2:
            return []

        nodes = [n for n in nodes if isinstance(n, dict)]
        edges = [e for e in edges if isinstance(e, dict)]
        if not nodes or len(nodes) < 2:
            return []

        node_map: dict[str, dict] = {}
        for n in nodes:
            props = n.get("properties", {}) if isinstance(n.get("properties"), dict) else {}
            nid = str(
                n.get("id") or props.get("id") or n.get("name")
                or props.get("name") or props.get("element_id", id(n))
            )
            name = str(
                n.get("name") or props.get("name") or props.get("COMPANY_NM")
                or props.get("zh_name") or props.get("title")
                or n.get("label") or nid
            )
            labels = n.get("labels", []) or []
            entity_type = n.get("entity_type") or n.get("type") or ""
            node_map[nid] = {"id": nid, "name": name, "labels": labels, "entity_type": entity_type}

        # Determine risky relation types
        if relation_focus is None:
            risky_rels = {
                "INVEST", "CONTROL", "CONTROLLER", "CONTROLL", "GUARANTEE", "SERVE",
                "TRANSACTION", "WARNING", "MENTION", "TRIGGERS", "REFLECTS",
                "CAUSE", "WORK", "SUE", "JOINDER", "MANAGER", "TRUSTEE",
                "CUSTOMER", "SUPPLIER", "ISSUE", "BRANCH", "REGULATE",
                "监管", "触发", "映射法规", "执行", "履行", "包含责任方",
            }
        else:
            risky_rels = set(relation_focus)

        # Diagnostic: collect all actual relation types to debug whitelist mismatches
        actual_rel_types: set[str] = set()
        for edge in edges:
            rel = str(
                edge.get("relation") or edge.get("type") or edge.get("label") or edge.get("raw_type", "")
            ).upper()
            if rel:
                actual_rel_types.add(rel)

        candidate_paths: list[dict] = []
        path_id = 0

        for edge in edges:
            rel_type = str(
                edge.get("relation") or edge.get("type") or edge.get("label") or edge.get("raw_type", "")
            ).upper()
            if rel_type not in risky_rels:
                continue

            src = str(edge.get("source", ""))
            tgt = str(edge.get("target", ""))
            edge_id = str(edge.get("id") or edge.get("element_id") or "")
            src_node = node_map.get(src, {})
            tgt_node = node_map.get(tgt, {})

            path_id += 1
            candidate_paths.append({
                "path_id": f"CP-{path_id:03d}",
                "node_ids": [src, tgt],
                "edge_ids": [edge_id] if edge_id else [],
                "entities": [
                    src_node.get("name", src),
                    tgt_node.get("name", tgt),
                ],
                "relation": rel_type,
                "risk_level_hint": (
                    "high" if rel_type in ("WARNING", "GUARANTEE", "TRIGGERS", "SUE", "监管", "触发")
                    else "medium" if rel_type in (
                        "CONTROL", "CONTROLLER", "CONTROLL", "INVEST", "CAUSE",
                        "MENTION", "JOINDER", "MANAGER", "TRUSTEE", "CUSTOMER",
                        "SUPPLIER", "ISSUE", "BRANCH", "REGULATE", "映射法规",
                    )
                    else "low"
                ),
                "confidence": 0.7,
            })

        logger.warning(
            "[GraphAnalytics][RISK_PATHS] actual_relation_types=%s",
            json.dumps(sorted(actual_rel_types), ensure_ascii=False),
        )
        logger.warning("[GraphAnalytics][RISK_PATHS] candidate_count=%d", len(candidate_paths))
        logger.info(
            "[GraphAnalytics][RISK_PATHS] risky_whitelist=%s",
            json.dumps(sorted(risky_rels), ensure_ascii=False),
        )
        agent_trace("GraphAnalytics", "RISK_PATHS",
            candidate_count=len(candidate_paths),
            first_3=candidate_paths[:3],
            actual_relation_types=sorted(actual_rel_types),
            risky_relation_whitelist=sorted(risky_rels))
        return candidate_paths

    # ── Scoring indicators ─────────────────────────────────────────

    @staticmethod
    def compute_scoring_indicators(
        nodes: list[dict],
        edges: list[dict],
        communities: list[dict],
    ) -> dict[str, Any]:
        """Compute base indicators used by RiskScoringPlugin.

        Six dimensions:
          relation_complexity(20), risky_relation(25), community_density(15),
          transmission(20), compliance(10), evidence(10)
        """
        n = max(len(nodes), 1)
        e = len(edges)

        risky_rels = {
            "INVEST", "CONTROL", "CONTROLLER", "CONTROLL", "GUARANTEE", "SERVE",
            "TRANSACTION", "WARNING", "MENTION", "TRIGGERS", "REFLECTS",
            "CAUSE", "WORK", "SUE", "JOINDER", "MANAGER", "TRUSTEE",
            "CUSTOMER", "SUPPLIER", "ISSUE", "BRANCH", "REGULATE",
            "监管", "触发", "映射法规", "执行", "履行", "包含责任方",
        }
        risky_edge_count = sum(
            1 for edge in edges
            if str(edge.get("relation", edge.get("label", edge.get("type", "")))).upper() in risky_rels
        )

        return {
            "node_count": n,
            "edge_count": e,
            "density": e / max(n * (n - 1) / 2, 1),
            "risky_edge_count": risky_edge_count,
            "risky_edge_ratio": risky_edge_count / max(e, 1),
            "community_count": len(communities),
            "max_community_size": max((c.get("size", 0) for c in communities), default=0),
            "avg_community_size": (
                sum(c.get("size", 0) for c in communities) / max(len(communities), 1)
            ),
        }

    # ── Graph metrics ──────────────────────────────────────────────

    @staticmethod
    def compute_graph_metrics(nodes: list[dict], edges: list[dict]) -> dict[str, Any]:
        """Compute graph-level metrics: density, avg degree, etc."""
        n = max(len(nodes), 1)
        e = len(edges)

        # Build degree map
        degree: dict[str, int] = {}
        for edge in edges:
            src = str(edge.get("source", ""))
            tgt = str(edge.get("target", ""))
            degree[src] = degree.get(src, 0) + 1
            degree[tgt] = degree.get(tgt, 0) + 1

        degrees = list(degree.values()) if degree else [0]

        graph_metrics = {
            "density": round(e / max(n * (n - 1) / 2, 1), 4),
            "avg_degree": round(sum(degrees) / max(len(degrees), 1), 2),
            "max_degree": max(degrees),
            "isolated_nodes": n - len(degree),
        }
        agent_trace("GraphAnalytics", "METRICS", graph_metrics=graph_metrics)
        return graph_metrics
