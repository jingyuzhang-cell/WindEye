"""EntityCleaner — multi-strategy entity cleaning chain for post-aggregation.

Hook: POST_AGGREGATE

Problem: AggregatorAgent's post-filter relies on a single LLM call. If the LLM
fails or hallucinates, noisy entities pass through. The MID pre-filter only
catches Freebase machine IDs.

Solution: A layered cleaning chain executed in priority order:
  1. Rule layer (deterministic, 100% accurate):
     - MID filter (m./g. Freebase IDs)
     - Length filter (< 2 or > 200 chars)
     - Special character filter
  2. Type consistency layer (Neo4j label check, no LLM):
     - Verify entity labels match Expected_Answer_Type via fast DB lookup
  3. LLM post-filter (only when rule + type layers are inconclusive):
     - Same prompt as AggregatorAgent but only called when necessary
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional, Set

from dra_ma.agents.layer3_execution.cypher_utils import call_llm, db_client
from dra_ma.skills.base import SkillBase, SkillContext, SkillHook
from kg_construction.ontology.ontology_registry import OntologyRegistry

logger = logging.getLogger(__name__)

# ── Rule-based filters ──────────────────────────────────────────────────────

# Freebase machine ID pattern: m.xxxxxx or g.xxxxxx
MID_PATTERN = re.compile(r'^[mg]\.\w{4,}$')

# Entities that are clearly noise
NOISE_PATTERNS = [
    re.compile(r'^\d{4,}$'),           # Pure numbers (years, IDs)
    re.compile(r'^[0-9a-f]{32}$'),     # MD5 hashes
    re.compile(r'^https?://'),         # URLs
    re.compile(r'^[\W_]+$'),           # Pure punctuation
]

# Maps IntentAgent's natural-language Expected_Answer_Type to ontology layer keys.
# IntentAgent outputs types like "organization", "person" — these don't match Neo4j
# labels like "COMPANY" or "Subject". This bridge maps them to the layer_keys defined
# in ontology_finance.json's layer_labels, which are then expanded to concrete Neo4j labels.
INTENT_TYPE_TO_LAYER: Dict[str, str] = {
    "organization": "Subject",
    "company": "Subject",
    "enterprise": "Subject",
    "corporation": "Subject",
    "institution": "Subject",
    "person": "Subject",
    "individual": "Subject",
    "people": "Subject",
    "event": "Event",
    "risk_event": "Event",
    "risk event": "Event",
    "incident": "Event",
    "time": "Event",
    "risk": "Feature",
    "risk factor": "Feature",
    "riskfeature": "Feature",
    "feature": "Feature",
    "regulation": "Regulation",
    "law": "Regulation",
    "rule": "Regulation",
    "action": "Regulation",
    "report": "Closure",
    "ticket": "Closure",
    "audit": "Closure",
    "fund": "Subject",
    "security": "Subject",
}


class EntityCleaner(SkillBase):
    name = "entity_cleaner"
    version = "1.0.0"
    description = "Multi-strategy entity cleaning chain: rule-based → type-check → LLM fallback"
    hook = SkillHook.POST_AGGREGATE
    priority = 20

    # ── Public API ──────────────────────────────────────────────────────

    async def execute(self, ctx: SkillContext) -> SkillContext:
        """Run the layered cleaning chain on ctx.results."""
        results = ctx.results
        if not results:
            return ctx

        original_count = len(results)
        expected_type = ctx.expected_answer_type or (
            ctx.intent.Expected_Answer_Type if ctx.intent and hasattr(ctx.intent, "Expected_Answer_Type") else ""
        )
        query = ctx.query

        # Layer 1: Rule-based deterministic cleaning
        after_rules, rule_removed = self._clean_rules(results)
        logger.info(
            f"[EntityCleaner] Layer 1 (rules): {original_count} -> {len(after_rules)} "
            f"(removed {len(rule_removed)})"
        )

        # Layer 2: Type consistency check via Neo4j labels
        after_types, type_removed = await self._clean_by_type(after_rules, expected_type)
        logger.info(
            f"[EntityCleaner] Layer 2 (type): {len(after_rules)} -> {len(after_types)} "
            f"(removed {len(type_removed)})"
        )

        # Layer 3: LLM post-filter (only if needed)
        uncertain = self._find_uncertain(after_types, expected_type)
        if uncertain and query:
            after_llm, llm_removed = await self._clean_by_llm(
                after_types, uncertain, query, expected_type
            )
            logger.info(
                f"[EntityCleaner] Layer 3 (LLM): {len(after_types)} -> {len(after_llm)} "
                f"(removed {len(llm_removed)})"
            )
            final_results = after_llm
        else:
            final_results = after_types
            llm_removed = []

        # Write results back
        ctx.results = final_results
        ctx.metadata["entity_cleaner"] = {
            "original_count": original_count,
            "final_count": len(final_results),
            "rule_removed": list(rule_removed),
            "type_removed": list(type_removed),
            "llm_removed": list(llm_removed),
            "layers_used": 3 if uncertain else 2,
        }

        return ctx

    # ── Layer 1: Rules ──────────────────────────────────────────────────

    @staticmethod
    def _clean_rules(results: List[str]) -> tuple:
        """Apply deterministic rule-based filters."""
        kept: List[str] = []
        removed: List[str] = []

        for entity in results:
            entity_str = str(entity).strip()

            # Empty / whitespace
            if not entity_str:
                removed.append(entity_str)
                continue

            # Length check
            if len(entity_str) < 2 or len(entity_str) > 200:
                removed.append(entity_str)
                continue

            # MID filter
            if MID_PATTERN.match(entity_str):
                removed.append(entity_str)
                continue

            # Noise patterns
            if any(p.match(entity_str) for p in NOISE_PATTERNS):
                removed.append(entity_str)
                continue

            kept.append(entity_str)

        return kept, removed

    # ── Layer 2: Type Consistency ───────────────────────────────────────

    async def _clean_by_type(self, results: List[str], expected_type: str) -> tuple:
        """Check entity labels in Neo4j against Expected_Answer_Type.

        Uses a two-level mapping:
          1. INTENT_TYPE_TO_LAYER: maps IntentAgent's natural-language type
             (e.g. "organization") to an ontology layer key (e.g. "Subject").
          2. layer_labels from ontology config: maps layer keys to concrete
             Neo4j labels (e.g. "Subject" → ["COMPANY", "PERSON", ...]).

        If the expected_type is unknown (no mapping entry), skip type checking
        and keep all entities rather than falsely removing valid results.
        """
        if not expected_type or expected_type == "any" or not results:
            return results, []

        expected_lower = expected_type.lower().strip()

        # Resolve expected_type → layer_key → allowed Neo4j labels
        layer_key = INTENT_TYPE_TO_LAYER.get(expected_lower)
        if layer_key is None:
            # Unknown type — skip type check, keep all entities
            logger.info(
                f"[EntityCleaner] Layer 2 SKIP: no mapping for "
                f"Expected_Answer_Type='{expected_type}'. Keeping all {len(results)} entities."
            )
            return results, []

        config = OntologyRegistry.get_config()
        layer_labels = config.get("layer_labels", {})
        allowed_labels = {
            lbl.lower() for lbl in layer_labels.get(layer_key, [])
        }
        if not allowed_labels:
            logger.info(
                f"[EntityCleaner] Layer 2 SKIP: layer_key='{layer_key}' has no "
                f"labels in ontology config. Keeping all {len(results)} entities."
            )
            return results, []

        logger.info(
            f"[EntityCleaner] Layer 2: expected_type='{expected_type}' "
            f"→ layer_key='{layer_key}' → allowed_labels={sorted(allowed_labels)}"
        )

        prop_key = OntologyRegistry.get_entity_matching_strategy().get("property_key", "name")
        node_label = OntologyRegistry.get_node_label()
        label_str = f":{node_label}" if node_label else ""

        kept: List[str] = []
        removed: List[str] = []

        # Only check a sample to avoid excessive DB calls
        sample_size = min(len(results), 10)
        for entity in results[:sample_size]:
            try:
                cypher = (
                    f"MATCH (n{label_str} {{{prop_key}: $entity}}) "
                    f"RETURN labels(n) as labels LIMIT 1"
                )
                rows = await asyncio.to_thread(
                    db_client.execute_read, cypher, {"entity": str(entity)}
                )
                if rows:
                    labels = {str(lbl).lower() for lbl in rows[0].get("labels", [])}
                    if labels & allowed_labels:
                        kept.append(entity)
                    else:
                        logger.info(
                            f"[EntityCleaner] Type mismatch: '{entity}' has labels "
                            f"{sorted(labels)}, allowed={sorted(allowed_labels)} "
                            f"(expected_type='{expected_type}', layer_key='{layer_key}')"
                        )
                        removed.append(entity)
                else:
                    # Entity not found in KG — keep it (may be valid but not indexed)
                    kept.append(entity)
            except Exception:
                kept.append(entity)  # Graceful: keep if DB check fails

        # For unchecked entities (beyond sample), keep them
        if len(results) > sample_size:
            kept.extend(results[sample_size:])

        return kept, removed

    # ── Layer 3: LLM ────────────────────────────────────────────────────

    async def _clean_by_llm(self, all_results: List[str], uncertain: List[str],
                            query: str, expected_type: str) -> tuple:
        """LLM post-filter for entities that couldn't be validated by rules."""
        prompt = _LLM_CLEAN_PROMPT.format(
            query=query,
            expected_answer_type=expected_type or "any",
            retrieved_entities=json.dumps(all_results, ensure_ascii=False),
        )

        try:
            raw = await call_llm(
                system="你是一个数据清洗助手，严格输出JSON数组。",
                user=prompt,
                temperature=0.1,
            )
            filtered = json.loads(raw)
            if isinstance(filtered, list):
                removed = [e for e in all_results if e not in filtered]
                return filtered, removed
        except Exception as exc:
            logger.error(f"[EntityCleaner] LLM layer failed: {exc}")

        return all_results, []

    # ── Helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _find_uncertain(results: List[str], expected_type: str) -> List[str]:
        """Identify entities that may need LLM verification.

        Returns entities that weren't definitively validated by rules/types.
        If the type layer wasn't run (no expected_type), all are uncertain.
        """
        if not expected_type or expected_type == "any":
            return list(results)

        # Entities with unusual characters or very short/long names
        uncertain = []
        for entity in results:
            entity_str = str(entity)
            # Unusual characters
            if re.search(r'[^\w\s\-.,&()（）一-鿿]', entity_str):
                uncertain.append(entity_str)
            # Very long names are suspicious
            elif len(entity_str) > 80:
                uncertain.append(entity_str)

        return uncertain


_LLM_CLEAN_PROMPT = """你是一个知识图谱结果终极过滤专家。
用户问题："{query}"
期望答案类型（语义定锚 / Semantic Anchor）：{expected_answer_type}
知识图谱初步检索结果：{retrieved_entities}

请根据常识和用户问题的语义约束，剔除检索结果中明显不符合逻辑或类型的噪音实体。

要求：
1. 仅保留正确的实体。如果全部都不符合，返回空数组 []。
2. 必须以 JSON 数组格式返回过滤后的实体列表。
3. 排除所有 `m.` 或 `g.` 开头的 Freebase MID 字符串。
4. 绝对禁止输出任何解释文字！只输出严格的 JSON 数组。
示例输出：
["Entity1", "Entity2"]
"""
