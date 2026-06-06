"""Layer 1: IntentAgent — extracts start entities, expected hop, and expected answer type from NL queries."""

import json
import logging
import re
from typing import List
from pydantic import BaseModel, Field

from dra_ma.agents.layer3_execution.cypher_utils import call_llm
from dra_ma.utils.agent_trace import agent_trace
from kg_construction.ontology.ontology_registry import OntologyRegistry

logger = logging.getLogger(__name__)

# ── Rule-based fallback patterns ─────────────────────────────────────────
# Chinese company name suffix patterns — ordered longest-first for greedy matching
_COMPANY_SUFFIXES = (
    "股份有限公司", "集团有限公司", "有限责任公司",
    "股份公司", "集团公司", "有限公司", "集团", "公司",
)
_COMPANY_SUFFIX_RE = "|".join(_COMPANY_SUFFIXES)
_COMPANY_PATTERN = re.compile(
    rf"([一-鿿\w]{{2,30}}?(?:{_COMPANY_SUFFIX_RE}))"
)

# Risk-related keywords that imply intent_type=risk_analysis
_RISK_KEYWORDS = re.compile(
    r"风险|传导|异常|合规|治理|报告|违规|处罚|监管|担保|关联交易|资金占用|内幕|操纵|洗钱|欺诈|违约|评级|预警"
)


class IntentObject(BaseModel):
    Start_Entities: List[str] = Field(default_factory=list, description="List of starting entities extracted from query")
    Constraint_Filters: List[str] = Field(default_factory=list, description="List of relation type constraints")
    Expected_Hop: int = Field(default=1, description="Expected multi-hop reasoning distance (1, 2, or 3)")
    Expected_Answer_Type: str = Field(default="", description="The semantic target type expected (location.country, person, etc.)")
    reasoning: str = Field(default="", description="LLM chain-of-thought reasoning for debugging")


INTENT_TEMPLATE = """
你是一个通用知识图谱意图解析专家（Intent Agent）。你的任务是从用户查询中提取结构化的硬性推理约束。

请先仔细分析问题，再输出最终 JSON。分析过程写在 reasoning 字段中。

【图谱环境】
- 数据集: {dataset_name}
- 节点标签: {node_label_constraint}
- 路径方向: {directed_rules}
- 关系命名风格: {relation_style}
{allowed_relations_section}

【常见答案类型参考】
- country (location.country) — 国家，如 China, France, Russia
- location (location.location) — 城市/地区，如 Paris, California
- person (people.person) — 人物，如 演员、导演、作家、政治家、歌手
- film (film.film) — 电影
- actor (film.actor) — 演员
- director (film.director) — 导演
- language (language.human_language) — 语言，如 French, German, Spanish
- currency (finance.currency) — 货币，如 Dollar, Euro, Yen
- government_type (government.government_type) — 政体类型，如 民主制、君主立宪制
- organization (organization.organization) — 组织机构，如 公司、学校、政府机构
- datetime — 日期/时间
- educational_institution (education.educational_institution) — 学校/大学
- profession (people.profession) — 职业
- religion — 宗教

【分析步骤】
1. 起点实体: 方括号 [...] 中的实体名是什么？如果问题没有方括号，问题的主语/主题实体是什么？
2. 答案类型: 问题问的是什么类型的事物？从上述类型参考中选择最匹配的。输出简短关键词形式（如 `country`, `language`, `person`, `film`, `director`），不要编造不存在的 Freebase 长路径。
3. 推理跳数:
   - 1-hop: 直接查询实体的一个属性或关系（如 "X 的首都是什么"、"X 的语言是什么"、"X 是什么类型"）
   - 2-hop: 需要经过一个中间实体（如 "X 的演员演过哪些电影" = X→演员→电影，需要 2 跳）
   - 3-hop+: 多层嵌套（如 "X 的演员演过的电影的导演是谁" = X→演员→电影→导演，需要 3 跳）
   ⚠️ 判断标准：数一下从起点实体到答案需要经过几个"关系箭头"。大多数简单问答是 1-hop！
4. 语义约束: 问题中有没有特殊限定词？如 "official"（官方）、"largest"（最大）、"first"（第一个）等。

【输出格式】
{{
  "reasoning": "步骤1: 起点实体=...  步骤2: 答案类型=... 因为问题问的是...  步骤3: 跳数=... 因为从起点到答案需要经过...  步骤4: 约束=...",
  "Start_Entities": ["实体名"],
  "Constraint_Filters": ["语义约束关键词"],
  "Expected_Hop": 1,
  "Expected_Answer_Type": "简短类型关键词"
}}

⚠️ 重要约束：
- reasoning 字段必须包含完整的四步分析过程。
- Expected_Answer_Type 必须是简短的类型关键词（如 `country`, `language`, `person`, `film`），不要输出完整 Freebase 路径。
- Constraint_Filters 填写语义约束关键词（如 "official", "largest"），不要瞎编关系名！关系名的选择由后续的探针+规划器负责。
- Expected_Hop 必须合理：数一下从起点实体到答案需要几个关系步骤。大多数问题是 1-hop！

❌ 绝对禁止输出任何多余的解释文字（reasoning 字段除外），最终必须是合法的 JSON 字符串。
"""


