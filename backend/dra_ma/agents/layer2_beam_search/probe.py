"""Layer 2: Entity-Aware Probe — deep Neo4j graph probing with push-down sampling and CVT look-ahead.

Armor 1: Node Sampling (LIMIT 50 random) — prevents memory explosion from fan-out.
Armor 2: sample_tails — returns tail entity samples to the LLM for informed decisions.
Armor 3: CVT dead-end folding — auto look-ahead for compound value nodes (r1 .. r2).
"""

import logging
from typing import List, Union

from kg_construction.ontology.ontology_registry import OntologyRegistry
from dra_ma.agents.layer3_execution.cypher_utils import db_client
from dra_ma.utils.agent_trace import agent_trace

logger = logging.getLogger(__name__)


def get_adjacent_relations(entity_names: Union[str, List[str]]) -> List[str]:
    """Query adjacent relation types for starting entities with push-down sampling.

    Returns relations with (Samples: ...) metadata and CVT-folded compound edges (r1 .. r2).
    """
    if not entity_names:
        return []

    agent_trace("Probe", "START", entity_names=entity_names)

    if isinstance(entity_names, str):
        entity_names = [entity_names]

    node_label = OntologyRegistry.get_node_label()
    label_str = f":{node_label}" if node_label else ""
    match_strategy = OntologyRegistry.get_entity_matching_strategy()
    prop_key = match_strategy.get("property_key", "name")

    cypher = f"""
    MATCH (n{label_str})
    WHERE n.{prop_key} IN $entity_names
       OR n.COMPANY_NM IN $entity_names
       OR n.PERSON_NM IN $entity_names
       OR n.title IN $entity_names
    WITH n, rand() AS r ORDER BY r LIMIT 50

    MATCH (n)-[rel]-(m)
    OPTIONAL MATCH (m)-[rel2]-(target) WHERE (m.{prop_key} STARTS WITH 'm.' OR m.{prop_key} STARTS WITH 'g.') AND target <> n

    WITH type(rel) AS rel_type, type(rel2) AS cvt_rel, m, target, rand() AS r
    ORDER BY r

    RETURN rel_type, cvt_rel,
           collect(m.{prop_key})[0..3] AS m_samples,
           collect(target.{prop_key})[0..3] AS target_samples
    LIMIT 100
    """

    try:
        res = db_client.execute_read(cypher, parameters={"entity_names": entity_names})
        relations = []
        for row in res:
            r1 = row.get("rel_type")
            r2 = row.get("cvt_rel")
            m_samples = row.get("m_samples", [])
            target_samples = row.get("target_samples", [])

            if r1:
                if r2:
                    samples = [s for s in target_samples if s]
                    sample_str = ", ".join(samples[:3])
                    relations.append(f"{r1} .. {r2} (Samples: {sample_str})")
                else:
                    samples = [s for s in m_samples if s]
                    sample_str = ", ".join(samples[:3])
                    relations.append(f"{r1} (Samples: {sample_str})")

        relations = list(set(relations))
        agent_trace("Probe", "RELATIONS", relations=relations, count=len(relations))
        # Truncate log to first 3 relations + count to avoid GBK encoding crashes on Windows
        rel_preview = relations[:3]
        logger.info(f"[Probe] Entities {entity_names[:3]}... adjacent relations ({len(relations)} total): {rel_preview}")
        return relations
    except Exception as e:
        logger.error(f"[Probe] Failed to query adjacent relations for {entity_names[:3]}: {e}")
        return []
