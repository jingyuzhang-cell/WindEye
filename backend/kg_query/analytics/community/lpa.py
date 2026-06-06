"""LPA — Label Propagation Algorithm.

Iterative label propagation without parameters. Each node adopts
the most common label among its neighbors. Fast and scalable.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

import numpy as np

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


class LPAAlgorithm(BaseCommunityAlgorithm):
    name = "label_propagation"
    label = "LPA"
    description = "标签传播算法，无需预设社区数量，快速扩展"
    complexity = "O(n + m)"

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
            logger.exception("Label propagation edge extraction failed")
            return [], 0.0

        if not records:
            return [], 0.0

        node_set: set[str] = set()
        adjacency: dict[str, set[str]] = defaultdict(set)
        for rec in records:
            src = str(rec.get("src", ""))
            tgt = str(rec.get("tgt", ""))
            if src and tgt:
                node_set.add(src)
                node_set.add(tgt)
                adjacency[src].add(tgt)
                adjacency[tgt].add(src)

        node_list = list(node_set)
        if not node_list:
            return [], 0.0

        nid_to_hash: dict[str, int] = {n: hash(n) for n in node_list}

        # Initialize each node with its own label
        node_labels = {node: i for i, node in enumerate(node_list)}

        for _ in range(20):
            changed = False
            order = np.random.permutation(node_list)
            for node in order:
                neighbors = adjacency[node]
                if not neighbors:
                    continue
                label_counts: dict[int, int] = defaultdict(int)
                for nb in neighbors:
                    label_counts[node_labels[nb]] += 1
                most_common = max(label_counts, key=label_counts.get)
                if most_common != node_labels[node]:
                    node_labels[node] = most_common
                    changed = True
            if not changed:
                break

        # Group by label
        comm_groups: dict[int, list[int]] = defaultdict(list)
        for node, label in node_labels.items():
            comm_groups[label].append(nid_to_hash[node])

        # Build node_info
        node_info: dict[int, dict] = {}
        try:
            all_nids = list(node_set)
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
                    node_info[hid] = {
                        "id": str(rec.get("nid", "")),
                        "labels": [
                            l
                            for l in (rec.get("lbls") or [])
                            if l in _ALL_VALID_LABELS_CLEAN
                        ],
                        "name": str(rec.get("name", "")),
                    }
        except Exception:
            logger.exception("Label resolution failed")

        edge_set: set[tuple[str, str]] = set()
        for src, tgt_set in adjacency.items():
            for tgt in tgt_set:
                if src < tgt:
                    edge_set.add((src, tgt))

        return build_community_list(comm_groups, node_info, edge_set, min_size), 0.0
