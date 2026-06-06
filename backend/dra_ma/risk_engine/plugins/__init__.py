"""Risk Analysis Plugins — modular risk analysis stages for UnifiedEngine.

Each plugin is a self-contained module that processes upstream outputs
and produces structured results. Plugins use LLMs but are orchestrated
by UnifiedEngine, not by the legacy RiskAnalysisEngine pipeline.
"""

from dra_ma.risk_engine.plugins.risk_analyst import RiskAnalystPlugin
from dra_ma.risk_engine.plugins.compliance import CompliancePlugin
from dra_ma.risk_engine.plugins.risk_scoring import RiskScoringPlugin
from dra_ma.risk_engine.plugins.governance import GovernancePlugin
from dra_ma.risk_engine.plugins.reporter import ReporterPlugin

__all__ = [
    "RiskAnalystPlugin",
    "CompliancePlugin",
    "RiskScoringPlugin",
    "GovernancePlugin",
    "ReporterPlugin",
]
