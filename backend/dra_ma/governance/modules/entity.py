from __future__ import annotations

from typing import Any, AsyncGenerator

from dra_ma.governance.context import GovernanceContext
from dra_ma.governance.events import EventPublisher
from dra_ma.governance.modules.base import GovernanceModule
from dra_ma.tools.entity_resolver import ResolvedEntity


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

        if ctx.confirmed_entities:
            resolved = [_confirmed_to_resolved(item) for item in ctx.confirmed_entities]
            confirmed_names = [
                r.canonical_name or r.raw
                for r in resolved
                if (r.canonical_name or r.raw)
            ]
            for name in confirmed_names:
                if name and name not in ctx.raw_entities:
                    ctx.raw_entities.insert(0, name)
            if hasattr(ctx.parsed_intent, "Start_Entities") and confirmed_names:
                ctx.parsed_intent.Start_Entities = confirmed_names
            ctx.intent_type = ctx.intent_hint or ctx.intent_type
        else:
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


def _confirmed_to_resolved(item: dict[str, Any]) -> ResolvedEntity:
    raw = str(item.get("raw") or item.get("alias") or item.get("canonical_name") or "").strip()
    canonical = str(
        item.get("canonical_name")
        or item.get("canonicalName")
        or item.get("name")
        or raw
    ).strip()
    kg_node_id = str(
        item.get("kg_node_id")
        or item.get("kgNodeId")
        or item.get("id")
        or ""
    ).strip()
    score = float(item.get("match_score") or item.get("matchScore") or 1.0)
    confidence = float(item.get("confidence") or score or 1.0)
    return ResolvedEntity(
        raw=raw or canonical,
        canonical_name=canonical or raw,
        kg_node_id=kg_node_id,
        match_type="user_confirmed",
        match_score=max(0.0, min(score, 1.0)),
        confidence=max(0.0, min(confidence, 1.0)),
    )
