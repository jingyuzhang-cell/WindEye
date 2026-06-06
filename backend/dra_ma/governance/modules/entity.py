from __future__ import annotations

from typing import Any, AsyncGenerator

from dra_ma.governance.context import GovernanceContext
from dra_ma.governance.events import EventPublisher
from dra_ma.governance.modules.base import GovernanceModule


class EntityModule(GovernanceModule):
    name = "entity_resolution"
    depends_on = ["intent"]
    output_events = ["stage", "entities"]

    async def run(
        self,
        ctx: GovernanceContext,
        services: Any,
        publisher: EventPublisher,
    ) -> AsyncGenerator[str, None]:
        yield publisher.emit(
            "entity_resolution",
            "stage",
            "running",
            {"stage_name": "实体对齐", "agent_action": "标准化实体名称..."},
        )

        resolved = await services.entity_resolver.resolve(ctx.raw_entities)
        ctx.resolved_entities = [r for r in resolved if r.kg_node_id]
        ctx.unresolved_entities = [r for r in resolved if not r.kg_node_id]
        entity_status = "warning" if ctx.unresolved_entities else "success"

        yield publisher.emit(
            "entity_resolution",
            "entities",
            entity_status,
            {
                "resolved": [services._serialize_resolved(r) for r in ctx.resolved_entities],
                "unresolved": [{"raw": r.raw} for r in ctx.unresolved_entities],
                "resolved_count": len(ctx.resolved_entities),
                "unresolved_count": len(ctx.unresolved_entities),
            },
        )
