from __future__ import annotations

import logging
from typing import Any, AsyncGenerator

from dra_ma.governance.context import GovernanceContext
from dra_ma.governance.events import EventPublisher
from dra_ma.governance.modules.base import GovernanceModule

logger = logging.getLogger(__name__)


class RiskPathModule(GovernanceModule):
    name = "risk_path"
    depends_on = ["community"]
    output_events = ["risk_paths", "anomaly_findings"]

    async def run(
        self,
        ctx: GovernanceContext,
        services: Any,
        publisher: EventPublisher,
    ) -> AsyncGenerator[str, None]:
        if ctx.report or ctx.intent_type != "risk_analysis":
            return

        yield publisher.emit(
            "risk_analysis",
            "stage",
            "running",
            {"stage_name": "风险分析", "agent_action": "解释风险路径与异常..."},
        )

        analyst_result = await services.risk_analyst.analyze(
            ctx.subgraph.nodes,
            ctx.subgraph.edges,
            ctx.candidate_risk_paths,
            {"confidence": ctx.subgraph.confidence},
        )
        interpreted_paths = analyst_result.get("interpreted_risk_paths", [])
        ctx.anomalies = analyst_result.get("anomalies", [])

        merged_path_ids: set[str] = set()
        merged_paths: list[dict] = []
        for path in interpreted_paths:
            path_id = path.get("path_id", "")
            if path_id and path_id not in merged_path_ids:
                merged_path_ids.add(path_id)
                merged_paths.append(path)
        for path in ctx.candidate_risk_paths:
            path_id = path.get("path_id", "")
            if path_id and path_id not in merged_path_ids:
                merged_path_ids.add(path_id)
                merged_paths.append(path)

        # ── Community path linkage ──────────────────────────────────────
        # Build community_path for each merged path using the expanded or
        # Phase-A entity_community_map.
        entity_map = _resolve_entity_community_map(ctx)

        for path in merged_paths:
            node_ids = path.get("node_ids", [])
            community_path: list[int] = []
            for node_id in node_ids:
                entry = entity_map.get(str(node_id), {})
                community_id = entry.get("community_id") or entry.get("communityId")
                if community_id is not None and community_id not in community_path:
                    community_path.append(int(community_id))

            path["community_path"] = community_path

            if node_ids and not community_path:
                logger.warning(
                    "[RiskPathCommunityMap] path_id=%s node_ids=%d community_path_empty",
                    path.get("path_id"), len(node_ids),
                )
            else:
                logger.info(
                    "[RiskPathCommunityMap] path_id=%s node_ids=%d community_path=%s",
                    path.get("path_id"), len(node_ids), community_path,
                )

        ctx.risk_paths = {
            "candidate_paths": ctx.candidate_risk_paths,
            "interpreted_paths": interpreted_paths,
            "merged_paths": merged_paths,
        }

        yield publisher.emit("risk_analysis", "risk_paths", "success", ctx.risk_paths)
        yield publisher.emit("risk_analysis", "anomaly_findings", "success", ctx.anomalies)


def _resolve_entity_community_map(ctx: GovernanceContext) -> dict[str, dict]:
    """Extract a flat {node_id: {community_id, role, isSeed, ...}} map from ctx.

    Prefers the expanded Phase-B map, falls back to the Phase-A map format.
    """
    # Phase B expanded format: {by_id: {node_id: {communities: [...]}}}
    expanded = ctx.expanded_entity_community_map
    if expanded:
        by_id = expanded.get("by_id", {})
        if by_id:
            result: dict[str, dict] = {}
            for node_id, entry in by_id.items():
                communities = entry.get("communities", [])
                if not communities:
                    continue
                primary = communities[0]
                result[str(node_id)] = {
                    "community_id": primary.get("community_id", 0),
                    "role": primary.get("role", "member"),
                    "isSeed": getattr(entry, "is_seed", False) or False,
                }
            return result

    # Phase A format: {entities: [{id, name, communities: [{community_id}]}]}
    phase_a = ctx.entity_community_map
    if phase_a:
        entities = phase_a.get("entities", [])
        result = {}
        for entity in entities:
            entity_id = str(entity.get("id", ""))
            if not entity_id:
                continue
            communities = entity.get("communities", [])
            if not communities:
                continue
            primary = communities[0]
            result[entity_id] = {
                "community_id": primary.get("community_id", 0),
                "role": primary.get("role", "member"),
                "isSeed": False,
            }
        return result

    return {}
