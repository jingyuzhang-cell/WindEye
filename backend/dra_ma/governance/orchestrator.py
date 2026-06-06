from __future__ import annotations

import logging
import time
from typing import Any, AsyncGenerator

from dra_ma.governance.context import GovernanceContext
from dra_ma.governance.errors import ErrorHandler
from dra_ma.governance.events import EventPublisher
from dra_ma.governance.registry import PluginRegistry
from dra_ma.governance.scheduler import StageScheduler

logger = logging.getLogger(__name__)


class GovernanceOrchestrator:
    """Coordinates modules without owning stage-specific business logic."""

    def __init__(
        self,
        services: Any,
        registry: PluginRegistry | None = None,
        scheduler: StageScheduler | None = None,
    ):
        self.services = services
        self.registry = registry or PluginRegistry.default()
        self.scheduler = scheduler or StageScheduler()

    async def run(self, ctx: GovernanceContext) -> AsyncGenerator[str, None]:
        ctx.session_id = ctx.session_id or ctx.sid
        start = time.time()
        publisher = EventPublisher(ctx)
        error_handler = ErrorHandler(publisher)

        logger.warning(
            "[GovernanceOrchestrator] ENTER query=%s intent_hint=%s max_hop=%s",
            ctx.query[:200], ctx.intent_hint, ctx.max_hop,
        )

        try:
            modules = self.scheduler.order(self.registry.modules())
            for module in modules:
                logger.warning("[GovernanceOrchestrator] Stage: %s", module.name)
                async for line in module.run(ctx, self.services, publisher):
                    yield line
                if ctx.report or self._is_terminal(ctx):
                    break
        except Exception as exc:
            logger.exception("[GovernanceOrchestrator] Pipeline failed: %s", exc)
            for line in error_handler.record(ctx, "orchestrator", exc):
                yield line
            return

        if not ctx.report and not self._is_terminal(ctx):
            yield publisher.emit(
                "done",
                "done",
                "success",
                {
                    "intent_type": ctx.intent_type,
                    "duration_ms": int((time.time() - start) * 1000),
                },
            )

    @staticmethod
    def _is_terminal(ctx: GovernanceContext) -> bool:
        if ctx.terminal:
            return True
        if ctx.subgraph is not None and getattr(ctx.subgraph, "insufficient_entities", False):
            return True
        return False

    def _can_use_file_fast_path(self, ctx: GovernanceContext) -> bool:
        return bool(
            ctx.intent_type == "risk_analysis"
            and ctx.file_context
            and self.services._should_use_file_fast_path(ctx.query)
        )

    def _emit_file_fast_path(self, ctx: GovernanceContext, publisher: EventPublisher) -> list[str]:
        ctx.subgraph = self.services._build_file_context_subgraph(ctx.file_context)
        ctx.report = self.services._build_file_context_report(
            query=ctx.query,
            file_context=ctx.file_context,
            subgraph=ctx.subgraph,
            resolved_entities=[],
            unresolved_entities=[],
        )
        report = ctx.report
        return [
            publisher.emit("entity_resolution", "stage", "success", {
                "stage_name": "实体识别",
                "agent_action": f"已从上传文件识别 {len(ctx.file_context.get('entities') or [])} 个风险主体",
            }),
            publisher.emit("subgraph", "subgraph", "success", {
                "nodes": ctx.subgraph.nodes,
                "edges": ctx.subgraph.edges,
                "node_count": len(ctx.subgraph.nodes),
                "edge_count": len(ctx.subgraph.edges),
                "relation_types": sorted(set(e.get("relation") or e.get("type") or "MENTION" for e in ctx.subgraph.edges)),
                "confidence": ctx.subgraph.confidence,
            }),
            publisher.emit("graph_analytics", "entity_stats", "success", report.get("entity_stats", {})),
            publisher.emit("graph_analytics", "community", "success", report.get("community_info", {})),
            publisher.emit("risk_analysis", "risk_paths", "success", {
                "candidate_paths": report.get("risk_paths", []),
                "interpreted_paths": report.get("risk_paths", []),
                "merged_paths": report.get("risk_paths", []),
            }),
            publisher.emit("risk_analysis", "anomaly_findings", "success", report.get("anomaly_findings", [])),
            publisher.emit("compliance", "compliance", "success", report.get("compliance_matches", [])),
            publisher.emit("scoring", "scoring", "warning", report.get("risk_scores", {})),
            publisher.emit("governance", "governance", "success", report.get("governance_plan", {})),
            publisher.emit("reporting", "report", "success", report),
            publisher.emit("done", "done", "success", {
                "intent_type": "risk_analysis",
                "risk_level": report.get("overall_risk_level"),
                "node_count": len(ctx.subgraph.nodes),
                "edge_count": len(ctx.subgraph.edges),
                "source": "file_context_fast_path",
            }),
        ]
