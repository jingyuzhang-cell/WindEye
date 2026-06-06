"""HGT embedding + Graph K-means community detection.

This algorithm consumes precomputed heterogeneous graph embeddings stored on
Neo4j nodes. It does not train HGT online; request-time training would make the
API too slow and hard to reproduce. If embeddings are unavailable, callers
should fall back to Louvain/WCC and expose the fallback reason.
"""

from __future__ import annotations

import logging
from collections import Counter, defaultdict
from math import sqrt
from typing import Any

import networkx as nx
import numpy as np
from sklearn.cluster import KMeans

from ..community.base import BaseCommunityAlgorithm
from ..community.utils import build_community_list

logger = logging.getLogger(__name__)

_EMBEDDING_KEYS = (
    "hgt_embedding",
    "hgtEmbedding",
    "graph_embedding",
    "graphEmbedding",
    "aligned_embedding",
    "alignedEmbedding",
    "embedding",
    "vector",
)


def _node_name(node: dict[str, Any]) -> str:
    props = node.get("properties") or {}
    return str(
        node.get("name")
        or node.get("title")
        or node.get("label")
        or props.get("name")
        or props.get("title")
        or props.get("COMPANY_NM")
        or props.get("PERSON_NM")
        or props.get("SECURITY_NM")
        or node.get("id")
        or ""
    )


def _node_labels(node: dict[str, Any]) -> list[str]:
    labels = node.get("labels") or []
    if labels:
        return [str(label) for label in labels]
    node_type = node.get("type") or node.get("entity_type") or node.get("entityType")
    return [str(node_type)] if node_type else ["Unknown"]


def _extract_embedding(node: dict[str, Any]) -> list[float] | None:
    props = node.get("properties") or {}
    for key in _EMBEDDING_KEYS:
        value = node.get(key, props.get(key))
        if isinstance(value, list) and value:
            try:
                return [float(item) for item in value]
            except (TypeError, ValueError):
                return None
    return None


