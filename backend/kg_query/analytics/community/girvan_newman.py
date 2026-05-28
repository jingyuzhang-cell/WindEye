"""Girvan-Newman algorithm via python-igraph edge betweenness.

Hierarchical divisive algorithm that removes edges with highest
betweenness centrality. Produces a dendrogram cut at threshold.
O(n·m²) — limited to moderate graph sizes.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

import igraph as ig

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

# Safety cap for edges — Girvan-Newman is O(n·m²)
_MAX_EDGES_FOR_GN = 5000


class GirvanNewmanAlgorithm(BaseCommunityAlgorithm):
    name = "girvan_newman"
    label = "G-N"
    description = "Girvan-Newman分裂式层次聚类，通过边介数逐步分割社区"
    complexity = "O(n·m²) — 限制 N≤5000"

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
        MATCH (n)-[r]-(m)
        WHERE ({label_conditions}) AND ({label_conditions.replace('n:', 'm:')})
        WITH n, m LIMIT $max_nodes * 2
        RETURN elementId(n) AS src, elementId(m) AS tgt
        """
        try:
            records, _ = db.execute_read_with_summary(
                edges_query, {"max_nodes": max_nodes}
            )
        except Exception:
            logger.exception("Girvan-Newman edge extraction failed")
            return [], 0.0

        if not records:
            return [], 0.0

        # Build node-to-index mapping
        node_ids: list[str] = []
        node_to_idx: dict[str, int] = {}
        edge_pairs: list[tuple[int, int]] = []
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
            edge_pairs.append((node_to_idx[src], node_to_idx[tgt]))
            edge_set.add((src, tgt) if src < tgt else (tgt, src))

        n = len(node_ids)
        m = len(edge_pairs)
        if n < min_size:
            return [], 0.0

        # Safety cap for large graphs
        if m > _MAX_EDGES_FOR_GN:
            logger.warning(
                "Girvan-Newman: %d edges exceeds safety cap %d, skipping",
                m, _MAX_EDGES_FOR_GN,
            )
            return [], 0.0

        # Build igraph Graph
        g = ig.Graph(n=n, edges=edge_pairs, directed=False)

        try:
            # Compute edge betweenness-based community dendrogram
            dendrogram = g.community_edge_betweenness(
                weights=None,
                directed=False,
            )

            # Cut dendrogram at a point that gives reasonable community sizes
            # We try different cut levels and pick the one that maximizes modularity
            best_modularity = -1.0
            best_partition = None
            max_communities = min(n // min_size, 50)

            for k in range(2, max_communities + 1, max(1, (max_communities - 2) // 10)):
                try:
                    partition = dendrogram.as_clustering(n=k)
                    mod = g.modularity(partition)
                    if mod > best_modularity:
                        best_modularity = mod
                        best_partition = partition
                except Exception:
                    continue

            if best_partition is None:
                # Fallback: cut where communities >= min_size
                best_partition = dendrogram.as_clustering(n=max_communities)
                best_modularity = g.modularity(best_partition)

        except Exception:
            logger.exception("Girvan-Newman detection failed")
            return [], 0.0

        # Group nodes by community
        comm_groups: dict[int, list[int]] = defaultdict(list)
        membership = best_partition.membership
        for idx, comm_id in enumerate(membership):
            nid = node_ids[idx]
            comm_groups[comm_id].append(hash(nid))

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
            logger.exception("Label resolution failed in Girvan-Newman")

        return (
            build_community_list(
                comm_groups, node_info, edge_set, min_size, node_to_idx, node_ids
            ),
            float(best_modularity),
        )
