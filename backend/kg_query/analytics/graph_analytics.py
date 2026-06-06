"""Graph analytics algorithms for community detection and pattern discovery.

Community detection algorithms live in the `community/` package and are
accessed via the AlgorithmRegistry. This module retains subgraph retrieval,
centrality, and cycle detection.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Any

import networkx as nx
import numpy as np
from scipy.sparse import lil_matrix

from .community import registry
from .community.utils import layer_filter

logger = logging.getLogger(__name__)

# Keep references for backward compatibility — these are used by other modules
_LAYER_LABEL_MAP: dict[str, list[str]] = {
    "Subject": ["Subject", "COMPANY", "PERSON", "PFCOMPANY", "PFUND", "SECURITY"],
    "Event": ["Event", "EVENT", "TIME", "REGULATOR"],
    "Feature": ["Feature", "RiskFeature", "RiskFactor"],
    "Regulation": ["Regulation", "Law", "Action"],
}
_ALL_VALID_LABELS = [label for labels in _LAYER_LABEL_MAP.values() for label in labels]


def _layer_filter(layer: str | None) -> list[str]:
    if layer and layer in _LAYER_LABEL_MAP:
        return _LAYER_LABEL_MAP[layer]
    return _ALL_VALID_LABELS


class GraphAnalytics:
    """Graph algorithms for the knowledge graph.

    Supported analyses:
    - Community detection (WCC, Louvain, LPA, Leiden, G-N, Spectral, Infomap)
    - Centrality metrics (PageRank, Betweenness)
    - Cycle detection (fund circular flows)
    """

    def __init__(self, db_client: Any = None) -> None:
        self._db = db_client

    # ── Community Detection (registry dispatch) ──────────────────────

    def detect_communities(
        self,
        layer: str | None = None,
        method: str = "wcc",
        max_nodes: int = 5000,
        min_community_size: int = 3,
    ) -> dict[str, Any]:
        """Detect communities using the registered algorithm.

        Args:
            layer: Filter to layer (all/Subject/Event/Feature/Regulation).
            method: Algorithm name (wcc, louvain, label_propagation, leiden,
                    girvan_newman, spectral, infomap).
            max_nodes: Max nodes to analyze.
            min_community_size: Filter out communities smaller than this.

        Returns:
            Dict with communities list and metadata.
        """
        alg = registry.get(method)
        if alg is None:
            known = registry.names()
            return {"success": False, "error": f"Unknown method: {method}. Known: {list(known)}"}

        labels = layer_filter(layer)
        t0 = time.perf_counter()
        try:
            communities, modularity = alg.detect(
                self._db, labels, max_nodes, min_community_size
            )
        except Exception:
            logger.exception("Algorithm %s failed", method)
            return {"success": False, "error": f"Algorithm '{method}' failed"}

        runtime_ms = round((time.perf_counter() - t0) * 1000)

        return {
            "success": True,
            "method": method,
            "modularity": round(modularity, 4),
            "communities_count": len(communities),
            "communities": communities,
            "runtime_ms": runtime_ms,
        }

    def compare_algorithms(
        self,
        layer: str | None = None,
        max_nodes: int = 2000,
        min_community_size: int = 3,
    ) -> dict[str, Any]:
        """Run all registered algorithms and return comparison results."""
        results = []
        labels = layer_filter(layer)

        for alg in registry.list_all():
            t0 = time.perf_counter()
            try:
                communities, modularity = alg.detect(
                    self._db, labels, max_nodes, min_community_size
                )
                runtime_ms = round((time.perf_counter() - t0) * 1000)
                results.append({
                    "method": alg.name,
                    "label": alg.label,
                    "communities_count": len(communities),
                    "modularity": round(modularity, 4),
                    "runtime_ms": runtime_ms,
                    "coverage": round(
                        sum(c["size"] for c in communities) / max(1, max_nodes), 4
                    ),
                    "size_distribution": [c["size"] for c in communities[:20]],
                })
            except Exception:
                logger.exception("Compare: %s failed", alg.name)
                results.append({
                    "method": alg.name,
                    "label": alg.label,
                    "communities_count": 0,
                    "modularity": 0,
                    "runtime_ms": 0,
                    "error": f"{alg.name} failed",
                })

        return {"results": sorted(results, key=lambda r: -r["modularity"])}

    # ── Community Subgraph ───────────────────────────────────────────

    def get_community_subgraph(
        self,
        community_id: int,
        layer: str | None = None,
        limit: int = 200,
    ) -> dict[str, Any]:
        """Return the subgraph for a specific community.

        Re-runs community detection once to get the member_ids list,
        then fetches nodes/edges in standard {nodes, edges} format.
        """
        result = self.detect_communities(layer=layer, method="wcc", min_community_size=1)
        communities = result.get("communities", [])
        if community_id >= len(communities):
            return {"nodes": [], "edges": []}

        comm = communities[community_id]

        # Use stored member_ids (up to 500) from detection result
        entity_ids = comm.get("member_ids", [])
        if not entity_ids:
            # Fallback to top_entities for backward compatibility
            entity_ids = [e["id"] for e in comm.get("top_entities", [])]

        if not entity_ids or self._db is None:
            return {"nodes": [], "edges": []}

        # Fetch nodes by elementId
        try:
            nodes_query = """
            UNWIND $ids AS nid
            MATCH (n) WHERE elementId(n) = nid
            RETURN n
            LIMIT $limit
            """
            from core.database import Neo4jClient

            records, _ = self._db.execute_read_with_summary(
                nodes_query, {"ids": entity_ids, "limit": limit}
            )
            nodes_map: dict[str, dict] = {}
            for record in records:
                node = record.get("n")
                if node:
                    nid = node.element_id
                    if nid not in nodes_map:
                        nodes_map[nid] = Neo4jClient.serialize_node(node)

            # Fetch edges between these nodes — no LIMIT since bounded by |nodes|²
            if len(nodes_map) > 1:
                nid_list = list(nodes_map.keys())
                edges_query = """
                UNWIND $ids AS a_id
                MATCH (a) WHERE elementId(a) = a_id
                MATCH (a)-[r]-(b)
                WHERE elementId(b) IN $ids AND elementId(a) < elementId(b)
                RETURN DISTINCT r
                """
                edge_records, _ = self._db.execute_read_with_summary(
                    edges_query, {"ids": nid_list}
                )
                edges: list[dict] = []
                edge_ids: set[str] = set()
                for record in edge_records:
                    rel = record.get("r")
                    if rel and rel.element_id not in edge_ids:
                        edges.append(Neo4jClient.serialize_relationship(rel))
                        edge_ids.add(rel.element_id)
            else:
                edges = []

            return {"nodes": list(nodes_map.values()), "edges": edges}

        except Exception:
            logger.exception("Community subgraph extraction failed")
            return {"nodes": [], "edges": []}

    # ── Seeded Connected Subgraph + Community Discovery ──────────────

    def discover_seeded_communities(
        self,
        seed_names: list[str] | None = None,
        seed_ids: list[str] | None = None,
        max_hop: int = 2,
        method: str = "louvain",
        min_community_size: int = 2,
        path_limit: int = 2000,
        max_nodes: int = 300,
        relation_whitelist: list[str] | None = None,
        community_mode: str = "expanded",
    ) -> dict[str, Any]:
        """Extract a connected seed subgraph and detect local communities.

        This is the online API version of the workflow in the desktop scripts:
        seed nodes -> N-hop network -> largest connected subgraph -> community
        discovery. It intentionally uses fast local graph algorithms instead of
        request-time HGT training.
        """
        if self._db is None:
            return {"success": False, "error": "Neo4j client is not configured"}

        seed_names = [s.strip() for s in (seed_names or []) if str(s).strip()]
        seed_ids = [str(s).strip() for s in (seed_ids or []) if str(s).strip()]
        max_hop = max(1, min(int(max_hop or 2), 3))
        path_limit = max(50, min(int(path_limit or 2000), 10000))
        max_nodes = max(10, min(int(max_nodes or 300), 5000))
        min_community_size = max(1, int(min_community_size or 2))
        relation_whitelist = [
            str(rel).strip()
            for rel in (relation_whitelist or [])
            if str(rel).strip()
        ]

        if not seed_names and not seed_ids:
            return {"success": False, "error": "seed_names or seed_ids is required"}

        t0 = time.perf_counter()
        seed_nodes = self._resolve_seed_nodes(seed_names, seed_ids)
        resolved_seed_ids = [n["id"] for n in seed_nodes]
        if not resolved_seed_ids:
            return {
                "success": False,
                "error": "No seed nodes matched",
                "input": {"seed_names": seed_names, "seed_ids": seed_ids},
            }

        subgraph = self._extract_seed_connected_subgraph(
            resolved_seed_ids,
            max_hop=max_hop,
            path_limit=path_limit,
            relation_whitelist=relation_whitelist,
        )
        nodes = subgraph.get("nodes", [])
        edges = subgraph.get("edges", [])
        if not nodes:
            return {
                "success": False,
                "error": "No connected subgraph found for seed nodes",
                "seed_nodes": seed_nodes,
            }

        connected = self._largest_connected_component(nodes, edges, resolved_seed_ids)
        connected = self._limit_subgraph_nodes(connected, resolved_seed_ids, max_nodes)
        communities, modularity, selected_method, fallback_reason = self._detect_local_communities(
            connected["nodes"],
            connected["edges"],
            method=method,
            min_community_size=min_community_size,
        )
        seed_community_id = self._find_seed_community_id(communities, resolved_seed_ids)
        community_edges = self._build_community_edges(communities, connected.get("edges", []))
        community_graph = self._build_community_graph(communities, community_edges, seed_community_id)
        entity_map = self._build_entity_community_map(communities)

        runtime_ms = round((time.perf_counter() - t0) * 1000)
        return {
            "success": True,
            "method": selected_method,
            "requested_method": method,
            "selected_method": selected_method,
            "fallback_reason": fallback_reason,
            "runtime_ms": runtime_ms,
            "input": {
                "seed_names": seed_names,
                "seed_ids": seed_ids,
                "max_hop": max_hop,
                "path_limit": path_limit,
                "max_nodes": max_nodes,
                "min_community_size": min_community_size,
                "relation_whitelist": relation_whitelist,
                "community_mode": community_mode,
            },
            "seed_nodes": seed_nodes,
            "subgraph": subgraph,
            "connected_subgraph": connected,
            "node_count": len(connected.get("nodes", [])),
            "edge_count": len(connected.get("edges", [])),
            "communities_count": len(communities),
            "community_count": len(communities),
            "modularity": round(float(modularity or 0.0), 4),
            "seed_community_id": seed_community_id,
            "communities": communities,
            "members": next((c.get("members", []) for c in communities if c.get("community_id") == seed_community_id), []),
            "core_nodes": next((c.get("core_nodes", []) for c in communities if c.get("community_id") == seed_community_id), []),
            "bridge_nodes": next((c.get("bridge_nodes", []) for c in communities if c.get("community_id") == seed_community_id), []),
            "entity_community_map": entity_map,
            "community_edges": community_edges,
            "community_graph": community_graph,
            "visualization": {
                "flow": ["seed_nodes", "n_hop_network", "connected_subgraph", "communities"],
                "default_view": "community_graph",
                "layout": "community-cluster",
                "suggested_layout": "clustered_force",
                "seed_community_id": seed_community_id,
                "highlight_seed_ids": resolved_seed_ids,
            },
        }

    def _resolve_seed_nodes(self, seed_names: list[str], seed_ids: list[str]) -> list[dict[str, Any]]:
        from core.database import Neo4jClient

        nodes: dict[str, dict[str, Any]] = {}
        if seed_ids:
            try:
                records, _ = self._db.execute_read_with_summary(
                    """
                    UNWIND $ids AS nid
                    MATCH (n)
                    WHERE elementId(n) = nid
                    RETURN n, nid AS input
                    LIMIT 100
                    """,
                    {"ids": seed_ids},
                )
                for record in records:
                    node = record.get("n")
                    if node:
                        serialized = Neo4jClient.serialize_node(node)
                        serialized["matched_input"] = record.get("input", "")
                        nodes[serialized["id"]] = serialized
            except Exception:
                logger.exception("Seed id resolution failed")

        if seed_names:
            try:
                records, _ = self._db.execute_read_with_summary(
                    """
                    UNWIND $names AS input_name
                    MATCH (n)
                    WHERE any(label IN labels(n) WHERE label IN [
                        'Subject','COMPANY','PERSON','PFCOMPANY','PFUND','SECURITY'
                    ])
                    WITH input_name, n,
                         coalesce(n.name, n.title, n.COMPANY_NM, n.PERSON_NM,
                                  n.SECURITY_NM, n.FUND_NM, '') AS display_name
                    WHERE display_name <> ''
                      AND (
                           toLower(display_name) = toLower(input_name)
                        OR toLower(display_name) CONTAINS toLower(input_name)
                        OR toLower(input_name) CONTAINS toLower(display_name)
                      )
                    RETURN n, input_name AS input
                    LIMIT 100
                    """,
                    {"names": seed_names},
                )
                for record in records:
                    node = record.get("n")
                    if node:
                        serialized = Neo4jClient.serialize_node(node)
                        serialized["matched_input"] = record.get("input", "")
                        nodes[serialized["id"]] = serialized
            except Exception:
                logger.exception("Seed name resolution failed")

        return list(nodes.values())

    def _extract_seed_connected_subgraph(
        self,
        seed_ids: list[str],
        max_hop: int,
        path_limit: int,
        relation_whitelist: list[str] | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        from core.database import Neo4jClient

        relation_whitelist = relation_whitelist or []
        try:
            records, _ = self._db.execute_read_with_summary(
                f"""
                MATCH (seed)
                WHERE elementId(seed) IN $seed_ids
                MATCH path = (seed)-[*1..{max_hop}]-(neighbor)
                WHERE ($relation_whitelist = [] OR all(rel IN relationships(path) WHERE type(rel) IN $relation_whitelist))
                  AND any(label IN labels(neighbor) WHERE label IN [
                    'Subject','Event','Feature','Regulation',
                    'COMPANY','PERSON','PFCOMPANY','PFUND','SECURITY',
                    'TIME','EVENT','REGULATOR',
                    'RiskFeature','RiskFactor',
                    'Law','Action'
                ])
                WITH path LIMIT $path_limit
                WITH collect(DISTINCT nodes(path)) AS node_paths,
                     collect(DISTINCT relationships(path)) AS rel_paths
                UNWIND node_paths AS np
                UNWIND np AS node
                WITH collect(DISTINCT node) AS nodes, rel_paths
                UNWIND rel_paths AS rp
                UNWIND rp AS rel
                WITH nodes, collect(DISTINCT rel) AS rels
                RETURN nodes, rels
                """,
                {
                    "seed_ids": seed_ids,
                    "path_limit": path_limit,
                    "relation_whitelist": relation_whitelist,
                },
                timeout_seconds=20.0,
            )
        except Exception:
            logger.exception("Seeded subgraph extraction failed")
            records = []

        nodes_map: dict[str, dict[str, Any]] = {}
        edges: list[dict[str, Any]] = []
        edge_ids: set[str] = set()

        for record in records:
            for node in record.get("nodes", []) or []:
                if node and node.element_id not in nodes_map:
                    nodes_map[node.element_id] = Neo4jClient.serialize_node(node)
            for rel in record.get("rels", []) or []:
                if rel and rel.element_id not in edge_ids:
                    edges.append(Neo4jClient.serialize_relationship(rel))
                    edge_ids.add(rel.element_id)

        # If seeds are isolated, still return the seed nodes.
        if not nodes_map:
            try:
                records, _ = self._db.execute_read_with_summary(
                    """
                    UNWIND $seed_ids AS nid
                    MATCH (n) WHERE elementId(n) = nid
                    RETURN n
                    """,
                    {"seed_ids": seed_ids},
                )
                for record in records:
                    node = record.get("n")
                    if node:
                        nodes_map[node.element_id] = Neo4jClient.serialize_node(node)
            except Exception:
                logger.exception("Fallback seed fetch failed")

        return {"nodes": list(nodes_map.values()), "edges": edges}

    def _largest_connected_component(
        self,
        nodes: list[dict[str, Any]],
        edges: list[dict[str, Any]],
        seed_ids: list[str],
    ) -> dict[str, Any]:
        graph = nx.Graph()
        for node in nodes:
            graph.add_node(node["id"])
        for edge in edges:
            src = str(edge.get("source", ""))
            tgt = str(edge.get("target", ""))
            if src and tgt:
                graph.add_edge(src, tgt)

        if graph.number_of_nodes() == 0:
            return {"nodes": [], "edges": [], "seed_coverage": {"present": [], "missing": seed_ids}}

        components = list(nx.connected_components(graph))
        if components:
            seed_set = set(seed_ids)
            components.sort(key=lambda c: (len(seed_set & set(c)), len(c)), reverse=True)
            keep = set(components[0])
        else:
            keep = {nodes[0]["id"]}

        filtered_nodes = [n for n in nodes if n["id"] in keep]
        filtered_edges = [
            e for e in edges
            if str(e.get("source", "")) in keep and str(e.get("target", "")) in keep
        ]
        present = [sid for sid in seed_ids if sid in keep]
        missing = [sid for sid in seed_ids if sid not in keep]
        return {
            "nodes": filtered_nodes,
            "edges": filtered_edges,
            "component_count": len(components),
            "seed_coverage": {
                "present": present,
                "missing": missing,
                "present_count": len(present),
                "missing_count": len(missing),
            },
        }

    def _limit_subgraph_nodes(
        self,
        subgraph: dict[str, Any],
        seed_ids: list[str],
        max_nodes: int,
    ) -> dict[str, Any]:
        nodes = subgraph.get("nodes", [])
        edges = subgraph.get("edges", [])
        if len(nodes) <= max_nodes:
            return subgraph

        degree: dict[str, int] = defaultdict(int)
        for edge in edges:
            src = str(edge.get("source", ""))
            tgt = str(edge.get("target", ""))
            degree[src] += 1
            degree[tgt] += 1

        seed_set = set(seed_ids)
        kept_ids = {
            str(node.get("id", ""))
            for node in sorted(
                nodes,
                key=lambda node: (
                    str(node.get("id", "")) in seed_set,
                    degree.get(str(node.get("id", "")), 0),
                ),
                reverse=True,
            )[:max_nodes]
        }
        filtered_nodes = [node for node in nodes if str(node.get("id", "")) in kept_ids]
        filtered_edges = [
            edge for edge in edges
            if str(edge.get("source", "")) in kept_ids and str(edge.get("target", "")) in kept_ids
        ]
        return {
            **subgraph,
            "nodes": filtered_nodes,
            "edges": filtered_edges,
            "truncated": True,
            "original_node_count": len(nodes),
            "max_nodes": max_nodes,
        }

    def _detect_local_communities(
        self,
        nodes: list[dict[str, Any]],
        edges: list[dict[str, Any]],
        method: str,
        min_community_size: int,
    ) -> tuple[list[dict[str, Any]], float, str, str | None]:
        graph = nx.Graph()
        node_by_id = {str(n.get("id", "")): n for n in nodes}
        for nid in node_by_id:
            graph.add_node(nid)
        for edge in edges:
            src = str(edge.get("source", ""))
            tgt = str(edge.get("target", ""))
            if src in node_by_id and tgt in node_by_id:
                graph.add_edge(src, tgt, weight=float(edge.get("weight", 1) or 1))

        if graph.number_of_nodes() == 0:
            return [], 0.0, "wcc", "empty_graph"

        method = (method or "auto").lower()
        if method == "auto":
            if self._has_hgt_embeddings(nodes) and graph.number_of_nodes() >= 30:
                method = "hgt_gkmeans"
            else:
                method = "wcc" if graph.number_of_nodes() < 30 else "louvain"

        hgt_fallback_reason: str | None = None
        if method == "leiden":
            hgt_fallback_reason = "leiden_local_not_available"
            method = "louvain"
        if method == "hgt_gkmeans":
            try:
                from kg_query.analytics.community.hgt_gkmeans import HGTGKMeansAlgorithm

                groups, modularity, meta = HGTGKMeansAlgorithm.cluster_subgraph(
                    nodes,
                    edges,
                    min_community_size,
                )
                if groups:
                    logger.info(
                        "Community detection selected_method=hgt_gkmeans nodes=%s edges=%s embedding_coverage=%s",
                        graph.number_of_nodes(),
                        graph.number_of_edges(),
                        meta.get("embedding_coverage"),
                    )
                    communities = self._format_local_communities(
                        groups,
                        nodes,
                        edges,
                        graph,
                        min_community_size,
                    )
                    return communities, float(modularity), "hgt_gkmeans", None
                hgt_fallback_reason = str(meta.get("fallback_reason") or "hgt_gkmeans_failed")
            except Exception as exc:
                hgt_fallback_reason = f"hgt_gkmeans_failed:{type(exc).__name__}:{exc}"
            method = "louvain"

        groups, modularity, selected_method, fallback_reason = self._partition_local_graph(graph, method)
        if hgt_fallback_reason:
            fallback_reason = (
                f"{hgt_fallback_reason};{fallback_reason}"
                if fallback_reason else hgt_fallback_reason
            )
        if fallback_reason:
            logger.warning(
                "Community detection fallback_reason=%s requested_method=%s selected_method=%s nodes=%s edges=%s",
                fallback_reason,
                method,
                selected_method,
                graph.number_of_nodes(),
                graph.number_of_edges(),
            )
        else:
            logger.info(
                "Community detection selected_method=%s nodes=%s edges=%s",
                selected_method,
                graph.number_of_nodes(),
                graph.number_of_edges(),
            )

        communities = self._format_local_communities(
            groups,
            nodes,
            edges,
            graph,
            min_community_size,
        )
        return communities, float(modularity), selected_method, fallback_reason

    def _format_local_communities(
        self,
        groups: list[set[str]],
        nodes: list[dict[str, Any]],
        edges: list[dict[str, Any]],
        graph: nx.Graph,
        min_community_size: int,
    ) -> list[dict[str, Any]]:
        node_by_id = {str(n.get("id", "")): n for n in nodes}
        community_by_node: dict[str, int] = {}
        for cid, members in enumerate(sorted(groups, key=len, reverse=True)):
            for node_id in members:
                community_by_node[str(node_id)] = cid

        external_degree: dict[str, int] = defaultdict(int)
        internal_degree: dict[str, int] = defaultdict(int)
        for edge in edges:
            src = str(edge.get("source", ""))
            tgt = str(edge.get("target", ""))
            if not src or not tgt:
                continue
            if community_by_node.get(src) == community_by_node.get(tgt):
                internal_degree[src] += 1
                internal_degree[tgt] += 1
            else:
                external_degree[src] += 1
                external_degree[tgt] += 1

        communities: list[dict[str, Any]] = []
        for members in sorted(groups, key=len, reverse=True):
            if len(members) < min_community_size:
                continue
            member_nodes = [node_by_id[nid] for nid in members if nid in node_by_id]
            label_distribution: dict[str, int] = defaultdict(int)
            for node in member_nodes:
                for label in node.get("labels", []) or ["Unknown"]:
                    label_distribution[str(label)] += 1
            internal_edges = [
                edge for edge in edges
                if str(edge.get("source", "")) in members and str(edge.get("target", "")) in members
            ]
            density = (
                len(internal_edges) / (len(members) * (len(members) - 1) / 2)
                if len(members) > 1 else 0.0
            )
            member_items = sorted(
                [self._community_member_payload(node, graph, internal_degree, external_degree) for node in member_nodes],
                key=lambda item: item["degree"],
                reverse=True,
            )
            top_entities = member_items[:10]
            core_nodes = member_items[: min(5, max(1, len(member_items) // 5 or 1))]
            bridge_nodes = [item for item in member_items if item.get("external_degree", 0) > 0][:10]
            communities.append({
                "community_id": len(communities),
                "size": len(members),
                "density": round(float(density), 4),
                "internal_edges": len(internal_edges),
                "label_distribution": dict(label_distribution),
                "members": member_items[:500],
                "core_nodes": core_nodes,
                "bridge_nodes": bridge_nodes,
                "top_entities": top_entities,
                "member_ids": [node["id"] for node in member_nodes[:500]],
            })

        return communities

    def _community_member_payload(
        self,
        node: dict[str, Any],
        graph: nx.Graph,
        internal_degree: dict[str, int],
        external_degree: dict[str, int],
    ) -> dict[str, Any]:
        node_id = str(node.get("id", ""))
        labels = node.get("labels") or ["Unknown"]
        degree = int(graph.degree(node_id)) if node_id in graph else 0
        role = "member"
        if external_degree.get(node_id, 0) > 0:
            role = "bridge"
        if internal_degree.get(node_id, 0) >= max(1, degree - external_degree.get(node_id, 0)):
            role = "core" if degree >= 2 else role
        return {
            "id": node_id,
            "name": self._node_display_name(node),
            "type": str(labels[0]),
            "label": str(labels[0]),
            "role": role,
            "degree": degree,
            "internal_degree": int(internal_degree.get(node_id, 0)),
            "external_degree": int(external_degree.get(node_id, 0)),
            "risk_level": str((node.get("properties") or {}).get("risk_level", "") or ""),
        }

    @staticmethod
    def _has_hgt_embeddings(nodes: list[dict[str, Any]]) -> bool:
        embedding_keys = {
            "hgt_embedding",
            "hgtEmbedding",
            "graph_embedding",
            "graphEmbedding",
            "aligned_embedding",
            "alignedEmbedding",
            "embedding",
            "vector",
        }
        covered = 0
        for node in nodes:
            props = node.get("properties") or {}
            if any(isinstance(node.get(key, props.get(key)), list) for key in embedding_keys):
                covered += 1
        return covered >= max(2, int(len(nodes) * 0.6))

    def _partition_local_graph(
        self,
        graph: nx.Graph,
        method: str,
    ) -> tuple[list[set[str]], float, str, str | None]:
        fallback_reason: str | None = None

        def wcc(reason: str | None) -> tuple[list[set[str]], float, str, str | None]:
            groups = [set(c) for c in nx.connected_components(graph)]
            return groups, 0.0, "wcc", reason

        def modularity(groups: list[set[str]]) -> float:
            if len(groups) <= 1:
                return 0.0
            try:
                return float(nx.community.modularity(graph, groups, weight="weight"))
            except Exception as exc:
                logger.warning("Community modularity calculation failed: %s", exc)
                return 0.0

        if graph.number_of_edges() == 0:
            return wcc("no_edges")

        if method == "wcc":
            return wcc(None)

        if method == "greedy":
            try:
                groups = [set(c) for c in nx.community.greedy_modularity_communities(graph, weight="weight")]
                return groups, modularity(groups), "greedy", None
            except Exception as exc:
                return wcc(f"greedy_failed:{type(exc).__name__}:{exc}")

        if method != "louvain":
            return wcc(f"unsupported_method:{method}")

        if graph.number_of_nodes() < 30:
            return wcc(f"node_count_lt_30:{graph.number_of_nodes()}")

        try:
            groups = [set(c) for c in nx.community.louvain_communities(graph, weight="weight", seed=42)]
            return groups, modularity(groups), "louvain_networkx", None
        except Exception as exc:
            fallback_reason = f"networkx_louvain_failed:{type(exc).__name__}:{exc}"

        try:
            import community as community_louvain  # type: ignore

            partition = community_louvain.best_partition(graph, weight="weight", random_state=42)
            bucket: dict[int, set[str]] = defaultdict(set)
            for node_id, community_id in partition.items():
                bucket[int(community_id)].add(str(node_id))
            groups = list(bucket.values())
            return groups, modularity(groups), "louvain_python_louvain", fallback_reason
        except Exception as exc:
            reason = f"{fallback_reason};python_louvain_failed:{type(exc).__name__}:{exc}"
            return wcc(reason)

    def _build_entity_community_map(self, communities: list[dict[str, Any]]) -> dict[str, Any]:
        entities: dict[str, dict[str, Any]] = {}
        for community in communities:
            cid = int(community.get("community_id", 0))
            for member in community.get("members", []):
                member_id = str(member.get("id", ""))
                if not member_id:
                    continue
                item = entities.setdefault(member_id, {
                    "id": member_id,
                    "name": member.get("name", member_id),
                    "type": member.get("type", "Unknown"),
                    "communities": [],
                })
                item["name"] = member.get("name", item["name"])
                item["type"] = member.get("type", item["type"])
                item["communities"].append({
                    "community_id": cid,
                    "size": community.get("size", 0),
                    "role": member.get("role", "member"),
                    "is_core": member_id in {n.get("id") for n in community.get("core_nodes", [])},
                    "is_bridge": member_id in {n.get("id") for n in community.get("bridge_nodes", [])},
                })

        entity_list = list(entities.values())
        return {
            "entities": entity_list,
            "by_id": {item["id"]: item for item in entity_list},
            "mapped_count": len(entities),
            "unmapped_count": 0,
        }

    def _find_seed_community_id(
        self,
        communities: list[dict[str, Any]],
        seed_ids: list[str],
    ) -> int | None:
        seed_set = set(seed_ids)
        best: tuple[int, int] | None = None
        for community in communities:
            cid = int(community.get("community_id", 0))
            overlap = len(seed_set & set(community.get("member_ids", [])))
            if overlap > 0 and (best is None or overlap > best[1]):
                best = (cid, overlap)
        return best[0] if best else None

    def _build_community_edges(
        self,
        communities: list[dict[str, Any]],
        edges: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        community_by_node: dict[str, int] = {}
        for community in communities:
            cid = int(community.get("community_id", 0))
            for member_id in community.get("member_ids", []):
                community_by_node[str(member_id)] = cid

        buckets: dict[tuple[int, int], dict[str, Any]] = {}
        for edge in edges:
            src = str(edge.get("source", ""))
            tgt = str(edge.get("target", ""))
            src_cid = community_by_node.get(src)
            tgt_cid = community_by_node.get(tgt)
            if src_cid is None or tgt_cid is None or src_cid == tgt_cid:
                continue
            key = (src_cid, tgt_cid) if src_cid < tgt_cid else (tgt_cid, src_cid)
            item = buckets.setdefault(key, {
                "source_community": key[0],
                "target_community": key[1],
                "relation_count": 0,
                "main_relations": defaultdict(int),
                "risk_level": "low",
            })
            item["relation_count"] += 1
            relation = str(edge.get("relation") or edge.get("type") or edge.get("label") or "RELATED")
            item["main_relations"][relation] += 1

        results: list[dict[str, Any]] = []
        for item in buckets.values():
            relation_count = int(item["relation_count"])
            risk_level = "high" if relation_count >= 8 else "medium" if relation_count >= 3 else "low"
            main_relations = [
                rel for rel, _ in sorted(item["main_relations"].items(), key=lambda kv: kv[1], reverse=True)[:5]
            ]
            results.append({
                "source_community": item["source_community"],
                "target_community": item["target_community"],
                "relation_count": relation_count,
                "risk_level": risk_level,
                "main_relations": main_relations,
            })
        return sorted(results, key=lambda item: item["relation_count"], reverse=True)

    def _build_community_graph(
        self,
        communities: list[dict[str, Any]],
        community_edges: list[dict[str, Any]],
        seed_community_id: int | None,
    ) -> dict[str, list[dict[str, Any]]]:
        nodes = []
        for community in communities:
            cid = int(community.get("community_id", 0))
            nodes.append({
                "id": f"community-{cid}",
                "community_id": cid,
                "label": f"群体 #{cid}",
                "size": community.get("size", 0),
                "density": community.get("density", 0),
                "risk_score": community.get("risk_score"),
                "seed_related": cid == seed_community_id,
                "top_entities": [
                    item.get("name")
                    for item in community.get("top_entities", [])[:5]
                    if item.get("name")
                ],
                "core_nodes": community.get("core_nodes", [])[:5],
                "bridge_nodes": community.get("bridge_nodes", [])[:5],
            })
        graph_edges = [
            {
                "source": f"community-{edge['source_community']}",
                "target": f"community-{edge['target_community']}",
                **edge,
            }
            for edge in community_edges
        ]
        return {"nodes": nodes, "edges": graph_edges}

    @staticmethod
    def _node_display_name(node: dict[str, Any]) -> str:
        props = node.get("properties") or {}
        return str(
            props.get("name")
            or props.get("title")
            or props.get("COMPANY_NM")
            or props.get("PERSON_NM")
            or props.get("SECURITY_NM")
            or props.get("FUND_NM")
            or node.get("id")
            or "(unnamed)"
        )

    # ── Centrality ───────────────────────────────────────────────────

    def compute_centrality(
        self,
        centrality_type: str = "pagerank",
        layer: str | None = None,
        top_n: int = 100,
    ) -> list[dict[str, Any]]:
        """Compute centrality scores.

        Args:
            centrality_type: "pagerank" or "betweenness".
            layer: Layer filter.
            top_n: Return top N nodes.

        Returns:
            List of {node_id, name, labels, score} sorted by score descending.
        """
        if self._db is None:
            return []

        labels = _layer_filter(layer)
        label_conditions = " OR ".join([f"n:{lbl}" for lbl in labels])

        edges_query = f"""
        MATCH (n)-[r]->(m)
        WHERE ({label_conditions}) AND ({label_conditions.replace('n:', 'm:')})
        RETURN elementId(n) AS src, elementId(m) AS tgt
        LIMIT 10000
        """
        try:
            records, _ = self._db.execute_read_with_summary(edges_query, {})
        except Exception:
            logger.exception("Centrality edge extraction failed")
            return []

        if not records:
            return []

        node_set: set[str] = set()
        edges: list[tuple[str, str]] = []
        for rec in records:
            src = str(rec.get("src", ""))
            tgt = str(rec.get("tgt", ""))
            if src and tgt:
                node_set.add(src)
                node_set.add(tgt)
                edges.append((src, tgt))

        node_ids = list(node_set)
        node_to_idx = {n: i for i, n in enumerate(node_ids)}
        n = len(node_ids)

        if centrality_type == "pagerank":
            scores = self._pagerank(n, node_to_idx, edges)
        elif centrality_type == "betweenness":
            scores = self._betweenness(n, node_to_idx, edges)
        else:
            return []

        # Sort by score descending
        sorted_indices = np.argsort(scores)[::-1][:top_n]

        # Resolve names
        top_ids = [node_ids[i] for i in sorted_indices]
        name_map: dict[str, tuple[str, list[str]]] = {}
        try:
            for start in range(0, len(top_ids), 200):
                batch = top_ids[start : start + 200]
                name_query = """
                UNWIND $ids AS nid
                MATCH (n) WHERE elementId(n) = nid
                RETURN elementId(n) AS nid,
                       coalesce(n.name, n.title, n.COMPANY_NM, n.factor_nm, n.regulation_name, '(unnamed)') AS name,
                       labels(n) AS lbls
                """
                name_records, _ = self._db.execute_read_with_summary(
                    name_query, {"ids": batch}
                )
                for rec in name_records:
                    name_map[str(rec.get("nid", ""))] = (
                        str(rec.get("name", "")),
                        [l for l in (rec.get("lbls") or []) if l in _ALL_VALID_LABELS],
                    )
        except Exception:
            logger.exception("Name resolution failed")

        result = []
        for i in sorted_indices:
            nid = node_ids[i]
            name, lbls = name_map.get(nid, ("(unnamed)", []))
            result.append({
                "node_id": nid,
                "name": name,
                "labels": lbls,
                "score": round(float(scores[i]), 6),
            })

        return result

    def _pagerank(
        self,
        n: int,
        node_to_idx: dict[str, int],
        edges: list[tuple[str, str]],
        damping: float = 0.85,
        max_iter: int = 100,
    ) -> np.ndarray:
        """Simple PageRank implementation."""
        adj = lil_matrix((n, n), dtype=np.float64)
        out_degree = np.zeros(n)
        for src, tgt in edges:
            i, j = node_to_idx[src], node_to_idx[tgt]
            adj[i, j] = 1
            out_degree[i] += 1

        # Handle dangling nodes
        for i in range(n):
            if out_degree[i] == 0:
                adj[i, :] = 1
                out_degree[i] = n

        # Row-normalize
        for i in range(n):
            adj[i, :] /= out_degree[i]

        adj = adj.tocsr()
        pr = np.ones(n) / n
        teleport = np.ones(n) / n

        for _ in range(max_iter):
            new_pr = (1 - damping) * teleport + damping * (adj.T.dot(pr))
            if np.abs(new_pr - pr).sum() < 1e-8:
                break
            pr = new_pr

        return pr

    def _betweenness(
        self,
        n: int,
        node_to_idx: dict[str, int],
        edges: list[tuple[str, str]],
    ) -> np.ndarray:
        """Approximate betweenness centrality using BFS from sample nodes."""
        adj_list: dict[int, list[int]] = defaultdict(list)
        for src, tgt in edges:
            i, j = node_to_idx[src], node_to_idx[tgt]
            adj_list[i].append(j)
            adj_list[j].append(i)

        betweenness = np.zeros(n)
        sample_size = min(n, 50)

        for source in np.random.choice(n, sample_size, replace=False):
            source = int(source)  # type narrowing
            # BFS
            stack: list[int] = []
            predecessors: dict[int, list[int]] = defaultdict(list)
            sigma = np.zeros(n)
            sigma[source] = 1
            dist = np.full(n, -1)
            dist[source] = 0
            queue = [source]

            while queue:
                v = queue.pop(0)
                stack.append(v)
                for w in adj_list[v]:
                    if dist[w] < 0:
                        dist[w] = dist[v] + 1
                        queue.append(w)
                    if dist[w] == dist[v] + 1:
                        sigma[w] += sigma[v]
                        predecessors[w].append(v)

            # Back-propagation
            delta = np.zeros(n)
            while stack:
                w = stack.pop()
                for pred in predecessors[w]:
                    delta[pred] += (sigma[pred] / sigma[w]) * (1 + delta[w])
                if w != source:
                    betweenness[w] += delta[w]

        return betweenness

    # ── Cycle Detection ──────────────────────────────────────────────

    def detect_cycles(
        self, layer: str | None = None, max_cycles: int = 50
    ) -> list[list[str]]:
        """Find directed cycles indicating circular fund flows.

        Uses DFS-based cycle detection on the extracted directed graph.
        """
        if self._db is None:
            return []

        labels = _layer_filter(layer)
        label_conditions = " OR ".join([f"n:{lbl}" for lbl in labels])

        edges_query = f"""
        MATCH (n)-[r]->(m)
        WHERE ({label_conditions}) AND ({label_conditions.replace('n:', 'm:')})
        RETURN elementId(n) AS src, elementId(m) AS tgt
        LIMIT 5000
        """
        try:
            records, _ = self._db.execute_read_with_summary(edges_query, {})
        except Exception:
            logger.exception("Cycle detection edge extraction failed")
            return []

        adj_list: dict[str, list[str]] = defaultdict(list)
        node_set: set[str] = set()
        for rec in records:
            src = str(rec.get("src", ""))
            tgt = str(rec.get("tgt", ""))
            if src and tgt:
                adj_list[src].append(tgt)
                node_set.add(src)
                node_set.add(tgt)

        cycles: list[list[str]] = []
        visited: set[str] = set()
        rec_stack: set[str] = set()
        path: list[str] = []

        def dfs(node: str) -> None:
            if len(cycles) >= max_cycles:
                return
            visited.add(node)
            rec_stack.add(node)
            path.append(node)

            for neighbor in adj_list.get(node, []):
                if neighbor in rec_stack:
                    cycle_start = path.index(neighbor)
                    cycles.append(path[cycle_start:] + [neighbor])
                    if len(cycles) >= max_cycles:
                        return
                elif neighbor not in visited:
                    dfs(neighbor)

            path.pop()
            rec_stack.discard(node)

        for start_node in list(node_set):
            if len(cycles) >= max_cycles:
                break
            if start_node not in visited:
                dfs(start_node)

        return cycles[:max_cycles]
