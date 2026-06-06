from __future__ import annotations

from typing import Any

from dra_ma.governance.context import GovernanceContext
from dra_ma.governance.events import EventPublisher


class ErrorHandler:
    """Converts module failures into user-visible events and skeleton reports."""

    def __init__(self, publisher: EventPublisher):
        self.publisher = publisher

    def record(self, ctx: GovernanceContext, module_name: str, exc: Exception) -> list[str]:
        error = {"module": module_name, "message": str(exc)}
        ctx.errors.append(error)
        return [
            self.publisher.emit("error", "error", "error", error, str(exc)),
            self.publisher.emit("reporting", "report", "error", self._skeleton_report(str(exc)), str(exc)),
            self.publisher.emit("done", "done", "success", {"intent_type": ctx.intent_type}),
        ]

    @staticmethod
    def _skeleton_report(reason: str) -> dict[str, Any]:
        return {
            "overall_risk_level": "insufficient_evidence",
            "risk_scores": {
                "overall": None,
                "level": "insufficient_evidence",
                "level_label": "证据不足",
                "reason": reason,
            },
            "executive_summary": f"风险分析失败：{reason}",
            "risk_paths": [],
            "anomaly_findings": [],
            "compliance_matches": [],
            "recommendations": [],
        }
