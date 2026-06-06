"""Layer 2: Dynamic Graph-Constrained Beam Search — planning and pruning agents.

IntentPlannerAgent: receives relation "menus" from the probe, scores candidates with confidence,
  enforces Top-K pruning, and supports <END_OF_SEARCH> adaptive early stopping.

PlannerAgent: generates diverse candidate meta-paths using temperature-controlled LLM calls.
  Multiple instances run in parallel for ensemble diversity.
"""

import json
import logging
from typing import List, Dict, Any

from dra_ma.agents.layer1_perception.intent_agent import IntentObject
from dra_ma.agents.layer3_execution.cypher_utils import call_llm
from dra_ma.agents.layer4_consensus.reward import calculate_jaccard_similarity
from dra_ma.utils.agent_trace import agent_trace

logger = logging.getLogger(__name__)


DYNAMIC_PLANNER_TEMPLATE = """
你是一个通用图谱知识推理探索专家（DynamicPlannerAgent）。
目前的探索任务是回答用户问题："{query}"

【当前状态】
你正在顺着推理路径进行探索。当前已走过的路径前缀为:
{current_path_prefix}

【下一步候选图谱关系 (Schema) 与实体采样】
通过对图谱底层探测，当前节点向外发散的合法真实关系集合如下。
⚠️ 重要：括号内是该关系指向的"尾节点实体名称采样 (Samples)"，这能极大帮助你判断该关系是否通向你想要的答案。
{candidate_relations}

【任务要求】
1. 分析候选关系及其尾部实体样本，结合常识和问题意图，判断哪个关系最有可能通向最终答案。
   - 如果尾节点样本已经是问题要的答案类型 → 高分 (≥0.85) 并考虑 END_OF_SEARCH。
   - 如果尾节点样本与问题答案类型不匹配 → 低分 (≤0.3) 或直接排除。
   - 例如：问题问"国家"，样本是 "Adelaide Airport" → 排除。问题问"语言"，样本是 "French, German" → 高分。

2. 🔴 关键：优先选择能直接通向目标答案类型的简单关系（1-hop）。大部分 WebQSP 问题是简单 1-hop 查询！
   大多数情况下，候选列表中已经存在直接给出答案的 1-hop 关系。多跳路径反而会引入噪音。
   ⚠️ 特别提醒：如果某 1-hop 关系的样本已经是答案（如 cause_of_death 的样本是 "Lung cancer"），直接选该 1-hop 并 END_OF_SEARCH。不要画蛇添足选 2-hop 去细化（如 cause_of_death→includes_diseases），那样会偏离原问题。
   ⚠️ 例外：如果 1-hop 关系的尾节点样本数量非常少（≤ 2 个样本），说明该关系可能无法覆盖全部答案。此时应考虑 2-hop 路径来获取更完整的答案集合（如 profession→specializations 可能比单层 profession 返回更多职业）。

3. 🔴 避免以下"元数据/噪音"关系类型（除非是唯一选项）：
   - `common.topic.*`（如 notable_types, article, image, webpage）— 这些是 Freebase 元数据，极少是正确答案
   - `freebase.valuenotation.*`（如 has_no_value, is_reviewed）— 数据库管理字段
   - `base.*`（如 base.schemastaging, base.ontologies, base.biblioness）— 系统内部/导入时的辅助数据
   - `type.type.*` — Schema 定义数据
   优先选择语义明确、内容丰富的关系（如 location.*, people.*, government.*, film.*, sports.*）。

4. 如果当前路径前缀已有至少一个有效的关系步骤，且尾节点样本已经像是问题要的答案，选择 "<END_OF_SEARCH>" 得分 1.0 并停止探索。
   ⚠️ 但是：如果当前路径前缀仅包含起点实体（还没有选择任何关系），绝对禁止输出 <END_OF_SEARCH>！你必须至少选择一个有效的关系。

5. 绝对禁止瞎编关系名！你的 "relation" 必须【严格等于】候选列表中的关系名称（必须去除 `(Samples: ...)` 部分！）。如果候选里有 `..` 折叠边，请原封不动带 `..` 输出。

6. 禁止选择会使路径形成循环的关系。例如：如果已走过 jurisdiction→position，不要再选 position→jurisdiction；如果已走过 person→profession，不要再选 profession→person。优先选择通向全新实体类型的关系，避免原地打转。

请以如下 JSON 格式响应（必须包含 selected_relations 数组）：
{{
  "selected_relations": [
    {{"relation": "location.location.contains", "score": 0.9, "reason": "1-hop直达，样本是明确的国家/地区，符合问题预期。"}},
    {{"relation": "location.location.containedby", "score": 0.4, "reason": "虽然是位置关系，但样本通常是更宏观的实体，方向可能相反。"}},
    {{"relation": "<END_OF_SEARCH>", "score": 0.1, "reason": "如果认为已经找到答案或无路可走"}}
  ]
}}

❌ 绝对禁止输出任何多余的解释文字，只输出符合格式的 JSON 字符串。
"""

