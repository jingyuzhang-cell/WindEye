"""Risk Analysis Engine — 5-Agent pipeline for financial risk governance.

Pipeline: Planner → Retriever → Analyst → Compliance → Reporter
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator

from dra_ma.agents.layer3_execution.cypher_utils import call_llm, db_client as _global_db
from dra_ma.prompts import PromptLoader
from core.database import Neo4jClient
from dra_ma.skills.base import SkillContext, SkillHook
from dra_ma.skills.registry import SkillManager
from dra_ma.skills.consensus.persona_selector import PersonaSelector
from dra_ma.skills.consensus.entity_cleaner import EntityCleaner

logger = logging.getLogger(__name__)

BANNED_CYPHER_KEYWORDS = {"CREATE", "DELETE", "SET", "MERGE", "DROP", "REMOVE"}


class RiskAnalysisEngine:
    """Financial risk analysis engine with 5-agent collaborative reasoning.

    Agent Pipeline:
      1. Planner Agent    — decomposes query into subtasks
      2. Retriever Agent  — translates info needs into Cypher queries
      3. Analyst Agent    — identifies risk paths and anomalies
      4. Compliance Agent — matches regulations and assesses violations
      5. Reporter Agent   — generates structured risk reports
    """

    def __init__(self, db_client: Any = None, demo_mode: bool = False,
                 skills: SkillManager = None) -> None:
        self._db = db_client or _global_db
        self._demo = demo_mode
        self.skills = skills or SkillManager()
        if skills is None:
            self.skills.register(PersonaSelector())
            self.skills.register(EntityCleaner())
            logger.info(f"[RiskEngine] Skill system initialized:\n{self.skills.summary()}")

    # ── Public API ──────────────────────────────────────────────────

    async def analyze_stream(
        self,
        query: str,
        focus_entities: list[str] | None = None,
        max_hop: int = 3,
        trigger_event: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Run the 5-agent pipeline with SSE streaming progress.

        Yields:
            {"stage": "planning", "content": "..."}
            {"stage": "retrieving", "content": "..."}
            {"stage": "analyzing", "content": "..."}
            {"stage": "compliance", "content": "..."}
            {"stage": "reporting", "content": "..."}
            {"output": RiskAnalysisReport}
        """
        if self._demo:
            async for event in self._demo_analyze_stream(query, focus_entities or [], max_hop):
                yield event
            return

        focus_entities = focus_entities or []

        # ── Skill Context ──
        ctx = SkillContext(query=query)
        ctx = await self.skills.execute_hook(SkillHook.RISK_PLANNING, ctx)

        # ── Stage 1: Planning ─────────────────────────────────────
        subtasks = await self._stage_planning(query, max_hop)
        ctx.risk_subtasks = subtasks
        yield {"stage": "planning", "content": f"任务拆解完成，共 {len(subtasks)} 个子任务"}

        # ── Skill: RISK_RETRIEVING ──
        ctx = await self.skills.execute_hook(SkillHook.RISK_RETRIEVING, ctx)

        # ── Stage 2: Retrieving ───────────────────────────────────
        all_nodes: dict[str, dict] = {}
        all_edges: dict[str, dict] = {}
        async for event in self._stage_retrieving(subtasks, focus_entities, max_hop):
            if "nodes" in event:
                all_nodes.update(event["nodes"])
                all_edges.update(event["edges"])
            else:
                yield event

        node_list = list(all_nodes.values())[:50]
        edge_list = list(all_edges.values())[:50]

        yield {"stage": "retrieving", "content": f"检索完成: {len(node_list)} 个节点, {len(edge_list)} 条关系"}

        # ── Stage 3: Entity Statistics ────────────────────────────
        entity_stats = self._compute_entity_stats(node_list)
        yield {"stage": "entity_stats", "content": f"实体识别: {entity_stats['total_entities']} 个实体, {len(entity_stats['entity_type_counts'])} 种类型"}
        yield {"entity_stats": entity_stats}

        # ── Stage 4: Community Discovery ──────────────────────────
        community_info = self._compute_community_discovery(node_list, edge_list)
        community_count = len(community_info.get("communities", []))
        yield {"stage": "community", "content": f"群体发现: {community_count} 个群体"}
        yield {"community": community_info}

        # ── Skill: RISK_ANALYZING (PersonaSelector for risk analysis) ──
        ctx = await self.skills.execute_hook(SkillHook.RISK_ANALYZING, ctx)

        # ── Stage 5: Analyzing ────────────────────────────────────
        risk_paths, anomalies, overall_assessment = await self._stage_analyzing(
            node_list, edge_list, trigger_event
        )
        yield {"stage": "analyzing", "content": f"分析完成: {len(risk_paths)} 条风险路径, {len(anomalies)} 处异常"}
        yield {"risk_paths": risk_paths}

        # ── Skill: RISK_COMPLIANCE ──
        ctx.risk_paths = risk_paths
        ctx.risk_anomalies = anomalies
        ctx = await self.skills.execute_hook(SkillHook.RISK_COMPLIANCE, ctx)

        # ── Stage 4: Compliance ───────────────────────────────────
        compliance_matches = await self._stage_compliance(risk_paths, anomalies)
        yield {"stage": "compliance", "content": f"合规匹配完成: {len(compliance_matches)} 条法规匹配"}

        # ── Skill: RISK_REPORTING ──
        ctx.risk_compliance_matches = compliance_matches
        ctx = await self.skills.execute_hook(SkillHook.RISK_REPORTING, ctx)

        # ── Stage 5: Reporting ────────────────────────────────────
        report = await self._stage_reporting(
            query=query,
            trigger_event=trigger_event,
            node_count=len(node_list),
            edge_count=len(edge_list),
            risk_paths=risk_paths,
            anomalies=anomalies,
            compliance_matches=compliance_matches,
        )
        yield {"stage": "reporting", "content": "报告生成完成"}

        # ── Final output ──────────────────────────────────────────
        yield {
            "output": {
                "executive_summary": report.get("executive_summary", ""),
                "entity_stats": entity_stats,
                "community_info": community_info,
                "risk_paths": risk_paths,
                "anomaly_findings": anomalies,
                "compliance_matches": compliance_matches,
                "overall_risk_level": report.get("overall_risk_level", "medium"),
                "recommendations": report.get("recommendations", []),
                "integrated_report": report.get("markdown_report", ""),
                "markdown_report": report.get("markdown_report", ""),
                "subtasks_completed": len(subtasks),
                "subgraph_summary": {
                    "node_count": len(node_list),
                    "edge_count": len(edge_list),
                },
                "echarts_config": self._build_echarts_config(node_list, risk_paths),
                "raw_data": self._build_raw_data(node_list),
            }
        }

    async def analyze(self, query: str, **kwargs: Any) -> dict[str, Any]:
        """Non-streaming analysis — collects all stages and returns final result."""
        result: dict[str, Any] = {}
        async for event in self.analyze_stream(query, **kwargs):
            if "output" in event:
                result = event["output"]
        return result

    # ── Demo mode: rule-based analysis without LLM ───────────────────

    async def _demo_analyze_stream(
        self, query: str, focus_entities: list[str], max_hop: int,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Demo mode: run the pipeline using deterministic Cypher queries.

        Extracts entity names from query, searches Neo4j, expands subgraph,
        and builds a structured risk report from graph patterns — no LLM needed.
        """
        await asyncio.sleep(0.4)
        yield {"stage": "planning", "content": "任务解析完成，提取关键实体并规划检索路径"}

        # Stage 1+2: Find entities + expand subgraph
        await asyncio.sleep(0.6)
        nodes, edges = await self._demo_retrieve(query, focus_entities, max_hop)
        yield {"stage": "retrieving", "content": f"图谱检索完成: {len(nodes)} 个节点, {len(edges)} 条关系"}
        yield {"stage": "subgraph", "nodes": nodes, "edges": edges}

        # Stage 3: Entity statistics
        await asyncio.sleep(0.2)
        entity_stats = self._compute_entity_stats(nodes)
        yield {"stage": "entity_stats", "content": f"实体统计完成: {entity_stats['total_entities']} 个实体"}
        yield {"entity_stats": entity_stats}

        # Stage 4: Community discovery
        await asyncio.sleep(0.3)
        community_info = self._compute_community_discovery(nodes, edges)
        yield {"stage": "community", "content": f"群体发现完成: {len(community_info['communities'])} 个群体"}
        yield {"community": community_info}

        # Stage 5: Analyze risk patterns from graph structure
        await asyncio.sleep(0.5)
        risk_paths, anomalies = await self._demo_analyze(nodes, edges)
        yield {"stage": "analyzing", "content": f"风险分析完成: {len(risk_paths)} 条风险路径, {len(anomalies)} 处异常"}
        yield {"risk_paths": risk_paths}

        # Stage 6: Match regulations
        await asyncio.sleep(0.4)
        compliance_matches = await self._demo_compliance(nodes, risk_paths, anomalies)
        yield {"stage": "compliance", "content": f"合规匹配完成: {len(compliance_matches)} 条法规匹配"}

        # Stage 7: Generate report
        await asyncio.sleep(0.5)
        report = self._demo_report(query, nodes, edges, risk_paths, anomalies, compliance_matches)
        yield {"stage": "reporting", "content": "报告生成完成"}

        yield {
            "output": {
                "executive_summary": report["executive_summary"],
                "entity_stats": entity_stats,
                "community_info": community_info,
                "risk_paths": risk_paths,
                "anomaly_findings": anomalies,
                "compliance_matches": compliance_matches,
                "overall_risk_level": report["overall_risk_level"],
                "recommendations": report["recommendations"],
                "markdown_report": report["markdown_report"],
                "subtasks_completed": 6,
                "subgraph_summary": {
                    "node_count": len(nodes),
                    "edge_count": len(edges),
                },
                "echarts_config": self._build_echarts_config(nodes, risk_paths),
                "raw_data": self._build_raw_data(nodes),
            }
        }

    async def _demo_retrieve(
        self, query: str, focus_entities: list[str], max_hop: int,
    ) -> tuple[list[dict], list[dict]]:
        """Search for entities by keyword, then expand to get connected subgraph."""
        # Extract token from query (use the whole query as keyword)
        keywords = focus_entities[:]
        if not keywords:
            for token in query.replace("，", ",").replace("、", ",").split(","):
                token = token.strip().strip("。").strip()
                if len(token) >= 2:
                    keywords.append(token)
            if not keywords:
                keywords = [query.strip()]

        all_nodes: dict[str, dict] = {}
        all_edges: dict[str, dict] = {}

        for keyword in keywords[:3]:
            search_cypher = """
            MATCH (n)
            WHERE (n.name CONTAINS $kw OR n.COMPANY_NM CONTAINS $kw
               OR n.title CONTAINS $kw OR n.factor_nm CONTAINS $kw
               OR n.feature_nm CONTAINS $kw OR n.regulation_title CONTAINS $kw)
            WITH n LIMIT 5
            MATCH (n)-[r*1..%d]-(m)
            RETURN n, r, m LIMIT 200
            """ % max_hop
            try:
                rows = await asyncio.to_thread(
                    self._db.execute_read, search_cypher, {"kw": keyword}, 15.0,
                )
                n, e = self._collect_subgraph(rows)
                all_nodes.update(n)
                all_edges.update(e)
            except Exception as exc:
                logger.warning("[demo] Keyword search failed for '%s': %s", keyword, exc)

        # If no results, grab some sample data so the UI isn't empty
        if not all_nodes:
            fallback = """
            MATCH (n)-[r]-(m)
            WHERE any(label IN labels(n) WHERE label IN ['Subject','Event','Feature','Regulation'])
            RETURN n, r, m LIMIT 30
            """
            try:
                rows = await asyncio.to_thread(self._db.execute_read, fallback, None, 10.0)
                n, e = self._collect_subgraph(rows)
                all_nodes.update(n)
                all_edges.update(e)
            except Exception as exc:
                logger.warning("[demo] Fallback query failed: %s", exc)

        return list(all_nodes.values()), list(all_edges.values())

    async def _demo_analyze(
        self, nodes: list[dict], edges: list[dict],
    ) -> tuple[list[dict], list[dict]]:
        """Build risk paths and anomalies from graph structure."""
        # Index nodes by id and labels
        node_map: dict[str, dict] = {n["id"]: n for n in nodes}
        node_labels: dict[str, list[str]] = {n["id"]: n.get("labels", []) for n in nodes}

        # Group edges by source/target
        adj: dict[str, list[dict]] = {}
        for e in edges:
            s = e.get("source", "")
            t = e.get("target", "")
            if s not in adj:
                adj[s] = []
            adj[s].append(e)
            if t not in adj:
                adj[t] = []
            adj[t].append(e)

        # Find cross-layer paths: Company → Event → Feature → Regulation
        risk_paths: list[dict] = []
        path_id_counter = [0]

        def _add_path(node_ids: list[str], risk_level: str, description: str, entities: list[str]):
            path_id_counter[0] += 1
            risk_paths.append({
                "path_id": f"RP-{path_id_counter[0]:03d}",
                "risk_level": risk_level,
                "affected_entities": entities[:8],
                "path_description": description,
                "confidence": 0.85 if risk_level == "high" else 0.7 if risk_level == "medium" else 0.6,
            })

        # Detect Company→Event→Feature→Regulation chains
        company_nodes = [n for n in nodes if "COMPANY" in n.get("labels", [])]
        event_nodes = [n for n in nodes if "EVENT" in n.get("labels", []) and "TIME" not in n.get("labels", [])]
        feature_nodes = [n for n in nodes if "RiskFeature" in n.get("labels", []) or "RiskFactor" in n.get("labels", [])]
        reg_nodes = [n for n in nodes if "Regulation" in n.get("labels", []) or "Law" in n.get("labels", [])]

        # Path 1: Company with high warning count → risk
        for c in company_nodes:
            props = c.get("properties", {})
            warning_num = props.get("WARNING_NUM", 0)
            try:
                warning_num = int(warning_num) if warning_num else 0
            except (ValueError, TypeError):
                warning_num = 0
            status = props.get("STATUS", "")
            risk_info = props.get("RISK_INFO", "")

            if warning_num >= 5:
                name = props.get("name", props.get("COMPANY_NM", "未知企业"))
                _add_path(
                    [c["id"]], "high",
                    f"{name} 预警数量达 {warning_num} 次，存在重大风险隐患。当前状态: {status}",
                    [name],
                )
            elif warning_num >= 2 or status == "吊销":
                name = props.get("name", props.get("COMPANY_NM", "未知企业"))
                _add_path(
                    [c["id"]], "medium",
                    f"{name} 预警数量 {warning_num} 次，状态: {status}，需持续关注",
                    [name],
                )

            if isinstance(risk_info, str) and risk_info and risk_info != "[]":
                name = props.get("name", props.get("COMPANY_NM", "未知企业"))
                _add_path(
                    [c["id"]], "high",
                    f"{name} 风险信息: {risk_info[:200]}",
                    [name],
                )

        # Path 2: Company→Event chains
        for c in company_nodes[:5]:
            c_id = c["id"]
            c_name = c.get("properties", {}).get("name", c.get("properties", {}).get("COMPANY_NM", "未知"))
            for e in event_nodes[:10]:
                e_id = e["id"]
                e_name = e.get("properties", {}).get("name", e.get("properties", {}).get("title", "未知事件"))
                connected = any(
                    (edge.get("source") == c_id and edge.get("target") == e_id) or
                    (edge.get("source") == e_id and edge.get("target") == c_id)
                    for edge in edges
                )
                if connected:
                    _add_path(
                        [c_id, e_id], "medium",
                        f"{c_name} 关联事件「{e_name}」，可能形成风险传导链路",
                        [c_name, e_name],
                    )

        # Path 3: Event→Feature chains
        for evt in event_nodes[:5]:
            evt_id = evt["id"]
            evt_name = evt.get("properties", {}).get("name", evt.get("properties", {}).get("title", "未知"))
            for feat in feature_nodes[:5]:
                feat_id = feat["id"]
                feat_name = feat.get("properties", {}).get("feature_nm", feat.get("properties", {}).get("name", "未知特征"))
                connected = any(
                    (edge.get("source") == evt_id and edge.get("target") == feat_id) or
                    (edge.get("source") == feat_id and edge.get("target") == evt_id)
                    for edge in edges
                )
                if connected:
                    _add_path(
                        [evt_id, feat_id], "medium",
                        f"事件「{evt_name}」触发了风险特征「{feat_name}」，构成风险识别依据",
                        [evt_name, feat_name],
                    )

        # Anomalies: detect patterns
        anomalies: list[dict] = []
        # Cross-shareholding: multiple companies connected via INVEST
        invest_count = sum(1 for e in edges if e.get("label") == "INVEST" or "INVEST" in str(e.get("label", "")))
        if invest_count >= 3:
            companies_in_invest = set()
            for e in edges:
                if e.get("label") == "INVEST" or "INVEST" in str(e.get("label", "")):
                    s = node_map.get(e.get("source", ""), {})
                    t = node_map.get(e.get("target", ""), {})
                    sn = s.get("properties", {}).get("name", "") if s else ""
                    tn = t.get("properties", {}).get("name", "") if t else ""
                    if sn:
                        companies_in_invest.add(sn)
                    if tn:
                        companies_in_invest.add(tn)
            anomalies.append({
                "anomaly_type": "复杂股权网络",
                "affected_entities": list(companies_in_invest)[:8],
                "evidence": f"图谱中存在 {invest_count} 条股权投资关系，涉及 {len(companies_in_invest)} 个主体，可能存在隐性控制或利益输送",
                "confidence": 0.82,
            })

        # Guarantee chain: multiple GUARANTEE relationships
        guarantee_count = sum(1 for e in edges if e.get("label") == "GUARANTEE" or "GUARANTEE" in str(e.get("label", "")))
        if guarantee_count >= 2:
            anomalies.append({
                "anomaly_type": "连环担保风险",
                "affected_entities": [],
                "evidence": f"发现 {guarantee_count} 条担保关系，存在连环担保导致的或有负债风险",
                "confidence": 0.78,
            })

        # Cross-position: same person at multiple companies
        person_companies: dict[str, set] = {}
        for e in edges:
            label = e.get("label", "")
            if "WORK" in str(label) or "CONTROLLER" in str(label):
                s = node_map.get(e.get("source", ""), {})
                t = node_map.get(e.get("target", ""), {})
                s_labels = s.get("labels", []) if s else []
                t_labels = t.get("labels", []) if t else []
                if "PERSON" in s_labels and "COMPANY" in t_labels:
                    pname = s.get("properties", {}).get("name", e.get("source"))
                    cname = t.get("properties", {}).get("name", e.get("target"))
                    if pname not in person_companies:
                        person_companies[pname] = set()
                    person_companies[pname].add(cname)
        for pname, comps in person_companies.items():
            if len(comps) >= 2:
                anomalies.append({
                    "anomaly_type": "高管交叉任职",
                    "affected_entities": [pname] + sorted(comps),
                    "evidence": f"{pname} 同时任职于 {len(comps)} 家企业（{', '.join(sorted(comps))}），存在风险关联传导可能",
                    "confidence": 0.75,
                })

        # Add a generic anomaly if none found
        if not anomalies:
            anomalies.append({
                "anomaly_type": "图谱结构异常",
                "affected_entities": [],
                "evidence": f"关联网络包含 {len(nodes)} 个节点和 {len(edges)} 条关系，跨层连接较多，建议人工审查",
                "confidence": 0.55,
            })

        return risk_paths, anomalies

    async def _demo_compliance(
        self, nodes: list[dict], risk_paths: list[dict], anomalies: list[dict],
    ) -> list[dict]:
        """Match risk findings against Regulation/Law nodes in the graph."""
        matches: list[dict] = []
        reg_nodes = [n for n in nodes if "Regulation" in n.get("labels", []) or "Law" in n.get("labels", [])]
        action_nodes = [n for n in nodes if "Action" in n.get("labels", [])]

        if reg_nodes:
            for rn in reg_nodes[:5]:
                props = rn.get("properties", {})
                matches.append({
                    "regulation": props.get("regulation_name", props.get("name", "未知法规")),
                    "article": props.get("regulation_title", props.get("title", ""))[:100],
                    "violation": f"基于图谱风险路径分析，相关行为可能涉及「{props.get('regulation_name', '')}」的合规审查范围",
                    "suggested_action": "立案调查" if "法" in str(props.get("regulation_name", "")) else "发函询问",
                    "confidence": 0.8,
                })

        if action_nodes:
            for an in action_nodes[:3]:
                props = an.get("properties", {})
                action_name = props.get("action_name", props.get("name", ""))
                action_type = props.get("action_type", props.get("type", ""))
                if action_name:
                    matches.append({
                        "regulation": f"处置措施: {action_name}",
                        "article": f"处置类型: {action_type}",
                        "violation": "根据图谱关联分析，建议采取相应监管处置措施",
                        "suggested_action": action_name,
                        "confidence": 0.72,
                    })

        if not matches:
            matches.append({
                "regulation": "《中华人民共和国公司法》",
                "article": "公司股东应当遵守法律、行政法规和公司章程，依法行使股东权利",
                "violation": "存在关联交易集中、股权穿透异常等风险行为",
                "suggested_action": "发函询问",
                "confidence": 0.68,
            })

        return matches

    def _demo_report(
        self, query: str, nodes, edges, risk_paths, anomalies, compliance_matches,
    ) -> dict:
        """Generate structured report from analysis results."""
        high_count = sum(1 for p in risk_paths if p.get("risk_level") == "high")
        medium_count = sum(1 for p in risk_paths if p.get("risk_level") == "medium")
        overall = "high" if high_count >= 2 else "medium" if high_count + medium_count >= 2 else "low"

        company_names = []
        for n in nodes:
            p = n.get("properties", {})
            nm = p.get("name", p.get("COMPANY_NM", ""))
            if nm and "COMPANY" in n.get("labels", []):
                company_names.append(nm)

        entity_summary = f"共涉及 {len(company_names)} 家企业" + (f": {'、'.join(company_names[:4])}" if company_names else "")

        summary_tpl = (
            f"经四层知识图谱风险传导分析，{entity_summary}。"
            f"发现高风险路径 {high_count} 条、中风险路径 {medium_count} 条、异常模式 {len(anomalies)} 处。"
            f"匹配相关法规 {len(compliance_matches)} 条，整体风险等级评定为"
            f"{'高风险' if overall == 'high' else '中风险' if overall == 'medium' else '低风险'}。"
        )

        recommendations = []
        if high_count > 0:
            recommendations.append({
                "action": "启动专项风险核查",
                "department": "风控部",
                "urgency": "urgent",
                "reasoning": f"存在 {high_count} 条高风险传导路径，建议立即启动尽职调查",
            })
        if overall in ("high", "medium"):
            recommendations.append({
                "action": "发出监管问询函",
                "department": "合规部",
                "urgency": "normal",
                "reasoning": "就相关关联交易和担保事项向涉事主体发函询问",
            })
        recommendations.append({
            "action": "纳入重点监控名单",
            "department": "监控中心",
            "urgency": "normal",
            "reasoning": f"将 {company_names[:3] if company_names else '相关主体'} 列入持续监控范围",
        })
        if len(anomalies) > 0:
            recommendations.append({
                "action": "现场检查及穿透核查",
                "department": "稽查部",
                "urgency": "low",
                "reasoning": f"针对 {anomalies[0].get('anomaly_type', '异常模式')} 开展穿透式检查",
            })

        # Build markdown
        md_lines = [
            f"# 风险分析报告",
            f"",
            f"## 一、核心摘要",
            f"",
            f"{summary_tpl}",
            f"",
            f"## 二、关联网络概览",
            f"",
            f"- 图谱节点: {len(nodes)} 个",
            f"- 图谱关系: {len(edges)} 条",
            f"- 涉及主体: {entity_summary}",
            f"",
            f"## 三、风险传递路径",
            f"",
        ]
        for i, p in enumerate(risk_paths[:6], 1):
            rl = p.get("risk_level", "medium")
            emoji = "🔴" if rl == "high" else "🟡" if rl == "medium" else "🟢"
            md_lines.append(f"### {i}. {emoji} {p.get('path_id', '')}")
            md_lines.append(f"")
            md_lines.append(f"{p.get('path_description', '')}")
            md_lines.append(f"")

        md_lines.append("## 四、异常发现")
        md_lines.append("")
        for a in anomalies:
            md_lines.append(f"- **{a.get('anomaly_type', '')}** (置信度: {a.get('confidence', 0):.0%})")
            md_lines.append(f"  {a.get('evidence', '')}")
        md_lines.append("")

        md_lines.append("## 五、合规研判")
        md_lines.append("")
        for c in compliance_matches:
            md_lines.append(f"- **{c.get('regulation', '')}** — {c.get('article', '')}")
            md_lines.append(f"  处置建议: {c.get('suggested_action', '')}")
        md_lines.append("")

        md_lines.append("## 六、处置建议")
        md_lines.append("")
        for r in recommendations:
            md_lines.append(f"1. **{r['action']}** — {r['reasoning']}（{r['department']}）")

        return {
            "executive_summary": summary_tpl,
            "overall_risk_level": overall,
            "recommendations": recommendations,
            "markdown_report": "\n".join(md_lines),
        }

    # ── ECharts & raw data builders ──────────────────────────────────

    @staticmethod
    def _build_echarts_config(nodes: list[dict], risk_paths: list[dict]) -> dict:
        """Build ECharts option from subgraph nodes and risk paths."""
        from collections import Counter

        label_name_map = {
            "COMPANY": "企业", "PERSON": "自然人", "PFCOMPANY": "平台企业",
            "PFUND": "私募基金", "SECURITY": "证券", "EVENT": "事件",
            "TIME": "时间", "REGULATOR": "监管机构", "RiskFeature": "风险特征",
            "RiskFactor": "风险因子", "Action": "处置措施", "Regulation": "法规",
            "Law": "法律", "Subject": "主体", "Event": "事件",
            "Feature": "特征", "SUB_EVENT": "子事件",
        }

        # Entity type distribution
        type_counter: Counter = Counter()
        for n in nodes:
            labels = n.get("labels", [])
            for lbl in labels:
                if lbl not in ("Subject", "Event", "Feature", "Regulation"):
                    type_counter[label_name_map.get(lbl, lbl)] += 1
        if not type_counter:
            type_counter["未分类"] = len(nodes)

        # Risk level distribution
        risk_counter: Counter = Counter()
        for p in risk_paths:
            rl = p.get("risk_level", "medium")
            risk_counter[rl] += 1
        if not risk_counter:
            risk_counter["low"] = 1

        risk_name_map = {"high": "高风险", "medium": "中风险", "low": "低风险"}
        risk_color_map = {"high": "#f5222d", "medium": "#faad14", "low": "#52c41a"}

        return {
            "tooltip": {"trigger": "item", "formatter": "{b}: {c} ({d}%)"},
            "legend": {"orient": "vertical", "left": "left", "top": "center", "textStyle": {"fontSize": 12}},
            "series": [
                {
                    "name": "实体类型分布",
                    "type": "pie",
                    "center": ["35%", "50%"],
                    "radius": ["30%", "55%"],
                    "label": {"formatter": "{b}\n{d}%", "fontSize": 10},
                    "data": [{"name": k, "value": v} for k, v in type_counter.most_common(8)],
                },
                {
                    "name": "风险等级分布",
                    "type": "pie",
                    "center": ["35%", "50%"],
                    "radius": ["58%", "75%"],
                    "label": {"formatter": "{b}\n{d}%", "fontSize": 10},
                    "data": [
                        {"name": risk_name_map.get(k, k), "value": v, "itemStyle": {"color": risk_color_map.get(k, "#cbd5e1")}}
                        for k, v in risk_counter.items()
                    ],
                },
            ],
            "color": ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272", "#fc8452", "#9a60b4"],
        }

    @staticmethod
    def _build_raw_data(nodes: list[dict]) -> list[dict]:
        """Build tabular data from subgraph node properties."""
        rows: list[dict] = []
        label_display = {"COMPANY": "企业", "PERSON": "自然人", "EVENT": "事件", "RiskFeature": "风险特征",
                         "RiskFactor": "风险因子", "Action": "处置措施", "Regulation": "法规", "Law": "法律"}
        for n in nodes[:50]:
            props = n.get("properties", {})
            labels = n.get("labels", [])
            primary_type = label_display.get(labels[0], labels[0]) if labels else "未知"
            name = (props.get("name") or props.get("COMPANY_NM") or props.get("title")
                    or props.get("factor_nm") or props.get("feature_nm")
                    or props.get("regulation_title") or n.get("id", ""))
            risk_info = props.get("RISK_INFO", "")
            warning_num = props.get("WARNING_NUM", "")
            status = props.get("STATUS", "")
            rows.append({
                "名称": str(name)[:60],
                "类型": primary_type,
                "预警数量": warning_num,
                "状态": str(status)[:20] if status else "",
                "风险信息": str(risk_info)[:100] if risk_info else "",
            })
        return rows

    # ── Helper: Entity stats ──────────────────────────────────────

    @staticmethod
    def _compute_entity_stats(nodes: list[dict]) -> dict[str, Any]:
        """Compute entity statistics from retrieved nodes."""
        type_counts: dict[str, int] = {}
        entity_list: list[dict] = []

        for node in nodes:
            labels = node.get("labels", [])
            props = node.get("properties", {}) if isinstance(node.get("properties"), dict) else {}
            node_id = props.get("id") or props.get("name") or props.get("COMPANY_NM") or props.get("zh_name") or str(props.get("_id", ""))
            node_name = props.get("name") or props.get("COMPANY_NM") or props.get("zh_name") or props.get("title") or str(node_id)

            for label in labels:
                if label and label != "Resource":
                    type_counts[label] = type_counts.get(label, 0) + 1
                    entity_list.append({"name": str(node_name)[:50], "type": label, "id": str(node_id)})
                    break  # count each node once by its primary label

        # Sort entities by name uniqueness (prefer unique names)
        seen_names: set[str] = set()
        unique_entities: list[dict] = []
        for e in entity_list:
            if e["name"] not in seen_names:
                seen_names.add(e["name"])
                unique_entities.append(e)

        return {
            "total_entities": len(nodes),
            "entity_type_counts": type_counts,
            "top_entities": unique_entities[:10],
        }

    @staticmethod
    def _compute_community_discovery(
        nodes: list[dict], edges: list[dict],
    ) -> dict[str, Any]:
        """Run community detection on the retrieved subgraph using WCC."""
        communities: list[dict] = []

        if not nodes or len(nodes) < 2:
            return {"communities": communities, "algorithm": "wcc"}

        try:
            # Build adjacency for Weakly Connected Components
            node_ids: list[str] = []
            node_map: dict[str, dict] = {}
            for n in nodes:
                props = n.get("properties", {}) if isinstance(n.get("properties"), dict) else {}
                nid = str(props.get("id") or props.get("name") or props.get("COMPANY_NM") or props.get("zh_name") or id(n))
                node_ids.append(nid)
                labels = n.get("labels", [])
                node_name = props.get("name") or props.get("COMPANY_NM") or props.get("zh_name") or props.get("title") or nid
                node_map[nid] = {"id": nid, "name": str(node_name)[:50], "type": labels[0] if labels else "Unknown"}

            # Union-Find for connected components
            parent: dict[str, str] = {nid: nid for nid in node_ids}

            def find(x: str) -> str:
                while parent[x] != x:
                    parent[x] = parent[parent[x]]
                    x = parent[x]
                return x

            def union(a: str, b: str) -> None:
                ra, rb = find(a), find(b)
                if ra != rb:
                    parent[ra] = rb

            for e in edges:
                src = str(e.get("source", ""))
                tgt = str(e.get("target", ""))
                if src in parent and tgt in parent:
                    union(src, tgt)

            # Group by component
            groups: dict[str, list[str]] = {}
            for nid in node_ids:
                root = find(nid)
                groups.setdefault(root, []).append(nid)

            # Build community list (only groups with >= 2 members)
            comm_id = 0
            for members in groups.values():
                if len(members) < 2:
                    continue
                member_details = [node_map[m] for m in members if m in node_map]
                communities.append({
                    "community_id": comm_id,
                    "size": len(members),
                    "members": member_details,
                    "modularity": None,
                })
                comm_id += 1

        except Exception as exc:
            logger.exception("[community] Discovery failed: %s", exc)

        return {"communities": communities, "algorithm": "wcc"}

    # ── Stage implementations ───────────────────────────────────────

    async def _stage_planning(self, query: str, max_hop: int) -> list[dict]:
        """Stage 1: Decompose user query into subtasks."""
        try:
            system = PromptLoader.render_planner_system()
            user = PromptLoader.render_planner_user(query)
            raw = await call_llm(
                system=system, user=user,
                temperature=0.1, response_format={"type": "json_object"},
            )
            plan = json.loads(raw) if raw else {}
            subtasks = plan.get("subtasks", [])
            if subtasks:
                return subtasks
        except Exception as exc:
            logger.exception("[planning] LLM call failed: %s", exc)
        return [{"id": 1, "goal": query, "info_needed": query, "hop": max_hop}]

    async def _discover_schema(self) -> tuple[list[str], list[str]]:
        """Discover actual Neo4j labels and relationship types from the live database."""
        labels: list[str] = []
        rels: list[str] = []
        try:
            label_rows = await asyncio.to_thread(
                self._db.execute_read, "CALL db.labels() YIELD label RETURN label", None, 5.0,
            )
            labels = [r["label"] for r in label_rows if r.get("label")]
        except Exception as exc:
            logger.warning("[schema] Label discovery failed: %s", exc)

        try:
            rel_rows = await asyncio.to_thread(
                self._db.execute_read, "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType", None, 5.0,
            )
            rels = [r["relationshipType"] for r in rel_rows if r.get("relationshipType")]
        except Exception as exc:
            logger.warning("[schema] Relationship type discovery failed: %s", exc)

        return labels, rels

    @staticmethod
    def _build_retriever_prompt(discovered_labels: list[str], discovered_rels: list[str]) -> str:
        """Build retriever system prompt with discovered schema injected."""
        base = PromptLoader.render_retriever_system()
        if discovered_labels:
            base += f"\n\n## 实际数据库标签 (请仅使用以下存在的标签)\n{', '.join(discovered_labels)}"
        if discovered_rels:
            base += f"\n\n## 实际关系类型 (请仅使用以下存在的关系类型)\n{', '.join(discovered_rels)}"
        return base

    async def _stage_retrieving(
        self, subtasks: list[dict], focus_entities: list[str], max_hop: int,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Stage 2: Translate each subtask into Cypher and execute against Neo4j."""
        discovered_labels, discovered_rels = await self._discover_schema()
        logger.info("[retrieving] Discovered %d labels, %d rels", len(discovered_labels), len(discovered_rels))
        yield {"stage": "retrieving", "content": f"发现 {len(discovered_labels)} 个标签, {len(discovered_rels)} 种关系"}
        retriever_system = self._build_retriever_prompt(discovered_labels, discovered_rels)
        for i, subtask in enumerate(subtasks):
            goal = subtask.get("goal", "")[:80]
            yield {"stage": "retrieving", "content": f"检索 ({i + 1}/{len(subtasks)}): {goal}"}
            try:
                retriever_user = PromptLoader.render_retriever_user(
                    info_needed=subtask.get("info_needed", ""),
                    focus_entities=focus_entities,
                    max_hop=subtask.get("hop", max_hop),
                )
                raw = await call_llm(
                    system=retriever_system, user=retriever_user,
                    temperature=0.1, response_format={"type": "json_object"},
                )
                cypher_data = json.loads(raw) if raw else {}
                cypher = cypher_data.get("cypher", "")

                if cypher and self._validate_cypher(cypher):
                    rows = await asyncio.to_thread(self._db.execute_read, cypher, None, 15.0)
                    nodes, edges = self._collect_subgraph(rows)
                    yield {"nodes": nodes, "edges": edges}
                else:
                    yield {"stage": "retrieving", "content": f"子任务 {i + 1}: {'Cypher验证未通过' if cypher else '未生成有效查询'}"}
            except Exception as exc:
                logger.exception("[retrieving] Subtask %d failed: %s", i + 1, exc)
                yield {"stage": "retrieving", "content": f"子任务 {i + 1} 检索异常: {exc}"}

    async def _stage_analyzing(
        self, nodes: list[dict], edges: list[dict], trigger_event: str | None,
    ) -> tuple[list[dict], list[dict], str]:
        """Stage 3: Analyze subgraph for risk paths and anomalies."""
        if not nodes:
            return [], [], "无子图数据，无法进行风险分析"

        try:
            system = PromptLoader.render_analyst_system()
            user = PromptLoader.render_analyst_user(
                node_count=len(nodes),
                nodes=json.dumps(nodes, ensure_ascii=False),
                edge_count=len(edges),
                edges=json.dumps(edges, ensure_ascii=False),
                trigger_event=trigger_event,
            )
            raw = await call_llm(
                system=system, user=user,
                temperature=0.2, response_format={"type": "json_object"},
            )
            result = json.loads(raw) if raw else {}
            return (
                result.get("risk_paths", []),
                result.get("anomalies", []),
                result.get("overall_assessment", ""),
            )
        except Exception as exc:
            logger.exception("[analyzing] Failed: %s", exc)
            return [], [], f"分析异常: {exc}"

    async def _stage_compliance(self, risk_paths: list[dict], anomalies: list[dict]) -> list[dict]:
        """Stage 4: Match risk findings against regulation layer."""
        try:
            reg_nodes = await self._query_regulation_layer()
            reg_data = json.dumps(reg_nodes, ensure_ascii=False) if reg_nodes else "无法规数据"

            analyst_findings = json.dumps({
                "risk_paths": risk_paths,
                "anomalies": anomalies,
            }, ensure_ascii=False)

            system = PromptLoader.render_compliance_system()
            user = PromptLoader.render_compliance_user(
                analyst_findings=analyst_findings,
                regulation_data=reg_data,
            )
            raw = await call_llm(
                system=system, user=user,
                temperature=0.1, response_format={"type": "json_object"},
            )
            result = json.loads(raw) if raw else {}
            return result.get("matches", [])
        except Exception as exc:
            logger.exception("[compliance] Failed: %s", exc)
            return []

    async def _stage_reporting(
        self,
        query: str,
        trigger_event: str | None,
        node_count: int,
        edge_count: int,
        risk_paths: list[dict],
        anomalies: list[dict],
        compliance_matches: list[dict],
    ) -> dict[str, Any]:
        """Stage 5: Generate structured risk report."""
        try:
            system = PromptLoader.render_reporter_system()
            user = PromptLoader.render_reporter_user(
                trigger_info=json.dumps({"query": query, "trigger_event": trigger_event}, ensure_ascii=False),
                network_summary=json.dumps({"node_count": node_count, "edge_count": edge_count}, ensure_ascii=False),
                risk_paths=json.dumps(risk_paths, ensure_ascii=False),
                anomalies=json.dumps(anomalies, ensure_ascii=False),
                compliance_matches=json.dumps(compliance_matches, ensure_ascii=False),
            )
            raw = await call_llm(
                system=system, user=user,
                temperature=0.3, response_format={"type": "json_object"},
            )
            return json.loads(raw) if raw else {}
        except Exception as exc:
            logger.exception("[reporting] Failed: %s", exc)
            return {
                "executive_summary": f"报告生成异常: {exc}",
                "overall_risk_level": "medium",
                "markdown_report": "",
                "recommendations": [],
            }

    # ── Helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _validate_cypher(cypher: str) -> bool:
        """Reject Cypher containing banned write-operation keywords."""
        upper = cypher.upper()
        for kw in BANNED_CYPHER_KEYWORDS:
            if kw in upper:
                logger.warning("[retrieving] Blocked cypher with keyword: %s", kw)
                return False
        return True

    @staticmethod
    def _collect_subgraph(rows: list[dict]) -> tuple[dict[str, dict], dict[str, dict]]:
        """Extract nodes and edges from Neo4j result rows using duck-typing."""
        nodes: dict[str, dict] = {}
        edges: dict[str, dict] = {}
        for row in rows:
            for val in row.values():
                if val is None:
                    continue
                if isinstance(val, list):
                    for item in val:
                        _classify_and_collect(item, nodes, edges)
                else:
                    _classify_and_collect(val, nodes, edges)
        return nodes, edges

    async def _query_regulation_layer(self) -> list[dict]:
        """Query regulation-layer nodes from Neo4j for compliance matching."""
        try:
            from kg_construction.ontology.ontology_registry import OntologyRegistry
            config = OntologyRegistry.get_config()
            reg_labels = config.get("layer_labels", {}).get("Regulation", ["Regulation", "Law", "Action"])
        except Exception:
            reg_labels = ["Regulation", "Law", "Action"]

        label_filter = " OR ".join(f"'{l}' IN labels(n)" for l in reg_labels)
        cypher = f"MATCH (n) WHERE {label_filter} RETURN n LIMIT 50"
        try:
            rows = await asyncio.to_thread(self._db.execute_read, cypher, None, 10.0)
            nodes: list[dict] = []
            for row in rows:
                for val in row.values():
                    if isinstance(val, dict) and "labels" in val:
                        nodes.append(val)
                    elif hasattr(val, "labels"):
                        nodes.append(Neo4jClient.serialize_node(val))
            return nodes
        except Exception as exc:
            logger.exception("[compliance] Regulation query failed: %s", exc)
            return []


def _classify_and_collect(val: Any, nodes: dict[str, dict], edges: dict[str, dict]) -> None:
    """Classify a Neo4j result value as node or relationship and collect it."""
    if hasattr(val, "labels") and hasattr(val, "element_id"):
        node_id = str(val.element_id)
        if node_id not in nodes:
            nodes[node_id] = Neo4jClient.serialize_node(val)
    elif hasattr(val, "type") and hasattr(val, "element_id") and hasattr(val, "start_node"):
        edge_id = str(val.element_id)
        if edge_id not in edges:
            edges[edge_id] = Neo4jClient.serialize_relationship(val)
