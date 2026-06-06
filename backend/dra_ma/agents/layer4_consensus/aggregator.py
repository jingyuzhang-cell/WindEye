"""Layer 4: AggregatorAgent — cross-branch consensus, LLM post-filtering, and NLG generation.

Best-path-first consensus: entities from the highest-scoring branch always retained;
other entities only kept if they appear in >= 2 branches.

Armor 6 [Semantic Post-Filtering]: collects all branch results, combines with Expected
  Answer Type from Layer 1, and performs a final LLM cleaning pass to remove noise entities.
"""

import json
import re
import logging
from typing import List, Dict, Any
from collections import Counter

from dra_ma.agents.layer3_execution.cypher_utils import call_llm
from dra_ma.utils.agent_trace import agent_trace

logger = logging.getLogger(__name__)

POST_FILTER_PROMPT = """
你是一个知识图谱结果终极过滤专家。
用户问题："{query}"
期望答案类型（语义定锚 / Semantic Anchor）：{expected_answer_type}
知识图谱初步检索结果：{retrieved_entities}

请根据常识和用户问题的语义约束，剔除检索结果中明显不符合逻辑或类型的噪音实体。
⚠️ 核心约束：结果必须是 "{expected_answer_type}" 类型。任何不符合此类型的实体必须被移除。

要求：
1. 仅保留正确的实体。如果全部都不符合，返回空数组 []。
2. 必须以 JSON 数组格式返回过滤后的实体列表。
3. 排除所有 `m.` 或 `g.` 开头的 Freebase MID 字符串（如 `m.060w6zq`），这些是原始机器 ID 而非人类可读的实体名称。
4. 绝对禁止输出任何解释文字！只输出严格的 JSON 数组。
{extra_constraints}
示例输出：
["Fiji", "New Zealand", "Australia"]
"""

AGGREGATOR_SYSTEM_PROMPT = """
你是一个图谱答案聚合与回答生成智能体（AggregatorAgent）。你的任务是接收来自图谱多跳推理分支合并并过滤后的结果实体，以及关联的元推理路径，生成最终对用户的自然语言回答。

用户原始问题: {question}
最终检索并过滤后的实体: {results}
采用的推理路径依据: {paths}

要求：
1. 给出自然流畅、有逻辑性的回答。
2. 引用推理路径中关键的实体与关系类型，确保回答是有事实可循的。
3. 绝不虚构任何关系和事实，避免引入幻觉。
"""


