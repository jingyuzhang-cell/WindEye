from __future__ import annotations

import logging
from typing import Any, AsyncGenerator

from dra_ma.governance.context import GovernanceContext
from dra_ma.governance.events import EventPublisher
from dra_ma.governance.modules.base import GovernanceModule

logger = logging.getLogger(__name__)


class CommunityModule(GovernanceModule):
    name = "community"
    depends_on = ["subgraph"]
    output_events = [
        "entity_stats", "community", "entity_community_map", "candidate_risk_paths",
        "expanded_community",
    ]

    async def run(
        self,
        ctx: GovernanceContext,
        services: Any,
        publisher: EventPublisher,
    ) -> AsyncGenerator[str, None]:
        if ctx.report:
            return

        # ── Phase A: Evidence subgraph community detection ──────────
        yield publisher.emit(
            "graph_analytics",
            "stage",
            "running",
            {"stage_name": "图计算分析", "agent_action": "计算图谱统计指标..."},
        )

        ctx.analytics = await services._run_graph_analytics(ctx.subgraph)
        ctx.entity_stats = ctx.analytics.entity_stats
        ctx.communities = ctx.analytics.communities
        ctx.entity_community_map = ctx.analytics.entity_community_map
        ctx.candidate_risk_paths = ctx.analytics.candidate_risk_paths

        yield publisher.emit("graph_analytics", "entity_stats", "success", ctx.entity_stats)
        yield publisher.emit("graph_analytics", "community", "success", ctx.communities)
        yield publisher.emit("graph_analytics", "entity_community_map", "success", ctx.entity_community_map)

        if ctx.candidate_risk_paths:
            yield publisher.emit(
                "graph_analytics",
                "candidate_risk_paths",
                "success",
                ctx.candidate_risk_paths,
            )

        # ── Phase B: Expanded community discovery ───────────────────
        if ctx.intent_type == "risk_analysis":
            seed_names = [
                r.canonical_name
                for r in (ctx.resolved_entities or [])
                if getattr(r, "canonical_name", None)
            ]
            seed_ids = [
                str(r.kg_node_id)
                for r in (ctx.resolved_entities or [])
                if getattr(r, "kg_node_id", None)
            ]
            if seed_names or seed_ids:
                logger.info(
                    "[CommunityExpanded] seedNames=%s seedIds=%s method=auto maxHop=3",
                    seed_names[:5], seed_ids[:5],
                )
                try:
                    expanded = await services._run_expanded_community(
                        seed_names=seed_names,
                        seed_ids=seed_ids,
                        method="auto",
                        max_hop=3,
                    )
                except Exception as exc:
                    logger.warning("[CommunityExpanded] failed: %s", exc)
                    return

                if expanded.get("success"):
                    ctx.expanded_community_result = expanded
                    ctx.expanded_communities = expanded.get("communities", [])
                    ctx.expanded_entity_community_map = expanded.get(
                        "entity_community_map", {},
                    )
                    ctx.community_edges = expanded.get("community_edges", [])
                    ctx.community_graph = expanded.get("community_graph", {})
                    ctx.seed_community_id = expanded.get("seed_community_id")

                    logger.info(
                        "[CommunityDetection] selected_method=%s community_count=%s fallback_reason=%s",
                        expanded.get("selected_method"),
                        expanded.get("community_count"),
                        expanded.get("fallback_reason"),
                    )
                    if ctx.seed_community_id is not None:
                        seed_node_ids = [
                            str(n.get("id", ""))
                            for n in expanded.get("seed_nodes", [])[:10]
                            if n.get("id")
                        ]
                        logger.info(
                            "[CommunitySeed] seedCommunityId=%s seedNodeIds=%s",
                            ctx.seed_community_id, seed_node_ids,
                        )
                    cg = expanded.get("community_graph", {})
                    logger.info(
                        "[CommunityGraph] nodes=%s edges=%s",
                        len(cg.get("nodes", [])),
                        len(cg.get("edges", [])),
                    )

                    yield publisher.emit(
                        "expanded_community",
                        "expanded_community",
                        "success",
                        {
                            "seedNodes": expanded.get("seed_nodes", []),
                            "communities": ctx.expanded_communities,
                            "seedCommunityId": ctx.seed_community_id,
                            "entityCommunityMap": ctx.expanded_entity_community_map,
                            "communityEdges": ctx.community_edges,
                            "communityGraph": ctx.community_graph,
                            "selectedMethod": expanded.get("selected_method"),
                            "fallbackReason": expanded.get("fallback_reason"),
                            "visualization": expanded.get("visualization", {}),
                        },
                    )
