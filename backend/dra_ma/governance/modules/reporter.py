from __future__ import annotations

from typing import Any, AsyncGenerator

from dra_ma.governance.context import GovernanceContext
from dra_ma.governance.events import EventPublisher
from dra_ma.governance.modules.base import GovernanceModule


class ReporterModule(GovernanceModule):
    name = "reporter"
    depends_on = ["governance"]
    output_events = ["compliance_indicators", "report", "done"]

    async def run(
        self,
        ctx: GovernanceContext,
        services: Any,
        publisher: EventPublisher,
    ) -> AsyncGenerator[str, None]:
        if ctx.report or ctx.terminal or ctx.intent_type != "risk_analysis":
            return

        nodes = ctx.subgraph.nodes
        edges = ctx.subgraph.edges
        interpreted_paths = (ctx.risk_paths or {}).get("interpreted_paths", [])

        ctx.evidence_chains = services.evidence_builder.build(
            {
                "nodes": nodes,
                "edges": edges,
                "evidence_paths": ctx.subgraph.evidence_paths,
                "cypher_records": ctx.subgraph.cypher_records,
                "verified_claims": ctx.subgraph.verified_claims,
                "confidence": ctx.subgraph.confidence,
            },
            ctx.analytics,
        )

        ctx.compliance_indicators = services.compliance_indicator_engine.compute(
            nodes,
            edges,
            interpreted_paths,
            ctx.compliance,
            evidence_chains={
                "chains": [
                    {
                        "claim_id": chain.claim_id,
                        "claim": chain.claim,
                        "confidence": chain.confidence,
                        "verifier_score": chain.verifier_score,
                    }
                    for chain in ctx.evidence_chains.chains
                ],
                "overall_confidence": ctx.evidence_chains.overall_confidence,
            },
            risk_scores=ctx.scoring,
        )
        yield publisher.emit(
            "compliance",
            "compliance_indicators",
            "success",
            {"indicators": ctx.compliance_indicators},
        )

        yield publisher.emit(
            "reporting",
            "stage",
            "running",
            {"stage_name": "报告生成", "agent_action": "生成结构化风险报告..."},
        )

        report = await services.reporter.generate(
            query=ctx.query,
            trigger_event=None,
            node_count=len(nodes),
            edge_count=len(edges),
            risk_paths=interpreted_paths,
            anomalies=ctx.anomalies,
            compliance_matches=ctx.compliance,
            scoring_result=ctx.scoring,
            governance_plan=ctx.governance,
            evidence_chains={
                "chains": [
                    {
                        "claim_id": chain.claim_id,
                        "claim": chain.claim,
                        "confidence": chain.confidence,
                    }
                    for chain in ctx.evidence_chains.chains
                ],
                "overall_confidence": ctx.evidence_chains.overall_confidence,
            },
            resolved_entities=[services._serialize_resolved(r) for r in ctx.resolved_entities],
        )

        ctx.report = {
            "executive_summary": report.get("executive_summary", ""),
            "entity_stats": ctx.entity_stats,
            "community_info": ctx.communities,
            "entity_community_map": ctx.entity_community_map,
            "risk_paths": interpreted_paths,
            "anomaly_findings": ctx.anomalies,
            "compliance_matches": ctx.compliance,
            "risk_scores": ctx.scoring,
            "governance_plan": ctx.governance,
            "overall_risk_level": ctx.scoring.get("level", "medium"),
            "recommendations": report.get("recommendations", []),
            "integrated_report": report.get("markdown_report", ""),
            "markdown_report": report.get("markdown_report", ""),
            "subtasks_completed": 6,
            "subgraph_summary": {
                "node_count": len(nodes),
                "edge_count": len(edges),
            },
            "resolved_entities": [services._serialize_resolved(r) for r in ctx.resolved_entities],
            "evidence_chains": {
                "chains": [
                    {
                        "claim_id": chain.claim_id,
                        "claim": chain.claim,
                        "confidence": chain.confidence,
                    }
                    for chain in ctx.evidence_chains.chains
                ],
                "overall_confidence": ctx.evidence_chains.overall_confidence,
            },
        }

        yield publisher.emit("reporting", "report", "success", ctx.report)
        yield publisher.emit(
            "done",
            "done",
            "success",
            {
                "intent_type": "risk_analysis",
                "risk_level": ctx.scoring.get("level"),
                "node_count": len(nodes),
                "edge_count": len(edges),
            },
        )
