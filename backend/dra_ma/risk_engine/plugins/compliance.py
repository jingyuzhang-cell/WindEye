"""Compliance Plugin — match risk findings against regulation layer.

Migrated from RiskAnalysisEngine._stage_compliance().
"""

from __future__ import annotations

import json
import logging
from typing import Any

from dra_ma.agents.layer3_execution.cypher_utils import call_llm, db_client
from dra_ma.prompts import PromptLoader
from dra_ma.utils.agent_trace import agent_trace

logger = logging.getLogger(__name__)


class CompliancePlugin:
    """Match risk paths and anomalies against regulatory rules."""

    def __init__(self, demo: bool = False):
        self.demo = demo

    async def match(
        self,
        risk_paths: list[dict],
        anomalies: list[dict],
        nodes: list[dict] | None = None,
    ) -> list[dict]:
        """Match risk findings against regulation/law layer."""
        if self.demo:
            matches = await self._demo_match(nodes or [], risk_paths, anomalies)
            agent_trace("Compliance", "MATCH",
                risk_path_count=len(risk_paths),
                compliance_match_count=len(matches))
            return matches

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
            matches = result.get("matches", [])
            if not matches and (risk_paths or anomalies):
                matches = await self._demo_match(nodes or [], risk_paths, anomalies)
            agent_trace("Compliance", "MATCH",
                risk_path_count=len(risk_paths),
                compliance_match_count=len(matches))
            return matches
        except Exception as exc:
            logger.exception("[Compliance] Failed: %s", exc)
            matches = await self._demo_match(nodes or [], risk_paths, anomalies) if (risk_paths or anomalies) else []
            agent_trace("Compliance", "MATCH",
                risk_path_count=len(risk_paths),
                compliance_match_count=len(matches))
            return matches

    async def _demo_match(
        self, nodes: list[dict], risk_paths: list[dict], anomalies: list[dict],
    ) -> list[dict]:
        """Rule-based compliance matching (no LLM)."""
        matches: list[dict] = []
        reg_nodes = [n for n in nodes if "Regulation" in n.get("labels", []) or "Law" in n.get("labels", [])]
        action_nodes = [n for n in nodes if "Action" in n.get("labels", [])]

        if reg_nodes:
            for rn in reg_nodes[:5]:
                props = rn.get("properties", {})
                matches.append({
                    "regulation": props.get("regulation_name", props.get("name", "未知法规")),
                    "article": str(props.get("regulation_title", props.get("title", "")))[:100],
                    "violation": f"基于风险路径分析，相关行为可能涉及合规审查",
                    "suggested_action": "立案调查" if "法" in str(props.get("regulation_name", "")) else "发函询问",
                    "confidence": 0.8,
                })

        if action_nodes:
            for an in action_nodes[:3]:
                props = an.get("properties", {})
                action_name = props.get("action_name", props.get("name", ""))
                if action_name:
                    matches.append({
                        "regulation": f"处置措施: {action_name}",
                        "article": f"处置类型: {props.get('action_type', '')}",
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

    @staticmethod
    async def _query_regulation_layer() -> list[dict]:
        """Query regulation-layer nodes from Neo4j."""
        import asyncio
        try:
            from kg_construction.ontology.ontology_registry import OntologyRegistry
            config = OntologyRegistry.get_config()
            reg_labels = config.get("layer_labels", {}).get("Regulation", ["Regulation", "Law", "Action"])
        except Exception:
            reg_labels = ["Regulation", "Law", "Action"]

        label_filter = " OR ".join(f"'{l}' IN labels(n)" for l in reg_labels)
        cypher = f"MATCH (n) WHERE {label_filter} RETURN n LIMIT 50"
        try:
            rows = await asyncio.to_thread(db_client.execute_read, cypher, None, 10.0)
            nodes: list[dict] = []
            for row in rows:
                for val in row.values():
                    if isinstance(val, dict):
                        nodes.append(val)
            return nodes
        except Exception as exc:
            logger.exception("[Compliance] Regulation query failed: %s", exc)
            return []
