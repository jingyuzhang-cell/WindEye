"""Governance Plugin — generate collaborative governance action plans.

Input:  Risk scoring results + compliance matches + community context
Output: Governance plan with actions, escalation rules, monitoring checklist
"""

from __future__ import annotations

import json
import logging
from typing import Any

from dra_ma.agents.layer3_execution.cypher_utils import call_llm
from dra_ma.prompts import PromptLoader
from dra_ma.utils.agent_trace import agent_trace

logger = logging.getLogger(__name__)


class GovernancePlugin:
    """Generate risk governance action plans.

    Output:
      - actions: [{target, risk_issue, measure, priority, department}]
      - escalation_rules: [{condition, action, timeline}]
      - monitoring_checklist: [string]
    """

    def __init__(self, demo: bool = False):
        self.demo = demo

    async def plan(
        self,
        scoring_result: dict[str, Any],
        compliance_matches: list[dict],
        risk_paths: list[dict],
        anomalies: list[dict],
        community_info: dict | None = None,
    ) -> dict[str, Any]:
        """Generate governance action plan."""
        if self.demo:
            plan_result = self._demo_plan(scoring_result, risk_paths, anomalies)
            agent_trace("Governance", "PLAN",
                action_count=len(plan_result.get("actions", [])),
                escalation_rule_count=len(plan_result.get("escalation_rules", [])),
                monitoring_count=len(plan_result.get("monitoring_checklist", [])))
            return plan_result

        try:
            system = PromptLoader.render_governance_system()
            user = json.dumps({
                "scoring": scoring_result,
                "compliance": compliance_matches,
                "risk_paths": risk_paths,
                "anomalies": anomalies,
                "community": community_info,
            }, ensure_ascii=False)
            raw = await call_llm(
                system=system, user=user,
                temperature=0.2, response_format={"type": "json_object"},
            )
            result = json.loads(raw) if raw else {}
            actions = result.get("actions", [])
            rules = result.get("escalation_rules", [])
            monitoring = result.get("monitoring_checklist", [])
            agent_trace("Governance", "PLAN",
                action_count=len(actions),
                escalation_rule_count=len(rules),
                monitoring_count=len(monitoring))
            return {
                "actions": actions,
                "escalation_rules": rules,
                "monitoring_checklist": monitoring,
            }
        except Exception as exc:
            logger.exception("[Governance] Failed: %s", exc)
            plan_result = self._demo_plan(scoring_result, risk_paths, anomalies)
            agent_trace("Governance", "PLAN",
                action_count=len(plan_result.get("actions", [])),
                escalation_rule_count=len(plan_result.get("escalation_rules", [])),
                monitoring_count=len(plan_result.get("monitoring_checklist", [])))
            return plan_result

    @staticmethod
    def _demo_plan(
        scoring_result: dict[str, Any],
        risk_paths: list[dict],
        anomalies: list[dict],
    ) -> dict[str, Any]:
        """Template-based governance plan (no LLM)."""
        level = scoring_result.get("level", "medium")
        high_count = sum(1 for p in risk_paths if p.get("risk_level") == "high")

        actions = []
        if high_count > 0:
            actions.append({
                "target": "涉险主体",
                "risk_issue": f"存在 {high_count} 条高风险传导路径",
                "measure": "启动专项风险核查，开展穿透式尽职调查",
                "priority": "urgent",
                "department": "风控部",
            })

        if level in ("high", "medium"):
            actions.append({
                "target": "关联企业",
                "risk_issue": "关联交易和担保事项",
                "measure": "发出监管问询函，要求说明关联交易合理性",
                "priority": "normal",
                "department": "合规部",
            })

        actions.append({
            "target": "监控名单主体",
            "risk_issue": "持续风险暴露",
            "measure": "纳入重点监控名单，设置风险预警阈值",
            "priority": "normal",
            "department": "监控中心",
        })

        if anomalies:
            actions.append({
                "target": "异常模式主体",
                "risk_issue": anomalies[0].get("anomaly_type", "异常模式"),
                "measure": "现场检查及穿透核查",
                "priority": "low",
                "department": "稽查部",
            })

        escalation_rules = [
            {"condition": "30天内预警数超过阈值", "action": "自动升级至部门负责人", "timeline": "即时"},
            {"condition": "关联方新增重大风险事件", "action": "触发临时风险评审会议", "timeline": "24小时内"},
            {"condition": "合规整改未按时完成", "action": "上报监管机构", "timeline": "整改期满后3个工作日"},
        ]

        monitoring_checklist = [
            "每日监控涉险主体舆情和公告",
            "每周更新关联交易数据",
            "每月复核风险评级",
            "每季度提交风险治理报告",
        ]

        return {
            "actions": actions,
            "escalation_rules": escalation_rules,
            "monitoring_checklist": monitoring_checklist,
        }
