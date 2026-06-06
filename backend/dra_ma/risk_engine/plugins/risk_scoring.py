"""Risk Scoring Plugin — multi-dimensional risk scoring.

Rule-first, LLM-second approach:
  1. Compute base scores from graph indicators (deterministic)
  2. LLM only explains each dimension and suggests adjustments (±10 max)
  3. Final score = clamp(base + adjustment, 0, 100)
  4. Four levels: high (≥80), medium (50-79), low (<50), insufficient_evidence

Fallback: if LLM unavailable, use base_overall directly.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from dra_ma.agents.layer3_execution.cypher_utils import call_llm
from dra_ma.prompts import PromptLoader
from dra_ma.utils.agent_trace import agent_trace

logger = logging.getLogger(__name__)

# Dimension weights (sum = 100)
DIMENSIONS = {
    "relation_complexity": {"weight": 20, "label": "关联复杂度"},
    "risky_relation": {"weight": 25, "label": "风险关系密度"},
    "community_density": {"weight": 15, "label": "群体聚集度"},
    "transmission": {"weight": 20, "label": "传导路径深度"},
    "compliance": {"weight": 10, "label": "合规风险"},
    "evidence": {"weight": 10, "label": "证据充分度"},
}


class RiskScoringPlugin:
    """Multi-dimensional risk scoring with rule-first, LLM-second approach."""

    def __init__(self, demo: bool = False):
        self.demo = demo

    def score(
        self,
        indicators: dict[str, Any],
        interpreted_risk_paths: list[dict],
        anomalies: list[dict],
        compliance_matches: list[dict],
        subgraph_confidence: float = 0.7,
        resolved_entity_count: int = 0,
        total_entity_count: int = 0,
    ) -> dict[str, Any]:
        """Compute risk scores.

        Returns:
            {scores: [{dimension, score, weight, explanation}],
             base_overall, final_overall, level, llm_adjustment, llm_adjustment_reason}
        """
        # Check evidence sufficiency
        node_count = indicators.get("node_count", 0)
        if (
            node_count <= 1
            or subgraph_confidence < 0.3
            or (total_entity_count > 0 and resolved_entity_count == 0)
        ):
            return {
                "scores": [],
                "base_overall": None,
                "final_overall": None,
                "level": "insufficient_evidence",
                "llm_adjustment": 0,
                "llm_adjustment_reason": "Insufficient evidence for reliable scoring",
            }

        # 1. Compute base scores from indicators
        base_scores = self._compute_base_scores(
            indicators, interpreted_risk_paths, anomalies, compliance_matches,
        )

        base_overall = sum(
            s["score"] * DIMENSIONS[s["dimension"]]["weight"] / 100
            for s in base_scores
        )

        level = self._level(base_overall)
        agent_trace("RiskScoringPlugin", "SCORE",
                    dimension_scores={s["dimension"]: s["score"] for s in base_scores},
                    base_score=round(base_overall, 1),
                    final_score=round(base_overall, 1),
                    level=level)

        return {
            "scores": base_scores,
            "base_overall": round(base_overall, 1),
            "final_overall": round(base_overall, 1),
            "level": level,
            "llm_adjustment": 0,
            "llm_adjustment_reason": "",
        }

    async def explain_and_adjust(self, scoring_result: dict[str, Any]) -> dict[str, Any]:
        """Use LLM to explain each dimension and suggest adjustments (±10 max)."""
        if self.demo:
            return scoring_result

        try:
            system = PromptLoader.render_scoring_system()
            user = json.dumps(scoring_result, ensure_ascii=False)
            raw = await call_llm(
                system=system, user=user,
                temperature=0.1, response_format={"type": "json_object"},
            )
            result = json.loads(raw) if raw else {}

            adjustment = max(-10, min(10, result.get("adjustment", 0)))
            base = scoring_result.get("base_overall", 50)
            final = max(0, min(100, base + adjustment))

            # Update scores with explanations
            explanations = result.get("explanations", {})
            for s in scoring_result.get("scores", []):
                dim = s["dimension"]
                s["explanation"] = explanations.get(dim, "")

            scoring_result["final_overall"] = round(final, 1)
            scoring_result["level"] = self._level(final)
            scoring_result["llm_adjustment"] = adjustment
            scoring_result["llm_adjustment_reason"] = result.get("adjustment_reason", "")

            return scoring_result
        except Exception as exc:
            logger.warning("[RiskScoring] LLM explanation failed: %s, using base scores", exc)
            return scoring_result

    @staticmethod
    def _compute_base_scores(
        indicators: dict[str, Any],
        risk_paths: list[dict],
        anomalies: list[dict],
        compliance_matches: list[dict],
    ) -> list[dict]:
        """Compute deterministic base scores for each dimension."""
        n = max(indicators.get("node_count", 1), 1)
        e = indicators.get("edge_count", 0)
        risky_ratio = indicators.get("risky_edge_ratio", 0)
        density = indicators.get("density", 0)
        comm_count = indicators.get("community_count", 0)
        max_comm_size = indicators.get("max_community_size", 0)

        scores = []

        # 1. Relation complexity (0-100)
        complexity = min(100, (e / max(n, 1)) * 15 + density * 100)
        scores.append({"dimension": "relation_complexity", "score": round(complexity, 1), "weight": 20})

        # 2. Risky relation density (0-100)
        risky_score = min(100, risky_ratio * 80 + len(risk_paths) * 10)
        scores.append({"dimension": "risky_relation", "score": round(risky_score, 1), "weight": 25})

        # 3. Community density (0-100)
        comm_score = min(100, comm_count * 15 + (max_comm_size / max(n, 1)) * 50)
        scores.append({"dimension": "community_density", "score": round(comm_score, 1), "weight": 15})

        # 4. Transmission path depth (0-100)
        high_risk_count = sum(1 for p in risk_paths if p.get("risk_level") == "high")
        medium_risk_count = sum(1 for p in risk_paths if p.get("risk_level") == "medium")
        transm_score = min(100, high_risk_count * 25 + medium_risk_count * 10)
        scores.append({"dimension": "transmission", "score": round(transm_score, 1), "weight": 20})

        # 5. Compliance risk (0-100)
        comp_score = min(100, len(compliance_matches) * 25 + len(anomalies) * 15)
        scores.append({"dimension": "compliance", "score": round(comp_score, 1), "weight": 10})

        # 6. Evidence sufficiency (0-100)
        ev_score = min(100, e * 5 + n * 2)
        scores.append({"dimension": "evidence", "score": round(ev_score, 1), "weight": 10})

        return scores

    @staticmethod
    def _level(score: float | None) -> str:
        if score is None:
            return "insufficient_evidence"
        if score >= 80:
            return "high"
        if score >= 50:
            return "medium"
        return "low"
