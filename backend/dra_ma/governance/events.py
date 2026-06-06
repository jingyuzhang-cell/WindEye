from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from typing import Any

from dra_ma.governance.context import GovernanceContext


@dataclass
class GovernanceEvent:
    session_id: str
    round_id: int
    stage: str
    event_type: str
    status: str
    data: Any
    trace_id: str = ""
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": uuid.uuid4().hex[:12],
            "trace_id": self.trace_id,
            "session_id": self.session_id,
            "round_id": self.round_id,
            "stage": self.stage,
            "type": self.event_type,
            "status": self.status,
            "data": self.data,
            "error": self.error,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)


class EventPublisher:
    """Builds standardized SSE envelope payloads for every pipeline stage."""

    def __init__(self, ctx: GovernanceContext):
        self.ctx = ctx

    def emit(
        self,
        stage: str,
        event_type: str,
        status: str,
        data: Any,
        error: str | None = None,
    ) -> str:
        return GovernanceEvent(
            session_id=self.ctx.session_id,
            round_id=self.ctx.round_id,
            stage=stage,
            event_type=event_type,
            status=status,
            data=data,
            trace_id=self.ctx.trace_id,
            error=error,
        ).to_json()
