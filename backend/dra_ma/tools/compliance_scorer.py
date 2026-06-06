"""Compliance Scorer — per-node compliance scores from regulation matches."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class ComplianceScorer:
    """Compute per-node compliance scores based on regulation matches.

    Each node starts at 100 (fully compliant). For each compliance match
    that affects the node's associated entities, a deduction is applied
    based on violation severity.
    """

    SEVERITY_DEDUCTION: dict[str, int] = {
        "严重违规": 30,
        "违规": 20,
        "轻微违规": 10,
        "风险提示": 5,
    }

    DEFAULT_DEDUCTION = 10

    @staticmethod
    def score_nodes(
        nodes: list[dict],
        compliance_matches: list[dict],
    ) -> dict[str, float]:
        """Return {node_id: compliance_score (0-100)} for affected nodes.

        Args:
            nodes: Subgraph node dicts (each has 'id' and optional 'properties').
            compliance_matches: From CompliancePlugin, each has 'violation' and
                                'affected_entities' fields.

        Returns:
            Mapping from node_id to compliance score (100 = fully compliant).
            Nodes not mentioned in any match default to 100.
        """
        scores: dict[str, float] = {}

        # Initialize all nodes at 100
        for n in nodes:
            nid = str(n.get("id", ""))
            if nid:
                scores[nid] = 100.0

        if not compliance_matches:
            logger.info("[ComplianceScorer] No compliance matches — all nodes at 100")
            return scores

        for match in compliance_matches:
            violation = match.get("violation", "")
            deduction = ComplianceScorer.SEVERITY_DEDUCTION.get(
                violation, ComplianceScorer.DEFAULT_DEDUCTION,
            )
            affected = match.get("affected_entities", [])

            if isinstance(affected, str):
                affected = [affected]

            for entity_name in affected:
                if not entity_name:
                    continue
                entity_str = str(entity_name)
                # Match by name against node properties
                matched = False
                for n in nodes:
                    props = n.get("properties", {}) if isinstance(n.get("properties"), dict) else {}
                    names = [
                        str(props.get("name", "")),
                        str(props.get("COMPANY_NM", "")),
                        str(props.get("zh_name", "")),
                        str(props.get("title", "")),
                    ]
                    if any(name == entity_str for name in names if name):
                        nid = str(n.get("id", ""))
                        if nid:
                            scores[nid] = max(0.0, scores.get(nid, 100.0) - deduction)
                            matched = True
                            break

                if not matched:
                    # Try partial match (entity_name appears in node name)
                    for n in nodes:
                        props = n.get("properties", {}) if isinstance(n.get("properties"), dict) else {}
                        names = [
                            str(props.get("name", "")),
                            str(props.get("COMPANY_NM", "")),
                            str(props.get("zh_name", "")),
                            str(props.get("title", "")),
                        ]
                        if any(entity_str in name for name in names if name):
                            nid = str(n.get("id", ""))
                            if nid:
                                scores[nid] = max(0.0, scores.get(nid, 100.0) - deduction * 0.5)
                            break

        scored_count = sum(1 for v in scores.values() if v < 100.0)
        logger.info(
            "[ComplianceScorer] Scored %d nodes: %d with deductions",
            len(scores), scored_count,
        )
        return scores
