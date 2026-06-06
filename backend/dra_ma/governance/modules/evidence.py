from __future__ import annotations

import json
import logging
from typing import Any, AsyncGenerator

from dra_ma.governance.context import GovernanceContext
from dra_ma.governance.events import EventPublisher
from dra_ma.governance.modules.base import GovernanceModule

logger = logging.getLogger(__name__)


class EvidenceModule(GovernanceModule):
    name = "subgraph"
    depends_on = ["entity_resolution"]
    output_events = ["stage", "subgraph"]

    async def run(
        self,
        ctx: GovernanceContext,
        services: Any,
        publisher: EventPublisher,
    ) -> AsyncGenerator[str, None]:
        yield publisher.emit(
            "subgraph",
            "stage",
            "running",
            {"stage_name": "图谱推理", "agent_action": "DRAEngine 检索证据子图..."},
        )

        ctx.subgraph = await services._retrieve_subgraph(
            ctx.query,
            ctx.resolved_entities,
            ctx.max_hop,
            ctx.intent_type,
            ctx.parsed_intent,
        )

        if ctx.subgraph.insufficient_entities:
            if ctx.intent_type == "risk_analysis" and ctx.file_content:
                ctx.file_context = ctx.file_context or await services._extract_file_context(ctx.file_content)
                ctx.subgraph = services._build_file_context_subgraph(ctx.file_context)
                ctx.report = services._build_file_context_report(
                    query=ctx.query,
                    file_context=ctx.file_context,
                    subgraph=ctx.subgraph,
                    resolved_entities=ctx.resolved_entities,
                    unresolved_entities=ctx.unresolved_entities,
                )
                for line in self._emit_file_report(ctx, publisher, status="warning"):
                    yield line
                return

            if ctx.intent_type == "risk_analysis":
                ctx.report = self._build_insufficient_risk_report(ctx, services)
                for line in self._emit_insufficient_report(ctx, publisher):
                    yield line
                return

            yield publisher.emit(
                "subgraph",
                "stage",
                "warning",
                {"stage_name": "图谱推理", "agent_action": "未检索到足够实体，证据不足"},
            )
            yield publisher.emit(
                "done",
                "done",
                "success",
                {"level": "insufficient_evidence", "message": "未检索到足够关系证据，无法形成稳定风险评级"},
            )
            return

        ctx.relation_types = sorted(set(
            str(e.get("relation") or e.get("type") or e.get("label") or "?")
            for e in ctx.subgraph.edges
        ))
        logger.warning(
            "[GovernanceEvidence] nodes=%s edges=%s relation_types=%s",
            len(ctx.subgraph.nodes), len(ctx.subgraph.edges),
            json.dumps(ctx.relation_types, ensure_ascii=False),
        )
        yield publisher.emit(
            "subgraph",
            "subgraph",
            "success",
            {
                "nodes": ctx.subgraph.nodes,
                "edges": ctx.subgraph.edges,
                "node_count": len(ctx.subgraph.nodes),
                "edge_count": len(ctx.subgraph.edges),
                "relation_types": ctx.relation_types,
                "confidence": ctx.subgraph.confidence,
            },
        )

    def _emit_file_report(
        self,
        ctx: GovernanceContext,
        publisher: EventPublisher,
        status: str,
    ) -> list[str]:
        report = ctx.report or {}
        return [
            publisher.emit("subgraph", "subgraph", status, {
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
                "source": "file_context_fallback",
            }),
        ]

    def _build_insufficient_risk_report(self, ctx: GovernanceContext, services: Any) -> dict:
        resolved_names = [r.canonical_name for r in ctx.resolved_entities if getattr(r, "canonical_name", None)]
        unresolved_names = [r.raw for r in ctx.unresolved_entities if getattr(r, "raw", None)]
        raw_names = ctx.raw_entities or []
        subjects = resolved_names or raw_names or unresolved_names
        subject_text = "、".join(subjects[:6]) if subjects else "用户查询中的风险主体"
        reason = "未检索到足够实体或关系证据，无法稳定生成风险传导路径。"
        if unresolved_names:
            reason = f"部分实体未能在图谱中精确对齐：{'、'.join(unresolved_names[:4])}。"

        recommendations = [
            {"priority": "紧急", "action": f"核验“{subject_text}”的标准主体名称、简称和工商全称。", "owner": "数据治理组"},
            {"priority": "一般", "action": "补充关联公司、股权、任职、资金往来和监管处罚关系后重新生成社区报告。", "owner": "风控部"},
            {"priority": "一般", "action": "将未命中的简称/别名写入实体别名库，避免同类查询再次断链。", "owner": "知识图谱维护组"},
        ]

        return {
            "report_id": "",
            "query_summary": ctx.query,
            "executive_summary": f"已识别到风险分析意图，关注主体为 {subject_text}。{reason} 当前报告先给出证据补强和治理处置建议。",
            "entity_stats": {
                "total_entities": len(subjects),
                "total_relations": 0,
                "top_entities": [
                    {"id": name, "name": name, "type": "COMPANY", "degree": 0}
                    for name in subjects[:10]
                ],
            },
            "community_info": {
                "algorithm": "insufficient_evidence",
                "communities": [{
                    "community_id": 0,
                    "size": len(subjects),
                    "density": 0,
                    "members": [{"id": name, "name": name, "type": "COMPANY"} for name in subjects[:20]],
                    "top_entities": [{"id": name, "name": name, "type": "COMPANY"} for name in subjects[:8]],
                    "core_nodes": [{"id": name, "name": name, "type": "COMPANY"} for name in subjects[:3]],
                }],
                "visualization": {"flow": ["实体识别", "群体发现", "风险传导", "合规分析", "治理报告"]},
            },
            "entity_community_map": {
                "entities": [{"id": name, "name": name, "communities": [{"community_id": 0}]} for name in subjects],
                "unmapped_count": len(unresolved_names),
            },
            "risk_paths": [],
            "anomaly_findings": [{
                "id": "insufficient-evidence",
                "title": "图谱证据不足",
                "description": reason,
                "severity": "medium",
                "related_entities": subjects[:6],
            }],
            "compliance_matches": [{
                "regulation": "实体识别与数据治理要求",
                "matched_issue": reason,
                "risk_level": "medium",
                "action": "补充主体别名、关系边和证据来源后再进行合规匹配。",
            }],
            "risk_scores": {
                "base_overall": None,
                "final_overall": None,
                "overall": None,
                "level": "insufficient_evidence",
                "level_label": "证据不足",
                "reason": reason,
            },
            "governance_plan": {
                "measures": recommendations,
                "escalation_rules": ["关键主体无法对齐时，先进入实体确认和数据补强流程。"],
                "monitoring_checklist": ["核验主体标准名称", "补齐关联关系", "复查资金往来和监管处罚记录"],
            },
            "overall_risk_level": "insufficient_evidence",
            "recommendations": recommendations,
            "markdown_report": "\n".join([
                f"# {subject_text}社区风险报告",
                "",
                "## 1. 当前结论",
                reason,
                "",
                "## 2. 已识别主体",
                subject_text,
                "",
                "## 3. 治理建议",
                "先完成实体标准名、别名和关系证据补强，再重新执行风险传导与合规分析。",
            ]),
            "integrated_report": "",
            "subtasks_completed": 3,
            "subgraph_summary": {"node_count": len(getattr(ctx.subgraph, "nodes", []) or []), "edge_count": len(getattr(ctx.subgraph, "edges", []) or [])},
            "resolved_entities": [services._serialize_resolved(r) for r in ctx.resolved_entities],
            "unresolved_entities": [{"raw": name} for name in unresolved_names],
            "evidence_chains": {"chains": [], "overall_confidence": 0.0},
        }

    def _emit_insufficient_report(self, ctx: GovernanceContext, publisher: EventPublisher) -> list[str]:
        report = ctx.report or {}
        return [
            publisher.emit("subgraph", "stage", "warning", {"stage_name": "图谱检索", "agent_action": "未检索到足够实体，证据不足"}),
            publisher.emit("graph_analytics", "entity_stats", "warning", report.get("entity_stats", {})),
            publisher.emit("graph_analytics", "community", "warning", report.get("community_info", {})),
            publisher.emit("risk_analysis", "anomaly_findings", "warning", report.get("anomaly_findings", [])),
            publisher.emit("compliance", "compliance", "warning", report.get("compliance_matches", [])),
            publisher.emit("scoring", "scoring", "warning", report.get("risk_scores", {})),
            publisher.emit("governance", "governance", "warning", report.get("governance_plan", {})),
            publisher.emit("reporting", "report", "warning", report),
            publisher.emit("done", "done", "success", {
                "intent_type": "risk_analysis",
                "risk_level": "insufficient_evidence",
                "node_count": report.get("subgraph_summary", {}).get("node_count", 0),
                "edge_count": report.get("subgraph_summary", {}).get("edge_count", 0),
                "source": "insufficient_evidence_report",
            }),
        ]
