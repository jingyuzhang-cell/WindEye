"""Louvain-inspired single-level greedy modularity optimization.

Uses scipy sparse adjacency matrix with iterative node-moving.
Note: This is a single-level greedy approximation, not the full multi-level Louvain.
For full Louvain, use the Leiden algorithm via python-igraph.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

import numpy as np
from scipy.sparse import csr_matrix, lil_matrix

from ..community.base import BaseCommunityAlgorithm
from ..community.utils import build_community_list, layer_filter

logger = logging.getLogger(__name__)

_ALL_VALID_LABELS = [
    l for ll in layer_filter(None) for l in (ll if isinstance(ll, str) else [])
]
# Recompute from utils
_ALL_VALID_LABELS_CLEAN: list[str] = []
_LAYER_LABEL_MAP_REF: dict[str, list[str]] = {
    "Subject": ["Subject", "COMPANY", "PERSON", "PFCOMPANY", "PFUND", "SECURITY"],
    "Event": ["Event", "EVENT", "TIME", "REGULATOR"],
    "Feature": ["Feature", "RiskFeature", "RiskFactor"],
    "Regulation": ["Regulation", "Law", "Action"],
}
_ALL_VALID_LABELS_CLEAN = [
    label for labels in _LAYER_LABEL_MAP_REF.values() for label in labels
]


class LouvainAlgorithm(BaseCommunityAlgorithm):
    name = "louvain"
    label = "Louvain"
    description = "单层贪心模块度优化，快速检测高密度社区"
    complexity = "O(n·log n) approximate"

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

        edges_query = f"""
        MATCH (n)-[r]->(m)
        WHERE ({label_conditions}) AND ({label_conditions.replace('n:', 'm:')})
        WITH n, m LIMIT $max_nodes * 2
        RETURN elementId(n) AS src, elementId(m) AS tgt
        """
        try:
            records, _ = db.execute_read_with_summary(
                edges_query, {"max_nodes": max_nodes}
            )
        except Exception:
            logger.exception("Louvain edge extraction failed")
            return [], 0.0

        if not records:
            return [], 0.0

        # Build node-to-index mapping
        node_ids: list[str] = []
        node_to_idx: dict[str, int] = {}
        for rec in records:
            src = str(rec.get("src", ""))
            tgt = str(rec.get("tgt", ""))
            if src and src not in node_to_idx:
                node_to_idx[src] = len(node_ids)
                node_ids.append(src)
            if tgt and tgt not in node_to_idx:
                node_to_idx[tgt] = len(node_ids)
                node_ids.append(tgt)

        n = len(node_ids)
        if n < 2:
            return [], 0.0

        # Build sparse adjacency matrix
        adj = lil_matrix((n, n), dtype=np.float64)
        for rec in records:
            src = str(rec.get("src", ""))
            tgt = str(rec.get("tgt", ""))
            if src in node_to_idx and tgt in node_to_idx:
                i, j = node_to_idx[src], node_to_idx[tgt]
                adj[i, j] = 1
                adj[j, i] = 1

        adj = adj.tocsr()
        degrees = np.array(adj.sum(axis=1)).flatten()
        m = degrees.sum() / 2.0
        if m == 0:
            return [], 0.0

        # Greedy modularity optimization (single-level Louvain)
        communities = np.arange(n, dtype=np.int64)
        improved = True
        for _ in range(50):
            if not improved:
                break
            improved = False
            order = np.random.permutation(n)
            for node in order:
                node_comm = communities[node]
                neigh_indices = adj[node].indices
                if len(neigh_indices) == 0:
                    continue

                comm_gains: dict[int, float] = {}
                k_i = degrees[node]
                for nb in neigh_indices:
                    nb_comm = communities[nb]
                    if nb_comm == node_comm:
                        continue
                    if nb_comm not in comm_gains:
                        comm_nodes = np.where(communities == nb_comm)[0]
                        comm_total = degrees[comm_nodes].sum()
                        comm_gains[nb_comm] = -k_i * comm_total / (2.0 * m * m)

                for nb in neigh_indices:
                    nb_comm = communities[nb]
                    if nb_comm != node_comm and nb_comm in comm_gains:
                        comm_gains[nb_comm] += 1.0 / m

                if comm_gains:
                    best_comm = max(comm_gains, key=comm_gains.get)
                    if comm_gains[best_comm] > 0:
                        communities[node] = best_comm
                        improved = True

        # Map communities back
        comm_groups: dict[int, list[int]] = defaultdict(list)
        for idx, comm in enumerate(communities):
            comm_groups[comm].append(idx)

        # Build node_info dict
        node_info: dict[int, dict] = {}
        for idx, nid in enumerate(node_ids):
            node_info[hash(nid)] = {"id": nid, "labels": [], "name": ""}

        # Query node labels
        try:
            batch_size = 200
            all_nids = list(node_ids)
            for start in range(0, len(all_nids), batch_size):
                batch = all_nids[start : start + batch_size]
                lbl_query = """
                UNWIND $ids AS nid
                MATCH (n) WHERE elementId(n) = nid
                RETURN elementId(n) AS nid, labels(n) AS lbls,
                       coalesce(n.name, n.title, n.COMPANY_NM, n.factor_nm, n.feature_nm, n.regulation_name, '(unnamed)') AS name
                """
                lbl_records, _ = db.execute_read_with_summary(
                    lbl_query, {"ids": batch}
                )
                for rec in lbl_records:
                    hid = hash(str(rec.get("nid", "")))
                    if hid in node_info:
                        node_info[hid]["labels"] = [
                            l
                            for l in (rec.get("lbls") or [])
                            if l in _ALL_VALID_LABELS_CLEAN
                        ]
                        node_info[hid]["name"] = str(rec.get("name", ""))
        except Exception:
            logger.exception("Label resolution failed")

        # Build edge_set
        edge_set: set[tuple[str, str]] = set()
        for rec in records:
            src = str(rec.get("src", ""))
            tgt = str(rec.get("tgt", ""))
            if src and tgt:
                edge_set.add((src, tgt) if src < tgt else (tgt, src))

        modularity = self._compute_modularity(adj, communities, degrees, m)
        return (
            build_community_list(
                comm_groups, node_info, edge_set, min_size, node_to_idx, node_ids
            ),
            modularity,
        )

    def _compute_modularity(
        self,
        adj: csr_matrix,
        communities: np.ndarray,
        degrees: np.ndarray,
        m: float,
    ) -> float:
        if m == 0:
            return 0.0
        q = 0.0
        for i in range(adj.shape[0]):
            for j in adj[i].indices:
                if communities[i] == communities[j]:
                    q += 1.0 - (degrees[i] * degrees[j]) / (2.0 * m)
        return q / (2.0 * m)
