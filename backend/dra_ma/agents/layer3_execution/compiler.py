"""Layer 3: ExecutorAgent — Symbol Compiler that translates GQ-IR to physical Cypher.

Armor 4 [Placeholder Crusher]: intercepts and removes hallucinated "Target" / "Node" pseudo-relations.
Armor 5 [Smart Return Anchor]: auto-overrides RETURN to use the correct property key based on Registry.
"""

import logging
from typing import List, Dict, Any

from pydantic import BaseModel, Field

from dra_ma.agents.layer3_execution.cypher_utils import (
    path_to_cypher,
    execute_cypher_and_extract,
)
from dra_ma.utils.agent_trace import agent_trace

logger = logging.getLogger(__name__)


class DBResponse(BaseModel):
    is_valid: bool = Field(..., description="Whether the Cypher statement executed without errors")
    is_empty: bool = Field(..., description="Whether the execution yielded zero results")
    subgraph: Dict[str, Any] = Field(default_factory=lambda: {"nodes": [], "edges": []}, description="Visual subgraph data")
    error_log: str = Field(default="", description="Error messages captured during database execution")
    results: List[str] = Field(default_factory=list, description="Flat list of result entities")


class ExecutorAgent:
    """Agent responsible for translating meta-paths into Cypher and performing Neo4j executions."""

    @staticmethod
    def translate_to_cypher(path: str, expected_type: str = "") -> str:
        cypher = path_to_cypher(path, expected_type=expected_type)
        agent_trace("ExecutorAgent", "COMPILE",
            path=path,
            expected_type=expected_type,
            cypher=str(cypher)[:500])
        logger.info(f"[ExecutorAgent] Path '{path}' translated to: '{cypher}'")
        return cypher

    @staticmethod
    async def execute(cypher: str, start_entity: str = "") -> DBResponse:
        logger.info(f"[ExecutorAgent] Executing Cypher: {cypher}")
        if not cypher or not cypher.strip():
            logger.error("[ExecutorAgent] Refusing to execute empty Cypher query.")
            return DBResponse(
                is_valid=False,
                is_empty=True,
                subgraph={"nodes": [], "edges": []},
                results=[],
                error_log="Empty Cypher query rejected before execution."
            )

        try:
            import asyncio
            results = await asyncio.wait_for(
                asyncio.to_thread(execute_cypher_and_extract, cypher),
                timeout=15.0
            )

            nodes = []
            edges = []
            if start_entity:
                from kg_construction.ontology.ontology_registry import OntologyRegistry
                viz_node_type = OntologyRegistry.get_node_label()
                nodes.append({"id": start_entity, "label": start_entity, "type": viz_node_type})
                added = {start_entity}
                for res in results[:20]:
                    if res not in added:
                        nodes.append({"id": res, "label": res, "type": viz_node_type})
                        added.add(res)
                    edges.append({"source": start_entity, "target": res, "type": ""})

            db_response = DBResponse(
                is_valid=True,
                is_empty=len(results) == 0,
                subgraph={"nodes": nodes, "edges": edges},
                results=results,
                error_log=""
            )
            agent_trace("ExecutorAgent", "RESULT",
                is_valid=True,
                result_count=len(results),
                node_count=len(nodes),
                edge_count=len(edges))
            logger.info(f"[ExecutorAgent] Execution success. Retrieved {len(results)} items.")
            return db_response

        except Exception as e:
            import asyncio
            if isinstance(e, asyncio.TimeoutError):
                error_msg = "TimeoutError: Execution exceeded 15 seconds. High Fan-out Error detected. Please add LIMIT 50 or tighter constraints to prevent cartesian explosion."
            else:
                error_msg = str(e)
            logger.error(f"[ExecutorAgent] Execution failed: {error_msg}")
            agent_trace("ExecutorAgent", "RESULT",
                is_valid=False,
                result_count=0,
                node_count=0,
                edge_count=0)
            return DBResponse(
                is_valid=False,
                is_empty=True,
                subgraph={"nodes": [], "edges": []},
                results=[],
                error_log=error_msg
            )
