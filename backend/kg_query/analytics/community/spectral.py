"""Spectral Clustering for community detection.

Constructs a normalized Laplacian from the adjacency matrix, computes
k smallest eigenvectors, and clusters with KMeans.

Auto-estimates k from the eigenvalue gap heuristic.
O(n³) worst case — uses max_nodes guard.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

import numpy as np
from scipy.sparse import csr_matrix, lil_matrix
from sklearn.cluster import KMeans

from ..community.base import BaseCommunityAlgorithm
from ..community.utils import build_community_list, layer_filter

logger = logging.getLogger(__name__)

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

# Spectral clustering becomes prohibitive above this node count
_MAX_NODES_SPECTRAL = 2000


class SpectralAlgorithm(BaseCommunityAlgorithm):
    name = "spectral"
    label = "Spectral"
    description = "谱聚类 — 基于图拉普拉斯矩阵特征分解的全局划分"
    complexity = "O(n³) — 限制 N≤2000"

    def detect(
        self,
        db: Any,
        labels: list[str],
        max_nodes: int,
        min_size: int,
    ) -> tuple[list[dict], float]:
        if db is None:
            return [], 0.0

        # Clamp to safety cap
        effective_max = min(max_nodes, _MAX_NODES_SPECTRAL)
        label_conditions = " OR ".join([f"n:{lbl}" for lbl in labels])

        edges_query = f"""
        MATCH (n)-[r]-(m)
        WHERE ({label_conditions}) AND ({label_conditions.replace('n:', 'm:')})
        WITH n, m LIMIT $max_nodes * 2
        RETURN elementId(n) AS src, elementId(m) AS tgt
        """
        try:
            records, _ = db.execute_read_with_summary(
                edges_query, {"max_nodes": effective_max}
            )
        except Exception:
            logger.exception("Spectral edge extraction failed")
            return [], 0.0

        if not records:
            return [], 0.0

        # Build node-to-index mapping
        node_ids: list[str] = []
        node_to_idx: dict[str, int] = {}
        edge_set: set[tuple[str, str]] = set()
        for rec in records:
            src = str(rec.get("src", ""))
            tgt = str(rec.get("tgt", ""))
            if not src or not tgt:
                continue
            if src not in node_to_idx:
                node_to_idx[src] = len(node_ids)
                node_ids.append(src)
            if tgt not in node_to_idx:
                node_to_idx[tgt] = len(node_ids)
                node_ids.append(tgt)
            edge_set.add((src, tgt) if src < tgt else (tgt, src))

        n = len(node_ids)
        if n < 2:
            return [], 0.0

        # Build sparse adjacency matrix
        adj = lil_matrix((n, n), dtype=np.float64)
        for src, tgt in edge_set:
            i = node_to_idx[src]
            j = node_to_idx[tgt]
            if i != j:
                adj[i, j] = 1
                adj[j, i] = 1

        adj = adj.tocsr()
        degrees = np.array(adj.sum(axis=1)).flatten()

        # Isolated nodes break spectral — handle gracefully
        valid = degrees > 0
        if valid.sum() < min_size:
            return [], 0.0

        # Normalized Laplacian: L_sym = I - D^(-1/2) A D^(-1/2)
        d_inv_sqrt = np.zeros(n)
        d_inv_sqrt[valid] = 1.0 / np.sqrt(degrees[valid])
        D_inv_sqrt = lil_matrix((n, n))
        D_inv_sqrt.setdiag(d_inv_sqrt)
        D_inv_sqrt = D_inv_sqrt.tocsr()

        L_sym = lil_matrix((n, n))
        L_sym.setdiag(1.0)
        L_sym = L_sym.tocsr()
        L_sym = L_sym - D_inv_sqrt.dot(adj).dot(D_inv_sqrt)

        # Compute k smallest eigenvalues
        try:
            # Use dense for now — alternatives exist but add complexity
            L_dense = L_sym.toarray()
            eigenvalues, eigenvectors = np.linalg.eigh(L_dense)
        except Exception:
            logger.exception("Spectral eigendecomposition failed")
            return [], 0.0

        # Auto-estimate k from eigenvalue gap
        k = self._estimate_k(eigenvalues, n, min_size)

        if k < 2:
            return [], 0.0

        # Use eigenvectors for k smallest non-trivial eigenvalues
        # Skip the trivial zero eigenvalue
        embedding = eigenvectors[:, 1:k]

        # Normalize rows
        row_norms = np.linalg.norm(embedding, axis=1)
        row_norms[row_norms == 0] = 1.0
        embedding = embedding / row_norms[:, np.newaxis]

        # KMeans clustering
        try:
            kmeans = KMeans(n_clusters=k, n_init=10, random_state=42)
            cluster_labels = kmeans.fit_predict(embedding)
        except Exception:
            logger.exception("Spectral KMeans failed")
            return [], 0.0

        # Group by cluster
        comm_groups: dict[int, list[int]] = defaultdict(list)
        for idx, cluster_id in enumerate(cluster_labels):
            nid = node_ids[idx]
            comm_groups[int(cluster_id)].append(hash(nid))

        # Build node_info
        node_info: dict[int, dict] = {}
        for idx, nid in enumerate(node_ids):
            node_info[hash(nid)] = {"id": nid, "labels": [], "name": ""}

        # Resolve labels and names
        try:
            all_nids = list(node_ids)
            for start in range(0, len(all_nids), 200):
                batch = all_nids[start : start + 200]
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
            logger.exception("Label resolution failed in Spectral")

        # Compute modularity
        modularity = self._compute_modularity_nx(adj, cluster_labels, degrees)

        return (
            build_community_list(
                comm_groups, node_info, edge_set, min_size, node_to_idx, node_ids
            ),
            modularity,
        )

    def _estimate_k(self, eigenvalues: np.ndarray, n: int, min_size: int) -> int:
        """Estimate number of clusters from eigenvalue gap."""
        # Look for largest gap between consecutive eigenvalues
        gaps = np.diff(eigenvalues)
        if len(gaps) < 2:
            return 2
        # Find the index with the largest gap, excluding the first few
        search_start = max(1, len(gaps) // 10)
        best_k = search_start + 1
        best_gap = 0.0
        for i in range(search_start, min(len(gaps), 30)):
            gap = gaps[i]
            if gap > best_gap:
                best_gap = gap
                best_k = i + 1

        # Bound k to reasonable range
        max_k = max(2, n // max(min_size, 2))
        return min(max(2, best_k), max_k, 30)

    def _compute_modularity_nx(
        self,
        adj: csr_matrix,
        labels: np.ndarray,
        degrees: np.ndarray,
    ) -> float:
        """Compute Newman-Girvan modularity Q from adjacency and labels."""
        m = degrees.sum() / 2.0
        if m == 0:
            return 0.0
        q = 0.0
        for i in range(adj.shape[0]):
            for j in adj[i].indices:
                if labels[i] == labels[j]:
                    q += 1.0 - (degrees[i] * degrees[j]) / (2.0 * m)
        return q / (2.0 * m)
