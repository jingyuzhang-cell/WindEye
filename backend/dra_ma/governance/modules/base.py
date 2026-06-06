from __future__ import annotations

from typing import Any, AsyncGenerator

from dra_ma.governance.context import GovernanceContext
from dra_ma.governance.events import EventPublisher


class GovernanceModule:
    """Base contract for pluggable collaborative governance modules."""

    name: str = "module"
    depends_on: list[str] = []
    output_events: list[str] = []

    async def run(
        self,
        ctx: GovernanceContext,
        services: Any,
        publisher: EventPublisher,
    ) -> AsyncGenerator[str, None]:
        raise NotImplementedError
