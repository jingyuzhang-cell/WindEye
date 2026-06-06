"""Evidence Builder — organize evidence chains from DRAEngine + Graph Analytics.

Tool module (NOT agent, no LLM calls). Organizes subgraph relations, Cypher results,
and Verifier conclusions into claim-based evidence chains for the Reporter.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class EvidenceChain:
    claim_id: str
    claim: str
    supporting_nodes: list[str] = field(default_factory=list)
    supporting_edges: list[str] = field(default_factory=list)
    cypher_source: str = ""
    verifier_score: float = 0.0
    document_snippets: list[str] = field(default_factory=list)
    confidence: float = 0.0


@dataclass
class EvidenceChains:
    chains: list[EvidenceChain] = field(default_factory=list)
    overall_confidence: float = 0.0
    total_claims: int = 0
    verified_claims: int = 0


class EvidenceBuilder:
    """Organize evidence from DRAEngine output into traceable claim chains.

    Does NOT call LLM. Pure data organization: maps subgraph relations,
    Cypher results, and Verifier conclusions to structured evidence.
    """

    def build(
        self,
        subgraph: dict,
        analytics_result: dict | None = None,
    ) -> EvidenceChains:
        """Build evidence chains from DRAEngine EvidenceSubgraph output.

        Args:
            subgraph: EvidenceSubgraph from DRAEngine.retrieve_evidence_subgraph()
                      {nodes, edges, evidence_paths, cypher_records, verified_claims,
                       failed_queries, graph_summary, confidence}
            analytics_result: Optional GraphAnalyticsResult for enrichment.

        Returns:
            EvidenceChains with organized claim-based evidence.
        """
        nodes = subgraph.get("nodes", [])
        edges = subgraph.get("edges", [])
        verified_claims = subgraph.get("verified_claims", [])
        cypher_records = subgraph.get("cypher_records", [])
        evidence_paths = subgraph.get("evidence_paths", [])

        chains: list[EvidenceChain] = []

        # Build node index for lookups
        node_index: dict[str, dict] = {}
        for n in nodes:
            nid = str(n.get("id", ""))
            node_index[nid] = n

        # 1. Evidence from verified claims
        for i, claim in enumerate(verified_claims):
            claim_text = claim.get("claim", claim.get("statement", f"Claim {i+1}"))
            supporting_nodes = []
            for nid in claim.get("supporting_node_ids", []):
                node = node_index.get(str(nid), {})
                props = node.get("properties", {}) if isinstance(node.get("properties"), dict) else {}
                name = props.get("name", props.get("COMPANY_NM", str(nid)))
                supporting_nodes.append(str(name))

            chains.append(EvidenceChain(
                claim_id=f"CL-{i+1:03d}",
                claim=str(claim_text),
                supporting_nodes=supporting_nodes,
                supporting_edges=[],
                cypher_source=claim.get("cypher", ""),
                verifier_score=float(claim.get("verifier_score", 0.0)),
                confidence=float(claim.get("confidence", 0.7)),
            ))

        # 2. Evidence from Cypher records
        for i, rec in enumerate(cypher_records):
            cypher = rec.get("cypher", "")
            result_count = len(rec.get("results", []))
            if result_count > 0:
                chains.append(EvidenceChain(
                    claim_id=f"CY-{i+1:03d}",
                    claim=f"Cypher query returned {result_count} results",
                    supporting_nodes=[],
                    supporting_edges=[],
                    cypher_source=cypher,
                    confidence=0.8,
                ))

        # 3. Evidence from evidence paths (paths connecting claims to graph elements)
        for i, path in enumerate(evidence_paths):
            path_nodes = path.get("node_ids", path.get("nodes", []))
            path_edges = path.get("edge_ids", path.get("edges", []))
            chains.append(EvidenceChain(
                claim_id=f"EP-{i+1:03d}",
                claim=path.get("description", f"Evidence path {i+1}"),
                supporting_nodes=[str(n) for n in path_nodes],
                supporting_edges=[str(e) for e in path_edges],
                cypher_source=path.get("cypher", ""),
                verifier_score=float(path.get("score", 0.0)),
                confidence=float(path.get("confidence", 0.7)),
            ))

        # 4. If no explicit evidence, derive from graph structure
        if not chains and nodes:
            node_count = len(nodes)
            edge_count = len(edges)
            chains.append(EvidenceChain(
                claim_id="GR-001",
                claim=f"Subgraph contains {node_count} nodes and {edge_count} edges",
                supporting_nodes=[str(n.get("id", "")) for n in nodes[:5]],
                supporting_edges=[],
                confidence=0.5,
            ))

        # Compute overall confidence
        total_claims = len(chains)
        verified_claims_count = sum(1 for c in chains if c.verifier_score > 0)
        avg_confidence = (
            sum(c.confidence for c in chains) / max(total_claims, 1)
        )

        return EvidenceChains(
            chains=chains,
            overall_confidence=round(avg_confidence, 3),
            total_claims=total_claims,
            verified_claims=verified_claims_count,
        )
