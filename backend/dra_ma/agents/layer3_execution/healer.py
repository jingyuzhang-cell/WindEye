"""Layer 3: SmashAgent — Generalized Self-Healing for Cypher query failures.

Zero-latency hotfix: uses difflib (cutoff=0.8) for simple spelling typos.
Semantic-level rescue: on empty results or deep logic errors, loops back to LLM with
  error logs and real schema for semantic reconstruction (Retry Loop).
Template reflection memory: caches healed Cypher patterns to avoid re-healing identical queries.
"""

import logging
import re
from typing import Dict

from kg_construction.ontology.ontology_registry import OntologyRegistry
from dra_ma.agents.layer3_execution.cypher_utils import (
    call_llm,
    extract_cypher_from_text,
    auto_fix_simple_errors,
    template_cypher,
    detemplate_cypher,
)
from dra_ma.utils.agent_trace import agent_trace

logger = logging.getLogger(__name__)


SMASH_ERROR_PROMPT = """
你是一个图谱查询修复智能体（SmashAgent）。你的任务是修复在 Neo4j 数据库上执行报错的 Cypher 语句。

用户原始问题: {question}
发生错误的Cypher: {cypher}
错误日志: {error_log}

【图谱约束】
{schema_constraint}

【微调指令】
1. 只做局部微调来修复语法或 Schema 错误，绝对禁止改变查询的整体业务逻辑！
2. 如果错误日志提示 High Fan-out Error 或 TimeoutError，请务必在查询末尾加上 LIMIT 50，或在节点处增加类型限制。
3. 请仅输出修复后的 Cypher 语句（用 ```cypher 包裹），不要输出任何解释性文字。
"""

SMASH_RECONSTRUCT_PROMPT = """
你是一个图谱查询语义重建专家（SmashAgent Reconstruct Mode）。当前查询语法正确，但执行后返回了空结果或执行超时。

用户原始问题: {question}
当前推理路径: {current_path}
失败的Cypher: {cypher}
失败类型: {failure_type}
错误详情: {error_log}

【图谱约束】
{schema_constraint}

【重建指令】
1. 这个 Cypher 语法没有错，但图谱中没有符合这个路径模式的数据。
2. 采用以下策略修复：
   - 如果使用了无向匹配 (n)-[:R]-(m)，尝试改为有向匹配 (n)-[:R]->(m)
   - 如果添加了 CONTAINS 类型过滤器导致空结果，去掉类型约束
   - 如果是扇出爆炸超时 (TimeoutError)，添加 LIMIT 50 并使用有向匹配缩小搜索空间
   - 可以尝试关系方向的逆反（如 contains → containedby）
3. 允许改变查询策略，但必须忠于用户问题的**语义意图**。
4. 请仅输出修复后的 Cypher 语句（用 ```cypher 包裹），不要输出任何解释性文字。
"""


class SmashAgent:
    """Agent that performs SMASH query self-healing with tiered failure-type-aware recovery.

    Tier 1 — heal():        Schema/syntax errors — local Cypher corrections.
    Tier 2 — reconstruct(): Empty results or timeouts — semantic query rewriting.
    """

    _cache: Dict[str, str] = {}

    @staticmethod
    async def heal(question: str, cypher: str, error_log: str, entity: str = "") -> str:
        """Tier 1: Repair Cypher schema/syntax errors (unchanged core logic)."""
        if not entity:
            bracket_match = re.search(r"\[(.*?)\]", question)
            if bracket_match:
                entity = bracket_match.group(1)

        failed_template = template_cypher(cypher, entity)

        if failed_template in SmashAgent._cache:
            healed_template = SmashAgent._cache[failed_template]
            healed_cypher = detemplate_cypher(healed_template, entity)
            logger.info(f"[SmashAgent] Cache HIT! Resolved Cypher: '{healed_cypher}'")
            return healed_cypher

        logger.warning(f"[SmashAgent] Cache MISS. Healing requested. Failed Cypher: '{cypher}'. Error: '{error_log}'")

        valid_rels = OntologyRegistry.get_valid_relations()
        schema_info = "合法的关系集为: " + ", ".join(valid_rels) if valid_rels else "使用语义判断合法关系。"

        prompt = SMASH_ERROR_PROMPT.format(
            question=question,
            cypher=cypher,
            error_log=error_log,
            schema_constraint=schema_info
        )

        try:
            raw_response = await call_llm(
                system=f"你是一个严格遵守Schema的修正助手。{schema_info}",
                user=prompt,
                temperature=0.1
            )

            repaired_cypher = extract_cypher_from_text(raw_response)
            repaired_cypher = auto_fix_simple_errors(repaired_cypher)

            repaired_template = template_cypher(repaired_cypher, entity)
            SmashAgent._cache[failed_template] = repaired_template
            logger.info(f"[SmashAgent] Cache SAVE! '{failed_template}' -> '{repaired_template}'")

            agent_trace("SmashAgent", "REPAIR",
                old_cypher=str(cypher)[:300],
                repaired_cypher=str(repaired_cypher)[:500])
            logger.info(f"[SmashAgent] Proposed repaired Cypher: '{repaired_cypher}'")
            return repaired_cypher
        except Exception as e:
            logger.error(f"[SmashAgent] Healing call failed: {e}")
            return cypher

    @staticmethod
    async def reconstruct(question: str, current_path: str, cypher: str, failure_type: str, error_log: str, entity: str = "") -> str:
        """Tier 2: Semantic reconstruction for empty results or timeouts.

        Unlike heal() which preserves the original query logic, reconstruct() allows
        rewriting the query strategy — e.g. switching from undirected to directed
        matching, removing type filters, or inverting relation direction.
        """
        agent_trace("SmashAgent", "START",
            failed_cypher=str(cypher)[:300],
            error_log=str(error_log)[:200])

        if not entity:
            bracket_match = re.search(r"\[(.*?)\]", question)
            if bracket_match:
                entity = bracket_match.group(1)

        logger.info(f"[SmashAgent:Reconstruct] Attempting semantic reconstruction for '{current_path}' ({failure_type})")

        valid_rels = OntologyRegistry.get_valid_relations()
        schema_info = "合法的关系集为: " + ", ".join(valid_rels) if valid_rels else "使用语义判断合法关系。"

        prompt = SMASH_RECONSTRUCT_PROMPT.format(
            question=question,
            current_path=current_path,
            cypher=cypher,
            failure_type=failure_type,
            error_log=error_log,
            schema_constraint=schema_info
        )

        try:
            raw_response = await call_llm(
                system=f"你是一个图谱语义推理专家。{schema_info}",
                user=prompt,
                temperature=0.2
            )

            reconstructed = extract_cypher_from_text(raw_response)
            reconstructed = auto_fix_simple_errors(reconstructed)
            agent_trace("SmashAgent", "REPAIR",
                old_cypher=str(cypher)[:300],
                repaired_cypher=str(reconstructed)[:500])
            logger.info(f"[SmashAgent:Reconstruct] Reconstructed Cypher: '{reconstructed}'")
            return reconstructed
        except Exception as e:
            logger.error(f"[SmashAgent:Reconstruct] Failed: {e}")
            return cypher
