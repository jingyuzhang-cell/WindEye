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
