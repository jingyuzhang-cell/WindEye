from __future__ import annotations

from dra_ma.governance.modules import (
    CommunityModule,
    ComplianceModule,
    EntityModule,
    GovernanceDecisionModule,
    GovernanceModule,
    IntentModule,
    ReporterModule,
    RiskPathModule,
    ScoringModule,
)
from dra_ma.governance.modules.evidence import EvidenceModule


class PluginRegistry:
    """Registry for governance pipeline modules."""

    def __init__(self):
        self._modules: list[GovernanceModule] = []

    def register(self, module: GovernanceModule) -> None:
        self._modules.append(module)

    def modules(self) -> list[GovernanceModule]:
        return list(self._modules)

    @classmethod
    def default(cls) -> "PluginRegistry":
        registry = cls()
        registry.register(IntentModule())
        registry.register(EntityModule())
        registry.register(EvidenceModule())
        registry.register(CommunityModule())
        registry.register(RiskPathModule())
        registry.register(ComplianceModule())
        registry.register(ScoringModule())
        registry.register(GovernanceDecisionModule())
        registry.register(ReporterModule())
        return registry
