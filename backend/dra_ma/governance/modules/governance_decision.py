from __future__ import annotations

from typing import Any, AsyncGenerator

from dra_ma.governance.context import GovernanceContext
from dra_ma.governance.events import EventPublisher
from dra_ma.governance.modules.base import GovernanceModule


class GovernanceDecisionModule(GovernanceModule):
    name = "governance"
    depends_on = ["scoring"]
    output_events = ["governance"]

    async def run(
        self,
        ctx: GovernanceContext,
        services: Any,
        publisher: EventPublisher,
    ) -> AsyncGenerator[str, None]:
        if ctx.report or ctx.terminal or ctx.intent_type != "risk_analysis":
            return

        yield publisher.emit(
            "governance",
            "stage",
            "running",
            {"stage_name": "治理方案", "agent_action": "生成协同治理方案..."},
        )

        interpreted_paths = (ctx.risk_paths or {}).get("interpreted_paths", [])
        ctx.governance = await services.governance.plan(
            ctx.scoring,
            ctx.compliance,
            interpreted_paths,
            ctx.anomalies,
            ctx.communities,
        )
        yield publisher.emit("governance", "governance", "success", ctx.governance)
