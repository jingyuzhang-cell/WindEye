"""EntityResolver — canonicalizes entity names against the Knowledge Graph.

Hook: POST_INTENT

Problem: IntentAgent frequently hallucinates entity names that don't exist
in the KG (engine.py:91 documents "Theodore Lesieg" for "Dr. Seuss").
Also, entities may be stored under different property keys (COMPANY_NM vs name).

Solution:
  1. Search across ALL search_properties from OntologyRegistry config.
  2. Multi-strategy matching: exact match on each property → CONTAINS → fuzzy.
  3. Return the canonical form (actual stored name) with detailed diagnostics.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Dict, List, Optional

from dra_ma.agents.layer3_execution.cypher_utils import db_client
from dra_ma.skills.base import SkillBase, SkillContext, SkillHook
from kg_construction.ontology.ontology_registry import OntologyRegistry

logger = logging.getLogger(__name__)


class EntityResolver(SkillBase):
    name = "entity_resolver"
    version = "1.0.0"
    description = "Canonicalizes entity names against KG using multi-property search to prevent hallucination"
    hook = SkillHook.POST_INTENT
    priority = 10

    async def execute(self, ctx: SkillContext) -> SkillContext:
        """Resolve and canonicalize entities from the query and intent."""
        intent = ctx.intent
        if intent is None:
            logger.info("[EntityResolver] SKIP: ctx.intent is None")
            return ctx

        query = ctx.query
        entities = list(intent.Start_Entities) if hasattr(intent, "Start_Entities") else []

        candidates = self._extract_candidates(query, entities)
        if not candidates:
            logger.info("[EntityResolver] SKIP: no entity candidates found in query or intent")
            return ctx

        logger.info(
            f"[EntityResolver] START: resolving {len(candidates)} candidate(s): {candidates}"
        )

        resolved: Dict[str, Optional[str]] = {}
        diagnostics: List[Dict] = []

        for candidate in candidates:
            logger.info(f"[EntityResolver]   Resolving: '{candidate}'...")
            match, diag = await self._resolve_entity(candidate)
            resolved[candidate] = match
            diagnostics.append(diag)

            if match and match != candidate:
                logger.info(
                    f"[EntityResolver]   MATCH: '{candidate}' -> '{match}' "
                    f"(via {diag.get('matched_property', '?')}, "
                    f"strategy={diag.get('strategy', '?')})"
                )
            elif match == candidate:
                if diag.get("found"):
                    logger.info(
                        f"[EntityResolver]   EXACT: '{candidate}' found in KG "
                        f"(canonical name matches raw, "
                        f"strategy={diag.get('strategy', '?')})"
                    )
                else:
                    logger.info(
                        f"[EntityResolver]   NO-MATCH: '{candidate}' not found in KG "
                        f"(searched {diag.get('properties_searched', 0)} properties)"
                    )
            else:
                logger.info(f"[EntityResolver]   NULL: '{candidate}' returned None")

        resolved_entities = [v for v in resolved.values() if v is not None]
        hallucinations = sum(1 for k, v in resolved.items() if v is not None and v != k)
        not_found = sum(1 for k, v in resolved.items() if v is not None and v == k and not any(
            d.get("found", False) for d in diagnostics if d.get("candidate") == k
        ))

        if resolved_entities and hasattr(intent, "Start_Entities"):
            intent.Start_Entities = resolved_entities

        ctx.metadata["entity_resolver"] = {
            "original_candidates": candidates,
            "resolved": resolved,
            "hallucinations_detected": hallucinations,
            "entities_not_found_in_kg": not_found,
            "diagnostics": diagnostics,
        }

        logger.info(
            f"[EntityResolver] DONE: {len(resolved_entities)} resolved, "
            f"{hallucinations} canonicalized, {not_found} not-in-KG"
        )
        return ctx

    # ── Helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _extract_candidates(query: str, llm_entities: List[str]) -> List[str]:
        candidates: List[str] = []
        bracket_matches = re.findall(r"\[(.*?)\]", query)
        candidates.extend(m.strip() for m in bracket_matches if m.strip())
        for ent in llm_entities:
            ent_str = str(ent).strip()
            if ent_str and ent_str not in candidates:
                candidates.append(ent_str)
        return candidates

    async def _resolve_entity(self, name: str) -> tuple:
        """Check if an entity name exists in the KG across all configured search properties.

        Returns (canonical_name, diagnostics_dict).
        """
        config = OntologyRegistry.get_config()
        search_props = config.get("search_properties", ["name"])
        node_label = OntologyRegistry.get_node_label()
        label_str = f":{node_label}" if node_label else ""

        diag = {
            "candidate": name,
            "properties_searched": len(search_props),
            "found": False,
            "matched_property": "",
            "matched_value": "",
            "strategy": "",
        }

        # ── Strategy 1: Exact match across ALL search properties ──────
        for prop in search_props:
            cypher = (
                f"MATCH (n{label_str}) WHERE n.{prop} = $name "
                f"RETURN n.{prop} as val LIMIT 1"
            )
            try:
                rows = await asyncio.to_thread(
                    db_client.execute_read, cypher, {"name": name}
                )
                if rows and rows[0].get("val"):
                    diag["found"] = True
                    diag["matched_property"] = prop
                    diag["matched_value"] = str(rows[0]["val"])
                    diag["strategy"] = "exact"
                    logger.info(
                        f"[EntityResolver]     exact match on n.{prop} = '{name}'"
                    )
                    return str(rows[0]["val"]), diag
            except Exception as exc:
                logger.debug(
                    f"[EntityResolver]     exact match failed on n.{prop}: {exc}"
                )

        # ── Strategy 2: CONTAINS match across ALL search properties ───
        for prop in search_props:
            cypher = (
                f"MATCH (n{label_str}) WHERE n.{prop} CONTAINS $name "
                f"RETURN n.{prop} as val LIMIT 3"
            )
            try:
                rows = await asyncio.to_thread(
                    db_client.execute_read, cypher, {"name": name}
                )
                if rows:
                    candidates = [str(r["val"]) for r in rows if r.get("val")]
                    best = self._pick_best_match(name, candidates)
                    if best:
                        diag["found"] = True
                        diag["matched_property"] = prop
                        diag["matched_value"] = best
                        diag["strategy"] = "contains"
                        logger.info(
                            f"[EntityResolver]     CONTAINS match on n.{prop}: "
                            f"'{name}' in '{best}'"
                        )
                        return best, diag
            except Exception as exc:
                logger.debug(
                    f"[EntityResolver]     CONTAINS match failed on n.{prop}: {exc}"
                )

        # ── Strategy 3: Multi-property OR search (any property contains) ──
        or_clauses = [f"n.{prop} CONTAINS $name" for prop in search_props]
        cypher = (
            f"MATCH (n{label_str}) WHERE {' OR '.join(or_clauses)} "
            f"RETURN n LIMIT 5"
        )
        try:
            rows = await asyncio.to_thread(
                db_client.execute_read, cypher, {"name": name}
            )
            if rows:
                # Extract the best display name from the matched node
                for row in rows:
                    node = row.get("n", {})
                    if isinstance(node, dict):
                        for prop in search_props:
                            val = node.get(prop)
                            if val and name.lower() in str(val).lower():
                                diag["found"] = True
                                diag["matched_property"] = prop
                                diag["matched_value"] = str(val)
                                diag["strategy"] = "multi_property_or"
                                logger.info(
                                    f"[EntityResolver]     multi-property OR match: "
                                    f"'{name}' -> n.{prop} = '{val}'"
                                )
                                return str(val), diag
        except Exception as exc:
            logger.debug(f"[EntityResolver]     multi-property OR search failed: {exc}")

        # ── Strategy 4: Fallback — entity may use a different property ──
        logger.info(
            f"[EntityResolver]     ALL strategies exhausted for '{name}' "
            f"(searched {len(search_props)} properties: {search_props})"
        )
        diag["strategy"] = "fallback_original"
        return name, diag

    @staticmethod
    def _pick_best_match(original: str, candidates: List[str]) -> Optional[str]:
        if not candidates:
            return None
        original_lower = original.lower().strip()
        for c in candidates:
            if c.lower().strip() == original_lower:
                return c
        for c in candidates:
            if original_lower in c.lower():
                return c
        return min(candidates, key=len)
