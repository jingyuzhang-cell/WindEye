"""Community Discovery Tools — WCC and Louvain community detection.

Deterministic graph computation (no LLM). Separates:
  - CommunityDiscovery: graph structure clustering (WCC / Louvain)
  - CommunityMatcher: semantic matching of query → community
"""

from __future__ import annotations

import logging
from typing import Any

from dra_ma.utils.agent_trace import agent_trace

logger = logging.getLogger(__name__)


class CommunityDiscoveryTool:
    """Detect communities from subgraph node/edge lists.

    method="auto": WCC for small graphs (< 30 nodes), HGT-GKMeans when
    embeddings are available, Louvain for larger structure-only graphs.
    """

    @staticmethod
    def detect_communities(
        nodes: list[dict],
        edges: list[dict],
        method: str = "auto",
        min_community_size: int = 2,
    ) -> dict[str, Any]:
        """Run community detection and return structured result.

        Returns:
            {communities, wcc_components, louvain_communities,
             selected_method, reason, algorithm}
        """
        n = len(nodes)
        agent_trace("CommunityDiscovery", "START",
            node_count=n,
            edge_count=len(edges),
            method=method)

        if n < 2:
            return {
                "communities": [],
                "wcc_components": [],
                "louvain_communities": [],
                "selected_method": "none",
                "reason": "Insufficient nodes for community detection",
                "algorithm": "none",
            }

        fallback_reason = None

        # Auto-select method
        if method == "auto":
            method = "hgt_gkmeans" if CommunityDiscoveryTool._has_hgt_embeddings(nodes) and n >= 30 else ("wcc" if n < 30 else "louvain")
            agent_trace("CommunityDiscovery", "DECISION",
                selected_method=method,
                reason=f"Auto-selected {method}: n={n} nodes")

        # Build node index
        node_map: dict[str, dict] = {}
        for node in nodes:
            props = node.get("properties", {}) if isinstance(node.get("properties"), dict) else {}
            # Use top-level id (element_id) first so edge source/target can match
            nid = str(node.get("id") or props.get("id") or props.get("name") or props.get("element_id") or id(node))
            name = str(
                props.get("name") or props.get("COMPANY_NM") or props.get("zh_name")
                or props.get("title") or nid
            )
            labels = node.get("labels", [])
            node_map[nid] = {"id": nid, "name": name[:50], "type": labels[0] if labels else "Unknown"}

        wcc_result = CommunityDiscoveryTool._compute_wcc(node_map, edges, min_community_size)
        louvain_result = CommunityDiscoveryTool._compute_louvain(node_map, edges, min_community_size)
        hgt_result: list[dict] = []

        if method == "hgt_gkmeans":
            hgt_result, fallback_reason = CommunityDiscoveryTool._compute_hgt_gkmeans(nodes, edges, node_map, min_community_size)
            if not hgt_result:
                method = "wcc" if n < 30 else "louvain"
                agent_trace("CommunityDiscovery", "FALLBACK",
                    selected_method=method,
                    fallback_reason=fallback_reason)

        if method == "wcc":
            communities = wcc_result
            reason = f"WCC: {n} nodes — checking connected risk network membership"
        elif method == "hgt_gkmeans":
            communities = hgt_result
            reason = f"HGT-GKMeans: {n} nodes — clustering precomputed HGT embeddings"
        else:
            communities = louvain_result
            reason = f"Louvain: {n} nodes — partitioning large network into tight subgroups"

        result = {
            "communities": communities,
            "wcc_components": wcc_result,
            "louvain_communities": louvain_result,
            "hgt_gkmeans_communities": hgt_result,
            "selected_method": method,
            "fallback_reason": fallback_reason,
            "reason": reason,
            "algorithm": method,
        }
        agent_trace("CommunityDiscovery", "RESULT",
            community_count=len(communities),
            mapped_entities=sum(c.get("size", 0) for c in communities))
        return result

    @staticmethod
    def _compute_wcc(
        node_map: dict[str, dict], edges: list[dict], min_size: int,
    ) -> list[dict]:
        """Weakly Connected Components via Union-Find."""
        node_ids = list(node_map.keys())
        parent: dict[str, str] = {nid: nid for nid in node_ids}

        def find(x: str) -> str:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a: str, b: str) -> None:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

        for e in edges:
            src = str(e.get("source", ""))
            tgt = str(e.get("target", ""))
            if src in parent and tgt in parent:
                union(src, tgt)

        groups: dict[str, list[str]] = {}
        for nid in node_ids:
            root = find(nid)
            groups.setdefault(root, []).append(nid)

        communities: list[dict] = []
        comm_id = 0
        for members in groups.values():
            if len(members) < min_size:
                continue
            member_details = [node_map[m] for m in members if m in node_map]
            communities.append({
                "community_id": comm_id,
                "size": len(members),
                "members": member_details,
                "modularity": None,
            })
            comm_id += 1

        return communities

    @staticmethod
    def _compute_louvain(
        node_map: dict[str, dict], edges: list[dict], min_size: int,
    ) -> list[dict]:
        """Louvain community detection via networkx; falls back to WCC on failure."""
        try:
            import networkx as nx
            from networkx.algorithms.community import louvain_communities

            G = nx.Graph()
            for nid, info in node_map.items():
                G.add_node(nid, **info)
            for e in edges:
                src = str(e.get("source", ""))
                tgt = str(e.get("target", ""))
                if src in G and tgt in G:
                    weight = float(e.get("confidence", 1.0))
                    G.add_edge(src, tgt, weight=weight)

            partitions = louvain_communities(G, weight="weight", seed=42)

            # Group by partition → same shape as WCC output
            communities: list[dict] = []
            for comm_id, members in enumerate(partitions):
                member_list = list(members)
                if len(member_list) < min_size:
                    continue
                communities.append({
                    "community_id": comm_id,
                    "size": len(member_list),
                    "members": [node_map[m] for m in member_list if m in node_map],
                    "modularity": None,
                })

            logger.info(
                "[CommunityDiscovery] Louvain: %d communities from %d nodes",
                len(communities), len(node_map),
            )
            return communities

        except Exception as exc:
            logger.warning(
                "[CommunityDiscovery] Louvain failed (%s), falling back to WCC for %d nodes",
                exc, len(node_map),
            )
            return CommunityDiscoveryTool._compute_wcc(node_map, edges, min_size)

    @staticmethod
    def _compute_hgt_gkmeans(
        nodes: list[dict],
        edges: list[dict],
        node_map: dict[str, dict],
        min_size: int,
    ) -> tuple[list[dict], str | None]:
        try:
            from kg_query.analytics.community.hgt_gkmeans import HGTGKMeansAlgorithm

            groups, _modularity, meta = HGTGKMeansAlgorithm.cluster_subgraph(nodes, edges, min_size)
            if not groups:
                return [], str(meta.get("fallback_reason") or "hgt_gkmeans_failed")
            communities: list[dict] = []
            for comm_id, members in enumerate(groups):
                member_list = [node_map[mid] for mid in members if mid in node_map]
                if len(member_list) < min_size:
                    continue
                communities.append({
                    "community_id": comm_id,
                    "size": len(member_list),
                    "members": member_list,
                    "modularity": _modularity,
                })
            return communities, None
        except Exception as exc:
            logger.warning("[CommunityDiscovery] HGT-GKMeans failed: %s", exc)
            return [], f"hgt_gkmeans_failed:{type(exc).__name__}:{exc}"

    @staticmethod
    def _has_hgt_embeddings(nodes: list[dict]) -> bool:
        keys = {
            "hgt_embedding", "hgtEmbedding", "graph_embedding", "graphEmbedding",
            "aligned_embedding", "alignedEmbedding", "embedding", "vector",
        }
        covered = 0
        for node in nodes:
            props = node.get("properties", {}) if isinstance(node.get("properties"), dict) else {}
            if any(isinstance(node.get(key, props.get(key)), list) for key in keys):
                covered += 1
        return covered >= max(2, int(len(nodes) * 0.6))

    @staticmethod
    def map_entities_to_communities(
        entity_stats: dict[str, Any],
        community_info: dict[str, Any],
        nodes: list[dict],
        edges: list[dict],
    ) -> dict[str, Any]:
        """Map each extracted entity to the communities it belongs to.

        Returns:
            {entities: [{name, type, id, communities: [{community_id, size, role}]}],
             unmapped_count: int}
        """
        top_entities: list[dict] = entity_stats.get("top_entities", [])
        communities: list[dict] = community_info.get("communities", [])

        if not top_entities or not communities:
            return {"entities": [], "unmapped_count": len(top_entities)}

        # Build adjacency degree
        degree: dict[str, int] = {}
        for e in edges:
            src = str(e.get("source", ""))
            tgt = str(e.get("target", ""))
            degree[src] = degree.get(src, 0) + 1
            degree[tgt] = degree.get(tgt, 0) + 1

        # Build community lookup: entity_id → [(community_id, size)]
        comm_lookup: dict[str, list[dict]] = {}
        for comm in communities:
            cid = comm.get("community_id")
            csize = comm.get("size", 0)
            for member in comm.get("members", []):
                mid = str(member.get("id", "")).lower()
                mname = str(member.get("name", "")).lower()
                entry = {"community_id": cid, "size": csize}
                if mid:
                    comm_lookup.setdefault(mid, []).append(entry)
                if mname and mname != mid:
                    comm_lookup.setdefault(mname, []).append(entry)

        # Compute per-community average degrees
        comm_degrees: dict[int, list[int]] = {}
        for comm in communities:
            cid = comm.get("community_id")
            degs = [degree.get(str(m.get("id", "")), 0) for m in comm.get("members", [])]
            if degs:
                comm_degrees[cid] = degs

        entity_results: list[dict] = []
        unmapped = 0

        for entity in top_entities:
            eid = str(entity.get("id", "")).lower()
            ename = str(entity.get("name", "")).lower()
            etype = str(entity.get("type", "Unknown"))

            matched_ids: set[int] = set()
            matched_entries: list[dict] = []

            for key in (eid, ename):
                if key in comm_lookup:
                    for entry in comm_lookup[key]:
                        cid = entry["community_id"]
                        if cid not in matched_ids:
                            matched_ids.add(cid)
                            matched_entries.append(dict(entry))

            for entry in matched_entries:
                cid = entry["community_id"]
                degs = comm_degrees.get(cid, [])
                entity_deg = degree.get(str(entity.get("id", "")), 0)

                if len(matched_entries) > 1:
                    role = "bridge"
                elif degs and entity_deg > 0:
                    avg_deg = sum(degs) / len(degs)
                    role = "core" if entity_deg >= avg_deg * 1.5 else "member"
                else:
                    role = "member"
                entry["role"] = role

            if matched_entries:
                entity_results.append({
                    "name": entity.get("name", ""),
                    "type": etype,
                    "id": entity.get("id", ""),
                    "communities": matched_entries,
                })
            else:
                unmapped += 1
                entity_results.append({
                    "name": entity.get("name", ""),
                    "type": etype,
                    "id": entity.get("id", ""),
                    "communities": [],
                })

        return {"entities": entity_results, "unmapped_count": unmapped}


class CommunityMatcher:
    """Match a user query to the most relevant community via semantic overlap."""

    @staticmethod
    def match_query_to_community(
        query: str, communities: list[dict],
    ) -> dict | None:
        """Score each community by character-level overlap of top entity names with query."""
        if not communities:
            return None

        query_chars = set(query.replace(" ", ""))
        best = None
        best_score = 0

        for comm in communities:
            score = 0
            for member in comm.get("members", [])[:20]:
                name = member.get("name", "")
                name_chars = set(name)
                overlap = len(query_chars & name_chars)
                score += overlap
            if score > best_score:
                best_score = score
                best = comm

        if best and best_score > 0:
            return {
                "communities": [best],
                "algorithm": "semantic_match",
                "matched_community_id": best["community_id"],
            }
        return None
