"""Agent Prompt Templates — financial risk analysis domain.

Five-agent prompts for the Risk Analysis pipeline:
- planner_risk:      Task decomposition and planning
- retriever_risk:    NL→Cypher translation with schema awareness
- analyst_risk:      Risk path analysis and anomaly detection
- compliance_risk:   Regulation matching and violation assessment
- reporter_risk:     Structured risk report generation
"""

from dra_ma.prompts.planner_risk import PLANNER_SYSTEM_PROMPT, PLANNER_USER_TEMPLATE
from dra_ma.prompts.retriever_risk import RETRIEVER_SYSTEM_PROMPT, RETRIEVER_USER_TEMPLATE
from dra_ma.prompts.analyst_risk import ANALYST_SYSTEM_PROMPT, ANALYST_USER_TEMPLATE
from dra_ma.prompts.compliance_risk import COMPLIANCE_SYSTEM_PROMPT, COMPLIANCE_USER_TEMPLATE
from dra_ma.prompts.reporter_risk import REPORTER_SYSTEM_PROMPT, REPORTER_USER_TEMPLATE
from dra_ma.prompts.intent.unified_intent import UNIFIED_INTENT_SYSTEM_PROMPT, UNIFIED_INTENT_USER_TEMPLATE
from dra_ma.prompts.risk.scoring_risk import SCORING_SYSTEM_PROMPT, SCORING_USER_TEMPLATE
from dra_ma.prompts.risk.governance_risk import GOVERNANCE_SYSTEM_PROMPT, GOVERNANCE_USER_TEMPLATE


class PromptLoader:
    """Renders prompt templates with dynamic ontology context from OntologyRegistry."""

    _LABEL_CN_MAP = {
        "Subject": "主体层",
        "Event": "事件层",
        "Feature": "特征层",
        "Regulation": "法规层",
        "Closure": "闭环层",
    }

    @staticmethod
    def _get_config() -> dict:
        try:
            from kg_construction.ontology.ontology_registry import OntologyRegistry
            return OntologyRegistry.get_config()
        except Exception:
            return {}

    @classmethod
    def _format_layer_labels(cls) -> str:
        config = cls._get_config()
        layer_labels = config.get("layer_labels", {})
        if not layer_labels:
            return "- 未配置本体层标签"
        lines = []
        for key, labels in layer_labels.items():
            cn_name = cls._LABEL_CN_MAP.get(key, key)
            labels_str = ", ".join(labels)
            lines.append(f"- {cn_name} ({key}): {labels_str}")
        return "\n".join(lines)

    @classmethod
    def _format_search_properties(cls) -> str:
        config = cls._get_config()
        props = config.get("search_properties", [])
        return ", ".join(props) if props else "name"

    # ── Planner ──────────────────────────────────────────────────

    @classmethod
    def render_planner_system(cls) -> str:
        return PLANNER_SYSTEM_PROMPT.format(
            layer_labels=cls._format_layer_labels(),
            search_properties=cls._format_search_properties(),
        )

    @staticmethod
    def render_planner_user(query: str) -> str:
        return PLANNER_USER_TEMPLATE.format(query=query)

    # ── Retriever ────────────────────────────────────────────────

    @classmethod
    def render_retriever_system(cls) -> str:
        return RETRIEVER_SYSTEM_PROMPT.format(
            layer_labels=cls._format_layer_labels(),
            search_properties=cls._format_search_properties(),
        )

    @staticmethod
    def render_retriever_user(info_needed: str, focus_entities: list, max_hop: int) -> str:
        return RETRIEVER_USER_TEMPLATE.format(
            info_needed=info_needed,
            focus_entities=focus_entities or [],
            max_hop=max_hop,
        )

    # ── Analyst ──────────────────────────────────────────────────

    @staticmethod
    def render_analyst_system() -> str:
        return ANALYST_SYSTEM_PROMPT

    @staticmethod
    def render_analyst_user(
        node_count: int, nodes: str, edge_count: int, edges: str, trigger_event: str | None
    ) -> str:
        return ANALYST_USER_TEMPLATE.format(
            node_count=node_count,
            nodes=nodes,
            edge_count=edge_count,
            edges=edges,
            trigger_event=trigger_event or "无",
        )

    # ── Compliance ───────────────────────────────────────────────

    @staticmethod
    def render_compliance_system() -> str:
        return COMPLIANCE_SYSTEM_PROMPT

    @staticmethod
    def render_compliance_user(analyst_findings: str, regulation_data: str) -> str:
        return COMPLIANCE_USER_TEMPLATE.format(
            analyst_findings=analyst_findings,
            regulation_data=regulation_data,
        )

    # ── Reporter ─────────────────────────────────────────────────

    @staticmethod
    def render_reporter_system() -> str:
        return REPORTER_SYSTEM_PROMPT

    @staticmethod
    def render_reporter_user(
        trigger_info: str,
        network_summary: str,
        risk_paths: str,
        anomalies: str,
        compliance_matches: str,
        scoring_result: str = "{}",
        governance_plan: str = "{}",
        evidence_chains: str = "{}",
        resolved_entities: str = "[]",
    ) -> str:
        return REPORTER_USER_TEMPLATE.format(
            trigger_info=trigger_info,
            network_summary=network_summary,
            risk_paths=risk_paths,
            anomalies=anomalies,
            compliance_matches=compliance_matches,
            scoring_result=scoring_result,
            governance_plan=governance_plan,
            evidence_chains=evidence_chains,
            resolved_entities=resolved_entities,
        )

    # ── Unified Intent ────────────────────────────────────────────

    @staticmethod
    def render_intent_system() -> str:
        return UNIFIED_INTENT_SYSTEM_PROMPT

    @staticmethod
    def render_intent_user(query: str) -> str:
        return UNIFIED_INTENT_USER_TEMPLATE.format(query=query)

    # ── Risk Scoring ──────────────────────────────────────────────

    @staticmethod
    def render_scoring_system() -> str:
        return SCORING_SYSTEM_PROMPT

    @staticmethod
    def render_scoring_user(scoring_data: str) -> str:
        return SCORING_USER_TEMPLATE.format(scoring_data=scoring_data)

    # ── Governance ────────────────────────────────────────────────

    @staticmethod
    def render_governance_system() -> str:
        return GOVERNANCE_SYSTEM_PROMPT

    @staticmethod
    def render_governance_user(governance_context: str) -> str:
        return GOVERNANCE_USER_TEMPLATE.format(governance_context=governance_context)


__all__ = [
    "PLANNER_SYSTEM_PROMPT", "PLANNER_USER_TEMPLATE",
    "RETRIEVER_SYSTEM_PROMPT", "RETRIEVER_USER_TEMPLATE",
    "ANALYST_SYSTEM_PROMPT", "ANALYST_USER_TEMPLATE",
    "COMPLIANCE_SYSTEM_PROMPT", "COMPLIANCE_USER_TEMPLATE",
    "REPORTER_SYSTEM_PROMPT", "REPORTER_USER_TEMPLATE",
    "UNIFIED_INTENT_SYSTEM_PROMPT", "UNIFIED_INTENT_USER_TEMPLATE",
    "SCORING_SYSTEM_PROMPT", "SCORING_USER_TEMPLATE",
    "GOVERNANCE_SYSTEM_PROMPT", "GOVERNANCE_USER_TEMPLATE",
    "PromptLoader",
]
