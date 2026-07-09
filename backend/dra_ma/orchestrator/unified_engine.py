"""Unified Engine — single pipeline orchestrating DRAEngine + Graph Analytics + Risk Plugins.

Replaces the split DRAEngine / RiskAnalysisEngine dual-pipeline architecture.
All SSE events use a unified envelope format:
  {event_id, session_id, stage, type, status, data, error, timestamp}

 Pipeline stages:
  1. Input Parser      — file content → unified text
  2. IntentAgent       — intent_type, raw_entities, task_config
  2.5. Entity Resolution — raw_entities → canonical KG node IDs
  3. DRAEngine         — retrieve_evidence_subgraph()
  4. Graph Analytics   — entity_stats, community, centrality, candidate_risk_paths
  5. Task Plugins      — risk_analysis → analyst → compliance → scoring → governance → reporter
                         graph_qa → Answer Agent
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator

from dra_ma.agents.layer1_perception.intent_agent import IntentAgent
from dra_ma.agents.layer3_execution.cypher_utils import call_llm, db_client
from dra_ma.prompts import PromptLoader
from dra_ma.tools.entity_resolver import EntityResolver, ResolvedEntity
from dra_ma.tools.graph_analytics_tools import GraphAnalyticsTool, GraphAnalyticsResult
from dra_ma.tools.community_discovery_tools import CommunityDiscoveryTool, CommunityMatcher
from dra_ma.tools.evidence_builder import EvidenceBuilder, EvidenceChains
from dra_ma.tools.compliance_scorer import ComplianceScorer
from dra_ma.tools.compliance_indicator_engine import ComplianceIndicatorEngine
from dra_ma.risk_engine.plugins.risk_analyst import RiskAnalystPlugin
from dra_ma.risk_engine.plugins.compliance import CompliancePlugin
from dra_ma.risk_engine.plugins.risk_scoring import RiskScoringPlugin
from dra_ma.risk_engine.plugins.governance import GovernancePlugin
from dra_ma.risk_engine.plugins.reporter import ReporterPlugin
from dra_ma.skills.base import SkillContext, SkillHook
from dra_ma.skills.registry import SkillManager
from dra_ma.risk_engine.risk_engine import RiskAnalysisEngine

logger = logging.getLogger(__name__)

_PLACEHOLDER_ENTITIES = {
    "文件", "该文件", "文档", "该文档", "报告", "该报告", "上传文件", "上传文档",
    "这份文件", "这份文档", "风险信息", "风险",
}

_RISK_QUERY_TERMS = (
    "风险", "协同治理", "治理报告", "社区报告", "传导", "异常", "合规", "违规",
    "监管", "处罚", "资金占用", "冻结", "担保", "关联交易",
)

_FILE_QUERY_TERMS = ("该文件", "文件", "上传文件", "该文档", "文档", "上传文档", "报告中")


def _clean_extracted_entity(name: str) -> str:
    text = str(name or "").strip(" \t\r\n，,。；;：:、（）()《》“”\"'")
    text = re.sub(r"^(?:对|与|和|及|及其|涉及|关联|关于|以下简称|简称|下称)+", "", text)
    text = re.sub(r"(?:及其关联企业|及其关联公司|关联企业|关联公司|相关主体)$", "", text)
    text = text.strip(" \t\r\n，,。；;：:、（）()《》“”\"'")
    return text


def _extract_entity_tail(text: str, suffix: str, max_prefix: int = 14) -> list[str]:
    results: list[str] = []
    pattern = re.compile(rf"[\u4e00-\u9fff]{{2,{max_prefix}}}{re.escape(suffix)}")
    stop_chars = "，,。；;：:、（）()《》“”\"' \t\r\n"
    prefix_cut_words = (
        "本报告基于", "公开市场信息", "监管披露文件", "综合分析", "以下简称",
        "请分析", "请查询", "帮我分析", "帮我查", "分析", "查询",
        "存在", "涉及", "提供", "投资", "控股", "担保", "对",
    )
    for match in pattern.finditer(text or ""):
        candidate = match.group(0)
        for char in stop_chars:
            if char in candidate:
                candidate = candidate.split(char)[-1]
        for word in prefix_cut_words:
            idx = candidate.rfind(word)
            if idx >= 0:
                candidate = candidate[idx + len(word):]
        candidate = _clean_extracted_entity(candidate)
        if candidate.endswith(suffix):
            results.append(candidate)
    return results


def _is_placeholder_entity(name: str) -> bool:
    text = str(name or "").strip()
    return not text or text in _PLACEHOLDER_ENTITIES or len(text) <= 1


def _dedupe_valid_entities(entities: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for entity in entities or []:
        name = _clean_extracted_entity(str(entity or ""))
        if _is_placeholder_entity(name) or name in seen:
            continue
        seen.add(name)
        result.append(name)
    return result


def _extract_query_entities_heuristic(query: str) -> list[str]:
    """Extract explicit entity mentions from a short user query.

    Intent LLMs occasionally return no entity for natural Chinese requests such
    as "请分析华创证券有限责任公司与关联公司...". This deterministic fallback only
    picks full legal-name shaped spans, so abbreviations like "华创" still go
    through the existing clarification flow instead of being guessed.
    """
    text = query or ""
    entities: list[str] = []
    suffixes = (
        "金融投资管理有限公司",
        "投资管理有限公司",
        "证券有限责任公司",
        "金融服务有限公司",
        "控股集团有限公司",
        "贸易有限责任公司",
        "有限责任公司",
        "股份有限公司",
        "集团有限公司",
        "有限公司",
    )
    for suffix in suffixes:
        entities.extend(_extract_entity_tail(text, suffix, max_prefix=22))

    quoted_patterns = [
        r"[“\"'《\[]([^“”\"'《》\[\]]{2,40}(?:公司|集团|企业|机构|银行|证券|信托))[”\"'》\]]",
    ]
    for pattern in quoted_patterns:
        entities.extend(re.findall(pattern, text))
    return _dedupe_valid_entities(entities)


def _extract_file_entities_heuristic(file_text: str) -> dict:
    """Deterministic backup when the LLM extractor cannot be used."""
    text = (file_text or "")[:20000]
    entities: list[str] = []
    company_suffixes = (
        "投资管理有限公司",
        "金融服务有限公司",
        "贸易有限责任公司",
        "控股集团有限公司",
        "股份有限公司",
        "集团有限公司",
        "有限公司",
    )
    for suffix in company_suffixes:
        entities.extend(_extract_entity_tail(text, suffix))

    risk_patterns = [
        r"([\u4e00-\u9fff]{2,16}(?:资金占用|股权冻结|违规担保|关联交易|债务违约|诉讼纠纷|监管处罚))",
    ]
    for pattern in risk_patterns:
        entities.extend(re.findall(pattern, text))

    risk_signals: list[str] = []
    sentence_parts = re.split(r"[。！？\n\r；;]", text)
    for sentence in sentence_parts:
        clean = sentence.strip()
        if not clean or len(clean) > 90:
            continue
        if any(term in clean for term in ("资金占用", "股权冻结", "违规", "处罚", "诉讼", "担保", "冻结", "异常", "监管")):
            risk_signals.append(clean)
        if len(risk_signals) >= 8:
            break

    return {
        "summary": "；".join(risk_signals[:2])[:120],
        "entities": _dedupe_valid_entities(entities)[:10],
        "risk_signals": risk_signals[:8],
        "is_financial_risk_relevant": bool(entities or risk_signals),
        "source": "heuristic",
    }

# ── Envelope builder ──────────────────────────────────────────────────────────


def _envelope(
    session_id: str,
    round_id: int,
    stage: str,
    event_type: str,
    status: str,
    data: Any,
    error: str | None = None,
) -> str:
    """Build a unified SSE envelope JSON string."""
    return json.dumps({
        "event_id": uuid.uuid4().hex[:12],
        "session_id": session_id,
        "round_id": round_id,
        "stage": stage,
        "type": event_type,
        "status": status,
        "data": data,
        "error": error,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }, ensure_ascii=False)


def _trace_event(sid: str, round_id: int, agent: str, step: str, data: dict) -> str:
    """构建 SSE agent_trace 摘要事件（仅发摘要，不发完整 payload）。

    详细日志留在后端 agent_trace()，SSE 只发摘要避免前端 reasoningLog 过大。
    """
    compact = {
        "agent": agent,
        "step": step,
        "summary": data.get("summary") or data.get("reason") or "",
        "metrics": data.get("metrics") or {},
        "timestamp": time.time(),
    }
    return _envelope(sid, round_id, "agent_trace", "agent_trace", "success", compact)


# ── EvidenceSubgraph ──────────────────────────────────────────────────────────


@dataclass
class EvidenceSubgraph:
    nodes: list[dict] = field(default_factory=list)
    edges: list[dict] = field(default_factory=list)
    evidence_paths: list[dict] = field(default_factory=list)
    cypher_records: list[dict] = field(default_factory=list)
    verified_claims: list[dict] = field(default_factory=list)
    failed_queries: list[dict] = field(default_factory=list)
    graph_summary: dict = field(default_factory=dict)
    confidence: float = 0.0
    insufficient_entities: bool = False


def _coerce_evidence_subgraph(raw: Any) -> EvidenceSubgraph:
    """将 DRAEngine 返回的 dict 或 dataclass 统一转为 EvidenceSubgraph。"""
    if isinstance(raw, EvidenceSubgraph):
        return raw
    if isinstance(raw, dict):
        return EvidenceSubgraph(
            nodes=raw.get("nodes", []) or [],
            edges=raw.get("edges", []) or [],
            evidence_paths=raw.get("evidence_paths", []) or [],
            cypher_records=raw.get("cypher_records", []) or [],
            verified_claims=raw.get("verified_claims", []) or [],
            failed_queries=raw.get("failed_queries", []) or [],
            graph_summary=raw.get("graph_summary", {}) or {},
            confidence=float(raw.get("confidence", 0.0) or 0.0),
            insufficient_entities=bool(raw.get("insufficient_entities", False)),
        )
    return EvidenceSubgraph(insufficient_entities=True)


def _evidence_subgraph_to_dict(subgraph: EvidenceSubgraph) -> dict:
    """将 EvidenceSubgraph 转回 dict，用于 SSE JSON 序列化。"""
    return {
        "nodes": subgraph.nodes,
        "edges": subgraph.edges,
        "evidence_paths": subgraph.evidence_paths,
        "cypher_records": subgraph.cypher_records,
        "verified_claims": subgraph.verified_claims,
        "failed_queries": subgraph.failed_queries,
        "graph_summary": subgraph.graph_summary,
        "confidence": subgraph.confidence,
        "insufficient_entities": subgraph.insufficient_entities,
    }


# ── UnifiedEngine ─────────────────────────────────────────────────────────────


class UnifiedEngine:
    """Unified pipeline orchestrator for both graph_qa and risk_analysis.

    Usage:
        engine = UnifiedEngine(dra_engine, demo=False)
        async for sse_line in engine.stream(query, session_id="s1"):
            yield sse_line
    """

    def __init__(self, dra_engine: Any = None, demo: bool = False):
        self.dra = dra_engine
        self.demo = demo
        self.entity_resolver = EntityResolver(enable_llm_fallback=not demo)
        self.graph_tool = GraphAnalyticsTool()
        self.community_tool = CommunityDiscoveryTool()
        self.evidence_builder = EvidenceBuilder()
        self.risk_analyst = RiskAnalystPlugin(demo=demo)
        self.compliance = CompliancePlugin(demo=demo)
        self.scoring = RiskScoringPlugin(demo=demo)
        self.governance = GovernancePlugin(demo=demo)
        self.reporter = ReporterPlugin(demo=demo)
        self.compliance_indicator_engine = ComplianceIndicatorEngine()

    # ── Main stream entry ──────────────────────────────────────────

    async def stream(
        self,
        query: str,
        session_id: str = "",
        round_id: int = 1,
        max_hop: int = 3,
        intent_hint: str | None = None,
        file_content: str | None = None,
        confirmed_entities: list[dict[str, Any]] | None = None,
        workflow: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Run the full unified pipeline and yield SSE envelope lines.

        Args:
            query: User query text.
            session_id: Session identifier.
            round_id: Conversation round counter.
            max_hop: Maximum graph traversal hops.
            intent_hint: Optional intent_type hint to skip classification LLM.
            file_content: Optional uploaded file text for entity extraction.
        """
        from dra_ma.governance import GovernanceContext, GovernanceOrchestrator

        ctx = GovernanceContext(
            query=query,
            session_id=session_id,
            round_id=round_id,
            intent_hint=intent_hint,
            max_hop=max_hop,
            file_content=file_content,
            confirmed_entities=confirmed_entities or [],
            workflow=workflow,
            demo=self.demo,
        )
        orchestrator = GovernanceOrchestrator(services=self)
        async for line in orchestrator.run(ctx):
            yield line
        return

        # Legacy inline orchestration is kept below as a migration reference.
        # Runtime now goes through dra_ma.governance.GovernanceOrchestrator.
        sid = session_id or f"sess-{uuid.uuid4().hex[:10]}"
        stage_start = time.time()

        logger.warning(
            "[UnifiedEngine] ENTER unified pipeline query=%s intent_hint=%s max_hop=%s",
            query[:200], intent_hint, max_hop,
        )

        try:
            # ── Stage 1: IntentAgent ────────────────────────────────
            logger.warning("[UnifiedEngine] Stage: intent_classification")
            yield _envelope(sid, round_id, "intent", "stage", "running",
                            {"stage_name": "意图解析", "agent_action": "识别查询意图与实体..."})

            if intent_hint and not self.demo:
                raw_entities, task_config, parsed_intent = await self._intent_light(query, intent_hint, file_content)
            else:
                raw_entities, task_config, parsed_intent = await self._intent_full(query, file_content)

            intent_type = intent_hint or task_config.get("intent_type", "graph_qa")
            yield _envelope(sid, round_id, "intent", "stage", "success",
                            {"stage_name": "意图解析",
                             "agent_action": f"意图: {intent_type}, 原始实体: {raw_entities}",
                             "intent_type": intent_type,
                             "raw_entities": raw_entities})

            file_context = task_config.get("file_context")
            if intent_type == "risk_analysis" and file_context and self._should_use_file_fast_path(query):
                fallback_subgraph = self._build_file_context_subgraph(file_context)
                fallback_report = self._build_file_context_report(
                    query=query,
                    file_context=file_context,
                    subgraph=fallback_subgraph,
                    resolved_entities=[],
                    unresolved_entities=[],
                )
                yield _envelope(sid, round_id, "entity_resolution", "stage", "success",
                                {"stage_name": "实体识别",
                                 "agent_action": f"已从上传文件识别 {len(file_context.get('entities') or [])} 个风险主体"})
                yield _envelope(sid, round_id, "subgraph", "subgraph", "success",
                                {"nodes": fallback_subgraph.nodes, "edges": fallback_subgraph.edges,
                                 "node_count": len(fallback_subgraph.nodes),
                                 "edge_count": len(fallback_subgraph.edges),
                                 "relation_types": sorted(set(e.get("relation") or e.get("type") or "MENTION" for e in fallback_subgraph.edges)),
                                 "confidence": fallback_subgraph.confidence})
                yield _envelope(sid, round_id, "graph_analytics", "entity_stats", "success",
                                fallback_report["entity_stats"])
                yield _envelope(sid, round_id, "graph_analytics", "community", "success",
                                fallback_report["community_info"])
                yield _envelope(sid, round_id, "risk_analysis", "risk_paths", "success", {
                    "candidate_paths": fallback_report["risk_paths"],
                    "interpreted_paths": fallback_report["risk_paths"],
                    "merged_paths": fallback_report["risk_paths"],
                })
                yield _envelope(sid, round_id, "risk_analysis", "anomaly_findings", "success",
                                fallback_report["anomaly_findings"])
                yield _envelope(sid, round_id, "compliance", "compliance", "success",
                                fallback_report["compliance_matches"])
                yield _envelope(sid, round_id, "scoring", "scoring", "warning",
                                fallback_report["risk_scores"])
                yield _envelope(sid, round_id, "governance", "governance", "success",
                                fallback_report["governance_plan"])
                yield _envelope(sid, round_id, "reporting", "report", "success", fallback_report)
                yield _envelope(sid, round_id, "done", "done", "success",
                                {"intent_type": "risk_analysis",
                                 "risk_level": fallback_report["overall_risk_level"],
                                 "node_count": len(fallback_subgraph.nodes),
                                 "edge_count": len(fallback_subgraph.edges),
                                 "source": "file_context_fast_path"})
                return

            # ── Stage 2.5: Entity Resolution ─────────────────────────
            logger.warning("[UnifiedEngine] Stage: entity_resolution")
            yield _envelope(sid, round_id, "entity_resolution", "stage", "running",
                            {"stage_name": "实体对齐", "agent_action": "标准化实体名称..."})

            resolved = await self.entity_resolver.resolve(raw_entities)
            resolved_entities = [r for r in resolved if r.kg_node_id]
            unresolved_entities = [r for r in resolved if not r.kg_node_id]
            entity_status = "warning" if unresolved_entities else "success"

            yield _envelope(sid, round_id, "entity_resolution", "entities", entity_status,
                            {"resolved": [self._serialize_resolved(r) for r in resolved_entities],
                             "unresolved": [{"raw": r.raw} for r in unresolved_entities],
                             "resolved_count": len(resolved_entities),
                             "unresolved_count": len(unresolved_entities)})

            # ── Stage 3: DRAEngine Evidence Subgraph ─────────────────
            logger.warning("[UnifiedEngine] Stage: retrieve_evidence_subgraph")
            yield _envelope(sid, round_id, "subgraph", "stage", "running",
                            {"stage_name": "图谱推理", "agent_action": "DRAEngine 检索证据子图..."})

            subgraph = await self._retrieve_subgraph(
                query, resolved_entities, max_hop, intent_type, parsed_intent,
            )

            if subgraph.insufficient_entities:
                if intent_type == "risk_analysis" and file_content:
                    file_context = task_config.get("file_context") or await self._extract_file_context(file_content)
                    fallback_subgraph = self._build_file_context_subgraph(file_context)
                    fallback_report = self._build_file_context_report(
                        query=query,
                        file_context=file_context,
                        subgraph=fallback_subgraph,
                        resolved_entities=resolved_entities,
                        unresolved_entities=unresolved_entities,
                    )
                    yield _envelope(sid, round_id, "subgraph", "subgraph", "warning",
                                    {"nodes": fallback_subgraph.nodes, "edges": fallback_subgraph.edges,
                                     "node_count": len(fallback_subgraph.nodes),
                                     "edge_count": len(fallback_subgraph.edges),
                                     "relation_types": sorted(set(e.get("relation") or e.get("type") or "MENTION" for e in fallback_subgraph.edges)),
                                     "confidence": fallback_subgraph.confidence})
                    yield _envelope(sid, round_id, "graph_analytics", "entity_stats", "success",
                                    fallback_report["entity_stats"])
                    yield _envelope(sid, round_id, "graph_analytics", "community", "success",
                                    fallback_report["community_info"])
                    yield _envelope(sid, round_id, "risk_analysis", "risk_paths", "success", {
                        "candidate_paths": fallback_report["risk_paths"],
                        "interpreted_paths": fallback_report["risk_paths"],
                        "merged_paths": fallback_report["risk_paths"],
                    })
                    yield _envelope(sid, round_id, "risk_analysis", "anomaly_findings", "success",
                                    fallback_report["anomaly_findings"])
                    yield _envelope(sid, round_id, "compliance", "compliance", "success",
                                    fallback_report["compliance_matches"])
                    yield _envelope(sid, round_id, "scoring", "scoring", "warning",
                                    fallback_report["risk_scores"])
                    yield _envelope(sid, round_id, "governance", "governance", "success",
                                    fallback_report["governance_plan"])
                    yield _envelope(sid, round_id, "reporting", "report", "success", fallback_report)
                    yield _envelope(sid, round_id, "done", "done", "success",
                                    {"intent_type": "risk_analysis",
                                     "risk_level": fallback_report["overall_risk_level"],
                                     "node_count": len(fallback_subgraph.nodes),
                                     "edge_count": len(fallback_subgraph.edges),
                                     "source": "file_context_fallback"})
                    return

                yield _envelope(sid, round_id, "subgraph", "stage", "warning",
                                {"stage_name": "图谱推理",
                                 "agent_action": "未检索到足够实体，证据不足"})
                yield _envelope(sid, round_id, "done", "done", "success",
                                {"level": "insufficient_evidence",
                                 "message": "未检索到足够关系证据，无法形成稳定风险评级"})
                return

            relation_types = sorted(set(
                str(e.get("relation") or e.get("type") or e.get("label") or "?")
                for e in subgraph.edges
            ))
            logger.warning(
                "[UnifiedEngine][SSE_SUBGRAPH] nodes=%s edges=%s relation_types=%s",
                len(subgraph.nodes), len(subgraph.edges),
                json.dumps(relation_types, ensure_ascii=False),
            )
            yield _envelope(sid, round_id, "subgraph", "subgraph", "success",
                            {"nodes": subgraph.nodes, "edges": subgraph.edges,
                             "node_count": len(subgraph.nodes),
                             "edge_count": len(subgraph.edges),
                             "relation_types": relation_types,
                             "confidence": subgraph.confidence})

            # ── Stage 4: Graph Analytics ─────────────────────────────
            logger.warning("[UnifiedEngine] Stage: graph_analytics")
            yield _envelope(sid, round_id, "graph_analytics", "stage", "running",
                            {"stage_name": "图计算分析", "agent_action": "计算图谱统计指标..."})

            analytics = await self._run_graph_analytics(subgraph)

            yield _envelope(sid, round_id, "graph_analytics", "entity_stats", "success",
                            analytics.entity_stats)
            yield _envelope(sid, round_id, "graph_analytics", "community", "success",
                            analytics.communities)
            yield _envelope(sid, round_id, "graph_analytics", "entity_community_map", "success",
                            analytics.entity_community_map)

            if analytics.candidate_risk_paths:
                yield _envelope(sid, round_id, "graph_analytics", "candidate_risk_paths", "success",
                                analytics.candidate_risk_paths)

            # ── Stage 5: Task Plugins ────────────────────────────────
            if intent_type == "risk_analysis":
                logger.warning("[UnifiedEngine] Stage: risk_plugins")
                async for line in self._run_risk_plugins(
                    sid, round_id, query, subgraph, analytics,
                    resolved_entities, unresolved_entities,
                ):
                    yield line
            else:
                # graph_qa: DRAEngine subgraph + analytics is sufficient
                yield _envelope(sid, round_id, "done", "done", "success",
                                {"intent_type": "graph_qa",
                                 "node_count": len(subgraph.nodes),
                                 "edge_count": len(subgraph.edges),
                                 "duration_ms": int((time.time() - stage_start) * 1000)})

        except Exception as exc:
            logger.exception("[UnifiedEngine] Pipeline failed: %s", exc)
            yield _envelope(sid, round_id, "error", "error", "error", {}, str(exc))
            # 输出可展示的 skeleton report，前端不会空白
            yield _envelope(sid, round_id, "reporting", "report", "error", {
                "overall_risk_level": "insufficient_evidence",
                "risk_scores": {
                    "overall": None,
                    "level": "insufficient_evidence",
                    "level_label": "证据不足",
                    "reason": str(exc),
                },
                "executive_summary": f"风险分析失败：{str(exc)}",
                "risk_paths": [],
                "anomaly_findings": [],
                "compliance_matches": [],
                "recommendations": [],
            }, error=str(exc))
            yield _envelope(sid, round_id, "done", "done", "success", {})

    # ── Intent ──────────────────────────────────────────────────────

    async def _intent_full(self, query: str, file_content: str | None) -> tuple[list[str], dict]:
        """Full LLM intent classification + entity extraction."""
        try:
            system = PromptLoader.render_intent_system()
            user = PromptLoader.render_intent_user(query)
            raw = await call_llm(
                system=system, user=user,
                temperature=0.1, response_format={"type": "json_object"},
            )
            data = json.loads(raw) if raw else {}
            entities = _dedupe_valid_entities([
                *data.get("raw_entities", []),
                *_extract_query_entities_heuristic(query),
            ])
            task_config = {
                "intent_type": data.get("intent_type", "graph_qa"),
                "reasoning": data.get("reasoning", ""),
                "confidence": data.get("confidence", 0.5),
            }
            if file_content and (
                not _dedupe_valid_entities(entities)
                or any(term in query for term in _RISK_QUERY_TERMS)
            ):
                file_context = await self._extract_file_context(file_content)
                file_entities = _dedupe_valid_entities(file_context.get("entities", []))
                entities = _dedupe_valid_entities([*entities, *file_entities])
                task_config["file_context"] = file_context
                if any(term in query for term in _RISK_QUERY_TERMS):
                    task_config["intent_type"] = "risk_analysis"
            return entities, task_config, None
        except Exception as exc:
            logger.warning("[UnifiedEngine] Intent classification failed: %s", exc)
            return [], {"intent_type": "graph_qa"}, None

    async def _intent_light(
        self, query: str, intent_hint: str, file_content: str | None,
    ) -> tuple[list[str], dict]:
        """Light intent: skip classification LLM but still extract entities."""
        try:
            if file_content and intent_hint == "risk_analysis" and self._should_use_file_fast_path(query):
                extraction = await self._extract_file_context(file_content)
                return (
                    _dedupe_valid_entities(extraction.get("entities", [])),
                    {"intent_type": intent_hint, "file_context": extraction},
                    None,
                )

            bracket_match = __import__("re").search(r"\[(.*?)\]", query)
            bracket_entity = bracket_match.group(1) if bracket_match else ""

            # Use IntentAgent for entity extraction only
            intent = await IntentAgent.parse(query, intent_hint=intent_hint)
            entity = (
                bracket_entity
                if bracket_entity
                else (intent.Start_Entities[0] if intent.Start_Entities else "")
            )
            entities = [entity] if entity else []
            entities = _dedupe_valid_entities([
                *entities,
                *_extract_query_entities_heuristic(query),
            ])

            # If the query only points to "the uploaded file", use the file text as
            # the real entity source. IntentAgent often returns the placeholder
            # entity "文件", which should not be resolved against Neo4j.
            task_config = {"intent_type": intent_hint}
            if file_content and (
                not _dedupe_valid_entities(entities)
                or all(_is_placeholder_entity(e) for e in entities)
                or any(term in query for term in _RISK_QUERY_TERMS)
            ):
                extraction = await self._extract_file_context(file_content)
                entities = _dedupe_valid_entities(extraction.get("entities", []))
                task_config["file_context"] = extraction
            else:
                entities = _dedupe_valid_entities(entities)

            return entities, task_config, intent
        except Exception as exc:
            logger.warning("[UnifiedEngine] Light intent failed: %s", exc)
            return [], {"intent_type": intent_hint}, None

    async def _extract_file_context(self, file_content: str) -> dict:
        """Extract and normalize document entities, risk signals, and summary."""
        heuristic_context = _extract_file_entities_heuristic(file_content)
        llm_context: dict = {}
        if not heuristic_context.get("entities") and not heuristic_context.get("risk_signals"):
            try:
                llm_context = await asyncio.wait_for(
                    RiskAnalysisEngine._extract_from_file_content_llm(file_content),
                    timeout=12,
                )
            except Exception as exc:
                logger.warning("[FileExtraction] LLM supplement skipped: %s", exc)

        entities = _dedupe_valid_entities([
            *(heuristic_context.get("entities") or []),
            *(llm_context.get("entities") or []),
        ])[:12]
        risk_signals = []
        seen_signal: set[str] = set()
        for signal in [*(heuristic_context.get("risk_signals") or []), *(llm_context.get("risk_signals") or [])]:
            text = str(signal or "").strip()
            if text and text not in seen_signal:
                seen_signal.add(text)
                risk_signals.append(text)

        return {
            "summary": llm_context.get("summary") or heuristic_context.get("summary") or "已从上传文件提取风险主体和风险信号。",
            "entities": entities,
            "risk_signals": risk_signals[:10],
            "is_financial_risk_relevant": bool(
                llm_context.get("is_financial_risk_relevant", False)
                or heuristic_context.get("is_financial_risk_relevant", False)
                or entities
                or risk_signals
            ),
            "source": "file_content",
        }

    # ── Subgraph retrieval ──────────────────────────────────────────

    async def _retrieve_subgraph(
        self,
        query: str,
        resolved_entities: list[ResolvedEntity],
        max_hop: int,
        intent_type: str,
        parsed_intent=None,
    ) -> EvidenceSubgraph:
        """Retrieve evidence subgraph via DRAEngine or fallback Neo4j queries."""
        entity_names = [r.canonical_name for r in resolved_entities if r.canonical_name]
        entity_ids = [str(r.kg_node_id) for r in resolved_entities if r.kg_node_id]

        # Try DRAEngine if available
        if self.dra and hasattr(self.dra, "retrieve_evidence_subgraph"):
            try:
                relation_focus = (
                    ["INVEST", "CONTROL", "CONTROLLER", "CONTROLL", "GUARANTEE",
                     "SERVE", "TRANSACTION", "WARNING", "MENTION", "WORK",
                     "REFLECTS", "CAUSE", "SUE", "JOINDER", "MANAGER", "TRUSTEE",
                     "CUSTOMER", "SUPPLIER", "ISSUE", "BRANCH"]
                    if intent_type == "risk_analysis" else None
                )
                raw = await self.dra.retrieve_evidence_subgraph(
                    query=query,
                    entities=entity_names or None,
                    max_hops=max_hop,
                    intent_type=intent_type,
                    relation_focus=relation_focus,
                    intent_obj=parsed_intent,
                )
                subgraph = _coerce_evidence_subgraph(raw)

                logger.warning(
                    "[UnifiedEngine][DRA] subgraph nodes=%s edges=%s insufficient=%s",
                    len(subgraph.nodes), len(subgraph.edges), subgraph.insufficient_entities,
                )
                if subgraph.nodes and not subgraph.insufficient_entities:
                    return subgraph
                logger.warning(
                    "[UnifiedEngine][DRA] empty/insufficient subgraph; fallback by kg_node_id=%s names=%s",
                    entity_ids[:5],
                    entity_names[:5],
                )
            except Exception as exc:
                logger.exception("[UnifiedEngine] DRAEngine retrieve failed: %s, using fallback", exc)

        # Fallback: direct Neo4j queries
        return await self._fallback_subgraph(resolved_entities, max_hop)

    async def _fallback_subgraph(
        self, resolved_entities: list[ResolvedEntity], max_hop: int,
    ) -> EvidenceSubgraph:
        """Fallback subgraph retrieval when DRAEngine is unavailable.

        Prefer Neo4j element IDs from entity alignment. Name matching is kept as a
        second path only for partially resolved entities. This avoids the common
        failure mode where the LLM extracts a correct company name, the resolver
        finds the KG node, but evidence retrieval searches the wrong property or
        layer and the downstream community/risk modules never run.
        """
        if not resolved_entities:
            return EvidenceSubgraph(insufficient_entities=True)

        safe_hop = max(1, min(int(max_hop or 1), 5))
        entity_ids = [str(r.kg_node_id) for r in resolved_entities if r.kg_node_id]
        entity_names = [
            str(r.canonical_name or r.raw).strip()
            for r in resolved_entities
            if str(r.canonical_name or r.raw or "").strip()
        ]
        all_nodes: dict[str, dict] = {}
        all_edges: dict[str, dict] = {}

        def _merge_rows(rows: list[dict]) -> None:
            def node_key(raw: Any) -> str:
                if hasattr(raw, "element_id"):
                    return str(raw.element_id)
                if isinstance(raw, dict):
                    return str(
                        raw.get("element_id")
                        or raw.get("NODE_ID")
                        or raw.get("id")
                        or raw.get("COMPANY_ID")
                        or raw.get("PERSON_ID")
                        or raw.get("SECURITY_ID")
                        or raw.get("COMPANY_NM")
                        or raw.get("PERSON_NM")
                        or raw.get("name")
                        or raw.get("title")
                        or id(raw)
                    )
                return str(id(raw))

            def node_name(raw: Any) -> str:
                if isinstance(raw, dict):
                    return str(
                        raw.get("name")
                        or raw.get("COMPANY_NM")
                        or raw.get("PERSON_NM")
                        or raw.get("SECURITY_NM")
                        or raw.get("title")
                        or raw.get("id")
                        or raw.get("NODE_ID")
                        or node_key(raw)
                    )
                props = dict(raw) if hasattr(raw, "items") else {}
                return str(props.get("name") or props.get("COMPANY_NM") or node_key(raw))

            def node_labels(raw: Any) -> list[str]:
                if hasattr(raw, "labels"):
                    return list(raw.labels)
                if not isinstance(raw, dict):
                    return ["Entity"]
                if raw.get("PERSON_NM"):
                    return ["PERSON", "Entity"]
                if raw.get("COMPANY_NM"):
                    return ["COMPANY", "Entity"]
                if raw.get("SECURITY_NM"):
                    return ["SECURITY", "Entity"]
                if raw.get("title"):
                    return ["EVENT", "Entity"]
                return ["Entity"]

            def put_node(raw: Any) -> str:
                nid = node_key(raw)
                if nid not in all_nodes:
                    labels = node_labels(raw)
                    props = dict(raw) if isinstance(raw, dict) else {}
                    name = node_name(raw)
                    entity_type = next((label for label in labels if label != "Entity"), "Entity")
                    all_nodes[nid] = {
                        "id": nid,
                        "name": name,
                        "label": name,
                        "type": entity_type,
                        "entity_type": entity_type,
                        "labels": labels,
                        "properties": props,
                    }
                return nid

            def put_edge(raw: Any) -> None:
                if isinstance(raw, tuple) and len(raw) >= 3:
                    src_raw, rel_type, tgt_raw = raw[0], raw[1], raw[2]
                    src = put_node(src_raw)
                    tgt = put_node(tgt_raw)
                    rel = str(rel_type or "RELATED")
                    eid = f"{src}-{rel}-{tgt}"
                    if eid not in all_edges:
                        all_edges[eid] = {
                            "id": eid,
                            "source": src,
                            "target": tgt,
                            "label": rel,
                            "relation": rel,
                            "type": rel,
                            "raw_type": rel,
                            "properties": {},
                        }
                elif hasattr(raw, "element_id") and hasattr(raw, "start_node"):
                    edge_id = str(raw.element_id)
                    if edge_id not in all_edges:
                        from core.database import Neo4jClient
                        all_edges[edge_id] = Neo4jClient.serialize_relationship(raw)

            def consume(value: Any) -> None:
                if value is None:
                    return
                if isinstance(value, list):
                    for item in value:
                        consume(item)
                    return
                if isinstance(value, tuple) and len(value) >= 3:
                    put_edge(value)
                    return
                if isinstance(value, dict) or hasattr(value, "labels"):
                    put_node(value)

            for row in rows or []:
                for value in row.values():
                    consume(value)

        if entity_ids:
            center_cypher = """
            MATCH (n)
            WHERE elementId(n) IN $ids
            RETURN n
            LIMIT 20
            """
            path_cypher = f"""
            MATCH (n)
            WHERE elementId(n) IN $ids
            WITH n LIMIT 10
            MATCH path=(n)-[*1..{safe_hop}]-(m)
            RETURN nodes(path) AS nodes, relationships(path) AS rels
            LIMIT 300
            """
            try:
                center_rows = await asyncio.to_thread(
                    db_client.execute_read, center_cypher, {"ids": entity_ids[:10]}, 10.0,
                )
                _merge_rows(center_rows)
                path_rows = await asyncio.to_thread(
                    db_client.execute_read, path_cypher, {"ids": entity_ids[:10]}, 20.0,
                )
                _merge_rows(path_rows)
            except Exception as exc:
                logger.warning("[UnifiedEngine] Fallback id query failed ids=%s: %s", entity_ids[:5], exc)

        if not all_edges and entity_names:
            name_cypher = f"""
            MATCH (n)
            WHERE n.name IN $names
               OR n.COMPANY_NM IN $names
               OR n.PERSON_NM IN $names
               OR n.title IN $names
               OR n.zh_name IN $names
               OR n.id IN $names
            WITH n LIMIT 10
            MATCH path=(n)-[*1..{safe_hop}]-(m)
            RETURN nodes(path) AS nodes, relationships(path) AS rels
            LIMIT 300
            """
            try:
                rows = await asyncio.to_thread(
                    db_client.execute_read, name_cypher, {"names": entity_names[:10]}, 20.0,
                )
                _merge_rows(rows)
            except Exception as exc:
                logger.warning("[UnifiedEngine] Fallback name query failed names=%s: %s", entity_names[:5], exc)

        node_list = list(all_nodes.values())
        edge_list = list(all_edges.values())

        if not node_list:
            return EvidenceSubgraph(insufficient_entities=True)

        logger.warning(
            "[UnifiedEngine][fallback_subgraph] nodes=%s edges=%s ids=%s names=%s",
            len(node_list),
            len(edge_list),
            entity_ids[:5],
            entity_names[:5],
        )
        return EvidenceSubgraph(
            nodes=node_list,
            edges=edge_list,
            graph_summary={
                "node_count": len(node_list),
                "edge_count": len(edge_list),
                "retrieval_source": "neo4j_fallback",
                "center_node_ids": entity_ids[:10],
            },
            confidence=0.75 if edge_list else 0.45,
        )

    # ── Graph Analytics ─────────────────────────────────────────────

    async def _run_graph_analytics(self, subgraph: EvidenceSubgraph) -> GraphAnalyticsResult:
        """Run all graph analytics computations on the evidence subgraph.

        Each step is isolated — a failure in one step does not crash the pipeline.
        """
        nodes = subgraph.nodes
        edges = subgraph.edges

        def _safe_call(name, fn, *args):
            try:
                return fn(*args)
            except Exception as exc:
                logger.warning("[GraphAnalytics] %s failed: %s", name, exc)
                return {} if name != "centrality" else []

        entity_stats = _safe_call("entity_stats", self.graph_tool.compute_entity_stats, nodes)
        relation_stats = _safe_call("relation_stats", self.graph_tool.compute_relation_stats, edges)
        central_nodes = _safe_call("centrality", self.graph_tool.compute_centrality, nodes, edges)
        candidate_risk_paths = _safe_call(
            "risk_paths", self.graph_tool.enumerate_candidate_risk_paths, nodes, edges,
        )
        graph_metrics = _safe_call("graph_metrics", self.graph_tool.compute_graph_metrics, nodes, edges)

        community_info = _safe_call("community", self.community_tool.detect_communities, nodes, edges)
        entity_comm_map = _safe_call(
            "entity_comm_map",
            self.community_tool.map_entities_to_communities,
            entity_stats, community_info, nodes, edges,
        )

        indicators = _safe_call(
            "scoring_indicators",
            self.graph_tool.compute_scoring_indicators,
            nodes, edges, community_info.get("communities", []),
        )

        return GraphAnalyticsResult(
            entity_stats=entity_stats,
            relation_stats=relation_stats,
            communities=community_info,
            entity_community_map=entity_comm_map,
            central_nodes=central_nodes,
            candidate_risk_paths=candidate_risk_paths,
            graph_metrics={**graph_metrics, **indicators},
        )

    # ── Expanded community discovery ─────────────────────────────────

    async def _run_expanded_community(
        self,
        seed_names: list[str] | None = None,
        seed_ids: list[str] | None = None,
        method: str = "auto",
        max_hop: int = 3,
    ) -> dict[str, Any]:
        """Run expanded community discovery on the knowledge graph.

        Calls GraphAnalytics.discover_seeded_communities() which performs
        k-hop ego network expansion, community detection (WCC / Louvain /
        HGT-GKMeans with fallback chain), and returns the community graph
        suitable for two-level zoom visualization.
        """
        from kg_query.analytics.graph_analytics import GraphAnalytics

        analytics = GraphAnalytics(db_client=db_client)
        return analytics.discover_seeded_communities(
            seed_names=seed_names or [],
            seed_ids=seed_ids or [],
            method=method,
            max_hop=max_hop,
            min_community_size=3,
        )

    # ── Risk plugins pipeline ───────────────────────────────────────

    async def _run_risk_plugins(
        self,
        sid: str,
        round_id: int,
        query: str,
        subgraph: EvidenceSubgraph,
        analytics: GraphAnalyticsResult,
        resolved_entities: list[ResolvedEntity],
        unresolved_entities: list[ResolvedEntity],
    ) -> AsyncGenerator[str, None]:
        """Run the full risk analysis plugin chain."""
        nodes = subgraph.nodes
        edges = subgraph.edges

        # ── Risk Analyst ────────────────────────────────────────────
        logger.warning("[UnifiedEngine] Stage: risk_analyst")
        yield _envelope(sid, round_id, "risk_analysis", "stage", "running",
                        {"stage_name": "风险分析", "agent_action": "解释风险路径与异常..."})

        analyst_result = await self.risk_analyst.analyze(
            nodes, edges, analytics.candidate_risk_paths, {"confidence": subgraph.confidence},
        )
        interpreted_paths = analyst_result.get("interpreted_risk_paths", [])
        anomalies = analyst_result.get("anomalies", [])

        # Merge candidate + interpreted paths (dedup by path_id), preferring
        # interpreted when both exist for the same path
        merged_path_ids: set[str] = set()
        merged_paths: list[dict] = []
        for p in interpreted_paths:
            pid = p.get("path_id", "")
            if pid and pid not in merged_path_ids:
                merged_path_ids.add(pid)
                merged_paths.append(p)
        for p in analytics.candidate_risk_paths:
            pid = p.get("path_id", "")
            if pid and pid not in merged_path_ids:
                merged_path_ids.add(pid)
                merged_paths.append(p)

        yield _envelope(sid, round_id, "risk_analysis", "risk_paths", "success", {
            "candidate_paths": analytics.candidate_risk_paths,
            "interpreted_paths": interpreted_paths,
            "merged_paths": merged_paths,
        })
        yield _envelope(sid, round_id, "risk_analysis", "anomaly_findings", "success", anomalies)

        # ── Compliance ──────────────────────────────────────────────
        logger.warning("[UnifiedEngine] Stage: compliance")
        yield _envelope(sid, round_id, "compliance", "stage", "running",
                        {"stage_name": "合规匹配", "agent_action": "匹配法规与违规评估..."})

        compliance_matches = await self.compliance.match(interpreted_paths, anomalies, nodes)

        yield _envelope(sid, round_id, "compliance", "compliance", "success", compliance_matches)

        # ── Compliance Scores (per-node) ──────────────────────────────
        compliance_scores = ComplianceScorer.score_nodes(nodes, compliance_matches)
        yield _envelope(sid, round_id, "compliance", "compliance_scores", "success", compliance_scores)

        # ── Risk Scoring ────────────────────────────────────────────
        logger.warning("[UnifiedEngine] Stage: risk_scoring")
        yield _envelope(sid, round_id, "scoring", "stage", "running",
                        {"stage_name": "风险评分", "agent_action": "多维度风险评分..."})

        indicators = analytics.graph_metrics
        scoring_result = self.scoring.score(
            indicators, interpreted_paths, anomalies, compliance_matches,
            subgraph_confidence=subgraph.confidence,
            resolved_entity_count=len(resolved_entities),
            total_entity_count=len(resolved_entities) + len(unresolved_entities),
        )

        if scoring_result["level"] == "insufficient_evidence":
            yield _envelope(sid, round_id, "scoring", "scoring", "warning", scoring_result)
            yield _envelope(sid, round_id, "done", "done", "success",
                            {"level": "insufficient_evidence",
                             "message": "未检索到足够关系证据，无法形成稳定风险评级"})
            return

        # LLM explanation (non-blocking — continue with base scores if fails)
        scoring_result = await self.scoring.explain_and_adjust(scoring_result)
        yield _envelope(sid, round_id, "scoring", "scoring", "success", scoring_result)

        # ── Governance ──────────────────────────────────────────────
        logger.warning("[UnifiedEngine] Stage: governance")
        yield _envelope(sid, round_id, "governance", "stage", "running",
                        {"stage_name": "治理方案", "agent_action": "生成协同治理方案..."})

        governance_plan = await self.governance.plan(
            scoring_result, compliance_matches, interpreted_paths, anomalies,
            analytics.communities,
        )
        yield _envelope(sid, round_id, "governance", "governance", "success", governance_plan)

        # ── Evidence Builder ────────────────────────────────────────
        evidence_chains = self.evidence_builder.build(
            {"nodes": nodes, "edges": edges,
             "evidence_paths": subgraph.evidence_paths,
             "cypher_records": subgraph.cypher_records,
             "verified_claims": subgraph.verified_claims,
             "confidence": subgraph.confidence},
            analytics,
        )

        # ── Compliance Indicators (34-indicator hierarchy) ────────────
        indicator_scores = self.compliance_indicator_engine.compute(
            nodes, edges, interpreted_paths, compliance_matches,
            evidence_chains={
                "chains": [{"claim_id": c.claim_id, "claim": c.claim,
                            "confidence": c.confidence, "verifier_score": c.verifier_score}
                           for c in evidence_chains.chains],
                "overall_confidence": evidence_chains.overall_confidence,
            },
            risk_scores=scoring_result,
        )
        yield _envelope(sid, round_id, "compliance", "compliance_indicators", "success",
                        {"indicators": indicator_scores})

        # ── Reporter ────────────────────────────────────────────────
        logger.warning("[UnifiedEngine] Stage: report")
        yield _envelope(sid, round_id, "reporting", "stage", "running",
                        {"stage_name": "报告生成", "agent_action": "生成结构化风险报告..."})

        report = await self.reporter.generate(
            query=query,
            trigger_event=None,
            node_count=len(nodes),
            edge_count=len(edges),
            risk_paths=interpreted_paths,
            anomalies=anomalies,
            compliance_matches=compliance_matches,
            scoring_result=scoring_result,
            governance_plan=governance_plan,
            evidence_chains={
                "chains": [{"claim_id": c.claim_id, "claim": c.claim,
                            "confidence": c.confidence}
                           for c in evidence_chains.chains],
                "overall_confidence": evidence_chains.overall_confidence,
            },
            resolved_entities=[self._serialize_resolved(r) for r in resolved_entities],
        )

        # Build comprehensive output
        output = {
            "executive_summary": report.get("executive_summary", ""),
            "entity_stats": analytics.entity_stats,
            "community_info": analytics.communities,
            "entity_community_map": analytics.entity_community_map,
            "risk_paths": interpreted_paths,
            "anomaly_findings": anomalies,
            "compliance_matches": compliance_matches,
            "risk_scores": scoring_result,
            "governance_plan": governance_plan,
            "overall_risk_level": scoring_result.get("level", "medium"),
            "recommendations": report.get("recommendations", []),
            "integrated_report": report.get("markdown_report", ""),
            "markdown_report": report.get("markdown_report", ""),
            "subtasks_completed": 6,
            "subgraph_summary": {
                "node_count": len(nodes),
                "edge_count": len(edges),
            },
            "resolved_entities": [self._serialize_resolved(r) for r in resolved_entities],
            "evidence_chains": {
                "chains": [{"claim_id": c.claim_id, "claim": c.claim,
                            "confidence": c.confidence}
                           for c in evidence_chains.chains],
                "overall_confidence": evidence_chains.overall_confidence,
            },
        }

        yield _envelope(sid, round_id, "reporting", "report", "success", output)
        yield _envelope(sid, round_id, "done", "done", "success",
                        {"intent_type": "risk_analysis",
                         "risk_level": scoring_result.get("level"),
                         "node_count": len(nodes),
                         "edge_count": len(edges)})

    # ── Helpers ─────────────────────────────────────────────────────

    @staticmethod
    def _should_use_file_fast_path(query: str) -> bool:
        text = str(query or "")
        return any(term in text for term in _FILE_QUERY_TERMS) and any(
            term in text for term in _RISK_QUERY_TERMS
        )

    def _build_file_context_subgraph(self, file_context: dict) -> EvidenceSubgraph:
        """Build a small displayable subgraph from extracted document facts."""
        from dra_ma.utils.entity_heuristics import infer_entity_type_from_name

        entities = _dedupe_valid_entities(file_context.get("entities", []))[:12]
        risk_signals = [str(x).strip() for x in (file_context.get("risk_signals") or []) if str(x).strip()][:8]

        nodes: list[dict] = []
        edges: list[dict] = []
        for index, name in enumerate(entities):
            entity_type = infer_entity_type_from_name(name) or "COMPANY"
            nodes.append({
                "id": f"file-entity-{index}",
                "name": name,
                "label": name,
                "type": entity_type,
                "entity_type": entity_type,
                "labels": [entity_type],
                "properties": {"name": name, "source": "uploaded_file"},
            })

        signal_node_ids: list[str] = []
        for index, signal in enumerate(risk_signals[:4]):
            event_name = signal[:30] + ("..." if len(signal) > 30 else "")
            node_id = f"file-risk-{index}"
            signal_node_ids.append(node_id)
            nodes.append({
                "id": node_id,
                "name": event_name,
                "label": event_name,
                "type": "EVENT",
                "entity_type": "EVENT",
                "labels": ["EVENT"],
                "properties": {"name": event_name, "description": signal, "source": "uploaded_file"},
            })

        for index, signal_id in enumerate(signal_node_ids):
            if entities:
                source_id = f"file-entity-{index % len(entities)}"
                edges.append({
                    "id": f"file-edge-{index}",
                    "source": source_id,
                    "target": signal_id,
                    "relation": "REFLECTS",
                    "type": "REFLECTS",
                    "label": "反映",
                    "properties": {"source": "uploaded_file"},
                })

        if len(entities) >= 2:
            for index in range(min(len(entities) - 1, 5)):
                edges.append({
                    "id": f"file-link-{index}",
                    "source": f"file-entity-{index}",
                    "target": f"file-entity-{index + 1}",
                    "relation": "MENTION",
                    "type": "MENTION",
                    "label": "共同提及",
                    "properties": {"source": "uploaded_file"},
                })

        return EvidenceSubgraph(
            nodes=nodes,
            edges=edges,
            graph_summary={"node_count": len(nodes), "edge_count": len(edges)},
            confidence=0.55 if nodes else 0.25,
        )

    def _build_file_context_report(
        self,
        query: str,
        file_context: dict,
        subgraph: EvidenceSubgraph,
        resolved_entities: list[ResolvedEntity],
        unresolved_entities: list[ResolvedEntity],
    ) -> dict:
        """Create a report from uploaded-file evidence when KG matching is weak."""
        nodes = subgraph.nodes
        edges = subgraph.edges
        entities = _dedupe_valid_entities(file_context.get("entities", []))
        risk_signals = [str(x).strip() for x in (file_context.get("risk_signals") or []) if str(x).strip()]
        summary = file_context.get("summary") or "上传文件中识别到风险主体和风险信号，图谱匹配证据不足，优先按文档证据生成协同治理分析。"
        primary_entity = entities[0] if entities else "上传文件相关主体"
        primary_signal = risk_signals[0] if risk_signals else "文件中存在待核验风险事项"

        top_entities = [
            {
                "id": node.get("id"),
                "name": node.get("name"),
                "type": node.get("entity_type") or node.get("type") or "Unknown",
                "degree": 1,
            }
            for node in nodes
            if node.get("type") != "EVENT"
        ][:10]
        members = [
            {
                "id": node.get("id"),
                "name": node.get("name"),
                "type": node.get("entity_type") or node.get("type") or "Unknown",
            }
            for node in nodes
        ][:30]

        risk_paths = []
        if entities:
            path_nodes = [entities[0]]
            if risk_signals:
                path_nodes.append(risk_signals[0][:24])
            if len(entities) > 1:
                path_nodes.append(entities[1])
            risk_paths.append({
                "path_id": "file-path-1",
                "risk_level": "medium",
                "confidence": 0.62,
                "description": primary_signal,
                "path": " -> ".join(path_nodes),
                "nodes": path_nodes,
                "node_names": path_nodes,
                "source": "uploaded_file",
                "interpretation": f"{primary_entity}相关风险信号需要结合图谱和人工证据继续核验。",
            })

        anomalies = [
            {
                "id": f"file-anomaly-{index + 1}",
                "title": signal[:36] + ("..." if len(signal) > 36 else ""),
                "description": signal,
                "severity": "medium" if index else "high",
                "related_entities": entities[:4],
                "source": "uploaded_file",
            }
            for index, signal in enumerate(risk_signals[:5])
        ]

        compliance_matches = [
            {
                "regulation": "上市公司信息披露与关联交易监管要求",
                "matched_issue": primary_signal,
                "risk_level": "medium",
                "action": "补充披露、资金流向凭证、关联关系说明和内部审批记录。",
            }
        ] if risk_signals else []

        recommendations = [
            {"priority": "紧急", "action": f"核验{primary_entity}相关风险事项的合同、流水和公告证据。", "owner": "合规部"},
            {"priority": "一般", "action": "将文件识别出的主体导入知识图谱，补齐股权、任职、交易和监管关系。", "owner": "数据治理组"},
            {"priority": "一般", "action": "对未命中的实体进行别名确认，避免简称或文档代词导致实体对齐失败。", "owner": "风控部"},
        ]

        markdown_report = "\n".join([
            f"# {primary_entity}协同治理社区报告",
            "",
            "## 1. 风险主体识别",
            f"上传文件识别到 {len(entities)} 个主体：{', '.join(entities[:8]) or '暂无明确主体'}。",
            "",
            "## 2. 群体发现",
            f"依据文件共同出现关系构建文档证据社区，共 {len(nodes)} 个节点、{len(edges)} 条关系。该社区仍需与 Neo4j 图谱实体完成精确对齐。",
            "",
            "## 3. 风险传导路径",
            f"主要风险线索：{primary_signal}",
            "",
            "## 4. 合规与治理建议",
            "建议优先补充公告、合同、银行流水、内部审批和关联关系披露材料，并将确认后的主体关系回写知识图谱。",
        ])

        return {
            "report_id": f"WIND-FILE-{uuid.uuid4().hex[:8].upper()}",
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "query_summary": query,
            "executive_summary": f"{summary} 当前按上传文件证据生成协同治理报告，图谱匹配证据不足时需进行实体别名确认和证据补强。",
            "entity_stats": {
                "total_entities": len(entities) or len(nodes),
                "total_relations": len(edges),
                "top_entities": top_entities,
                "source": "uploaded_file",
            },
            "community_info": {
                "algorithm": "file_cooccurrence",
                "selected_method": "file_cooccurrence",
                "communities": [{
                    "community_id": 0,
                    "size": len(members),
                    "density": 0.35 if len(members) > 1 else 0,
                    "members": members,
                    "top_entities": top_entities[:8],
                    "core_nodes": top_entities[:3],
                }],
                "seed_nodes": top_entities[:6],
                "subgraph": {"nodes": nodes, "edges": edges},
                "connected_subgraph": {"nodes": nodes, "edges": edges},
                "visualization": {"flow": ["风险主体", "群体发现", "风险传导路径", "协同治理社区报告"]},
            },
            "entity_community_map": {
                "entities": [
                    {"id": node.get("id"), "name": node.get("name"), "communities": [{"community_id": 0}]}
                    for node in nodes
                ],
                "unmapped_count": 0,
            },
            "risk_paths": risk_paths,
            "anomaly_findings": anomalies,
            "compliance_matches": compliance_matches,
            "risk_scores": {
                "base_overall": 58,
                "final_overall": 58,
                "overall": 58,
                "level": "medium",
                "level_label": "中等风险",
                "reason": "图谱证据不足，按上传文件风险信号进行保守评分。",
            },
            "governance_plan": {
                "measures": recommendations,
                "escalation_rules": ["实体无法对齐或证据不足时，转入人工别名确认和材料补证。"],
                "monitoring_checklist": ["核验主体工商/公告名称", "补充股权与资金流关系", "跟踪监管披露与诉讼状态"],
            },
            "overall_risk_level": "medium",
            "recommendations": recommendations,
            "integrated_report": markdown_report,
            "markdown_report": markdown_report,
            "subtasks_completed": 4,
            "subgraph_summary": {"node_count": len(nodes), "edge_count": len(edges)},
            "resolved_entities": [self._serialize_resolved(r) for r in resolved_entities],
            "unresolved_entities": [{"raw": r.raw} for r in unresolved_entities],
            "evidence_chains": {
                "chains": [{"claim_id": "file-claim-1", "claim": primary_signal, "confidence": 0.55}],
                "overall_confidence": 0.55,
            },
            "file_context": file_context,
        }

    @staticmethod
    def _serialize_resolved(r: ResolvedEntity) -> dict:
        return {
            "raw": r.raw,
            "canonical_name": r.canonical_name,
            "kg_node_id": r.kg_node_id,
            "match_type": r.match_type,
            "match_score": r.match_score,
            "confidence": r.confidence,
        }