PLANNER_SYSTEM_PROMPT = """
你是一个图谱路径规划智能体（PlannerAgent-{agent_id}）。你的任务是根据用户的推理意图，在知识图谱上生成多个候选的元推理路径。

起点实体: {entities}
预期跳数: {hop}
约束过滤条件: {filters}
允许使用的关系集: [directed_by, starred_actors, written_by, release_year, has_genre]

输出规范：
1. 路径格式必须为: "起点实体 - 关系1 - 实体A - 关系2 - 实体B - 关系3 - Target"
2. 每个步骤的关系必须属于候选关系集。
3. 请尽可能根据分配给你的发散程度进行合理的逻辑扩展。

请输出如下 JSON 格式：
{{
  "paths": [
    "起点实体 - 关系1 - 中间实体 - 关系2 - Target"
  ]
}}

❌ 绝对禁止输出任何解释文字，仅输出 JSON 本体。
"""


RE_PLAN_TEMPLATE = """
你是一个通用图谱知识推理探索专家（DynamicPlannerAgent — Re-Plan Mode）。
目前的探索任务是回答用户问题："{query}"

【当前状态】
你正在从一次**失败的探索**中恢复。当前已回溯到的路径前缀为:
{current_path_prefix}

【失败上下文】
{failure_context}
⚠️ 请避免选择导致上述失败的关系。

【下一步候选图谱关系 (Schema) 与实体采样】
通过对图谱底层探测，当前节点向外发散的合法真实关系集合如下：
{candidate_relations}

【任务要求】
1. 分析候选关系及其尾部实体样本，优先选择与之前失败关系**不同的**路线。
2. 为每一个有潜力的候选关系进行打分（0.0 ~ 1.0）。
3. 如果你认为所有候选关系都无法通向答案，请输出 "<END_OF_SEARCH>"。
4. 绝对禁止瞎编关系名！

请以如下 JSON 格式响应：
{{
  "selected_relations": [
    {{"relation": "备选关系名", "score": 0.8, "reason": "选择理由"}},
    {{"relation": "<END_OF_SEARCH>", "score": 0.1, "reason": "无路可走"}}
  ]
}}
"""


