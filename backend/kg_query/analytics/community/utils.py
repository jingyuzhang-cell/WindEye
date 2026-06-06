"""Shared utilities for community detection algorithms."""

from __future__ import annotations

import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

# ── Layer label mapping ────────────────────────────────────────────────

_LAYER_LABEL_MAP: dict[str, list[str]] = {
    "Subject": ["Subject", "COMPANY", "PERSON", "PFCOMPANY", "PFUND", "SECURITY"],
    "Event": ["Event", "EVENT", "TIME", "REGULATOR"],
    "Feature": ["Feature", "RiskFeature", "RiskFactor"],
    "Regulation": ["Regulation", "Law", "Action"],
}
_ALL_VALID_LABELS = [label for labels in _LAYER_LABEL_MAP.values() for label in labels]


def layer_filter(layer: str | None) -> list[str]:
    """Get Neo4j labels for a given layer key."""
    if layer and layer in _LAYER_LABEL_MAP:
        return _LAYER_LABEL_MAP[layer]
    return _ALL_VALID_LABELS


def layer_filter_safe(layer: str | None, labels: list[str]) -> list[str]:
    """Filter a list of labels to only include those in the chosen layer."""
    valid = set(layer_filter(layer))
    return [l for l in labels if l in valid]


def build_community_list(
    components: dict[int, list[int]],
    node_info: dict[int, dict],
    edge_set: set[tuple[str, str]],
    min_size: int,
    idx_to_nid: dict[int, str] | None = None,
    node_ids: list[str] | None = None,
) -> tuple[list[dict], float]:
    """Convert component groups into the standard community dict format.

    Returns (communities, modularity).
    """
    communities = []
    for cid, members in sorted(components.items(), key=lambda x: -len(x[1])):
        if len(members) < min_size:
            continue

        members_set = set(members)
        member_nids: set[str] = set()
        for m in members:
            info = node_info.get(m)
            if info:
                member_nids.add(info["id"])
            elif idx_to_nid and node_ids:
                for i, nid_val in enumerate(node_ids):
                    if hash(nid_val) == m:
                        member_nids.add(nid_val)
                        break

        # Count internal edges
        internal_edges = 0
        for src, tgt in edge_set:
            if (
                (hash(src) in members_set or src in member_nids)
                and (hash(tgt) in members_set or tgt in member_nids)
            ):
                internal_edges += 1

        size = len(members)
        max_possible = size * (size - 1) / 2.0
        density = internal_edges / max_possible if max_possible > 0 else 0.0

        # Label distribution
        label_dist: dict[str, int] = defaultdict(int)
        for m in members:
            info = node_info.get(m)
            lbls = info.get("labels", []) if info else []
            for lbl in lbls:
                label_dist[lbl] += 1

        # Top entities (by name)
        top_entities = []
        for m in members[:10]:
            info = node_info.get(m)
            if info:
                top_entities.append({
                    "id": info["id"],
                    "name": info.get("name", "(unnamed)"),
                    "label": (info.get("labels") or ["Unknown"])[0],
                })

        # All member IDs for subgraph retrieval (up to 500)
        member_ids: list[str] = []
        for m in members[:500]:
            info = node_info.get(m)
            if info and info.get("id"):
                member_ids.append(info["id"])

        communities.append({
            "community_id": len(communities),
            "size": size,
            "density": round(density, 4),
            "internal_edges": internal_edges,
            "label_distribution": dict(label_dist),
            "top_entities": top_entities,
            "member_ids": member_ids,
        })

    return communities, 0.0


def extract_edges(
    db: object,
    labels: list[str],
    max_nodes: int,
    directed: bool = False,
    label_conditions: str | None = None,
) -> tuple[list, str]:
    """Extract edges from Neo4j for community detection.

    Returns (records, label_conditions_string).
    """
    if label_conditions is None:
        label_conditions = " OR ".join([f"n:{lbl}" for lbl in labels])

    arrow = "->" if directed else "-"
    edges_query = f"""
    MATCH (n)-[r]{arrow}(m)
    WHERE ({label_conditions}) AND ({label_conditions.replace('n:', 'm:')})
    WITH n, m LIMIT $max_nodes * 2
    RETURN elementId(n) AS src, elementId(m) AS tgt
    """
    try:
        records, _ = db.execute_read_with_summary(
            edges_query, {"max_nodes": max_nodes}
        )
        return list(records), label_conditions
    except Exception:
        logger.exception("Edge extraction failed")
        return [], label_conditions


def resolve_node_info(
    db: object,
    node_ids: list[str],
    node_info: dict[int, dict] | None = None,
) -> dict[int, dict]:
    """Resolve node names and labels from Neo4j by elementId.

    Populates / returns a dict keyed by hash(nid) -> {id, labels, name}.
    """
    if node_info is None:
        node_info = {}

    batch_size = 200
    try:
        for start in range(0, len(node_ids), batch_size):
            batch = node_ids[start : start + batch_size]
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
                        l for l in (rec.get("lbls") or []) if l in _ALL_VALID_LABELS
                    ],
                    "name": str(rec.get("name", "")),
                }
    except Exception:
        logger.exception("Node info resolution failed")

    return node_info


class UnionFind:
    """Disjoint Set Union for connected components."""

    def __init__(self) -> None:
        self._parent: dict[int, int] = {}
        self._rank: dict[int, int] = {}

    def add(self, x: int) -> None:
        if x not in self._parent:
            self._parent[x] = x
            self._rank[x] = 0

    def find(self, x: int) -> int:
        path: list[int] = []
        while self._parent[x] != x:
            path.append(x)
            x = self._parent[x]
        for node in path:
            self._parent[node] = x
        return x

    def union(self, x: int, y: int) -> None:
        rx, ry = self.find(x), self.find(y)
        if rx == ry:
            return
        if self._rank[rx] < self._rank[ry]:
            self._parent[rx] = ry
        elif self._rank[rx] > self._rank[ry]:
            self._parent[ry] = rx
        else:
            self._parent[ry] = rx
            self._rank[rx] += 1

    def components(self) -> dict[int, list[int]]:
        groups: dict[int, list[int]] = defaultdict(list)
        for node in self._parent:
            groups[self.find(node)].append(node)
        return dict(groups)
