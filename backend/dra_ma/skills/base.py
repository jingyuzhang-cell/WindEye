"""DRA-MA Skill Framework — base classes for pluggable reasoning skills.

Skills are lightweight, self-contained modules that hook into the DRA-MA
pipeline at defined interception points to enhance reasoning accuracy and
efficiency. Each skill has a standard interface, can be enabled/disabled
via feature flags, and is composable with other skills.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ── Hook Points ──────────────────────────────────────────────────────────────

class SkillHook(str, Enum):
    """Pipeline interception points where skills can be injected.

    Naming convention: PRE_* runs before the stage, POST_* runs after.
    ON_FAILURE and ON_COMPLETE are global lifecycle hooks.
    """

    # Layer 1 — Perception
    PRE_INTENT = "pre_intent"
    POST_INTENT = "post_intent"
    PRE_GATING = "pre_gating"
    POST_GATING = "post_gating"

    # Layer 2 — Planning
    PRE_PLAN = "pre_plan"
    POST_PLAN = "post_plan"

    # Layer 3 — Execution
    PRE_EXECUTE = "pre_execute"
    POST_EXECUTE = "post_execute"
    PRE_HEAL = "pre_heal"
    POST_HEAL = "post_heal"

    # Layer 4 — Consensus
    PRE_VERIFY = "pre_verify"
    POST_VERIFY = "post_verify"
    PRE_AGGREGATE = "pre_aggregate"
    POST_AGGREGATE = "post_aggregate"
    PRE_NLG = "pre_nlg"
    POST_NLG = "post_nlg"

    # Risk Engine hooks (legacy — still used by existing pipeline)
    RISK_PLANNING = "risk_planning"
    RISK_RETRIEVING = "risk_retrieving"
    RISK_ANALYZING = "risk_analyzing"
    RISK_COMPLIANCE = "risk_compliance"
    RISK_REPORTING = "risk_reporting"

    # Unified pipeline stage hooks (used by UnifiedEngine)
    GRAPH_ANALYTICS = "graph_analytics"
    RISK_ANALYSIS = "risk_analysis"
    RISK_SCORING = "risk_scoring"
    RISK_GOVERNANCE = "risk_governance"

    # Global lifecycle
    ON_FAILURE = "on_failure"
    ON_COMPLETE = "on_complete"


# ── Skill Context ────────────────────────────────────────────────────────────

class SkillContext(BaseModel):
    """Mutable context object passed through the skill execution chain.

    Skills read from and write to this context. The context accumulates
    state as it flows through the pipeline, enabling cross-skill communication.
    """

    query: str = ""
    intent: Optional[Any] = None  # IntentObject
    gated_mode: str = ""  # "simple" | "complex"
    beams: List[Dict[str, Any]] = Field(default_factory=list)
    cypher: str = ""
    results: List[str] = Field(default_factory=list)
    error_log: str = ""
    expected_answer_type: str = ""
    dataset_name: str = ""
    history: List[str] = Field(default_factory=list)

    # Beam search state
    current_step: int = 0
    max_hop: int = 1
    active_beams: int = 0

    # Risk engine state
    risk_subtasks: List[Dict[str, Any]] = Field(default_factory=list)
    risk_paths: List[Dict[str, Any]] = Field(default_factory=list)
    risk_anomalies: List[Dict[str, Any]] = Field(default_factory=list)
    risk_compliance_matches: List[Dict[str, Any]] = Field(default_factory=list)

    # Metadata bag for skill-to-skill communication
    metadata: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        arbitrary_types_allowed = True


# ── Skill Base ───────────────────────────────────────────────────────────────

class SkillBase(ABC):
    """Abstract base class for all DRA-MA pipeline skills.

    Each skill hooks into exactly one pipeline stage (defined by `hook`)
    and receives a `SkillContext` to read/write. Skills are executed in
    `priority` order (lower numbers run first).

    Subclasses must override `execute()` and set the class-level attributes
    `name`, `description`, and `hook`.
    """

    # ── Class-level metadata (override in subclasses) ──
    name: str = ""
    version: str = "1.0.0"
    description: str = ""
    hook: SkillHook = SkillHook.ON_COMPLETE
    priority: int = 100
    enabled: bool = True

    def can_execute(self, ctx: SkillContext) -> bool:
        """Check whether this skill should run given the current context.

        Override to add conditional logic (e.g. skip if dataset is wrong).
        """
        return self.enabled

    @abstractmethod
    async def execute(self, ctx: SkillContext) -> SkillContext:
        """Execute the skill, mutating and returning the context.

        Implementations should:
        1. Read relevant fields from ctx
        2. Perform their logic (query KG, call LLM, apply rules, etc.)
        3. Write results back to ctx (or ctx.metadata)
        4. Return ctx for the next skill in the chain
        """
        ...

    def __repr__(self) -> str:
        status = "ON" if self.enabled else "OFF"
        return f"<{self.name} v{self.version} [{status}] hook={self.hook.value} pri={self.priority}>"
