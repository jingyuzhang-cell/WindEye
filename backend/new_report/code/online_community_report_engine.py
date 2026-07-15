"""Generate online community report payloads in new_report style."""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any

from .online_perspective_builder import PerspectiveBundle
from .online_report_context_builder import OnlineReportContext


def _slugify(text: str) -> str:
    return "".join(ch for ch in text.lower() if ch.isalnum())[:36] or f"sec-{int(time.time())}"


class OnlineCommunityReportEngine:
    """Generate structured governance community reports from online context."""

    def generate(
        self,
        context: OnlineReportContext,
        bundle: PerspectiveBundle,
        report_req: Any,
    ) -> dict[str, Any]:
        generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        report_id = f"WIND-COMP-{int(time.time() * 1000)}"
        indicators = self._build_compliance_indicators(context, bundle)
        detail_indicators = self._build_indicator_details(context, bundle)
        actions = self._build_actions(context, bundle)
        sections = self._build_sections(context, bundle, actions)
        markdown = self._sections_to_markdown(context.subject_name, generated_at, sections)
        matched_rules = self._build_matched_rules(context, bundle)
        high_paths = [
            path for path in context.risk_paths
            if str(path.get("riskLevel") or path.get("risk_level") or "").lower() == "high"
        ]
        highlight_nodes = sorted({
            str(node_id)
            for path in context.risk_paths[:8]
            for node_id in (path.get("nodeIds") or path.get("node_ids") or [])
        })
        highlight_edges = sorted({
            str(edge_id)
            for path in context.risk_paths[:8]
            for edge_id in (path.get("edgeIds") or path.get("edge_ids") or [])
        })
        highlight_communities = sorted({
            int(cid)
            for path in context.risk_paths[:8]
            for cid in (path.get("communityPath") or path.get("community_path") or [])
            if isinstance(cid, int)
        })

        report = {
            "reportId": report_id,
            "title": f"{context.subject_name}协同治理社区报告",
            "executiveSummary": sections[0]["summary"] if sections else "",
            "markdownReport": markdown,
            "recommendations": [item["description"] for item in actions],
            "reportSections": sections,
            "summaryCards": [
                {"label": "风险社区", "value": context.summary["communityCount"]},
                {"label": "风险路径", "value": context.summary["riskPathCount"]},
                {"label": "高风险路径", "value": context.summary["highRiskCount"]},
                {"label": "法规节点", "value": len(bundle.regulatory.get("laws", []))},
            ],
        }

        governance = {
            "priority": "high" if indicators["riskLevel"] == "high" else "medium",
            "actions": actions,
            "timeline": [
                {"stage": "T+1", "task": "确认种子主体所在社区与高风险路径"},
                {"stage": "T+3", "task": "完成责任分工、法规复核与路径处置台账"},
                {"stage": "T+7", "task": "形成复盘结论并纳入持续监测"},
            ],
        }

        response = {
            "success": True,
            "apiVersion": "v1",
            "traceId": f"trc-{int(time.time() * 1000)}",
            "reportId": report_id,
            "generatedAt": generated_at,
            "subject": context.subject_name,
            "compliance": {
                "status": "warning" if indicators["riskLevel"] in ("high", "medium") else "pass",
                "riskLevel": indicators["riskLevel"],
                "score": indicators["totalScore"],
                "summary": sections[0]["summary"] if sections else "",
                "matchedRules": matched_rules,
                "violations": [
                    {
                        "pathId": item.get("pathId") or item.get("path_id"),
                        "riskLevel": item.get("riskLevel") or item.get("risk_level"),
                        "score": item.get("score"),
                        "description": item.get("renderedDescription") or item.get("pathDescription") or item.get("path_description") or item.get("description"),
                    }
                    for item in high_paths[:10]
                ],
            },
            "complianceIndicators": indicators,
            "complianceIndicatorDetails": detail_indicators,
            "governance": governance,
            "report": report,
            "communityReportSources": [],
            "viewModel": {
                "reportPanel": "compliance-report",
                "compliancePanel": True,
                "ticketEnabled": True,
                "exportEnabled": True,
                "highlightNodeIds": highlight_nodes,
                "highlightEdgeIds": highlight_edges,
                "highlightCommunityIds": highlight_communities,
                "defaultSelectedPathId": context.risk_paths[0].get("pathId") if context.risk_paths else None,
            },
            "warnings": context.warnings,
        }
        response.update(self._build_compatibility_payload(response, context, detail_indicators, actions))
        return response

    def _build_compliance_indicators(self, context: OnlineReportContext, bundle: PerspectiveBundle) -> dict[str, Any]:
        high = sum(1 for path in context.risk_paths if str(path.get("riskLevel") or path.get("risk_level") or "").lower() == "high")
        medium = sum(1 for path in context.risk_paths if str(path.get("riskLevel") or path.get("risk_level") or "").lower() == "medium")
        low = sum(1 for path in context.risk_paths if str(path.get("riskLevel") or path.get("risk_level") or "").lower() == "low")
        event_count = len(bundle.violation.get("keyEvents", []))
        law_count = len(bundle.regulatory.get("laws", []))
        cross_count = len(bundle.cross_links)
        total_score = max(
            28,
            100 - min(
                62,
                high * 8 + medium * 4 + max(0, context.summary["communityCount"] - 1) * 2 + max(0, context.summary["riskPathCount"] - 3),
            ),
        )
        return {
            "totalScore": total_score,
            "riskLevel": "high" if high or total_score < 60 else ("medium" if medium or total_score < 80 else "low"),
            "level1": [
                {"name": "社区结构稳定性", "weight": 0.30, "score": max(45, 92 - context.summary["communityCount"] * 3)},
                {"name": "风险路径可解释性", "weight": 0.35, "score": max(40, 94 - high * 6 - medium * 2)},
                {"name": "治理闭环充分性", "weight": 0.35, "score": max(48, 70 + min(18, cross_count) - max(0, high * 2))},
            ],
            "level2": [
                {"parent": "社区结构稳定性", "name": "主体群体覆盖", "score": min(100, 62 + context.summary["communityCount"] * 6)},
                {"parent": "社区结构稳定性", "name": "跨社区联动识别", "score": min(100, 60 + cross_count * 4)},
                {"parent": "风险路径可解释性", "name": "高风险路径识别", "score": max(35, 100 - high * 7)},
                {"parent": "风险路径可解释性", "name": "事件证据支撑", "score": min(100, 58 + event_count * 4)},
                {"parent": "治理闭环充分性", "name": "法规依据完整性", "score": min(100, 56 + law_count * 4)},
                {"parent": "治理闭环充分性", "name": "治理动作可执行性", "score": max(45, 72 + min(20, cross_count * 2) - high)},
            ],
            "level3": [
                {"name": "高风险路径数量", "value": high},
                {"name": "中风险路径数量", "value": medium},
                {"name": "低风险路径数量", "value": low},
                {"name": "社区数量", "value": context.summary["communityCount"]},
                {"name": "事件节点数量", "value": event_count},
                {"name": "法规节点数量", "value": law_count},
                {"name": "跨视角连接数量", "value": cross_count},
            ],
        }

    def _build_indicator_details(self, context: OnlineReportContext, bundle: PerspectiveBundle) -> list[dict[str, Any]]:
        return [
            {
                "id": "data-community-coverage",
                "l1": "数据合规性",
                "l2": "子图覆盖与完整性",
                "l3": "社区与节点覆盖充分性",
                "objective": min(100, 60 + context.summary["communityCount"] * 8),
                "category": "data_driven",
                "evidence": f"识别 {context.summary['communityCount']} 个社区、{context.summary['nodeCount']} 个节点。",
            },
            {
                "id": "data-regulation-basis",
                "l1": "数据合规性",
                "l2": "法规证据完整性",
                "l3": "法规与监管节点支撑",
                "objective": min(100, 55 + len(bundle.regulatory.get('laws', [])) * 5),
                "category": "evidence_based",
                "evidence": f"关联法规/条款 {len(bundle.regulatory.get('laws', []))} 个，监管机构 {len(bundle.regulatory.get('regulators', []))} 个。",
            },
            {
                "id": "algo-path-explainability",
                "l1": "算法合规性",
                "l2": "路径可解释性",
                "l3": "高风险路径具备因果说明",
                "objective": max(35, 95 - sum(1 for p in context.risk_paths if str(p.get('riskLevel') or p.get('risk_level') or '').lower() == 'high') * 6),
                "category": "evidence_based",
                "evidence": f"识别 {context.summary['riskPathCount']} 条路径，其中高风险 {context.summary['highRiskCount']} 条。",
            },
            {
                "id": "algo-cross-linking",
                "l1": "算法合规性",
                "l2": "跨层传播识别",
                "l3": "跨视角连接与社区传播链",
                "objective": min(100, 58 + len(bundle.cross_links) * 3),
                "category": "data_driven",
                "evidence": f"构建 {len(bundle.cross_links)} 条责任方-事件-法规跨视角连接。",
            },
            {
                "id": "content-governance-actions",
                "l1": "内容合规性",
                "l2": "治理建议完整性",
                "l3": "治理动作与时间线可执行",
                "objective": 84,
                "category": "policy_driven",
                "evidence": "输出了分阶段治理动作、责任部门与监控清单。",
            },
            {
                "id": "content-traceability",
                "l1": "内容合规性",
                "l2": "报告可追溯性",
                "l3": "章节、证据与路径留痕",
                "objective": min(100, 64 + context.summary["riskPathCount"] * 3),
                "category": "evidence_based",
                "evidence": f"报告章节 {8} 个，证据路径 {context.summary['riskPathCount']} 条。",
            },
        ]

    def _build_actions(self, context: OnlineReportContext, bundle: PerspectiveBundle) -> list[dict[str, Any]]:
        subject_nodes = bundle.responsibility.get("coreSubjects", [])
        regulators = bundle.regulatory.get("regulators", [])
        return [
            {
                "actionId": "GOV-001",
                "title": "锁定高风险路径并完成责任核验",
                "description": f"优先复核 {context.summary['highRiskCount']} 条高风险路径，确认 {context.subject_name} 与关键事件、人员、资金链之间的责任关系。",
                "priority": "high" if context.summary["highRiskCount"] else "medium",
                "owner": "风险管理部门",
                "target": context.subject_name,
                "risk_issue": "高风险路径与责任关系核验",
                "measure": "围绕高风险路径逐条核验主体、事件、路径证据与责任边界。",
                "department": "风险管理部门",
            },
            {
                "actionId": "GOV-002",
                "title": "按社区拆分治理任务",
                "description": f"围绕 {context.summary['communityCount']} 个局部社区建立分工台账，优先处理核心主体 {len(subject_nodes)} 个、关键人员 {len(bundle.responsibility.get('keyPersons', []))} 个。",
                "priority": "medium",
                "owner": "协同治理专班",
                "target": "局部风险社区",
                "risk_issue": "社区级治理协同不足",
                "measure": "按社区和路径拆解治理责任，形成处置闭环与回溯记录。",
                "department": "协同治理专班",
            },
            {
                "actionId": "GOV-003",
                "title": "补齐法规依据与持续监测",
                "description": f"结合 {len(regulators)} 个监管节点和 {len(bundle.regulatory.get('laws', []))} 个法规节点，完善法规依据、整改动作和监测规则。",
                "priority": "medium",
                "owner": "合规管理部门",
                "target": "法规与监管约束",
                "risk_issue": "法规依据与整改追踪不足",
                "measure": "补齐法规条款、监管要求和整改监测清单，形成持续跟踪机制。",
                "department": "合规管理部门",
            },
        ]

    def _build_sections(
        self,
        context: OnlineReportContext,
        bundle: PerspectiveBundle,
        actions: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        top_paths = bundle.violation.get("topRiskPaths", [])[:5]
        top_path_lines = [
            f"{idx}. {item.get('renderedDescription') or item.get('pathDescription') or item.get('path_description') or item.get('description') or item.get('pathId')}"
            for idx, item in enumerate(top_paths, start=1)
        ] or ["暂无高价值风险路径摘要。"]
        sections = [
            {
                "id": "executive-summary",
                "title": "一、执行摘要",
                "summary": (
                    f"基于主体“{context.subject_name}”的局部子图、群体发现和风险传导路径分析，"
                    f"当前识别社区 {context.summary['communityCount']} 个、风险路径 {context.summary['riskPathCount']} 条、"
                    f"高风险路径 {context.summary['highRiskCount']} 条，建议立即进入协同治理复核。"
                ),
                "bullets": [
                    f"局部子图规模：{context.summary['nodeCount']} 个节点 / {context.summary['edgeCount']} 条关系",
                    f"跨视角连接：{len(bundle.cross_links)} 条",
                    f"法规支撑：{len(bundle.regulatory.get('laws', []))} 个条款/法规节点",
                ],
            },
            {
                "id": "community-overview",
                "title": "二、主体所在社区概览",
                "summary": bundle.responsibility.get("summary"),
                "bullets": [
                    f"种子社区：{context.seed_community_id if context.seed_community_id is not None else '未明确'}",
                    f"局部社区数量：{context.summary['communityCount']}",
                    f"核心主体：{', '.join(item['name'] for item in bundle.responsibility.get('coreSubjects', [])[:5]) or '暂无'}",
                ],
            },
            {
                "id": "responsibility",
                "title": "三、责任方视角分析",
                "summary": bundle.responsibility.get("summary"),
                "bullets": [
                    f"关键主体：{', '.join(item['name'] for item in bundle.responsibility.get('coreSubjects', [])[:6]) or '暂无'}",
                    f"关键人员：{', '.join(item['name'] for item in bundle.responsibility.get('keyPersons', [])[:6]) or '暂无'}",
                ],
            },
            {
                "id": "violation",
                "title": "四、违规行为与风险传导分析",
                "summary": bundle.violation.get("summary"),
                "bullets": top_path_lines,
            },
            {
                "id": "regulatory",
                "title": "五、监管机构与法规依据分析",
                "summary": bundle.regulatory.get("summary"),
                "bullets": [
                    f"监管机构：{', '.join(item['name'] for item in bundle.regulatory.get('regulators', [])[:6]) or '暂无'}",
                    f"法规节点：{', '.join(item['name'] for item in bundle.regulatory.get('laws', [])[:6]) or '暂无'}",
                ],
            },
            {
                "id": "cross-perspective",
                "title": "六、跨视角治理链条",
                "summary": f"当前共构建 {len(bundle.cross_links)} 条责任方-事件-法规跨视角连接，用于解释风险传播和治理优先级。",
                "bullets": [
                    item.get("description") or "存在主体、事件与法规间的多跳关联。"
                    for item in bundle.cross_links[:6]
                ] or ["暂无跨视角连接摘要。"],
            },
            {
                "id": "governance-actions",
                "title": "七、协同治理建议",
                "summary": "建议围绕高风险路径、社区责任划分和法规依据补齐三个方向开展协同治理。",
                "bullets": [
                    f"{item['title']}：{item['description']}" for item in actions
                ],
            },
            {
                "id": "evidence-appendix",
                "title": "八、证据附录",
                "summary": "以下证据摘要来自局部子图、风险路径和异常发现，用于支持报告结论留痕。",
                "bullets": [
                    *(f"风险路径证据：{line}" for line in top_path_lines[:3]),
                    *(f"异常发现：{item.get('evidence')}" for item in context.anomaly_findings[:3] if isinstance(item, dict) and item.get("evidence")),
                ] or ["暂无附录证据。"],
            },
        ]
        for item in sections:
            item["slug"] = _slugify(item["id"])
        return sections

    def _build_matched_rules(self, context: OnlineReportContext, bundle: PerspectiveBundle) -> list[dict[str, Any]]:
        return [
            {"code": "GRAPH-RISK-PATH", "name": "风险传导路径监测", "matched": bool(context.risk_paths)},
            {"code": "COMMUNITY-GOV", "name": "局部风险社区识别", "matched": context.summary["communityCount"] > 0},
            {"code": "REG-BASIS", "name": "法规与监管依据支撑", "matched": bool(bundle.regulatory.get("laws") or bundle.regulatory.get("regulators"))},
        ]

    def _sections_to_markdown(self, subject: str, generated_at: str, sections: list[dict[str, Any]]) -> str:
        lines = [f"# {subject}协同治理社区报告", "", f"生成时间：{generated_at}", ""]
        for section in sections:
            lines.append(section["title"])
            lines.append(section["summary"])
            lines.append("")
            for bullet in section.get("bullets", []):
                lines.append(f"- {bullet}")
            lines.append("")
        return "\n".join(lines).strip()

    def _build_compatibility_payload(
        self,
        response: dict[str, Any],
        context: OnlineReportContext,
        detail_indicators: list[dict[str, Any]],
        actions: list[dict[str, Any]],
    ) -> dict[str, Any]:
        report = response["report"]
        compliance = response["compliance"]
        governance = response["governance"]
        compatibility_paths = [
            {
                "path_id": item.get("pathId") or item.get("path_id"),
                "risk_level": item.get("riskLevel") or item.get("risk_level") or "medium",
                "affected_entities": item.get("affectedEntities") or item.get("affected_entities") or [],
                "node_ids": item.get("nodeIds") or item.get("node_ids") or [],
                "edge_ids": item.get("edgeIds") or item.get("edge_ids") or [],
                "community_path": item.get("communityPath") or item.get("community_path") or [],
                "path_description": item.get("renderedDescription") or item.get("pathDescription") or item.get("path_description") or item.get("description") or "",
                "path_text": item.get("renderedDescription") or item.get("pathDescription") or item.get("path_description") or item.get("description") or "",
                "confidence": item.get("confidence") or 0.8,
            }
            for item in context.risk_paths
            if isinstance(item, dict)
        ]
        compliance_matches = [
            {
                "regulation": rule.get("name"),
                "article": rule.get("code"),
                "violation": "已命中" if rule.get("matched") else "未命中",
                "suggested_action": "纳入报告并持续跟踪" if rule.get("matched") else "暂不触发",
                "confidence": 0.88 if rule.get("matched") else 0.4,
            }
            for rule in response["compliance"]["matchedRules"]
            if isinstance(rule, dict)
        ]
        return {
            "report_id": response["reportId"],
            "generated_at": response["generatedAt"],
            "query_summary": context.query,
            "executive_summary": report["executiveSummary"],
            "markdown_report": report["markdownReport"],
            "integrated_report": report["markdownReport"],
            "report_sections": report["reportSections"],
            "risk_paths": compatibility_paths,
            "anomaly_findings": context.anomaly_findings,
            "compliance_matches": compliance_matches,
            "overall_risk_level": compliance["riskLevel"],
            "recommendations": [
                {
                    "action": item["title"],
                    "department": item["owner"],
                    "urgency": "urgent" if item["priority"] == "high" else "normal",
                    "reasoning": item["description"],
                }
                for item in actions
            ],
            "subgraph_summary": {
                "node_count": context.summary["nodeCount"],
                "edge_count": context.summary["edgeCount"],
            },
            "governance_plan": {
                "actions": [
                    {
                        "target": item["target"],
                        "risk_issue": item["risk_issue"],
                        "measure": item["measure"],
                        "priority": "urgent" if item["priority"] == "high" else "normal",
                        "department": item["department"],
                    }
                    for item in governance["actions"]
                ],
                "escalation_rules": [
                    {"condition": "高风险路径持续增加", "action": "升级至协同治理专班", "timeline": "T+1"},
                    {"condition": "法规依据不足", "action": "补齐合规证据与监管解释", "timeline": "T+3"},
                ],
                "monitoring_checklist": [
                    item["task"] for item in governance["timeline"] if isinstance(item, dict) and item.get("task")
                ],
            },
            "compliance_indicator_details": detail_indicators,
        }