class IntentPlannerAgent:
    """Agent responsible for dynamic step-by-step scoring with confidence and early stopping."""

    @staticmethod
    async def dynamic_step_plan(query: str, current_path_prefix: str, candidate_relations: List[str], temperature: float = 0.3) -> List[Dict[str, Any]]:
        logger.info(f"[IntentPlannerAgent] Dynamic scoring for path: '{current_path_prefix}' (temp={temperature})")

        if not candidate_relations:
            return [{"relation": "<END_OF_SEARCH>", "score": 1.0, "reason": "No candidates available"}]

        system_prompt = DYNAMIC_PLANNER_TEMPLATE.format(
            query=query,
            current_path_prefix=current_path_prefix,
            candidate_relations=str(candidate_relations)
        )

        try:
            raw_response = await call_llm(
                system=system_prompt,
                user="请进行下一步关系挑选并打分。",
                temperature=temperature,
                response_format={"type": "json_object"}
            )
            data = json.loads(raw_response)
            selected = data.get("selected_relations", [])

            # GCR-Guard: hard-constraint validation against actual KG candidates
            valid_relations = set()
            for c in candidate_relations:
                clean = c.split(" (Samples:")[0].strip()
                valid_relations.add(clean)
            for decision in selected:
                rel = decision.get("relation", "")
                if rel in ("<END_OF_SEARCH>", "<BACKTRACK>"):
                    continue
                if rel not in valid_relations:
                    logger.warning(f"[GCR-Guard] Rejected hallucinated relation: '{rel}' (not in KG candidates)")
                    decision["score"] = 0.0

            selected = sorted(selected, key=lambda x: x.get("score", 0.0), reverse=True)

            top_candidates = selected[:5]
            agent_trace("PlannerAgent", "CANDIDATES", top_candidates=top_candidates)

            if selected:
                top = selected[0]
                agent_trace("PlannerAgent", "SELECTED",
                    selected_relation=top.get("relation", ""),
                    score=top.get("score", 0.0),
                    reason=str(top.get("reason", ""))[:200])

            return selected

        except Exception as e:
            logger.error(f"[IntentPlannerAgent] Dynamic call failed: {e}")
            return [{"relation": "<END_OF_SEARCH>", "score": 1.0, "reason": "Fallback due to error"}]

    @staticmethod
    def aggregate_ensemble_decisions(
        all_planner_decisions: List[List[Dict[str, Any]]],
        min_consensus_planners: int = 2
    ) -> List[Dict[str, Any]]:
        """Merge decisions from multiple planners into a consensus-ranked list.

        Weighted averaging across planners, then re-rank. Relations appearing
        in fewer than min_consensus_planners are penalized (score * 0.3).

        Args:
            all_planner_decisions: List of decision-lists, one per planner.
            min_consensus_planners: Minimum planners that must agree.

        Returns:
            Merged and re-ranked decision list.
        """
        rel_scores: Dict[str, List[float]] = {}
        rel_reasons: Dict[str, str] = {}
        for decisions in all_planner_decisions:
            for d in decisions:
                rel = d.get("relation", "")
                score = d.get("score", 0.0)
                if rel not in rel_scores:
                    rel_scores[rel] = []
                    rel_reasons[rel] = d.get("reason", "")
                rel_scores[rel].append(score)

        merged = []
        for rel, scores in rel_scores.items():
            avg_score = sum(scores) / len(scores)
            if len(scores) < min_consensus_planners:
                avg_score *= 0.3
            merged.append({
                "relation": rel,
                "score": round(avg_score, 4),
                "reason": rel_reasons.get(rel, ""),
                "planner_count": len(scores)
            })

        merged.sort(key=lambda x: x["score"], reverse=True)
        logger.info(
            f"[Ensemble] Merged {len(merged)} relations from "
            f"{len(all_planner_decisions)} planners"
        )
        return merged

    @staticmethod
    async def re_plan(
        query: str,
        current_path: str,
        candidate_relations: List[str],
        failure_type: str = "",
        failed_relation: str = "",
        error_log: str = "",
    ) -> List[Dict[str, Any]]:
        """Tier 3 replanning: re-scores candidate relations with failure context injected.

        Called after Tier 1 (heal) and Tier 2 (reconstruct) both failed. The LLM receives
        explicit failure context to avoid repeating the same dead-end relation.
        """
        logger.info(f"[IntentPlannerAgent:RePlan] Re-planning from '{current_path}' after {failure_type}")

        if not candidate_relations:
            return [{"relation": "<END_OF_SEARCH>", "score": 1.0, "reason": "No candidates after backtrack"}]

        # Build structured failure context for the LLM
        failure_context = f"上一轮尝试的关系 '{failed_relation}' 导致了以下失败: [{failure_type}] {error_log}" if failed_relation else f"上一轮探索失败: [{failure_type}] {error_log}"

        system_prompt = RE_PLAN_TEMPLATE.format(
            query=query,
            current_path_prefix=current_path,
            failure_context=failure_context,
            candidate_relations=str(candidate_relations)
        )

        try:
            raw_response = await call_llm(
                system=system_prompt,
                user="上一次选择了错误的关系导致失败，请重新评估候选关系。",
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            data = json.loads(raw_response)
            selected = data.get("selected_relations", [])

            # GCR-Guard: hard-constraint validation
            valid_relations = set()
            for c in candidate_relations:
                clean = c.split(" (Samples:")[0].strip()
                valid_relations.add(clean)
            for decision in selected:
                rel = decision.get("relation", "")
                if rel in ("<END_OF_SEARCH>", "<BACKTRACK>"):
                    continue
                if rel not in valid_relations:
                    logger.warning(f"[GCR-Guard:RePlan] Rejected hallucinated relation: '{rel}'")
                    decision["score"] = 0.0

            selected = sorted(selected, key=lambda x: x.get("score", 0.0), reverse=True)
            logger.info(f"[IntentPlannerAgent:RePlan] Top choice: '{selected[0].get('relation', '?')}' (score={selected[0].get('score', 0):.3f})")
            return selected

        except Exception as e:
            logger.error(f"[IntentPlannerAgent:RePlan] Failed: {e}")
            return [{"relation": "<END_OF_SEARCH>", "score": 1.0, "reason": "Re-plan fallback due to error"}]


class PlannerAgent:
    """Agent responsible for proposing high-level graph reasoning paths using temperature diversity.

    Multiple instances run with different temperatures for ensemble diversity (Horizontal
    Collaboration dimension). Each instance also provides a convenience scorer that delegates
    to IntentPlannerAgent with the instance's configured temperature.
    """

    def __init__(self, agent_id: int):
        self.agent_id = agent_id
        # Temperature diversity for ensemble: spread across [0.20, 0.50]
        self.temperatures = [0.20, 0.35, 0.50]
        self.temperature = self.temperatures[agent_id % len(self.temperatures)]

    async def score_relations(self, query: str, current_path_prefix: str, candidate_relations: List[str]) -> List[Dict[str, Any]]:
        """Score candidate relations using this agent's temperature for ensemble diversity.

        Delegates to IntentPlannerAgent.dynamic_step_plan with the instance's temperature,
        producing different exploration biases across the ensemble.
        """
        return await IntentPlannerAgent.dynamic_step_plan(
            query, current_path_prefix, candidate_relations, temperature=self.temperature
        )

    @staticmethod
    def deduplicate_paths(paths: List[str], threshold: float = 0.7) -> List[str]:
        """Filter out paths that are too similar to each other (Jaccard on relations).

        Keeps the first occurrence and removes later paths whose relation-set overlap
        with any already-kept path exceeds the threshold.
        """
        if not paths:
            return []
        kept = [paths[0]]
        for p in paths[1:]:
            if all(calculate_jaccard_similarity(p, k) < threshold for k in kept):
                kept.append(p)
        removed = len(paths) - len(kept)
        if removed:
            logger.info(f"[PlannerAgent] Jaccard dedup: {len(paths)} → {len(kept)} paths (threshold={threshold}, removed {removed})")
        return kept

    async def plan(self, intent: IntentObject, temperature: float, existing_paths: List[str] = None) -> List[str]:
        """Propose relation paths with a specified temperature to generate variations."""
        if not intent.Start_Entities:
            logger.warning(f"[PlannerAgent-{self.agent_id}] No start entity provided. Cannot plan paths.")
            return []

        start_entity = intent.Start_Entities[0]
        logger.info(f"[PlannerAgent-{self.agent_id}] Planning paths for entity '{start_entity}' with temperature={temperature}")

        system_prompt = PLANNER_SYSTEM_PROMPT.format(
            agent_id=self.agent_id,
            entities=str(intent.Start_Entities),
            hop=intent.Expected_Hop,
            filters=str(intent.Constraint_Filters)
        )

        try:
            raw_response = await call_llm(
                system=system_prompt,
                user=f"请生成 {intent.Expected_Hop}-跳 元推理路径。",
                temperature=temperature,
                response_format={"type": "json_object"}
            )

            data = json.loads(raw_response)
            proposed_paths = data.get("paths", [])

            cleaned_paths = []
            for path in proposed_paths:
                parts = path.split(" - ")
                if parts:
                    parts[0] = start_entity
                    cleaned_path = " - ".join(parts)
                    cleaned_paths.append(cleaned_path)

            logger.info(f"[PlannerAgent-{self.agent_id}] Proposed paths: {cleaned_paths}")
            return cleaned_paths

        except Exception as e:
            logger.error(f"[PlannerAgent-{self.agent_id}] Planning failed: {e}")
            return []