class HGTGKMeansAlgorithm(BaseCommunityAlgorithm):
    name = "hgt_gkmeans"
    label = "HGT + Graph K-means"
    description = "基于预训练 HGT 节点向量的 Graph K-means 潜在异常群体发现"
    complexity = "O(n·k·d·iter), requires precomputed HGT embeddings"
    params = {
        "embedding_keys": list(_EMBEDDING_KEYS),
        "fallback": "louvain -> wcc",
    }

    @staticmethod
    def cluster_subgraph(
        nodes: list[dict[str, Any]],
        edges: list[dict[str, Any]],
        min_size: int,
        max_clusters: int = 12,
    ) -> tuple[list[set[str]], float, dict[str, Any]]:
        """Cluster an in-memory subgraph by stored HGT embeddings."""
        node_ids: list[str] = []
        vectors: list[list[float]] = []
        missing = 0
        expected_dim: int | None = None

        for node in nodes:
            node_id = str(node.get("id", ""))
            vector = _extract_embedding(node)
            if not node_id or vector is None:
                missing += 1
                continue
            if expected_dim is None:
                expected_dim = len(vector)
            if len(vector) != expected_dim:
                missing += 1
                continue
            node_ids.append(node_id)
            vectors.append(vector)

        if len(vectors) < max(2, min_size):
            return [], 0.0, {
                "selected_method": "hgt_gkmeans",
                "success": False,
                "fallback_reason": f"missing_hgt_embedding:{len(vectors)}/{len(nodes)}",
                "embedding_coverage": round(len(vectors) / max(1, len(nodes)), 4),
            }

        max_possible_clusters = max(1, len(vectors) // max(1, min_size))
        k = min(max_clusters, max_possible_clusters, max(2, round(sqrt(len(vectors) / 2))))
        if k <= 1:
            return [set(node_ids)], 0.0, {
                "selected_method": "hgt_gkmeans",
                "success": True,
                "fallback_reason": None,
                "embedding_coverage": round(len(vectors) / max(1, len(nodes)), 4),
                "cluster_count": 1,
            }

        x = np.asarray(vectors, dtype=np.float64)
        norms = np.linalg.norm(x, axis=1)
        norms[norms == 0] = 1.0
        x = x / norms[:, np.newaxis]

        labels = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(x)
        buckets: dict[int, set[str]] = defaultdict(set)
        for node_id, cluster_id in zip(node_ids, labels):
            buckets[int(cluster_id)].add(node_id)

        groups = [members for members in buckets.values() if len(members) >= min_size]
        if not groups:
            return [], 0.0, {
                "selected_method": "hgt_gkmeans",
                "success": False,
                "fallback_reason": "all_hgt_clusters_below_min_size",
                "embedding_coverage": round(len(vectors) / max(1, len(nodes)), 4),
            }

        graph = nx.Graph()
        graph.add_nodes_from(node_ids)
        for edge in edges:
            src = str(edge.get("source", ""))
            tgt = str(edge.get("target", ""))
            if src in graph and tgt in graph:
                graph.add_edge(src, tgt, weight=float(edge.get("weight", edge.get("confidence", 1)) or 1))

        modularity = 0.0
        covered_nodes = set().union(*groups) if groups else set()
        modularity_graph = graph.subgraph(covered_nodes).copy()
        if modularity_graph.number_of_edges() > 0 and len(groups) > 1:
            try:
                modularity = float(nx.algorithms.community.modularity(modularity_graph, groups, weight="weight"))
            except Exception as exc:
                logger.warning("HGT-GKMeans modularity failed: %s", exc)

        return groups, modularity, {
            "selected_method": "hgt_gkmeans",
            "success": True,
            "fallback_reason": None,
            "embedding_coverage": round(len(vectors) / max(1, len(nodes)), 4),
            "cluster_count": len(groups),
        }

    def detect(
        self,
        db: Any,
        labels: list[str],
        max_nodes: int,
        min_size: int,
    ) -> tuple[list[dict], float]:
        if db is None:
            return [], 0.0

        label_conditions = " OR ".join([f"n:{lbl}" for lbl in labels])
        query = f"""
        MATCH (n)-[r]-(m)
        WHERE ({label_conditions}) AND ({label_conditions.replace('n:', 'm:')})
        WITH collect(DISTINCT n)[..$max_nodes] AS ns,
             collect(DISTINCT m)[..$max_nodes] AS ms,
             collect(DISTINCT r)[..$max_nodes * 2] AS rels
        WITH ns + ms AS raw_nodes, rels
        UNWIND raw_nodes AS node
        WITH collect(DISTINCT node) AS nodes, rels
        RETURN nodes, rels
        """
        try:
            from core.database import Neo4jClient

            records, _ = db.execute_read_with_summary(query, {"max_nodes": max_nodes})
            nodes: dict[str, dict[str, Any]] = {}
            edges: list[dict[str, Any]] = []
            for record in records:
                for node in record.get("nodes", []) or []:
                    serialized = Neo4jClient.serialize_node(node)
                    nodes[serialized["id"]] = serialized
                for rel in record.get("rels", []) or []:
                    edges.append(Neo4jClient.serialize_relationship(rel))
        except Exception:
            logger.exception("HGT-GKMeans graph extraction failed")
            return [], 0.0

        groups, modularity, meta = self.cluster_subgraph(list(nodes.values()), edges, min_size)
        if not groups:
            logger.warning("HGT-GKMeans fallback_reason=%s", meta.get("fallback_reason"))
            return [], 0.0

        node_info: dict[int, dict[str, Any]] = {}
        for node_id, node in nodes.items():
            node_info[hash(node_id)] = {
                "id": node_id,
                "labels": _node_labels(node),
                "name": _node_name(node),
            }
        components = {index: [hash(node_id) for node_id in group] for index, group in enumerate(groups)}
        edge_set = {
            (str(edge.get("source")), str(edge.get("target")))
            for edge in edges
            if edge.get("source") and edge.get("target")
        }
        communities, _ = build_community_list(components, node_info, edge_set, min_size)

        method_counts = Counter(node.get("labels", ["Unknown"])[0] for node in nodes.values())
        logger.info(
            "HGT-GKMeans selected_method=hgt_gkmeans communities=%s embedding_coverage=%s label_distribution=%s",
            len(communities),
            meta.get("embedding_coverage"),
            dict(method_counts),
        )
        return communities, modularity
