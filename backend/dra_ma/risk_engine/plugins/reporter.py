"""Reporter Plugin — generate structured risk analysis reports.

Input:  All upstream outputs + EvidenceChains
Output: {executive_summary, overall_risk_level, recommendations,
         markdown_report, integrated_report}
"""

from __future__ import annotations

import json
import logging
from typing import Any

from dra_ma.agents.layer3_execution.cypher_utils import call_llm
from dra_ma.prompts import PromptLoader
from dra_ma.utils.agent_trace import agent_trace

logger = logging.getLogger(__name__)


class ReporterPlugin:
    """Generate structured risk reports with evidence chains."""

    def __init__(self, demo: bool = False):
        self.demo = demo

    async def generate(
        self,
        query: str,
        trigger_event: str | None,
        node_count: int,
        edge_count: int,
        risk_paths: list[dict],
        anomalies: list[dict],
        compliance_matches: list[dict],
        scoring_result: dict[str, Any] | None = None,
        governance_plan: dict[str, Any] | None = None,
        evidence_chains: dict[str, Any] | None = None,
        resolved_entities: list[dict] | None = None,
    ) -> dict[str, Any]:
        """Generate structured risk report."""
        if self.demo:
            report = self._demo_report(query, node_count, edge_count, risk_paths, anomalies, compliance_matches)
            agent_trace("Reporter", "REPORT",
                report_id=query[:50] if query else "unknown",
                risk_level=report.get("overall_risk_level", "unknown"),
                risk_path_count=len(risk_paths),
                evidence_count=len(anomalies))
            return report

        try:
            system = PromptLoader.render_reporter_system()
            user = PromptLoader.render_reporter_user(
                trigger_info=json.dumps({"query": query, "trigger_event": trigger_event}, ensure_ascii=False),
                network_summary=json.dumps({"node_count": node_count, "edge_count": edge_count}, ensure_ascii=False),
                risk_paths=json.dumps(risk_paths, ensure_ascii=False),
                anomalies=json.dumps(anomalies, ensure_ascii=False),
                compliance_matches=json.dumps(compliance_matches, ensure_ascii=False),
                scoring_result=json.dumps(scoring_result or {}, ensure_ascii=False),
                governance_plan=json.dumps(governance_plan or {}, ensure_ascii=False),
                evidence_chains=json.dumps(evidence_chains or {}, ensure_ascii=False),
                resolved_entities=json.dumps(resolved_entities or [], ensure_ascii=False),
            )
            raw = await call_llm(
                system=system, user=user,
                temperature=0.3, response_format={"type": "json_object"},
            )
            result = json.loads(raw) if raw else {}
            if not result.get("markdown_report") and (risk_paths or anomalies or compliance_matches):
                result = self._demo_report(query, node_count, edge_count, risk_paths, anomalies, compliance_matches)
            agent_trace("Reporter", "REPORT",
                report_id=query[:50] if query else "unknown",
                risk_level=result.get("overall_risk_level", "unknown"),
                risk_path_count=len(risk_paths),
                evidence_count=len(anomalies))
            return result
        except Exception as exc:
            logger.exception("[Reporter] Failed: %s", exc)
            report = self._demo_report(query, node_count, edge_count, risk_paths, anomalies, compliance_matches)
            agent_trace("Reporter", "REPORT",
                report_id=query[:50] if query else "unknown",
                risk_level=report.get("overall_risk_level", "unknown"),
                risk_path_count=len(risk_paths),
                evidence_count=len(anomalies))
            return report

    @staticmethod
    def _demo_report(
        query: str,
        node_count: int,
        edge_count: int,
        risk_paths: list[dict],
        anomalies: list[dict],
        compliance_matches: list[dict],
    ) -> dict[str, Any]:
        """Template-based report generation (no LLM)."""
        high_count = sum(1 for p in risk_paths if p.get("risk_level") == "high")
        medium_count = sum(1 for p in risk_paths if p.get("risk_level") == "medium")
        overall = "high" if high_count >= 2 else "medium" if high_count + medium_count >= 2 else "low"

        summary = (
            f"经知识图谱风险传导分析，关联网络包含 {node_count} 个节点、{edge_count} 条关系。"
            f"发现高风险路径 {high_count} 条、中风险路径 {medium_count} 条、异常模式 {len(anomalies)} 处。"
            f"匹配相关法规 {len(compliance_matches)} 条，整体风险等级评定为"
            f"{'高风险' if overall == 'high' else '中风险' if overall == 'medium' else '低风险'}。"
        )

        recommendations = []
        if high_count > 0:
            recommendations.append({
                "action": "启动专项风险核查", "department": "风控部",
                "urgency": "urgent", "reasoning": f"存在 {high_count} 条高风险传导路径",
            })
        if overall in ("high", "medium"):
            recommendations.append({
                "action": "发出监管问询函", "department": "合规部",
                "urgency": "normal", "reasoning": "就关联交易和担保事项发函询问",
            })
        recommendations.append({
            "action": "纳入重点监控名单", "department": "监控中心",
            "urgency": "normal", "reasoning": "列入持续监控范围",
        })

        md_lines = [
            "# 风险分析报告",
            "",
            "## 一、核心摘要",
            "", summary, "",
            "## 二、关联网络概览",
            "", f"- 图谱节点: {node_count} 个",
            f"- 图谱关系: {edge_count} 条", "",
            "## 三、风险传递路径", "",
        ]
        for i, p in enumerate(risk_paths[:6], 1):
            rl = p.get("risk_level", "medium")
            emoji = "🔴" if rl == "high" else "🟡" if rl == "medium" else "🟢"
            md_lines.append(f"### {i}. {emoji} {p.get('path_id', '')}")
            md_lines.append(f"{p.get('path_description', '')}")
            md_lines.append("")

        md_lines.extend(["## 四、异常发现", ""])
        for a in anomalies:
            md_lines.append(f"- **{a.get('anomaly_type', '')}** (置信度: {a.get('confidence', 0):.0%})")
            md_lines.append(f"  {a.get('evidence', '')}")
        md_lines.append("")

        md_lines.extend(["## 五、合规研判", ""])
        for c in compliance_matches:
            md_lines.append(f"- **{c.get('regulation', '')}** — {c.get('article', '')}")
            md_lines.append(f"  处置建议: {c.get('suggested_action', '')}")
        md_lines.append("")

        md_lines.extend(["## 六、处置建议", ""])
        for r in recommendations:
            md_lines.append(f"1. **{r['action']}** — {r['reasoning']}（{r['department']}）")

        return {
            "executive_summary": summary,
            "overall_risk_level": overall,
            "recommendations": recommendations,
            "markdown_report": "\n".join(md_lines),
        }
