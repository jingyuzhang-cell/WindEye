"""WCC — Weakly Connected Components via Union-Find.

Finds connected components in the undirected graph using DSU.
Fastest method, useful for initial exploration.
"""

from __future__ import annotations

import logging
from typing import Any

from ..community.base import BaseCommunityAlgorithm
from ..community.utils import (
    UnionFind,
    build_community_list,
    layer_filter,
    resolve_node_info,
)

logger = logging.getLogger(__name__)


class WCCAlgorithm(BaseCommunityAlgorithm):
    name = "wcc"
    label = "WCC"
    description = "Weakly Connected Components — 快速拆分连通分量，适合初始探索"
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

        query = f"""
        MATCH (n)
        WHERE {label_conditions}
        WITH n LIMIT $max_nodes
        MATCH (n)-[r]-(m)
        WHERE {label_conditions} AND elementId(n) < elementId(m)
        RETURN elementId(n) AS src, elementId(m) AS tgt, labels(m) AS m_labels
        LIMIT $max_nodes * 3
        """
        try:
            records, _ = db.execute_read_with_summary(
                query, {"max_nodes": max_nodes}
            )
        except Exception:
            logger.exception("WCC edge extraction failed")
            return [], 0.0

        # Union-Find on edges
        uf = UnionFind()
        edge_set: set[tuple[str, str]] = set()
        for record in records:
            src, tgt = record.get("src"), record.get("tgt")
            if src and tgt:
                uf.add(hash(src))
                uf.add(hash(tgt))
                uf.union(hash(src), hash(tgt))
                edge_set.add((str(src), str(tgt)))

        # Also add isolated nodes (single-node components)
        try:
            node_query = f"""
            MATCH (n) WHERE {label_conditions}
            WITH n LIMIT $max_nodes
            RETURN elementId(n) AS nid, labels(n) AS lbls
            """
            node_records, _ = db.execute_read_with_summary(
                node_query, {"max_nodes": max_nodes}
            )
        except Exception:
            logger.exception("Node extraction failed")
            node_records = []

        node_info: dict[int, dict] = {}
        for record in node_records:
            nid = str(record.get("nid", ""))
            lbls = record.get("lbls", [])
            if nid:
                node_info[hash(nid)] = {"id": nid, "labels": lbls, "name": ""}
                uf.add(hash(nid))

        # Resolve node names in a batch
        if node_info:
            try:
                nids = list(node_info.values())[:500]
                nid_list = [ni["id"] for ni in nids]
                name_query = """
                UNWIND $ids AS nid
                MATCH (n) WHERE elementId(n) = nid
                RETURN elementId(n) AS nid,
                       coalesce(n.name, n.title, n.COMPANY_NM, n.factor_nm, n.feature_nm, n.regulation_name, '(unnamed)') AS name,
                       labels(n) AS lbls
                """
                name_records, _ = db.execute_read_with_summary(
                    name_query, {"ids": nid_list}
                )
                for rec in name_records:
                    hid = hash(str(rec.get("nid", "")))
                    if hid in node_info:
                        node_info[hid]["name"] = str(rec.get("name", ""))
            except Exception:
                logger.exception("Name resolution failed")

        components = uf.components()
        return build_community_list(
            components, node_info, edge_set, min_size
        )
