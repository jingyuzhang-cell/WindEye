from __future__ import annotations

from typing import Any, AsyncGenerator

from dra_ma.governance.context import GovernanceContext
from dra_ma.governance.events import EventPublisher
from dra_ma.governance.modules.base import GovernanceModule


class ComplianceModule(GovernanceModule):
    name = "compliance"
    depends_on = ["risk_path"]
    output_events = ["compliance", "compliance_scores"]

    async def run(
        self,
        ctx: GovernanceContext,
        services: Any,
        publisher: EventPublisher,
    ) -> AsyncGenerator[str, None]:
        if ctx.report or ctx.intent_type != "risk_analysis":
            return

        yield publisher.emit(
            "compliance",
            "stage",
            "running",
            {"stage_name": "合规匹配", "agent_action": "匹配法规与违规评估..."},
        )

        interpreted_paths = (ctx.risk_paths or {}).get("interpreted_paths", [])
        ctx.compliance = await services.compliance.match(
            interpreted_paths,
            ctx.anomalies,
            ctx.subgraph.nodes,
        )
        yield publisher.emit("compliance", "compliance", "success", ctx.compliance)

        from dra_ma.tools.compliance_scorer import ComplianceScorer

        ctx.compliance_scores = ComplianceScorer.score_nodes(ctx.subgraph.nodes, ctx.compliance)
        yield publisher.emit("compliance", "compliance_scores", "success", ctx.compliance_scores)
