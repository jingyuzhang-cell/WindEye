"""Layer 4: VerifierAgent — validates fact consistency and computes GNN alignment scores."""

import json
import logging
from typing import List

from dra_ma.agents.layer1_perception.intent_agent import IntentObject
from dra_ma.agents.layer3_execution.cypher_utils import call_llm
from dra_ma.utils.agent_trace import agent_trace

logger = logging.getLogger(__name__)

VERIFIER_SYSTEM_PROMPT = """
你是一个图谱事实校验智能体（VerifierAgent）。你的任务是验证从图数据库中检索出的结果和执行 Cypher，在事实逻辑上是否与用户提出的推理意图完美吻合，避免产生幻觉。

用户提取意图 (Constraint_Filters): {filters}
期望答案类型 (Semantic Anchor): {expected_answer_type}
期望推理跳数: {hop}
实际生成 Cypher: {cypher}
返回结果样例: {results_sample}

评估规则：
1. Cypher 中使用的关系链条，是否与用户意图约束中的字段表达完全对齐？
2. 如果执行结果为空，说明该事实路径不存在，应为无效。
3. ⚠️ 核心类型约束：返回的实体必须是 "{expected_answer_type}" 类型。如果结果实体的语义类型与期望答案类型不匹配（例如需要"国家"却返回了"机场"），必须降低置信度分数。

请输出如下 JSON 格式：
{{
  "is_valid": true 或 false（完美吻合为 true，否则为 false）,
  "confidence_score": 0.0 到 1.0 之间的置信度分数,
  "reason": "给出打分依据的简短理由"
}}

❌ 绝对禁止输出任何多余的解释字符，仅输出 JSON 本体。
"""


class VerifierAgent:
    """Agent responsible for fact-consistency verification and GNN alignment scoring."""

    @staticmethod
    def _fast_type_check(expected_type: str, results: List[str]) -> bool:
        """Check if result entities' Neo4j labels match the expected semantic type.

        Returns True if the fast check PASSES (skip LLM verification).
        Returns False if inconclusive (fall through to LLM).

        Graceful degradation for MetaQA: all nodes have label 'MetaQA_Node',
        which never matches specific types like 'Actor' — always falls through.
        """
        if not expected_type or not results:
            return False

        from kg_construction.ontology.ontology_registry import OntologyRegistry
        from dra_ma.agents.layer3_execution.cypher_utils import db_client

        prop_key = OntologyRegistry.get_entity_matching_strategy().get("property_key", "name")
        node_label = OntologyRegistry.get_node_label()

        sample_entities = results[:3]
        match_count = 0

        label_str = f":{node_label}" if node_label else ""

        for entity in sample_entities:
            try:
                cypher = (
                    f"MATCH (n{label_str} {{{prop_key}: $entity}}) "
                    f"RETURN labels(n) as labels LIMIT 1"
                )
                label_rows = db_client.execute_read(cypher, parameters={"entity": str(entity)})
                if label_rows:
                    labels = [str(l).lower() for l in label_rows[0].get("labels", [])]
                    expected_lower = expected_type.lower()
                    if any(expected_lower in lbl for lbl in labels):
                        match_count += 1
            except Exception:
                continue

        passes = match_count >= min(2, len(sample_entities))
        if passes:
            logger.info(
                f"[VerifierAgent] Fast type check PASSED: "
                f"{match_count}/{len(sample_entities)} samples match '{expected_type}'"
            )
        return passes

    @staticmethod
    async def verify(intent: IntentObject, cypher: str, results: List[str],
                     system_prompt: str = "") -> float:
        agent_trace("VerifierAgent", "START",
            cypher=str(cypher)[:300],
            result_count=len(results) if results else 0,
            semantic_anchor=intent.Expected_Answer_Type if hasattr(intent, 'Expected_Answer_Type') else "any")

        if not cypher or not results:
            logger.info("[VerifierAgent] Empty Cypher or results. Verification score = 0.0")
            return 0.0

        expected_type = intent.Expected_Answer_Type or "any"

        # Hybrid fast-pass (Opt 3): skip LLM if KG labels already match semantic anchor
        if expected_type and expected_type != "any":
            if VerifierAgent._fast_type_check(expected_type, results):
                logger.info(
                    f"[VerifierAgent] Hybrid fast-pass: skipping LLM verification "
                    f"({len(results)} results, type='{expected_type}')"
                )
                agent_trace("VerifierAgent", "DECISION",
                    is_valid=True,
                    raw_score=0.95,
                    final_score=0.95)
                return 0.95

        sample = results[:5]
        prompt = VERIFIER_SYSTEM_PROMPT.format(
            filters=str(intent.Constraint_Filters),
            expected_answer_type=expected_type,
            hop=intent.Expected_Hop,
            cypher=cypher,
            results_sample=str(sample)
        )

        logger.info(f"[VerifierAgent] Verifying fact consistency (SemanticAnchor='{expected_type}') for Cypher: {cypher}")

        try:
            verifier_system = system_prompt or "你是一个电影知识事实校验智能体。"
            raw_response = await call_llm(
                system=verifier_system,
                user=prompt,
                temperature=0.1,
                response_format={"type": "json_object"}
            )

            data = json.loads(raw_response)
            is_valid = bool(data.get("is_valid", False))
            score = float(data.get("confidence_score", 0.0))

            final_score = score if is_valid else min(score, 0.1)
            agent_trace("VerifierAgent", "DECISION",
                is_valid=is_valid,
                raw_score=score,
                final_score=final_score)
            logger.info(f"[VerifierAgent] Verification: is_valid={is_valid}, score={score} -> final={final_score:.4f}")
            return final_score

        except Exception as e:
            logger.error(f"[VerifierAgent] Verification failed: {e}. Falling back to default score.")
            return 0.8 if results else 0.0

    @staticmethod
    def verify_embeddings(entity_id: str, graph_emb: list, semantic_emb: list) -> float:
        """Calculate GNN alignment projection scores if embeddings are available."""
        try:
            from kg_construction.alignment.projector import get_aligner
            aligner = get_aligner()
            if not aligner.is_available:
                return 1.0
            res = aligner.align(entity_id, graph_emb, semantic_emb)
            score = float(res.get("alignmentScore", 1.0))
            logger.info(f"[VerifierAgent] GNN Alignment Score for '{entity_id}': {score:.4f}")
            return score
        except Exception as e:
            logger.error(f"[VerifierAgent] GNN alignment error: {e}")
            return 1.0
