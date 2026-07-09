from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class GovernanceContext:
    """Shared state passed through the collaborative governance pipeline.

    Modules should only read their declared dependencies and write their own
    output fields. This keeps the pipeline auditable and easy to replace stage
    by stage.
    """

    query: str
    session_id: str = ""
    round_id: int = 1
    intent_hint: str | None = None
    max_hop: int = 3
    file_content: str | None = None
    confirmed_entities: list[dict[str, Any]] = field(default_factory=list)
    workflow: str | None = None
    demo: bool = False

    intent_type: str = "graph_qa"
    raw_entities: list[str] = field(default_factory=list)
    task_config: dict[str, Any] = field(default_factory=dict)
    parsed_intent: Any = None
    file_context: dict[str, Any] | None = None

    resolved_entities: list[Any] = field(default_factory=list)
    unresolved_entities: list[Any] = field(default_factory=list)
    subgraph: Any = None
    relation_types: list[str] = field(default_factory=list)

    analytics: Any = None
    entity_stats: dict[str, Any] | None = None
    communities: dict[str, Any] | None = None
    entity_community_map: dict[str, Any] | None = None
    candidate_risk_paths: list[dict[str, Any]] = field(default_factory=list)

    risk_paths: Any = None
    anomalies: list[dict[str, Any]] = field(default_factory=list)
    compliance: Any = None
    compliance_scores: Any = None
    compliance_indicators: Any = None
    scoring: Any = None
    governance: Any = None
    evidence_chains: Any = None
    report: dict[str, Any] | None = None
    terminal: bool = False

    # Expanded community discovery (Phase B)
    expanded_community_result: dict[str, Any] | None = None
    expanded_communities: list[dict[str, Any]] = field(default_factory=list)
    expanded_entity_community_map: dict[str, Any] = field(default_factory=dict)
    community_edges: list[dict[str, Any]] = field(default_factory=list)
    community_graph: dict[str, Any] | None = None
    seed_community_id: int | None = None

    trace_id: str = field(default_factory=lambda: f"trc-{uuid.uuid4().hex}")
    warnings: list[str] = field(default_factory=list)
    errors: list[dict[str, Any]] = field(default_factory=list)

    @property
    def sid(self) -> str:
        return self.session_id or f"sess-{uuid.uuid4().hex[:10]}"