def generate_prompt(template_str: str, adjacent_relations: List[str] = None, hop_constraint: str = "") -> str:
    dataset_name = OntologyRegistry.get_config().get("dataset_name", "Unknown")

    node_label = OntologyRegistry.get_node_label()
    node_label_constraint = node_label if node_label else "任意标签通配符 ()"

    directed = OntologyRegistry.is_directed()
    directed_rules = "保留关系方向 ()-[]->()" if directed else "忽略关系方向，严格使用无向匹配 ()-[]-()"

    return_types = ", ".join(OntologyRegistry.get_return_target_types())

    valid_relations = OntologyRegistry.get_valid_relations()
    if len(valid_relations) == 0:
        allowed_relations_section = f"- 合法关系: {dataset_name} 包含数千种 Freebase 风格关系，无法全部列举。请根据问题语义推断，不要自行编造具体关系名。关系选择由探针+规划器负责。"
        relation_style = "Freebase 风格 (如 film.film.starring, people.person.profession, location.country.capital, government.government_type)"
    elif len(valid_relations) < 50:
        allowed_relations_section = f"- 合法关系 (全部): {', '.join(valid_relations)}"
        relation_style = f"{dataset_name} 预定义关系"
    else:
        relation_style = f"{dataset_name} 预定义关系"
        if adjacent_relations:
            allowed_relations_section = f"- 合法关系 (局部候选): {', '.join(adjacent_relations)}"
        else:
            allowed_relations_section = "- 合法关系: 图谱规模庞大，请根据语义推断关系"

    format_kwargs = {
        "dataset_name": dataset_name,
        "node_label_constraint": node_label_constraint,
        "allowed_relations_section": allowed_relations_section,
        "relation_style": relation_style,
        "directed_rules": directed_rules,
        "return_target_types": return_types
    }
    if "{hop_constraint}" in template_str:
        format_kwargs["hop_constraint"] = hop_constraint
    if "{adjacent_relations}" in template_str:
        format_kwargs["adjacent_relations"] = str(adjacent_relations) if adjacent_relations else "任何候选关系"

    return template_str.format(**format_kwargs)


