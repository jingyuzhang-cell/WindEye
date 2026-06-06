from __future__ import annotations

from typing import Any, AsyncGenerator

from dra_ma.governance.context import GovernanceContext
from dra_ma.governance.events import EventPublisher
from dra_ma.governance.modules.base import GovernanceModule


class ScoringModule(GovernanceModule):
    name = "scoring"
    depends_on = ["compliance"]
    output_events = ["scoring"]

    async def run(
        self,
        ctx: GovernanceContext,
        services: Any,
        publisher: EventPublisher,
    ) -> AsyncGenerator[str, None]:
        if ctx.report or ctx.intent_type != "risk_analysis":
            return

        yield publisher.emit(
            "scoring",
            "stage",
            "running",
            {"stage_name": "风险评分", "agent_action": "多维度风险评分..."},
        )

        interpreted_paths = (ctx.risk_paths or {}).get("interpreted_paths", [])
        ctx.scoring = services.scoring.score(
            ctx.analytics.graph_metrics,
            interpreted_paths,
            ctx.anomalies,
            ctx.compliance,
            subgraph_confidence=ctx.subgraph.confidence,
            resolved_entity_count=len(ctx.resolved_entities),
            total_entity_count=len(ctx.resolved_entities) + len(ctx.unresolved_entities),
        )

        if ctx.scoring["level"] == "insufficient_evidence":
            ctx.terminal = True
            yield publisher.emit("scoring", "scoring", "warning", ctx.scoring)
            yield publisher.emit(
                "done",
                "done",
                "success",
                {"level": "insufficient_evidence", "message": "未检索到足够关系证据，无法形成稳定风险评级"},
            )
            return

        ctx.scoring = await services.scoring.explain_and_adjust(ctx.scoring)
        yield publisher.emit("scoring", "scoring", "success", ctx.scoring)