class AggregatorAgent:
    """Agent responsible for cross-branch consensus voting, LLM post-filtering, and NLG generation."""

    @staticmethod
    def _dedup_and_rank(retained: List[str], entity_occurrences: Counter) -> List[str]:
        """Dedup by normalized entity ID and rank by cross-branch frequency."""
        seen = set()
        unique = []
        for ent in sorted(retained, key=lambda e: entity_occurrences.get(e, 0), reverse=True):
            norm = str(ent).lower().strip()
            if norm not in seen:
                seen.add(norm)
                unique.append(ent)
        return unique

    @staticmethod
    async def aggregate_results(query: str, branches: List[Dict[str, Any]], expected_answer_type: str = "") -> List[str]:
        """
        Best-path-first consensus aggregation with cross-layer semantic anchor.

        Entities from the highest-scoring branch are always retained.
        Entities from other branches are only retained if they appear in >= 2 branches.
        The Expected_Answer_Type from Layer 1 (IntentAgent) is injected as a semantic
        anchor into the LLM post-filter to eliminate type-mismatched noise entities.
        """
        if not branches:
            logger.warning("[AggregatorAgent] No branches to aggregate.")
            return []

        if len(branches) == 1:
            return sorted(branches[0].get("results", []))

        best_results = set(branches[0].get("results", []))
        best_path = branches[0].get("path", "Unknown")

        entity_occurrences = Counter()
        entity_sources = {}
        for idx, b in enumerate(branches):
            for ent in b.get("results", []):
                entity_occurrences[ent] += 1
                if ent not in entity_sources:
                    entity_sources[ent] = []
                entity_sources[ent].append(b.get("path", f"Branch-{idx}"))

        retained = []
        consensus_added = []
        eliminated = []

        for ent, count in entity_occurrences.items():
            if ent in best_results:
                retained.append(ent)
            elif count >= 2:
                retained.append(ent)
                consensus_added.append(ent)
            else:
                eliminated.append({"entity": ent, "occurrences": count, "sources": entity_sources[ent]})

        logger.info("=" * 70)
        logger.info("[AggregatorAgent] --- BEST-PATH-FIRST CONSENSUS AGGREGATION ---")
        logger.info(f"[AggregatorAgent] Best branch: '{best_path}' with {len(best_results)} entities")
        logger.info(f"[AggregatorAgent] Total candidates: {len(entity_occurrences)}")
        logger.info(f"[AggregatorAgent] RETAINED: {len(retained)} (best-path: {len(retained) - len(consensus_added)}, consensus: {len(consensus_added)})")
        logger.info(f"[AggregatorAgent] ELIMINATED: {len(eliminated)}")
        if eliminated:
            for item in eliminated:
                logger.info(f"   - '{item['entity']}' (occurrences={item['occurrences']}, sources={item['sources']})")
        logger.info("=" * 70)

        if not retained:
            return []

        retained = AggregatorAgent._dedup_and_rank(retained, entity_occurrences)
        logger.info(f"[AggregatorAgent] After dedup/ranking: {len(retained)} unique entities")

        # ── Deterministic MID pre-filter ──
        # Strip raw Freebase machine IDs (m.xxxxxxx, g.xxxxxxx) before LLM post-filter.
        # These are internal DB keys, not human-readable entity names. The LLM-based
        # post-filter may not always catch them, so we do a deterministic pass first.
        mid_pattern = re.compile(r'^[mg]\.\w{4,}$')
        mid_count = sum(1 for e in retained if mid_pattern.match(str(e)))
        if mid_count > 0:
            retained = [e for e in retained if not mid_pattern.match(str(e))]
            logger.info(f"[AggregatorAgent] Pre-filter removed {mid_count} MID strings (m./g. IDs)")

        # Phase 3: LLM Post-Filtering with Semantic Anchor from Layer 1

        # Build dynamic extra constraints based on query patterns
        extra = ""
        # 4B.1: Official language constraint
        if "official" in query.lower():
            extra += '4. 问题要求「官方」语言。只保留该国宪法/法律规定的官方语言。排除 English 等广泛使用但非官方的外语，除非该语言确实是该国的法定官方语言。\n'

        prompt = POST_FILTER_PROMPT.format(
            query=query,
            expected_answer_type=expected_answer_type or "any",
            retrieved_entities=json.dumps(retained, ensure_ascii=False),
            extra_constraints=extra
        )
        try:
            logger.info(f"[AggregatorAgent] Executing LLM Post-Filtering with SemanticAnchor='{expected_answer_type or 'any'}'...")
            raw_response = await call_llm(
                system="你是一个数据清洗助手，严格输出JSON数组。",
                user=prompt,
                temperature=0.1
            )
            filtered_entities = json.loads(raw_response)
            if isinstance(filtered_entities, list):
                logger.info(f"[AggregatorAgent] Post-Filtering: {len(retained)} -> {len(filtered_entities)} entities.")
                agent_trace("AggregatorAgent", "MERGE",
                    evidence_path_count=len(branches),
                    verified_claim_count=len(filtered_entities),
                    node_count=len(entity_occurrences),
                    edge_count=len(retained),
                    confidence=round(len(filtered_entities) / max(len(retained), 1), 4))
                return sorted(filtered_entities)
            agent_trace("AggregatorAgent", "MERGE",
                evidence_path_count=len(branches),
                verified_claim_count=len(retained),
                node_count=len(entity_occurrences),
                edge_count=len(retained),
                confidence=1.0)
            return sorted(retained)
        except Exception as e:
            logger.error(f"[AggregatorAgent] Post-Filtering failed: {e}")
            agent_trace("AggregatorAgent", "MERGE",
                evidence_path_count=len(branches),
                verified_claim_count=len(retained),
                node_count=len(entity_occurrences),
                edge_count=len(retained),
                confidence=0.0)
            return sorted(retained)

    @staticmethod
    async def generate_response(question: str, results: List[str], paths: List[str],
                                system_prompt: str = "") -> str:
        """Generate a user-friendly natural language response based on verified KG path facts."""
        if not results:
            return "根据图数据库中的知识库，未能在对应实体及路径下查询到匹配的结果。"

        prompt = AGGREGATOR_SYSTEM_PROMPT.format(
            question=question,
            results=str(results[:15]),
            paths=str(paths)
        )

        try:
            logger.info("[AggregatorAgent] Generating natural language answer with LLM.")
            nlg_system = system_prompt or "你是一个专业的电影推荐与问答助手。"
            response = await call_llm(
                system=nlg_system,
                user=prompt,
                temperature=0.7
            )
            return response
        except Exception as e:
            logger.error(f"[AggregatorAgent] NLG response failed: {e}")
            return f"查询到的相关实体有: {', '.join(results[:10])}。"