class IntentAgent:
    """Agent responsible for parsing natural language queries into logical IntentObjects."""

    @staticmethod
    async def parse(query: str, intent_hint: str | None = None) -> IntentObject:
        logger.info(f"[IntentAgent] Parsing query: '{query}'")
        agent_trace("IntentAgent", "START", query=query[:200])

        try:
            system_prompt = generate_prompt(INTENT_TEMPLATE)
            raw_response = await call_llm(
                system=system_prompt,
                user=f"用户查询: {query}",
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            data = json.loads(raw_response)

            # Extract and log CoT reasoning for debugging
            reasoning = data.get("reasoning", "")
            if reasoning:
                logger.info(f"[IntentAgent] Reasoning: {reasoning[:300]}")

            entities = data.get("Start_Entities", [])
            if not entities:
                bracket_match = re.search(r"\[(.*?)\]", query)
                if bracket_match:
                    entities = [bracket_match.group(1)]

            # Normalize Expected_Answer_Type: extract last segment if LLM outputs
            # a full Freebase path (e.g. "people.person.profession" → "profession",
            # "location.country" → "country")
            raw_type = data.get("Expected_Answer_Type", "")
            if raw_type and "." in raw_type:
                parts = raw_type.split(".")
                # Use last segment unless it's a generic prefix like "location" or "people"
                short = parts[-1]
                logger.info(f"[IntentAgent] Type normalization: '{raw_type}' → '{short}'")
                raw_type = short

            raw_filters = data.get("Constraint_Filters", [])
            cleaned_filters = []
            for f in raw_filters:
                f_str = str(f)
                # Detect relation-name-like strings (contain dots) and warn
                if "." in f_str:
                    logger.warning(f"[IntentAgent] Constraint_Filter looks like a relation name, not a semantic constraint: '{f_str}'")
                cleaned_filters.append(f_str)

            intent = IntentObject(
                Start_Entities=entities,
                Constraint_Filters=cleaned_filters,
                Expected_Hop=int(data.get("Expected_Hop", 1)),
                Expected_Answer_Type=raw_type,
                reasoning=reasoning
            )
            logger.info(f"[IntentAgent] Parsed: Entities={intent.Start_Entities}, Filters={intent.Constraint_Filters}, Hop={intent.Expected_Hop}, Type={intent.Expected_Answer_Type}")
            agent_trace("IntentAgent", "DECISION",
                        entities=intent.Start_Entities,
                        filters=intent.Constraint_Filters,
                        hop=intent.Expected_Hop,
                        answer_type=intent.Expected_Answer_Type,
                        reasoning=intent.reasoning[:300] if intent.reasoning else "")
            return intent

        except Exception as e:
            logger.warning(f"[IntentAgent] LLM extraction failed: {e}. Falling back to rule-based extraction.")

            # ── Rule-based fallback entity extraction ────────────────
            entities: list[str] = []

            # Step 1: Bracket notation [EntityName]
            bracket_match = re.search(r"\[(.*?)\]", query)
            if bracket_match:
                entities = [bracket_match.group(1)]
                logger.info(f"[IntentAgent][FALLBACK] Extracted entity from brackets: {entities}")

            # Step 2: Chinese company name patterns
            if not entities:
                company_matches = _COMPANY_PATTERN.findall(query)
                if company_matches:
                    # Deduplicate while preserving order
                    seen: set[str] = set()
                    for m in company_matches:
                        if m not in seen:
                            seen.add(m)
                            entities.append(m)
                    logger.info(f"[IntentAgent][FALLBACK] Extracted company entities by pattern: {entities}")

            # ── Determine answer type ───────────────────────────────
            if intent_hint == "risk_analysis":
                answer_type = "risk_evidence"
            elif _RISK_KEYWORDS.search(query):
                answer_type = "risk_evidence"
            else:
                answer_type = ""

            logger.warning(
                "[IntentAgent][FALLBACK] entities=%s intent_type=%s answer_type=%s query=%.100s",
                entities,
                intent_hint or ("risk_analysis" if answer_type == "risk_evidence" else "graph_qa"),
                answer_type,
                query,
            )

            return IntentObject(
                Start_Entities=entities,
                Constraint_Filters=[],
                Expected_Hop=1,
                Expected_Answer_Type=answer_type,
                reasoning=f"[RULE-BASED FALLBACK] LLM failed: {str(e)[:200]}",
            )
