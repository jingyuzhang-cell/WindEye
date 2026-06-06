from __future__ import annotations

from typing import Any, AsyncGenerator

from dra_ma.governance.context import GovernanceContext
from dra_ma.governance.events import EventPublisher
from dra_ma.governance.modules.base import GovernanceModule


class IntentModule(GovernanceModule):
    name = "intent"
    depends_on: list[str] = []
    output_events = ["stage"]

    async def run(
        self,
        ctx: GovernanceContext,
        services: Any,
        publisher: EventPublisher,
    ) -> AsyncGenerator[str, None]:
        yield publisher.emit(
            "intent",
            "stage",
            "running",
            {"stage_name": "意图解析", "agent_action": "识别查询意图与实体..."},
        )

        if ctx.intent_hint and not ctx.demo:
            raw_entities, task_config, parsed_intent = await services._intent_light(
                ctx.query, ctx.intent_hint, ctx.file_content,
            )
        else:
            raw_entities, task_config, parsed_intent = await services._intent_full(
                ctx.query, ctx.file_content,
            )

        ctx.raw_entities = raw_entities
        ctx.task_config = task_config
        ctx.parsed_intent = parsed_intent
        ctx.intent_type = ctx.intent_hint or task_config.get("intent_type", "graph_qa")
        ctx.file_context = task_config.get("file_context")

        yield publisher.emit(
            "intent",
            "stage",
            "success",
            {
                "stage_name": "意图解析",
                "agent_action": f"意图: {ctx.intent_type}, 原始实体: {ctx.raw_entities}",
                "intent_type": ctx.intent_type,
                "raw_entities": ctx.raw_entities,
            },
        )
