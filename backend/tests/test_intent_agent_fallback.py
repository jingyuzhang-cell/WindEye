"""Unit tests for IntentAgent rule-based fallback entity extraction.

Verifies that when the LLM returns non-JSON or empty strings, the fallback
code-path correctly extracts Chinese company names and sets intent_type.
"""

import pytest
from unittest.mock import AsyncMock, patch

from dra_ma.agents.layer1_perception.intent_agent import (
    IntentAgent,
    _COMPANY_PATTERN,
    _RISK_KEYWORDS,
)
from dra_ma.risk_engine.plugins.risk_analyst import _resolve_path_ids


# ── Regex pattern unit tests ──────────────────────────────────────────────

class TestCompanyPattern:
    def test_limited_company(self):
        matches = _COMPANY_PATTERN.findall("鑫达投资管理有限公司")
        assert "鑫达投资管理有限公司" in matches

    def test_share_limited_company(self):
        matches = _COMPANY_PATTERN.findall("华创地产股份有限公司")
        assert "华创地产股份有限公司" in matches

    def test_group_limited_company(self):
        matches = _COMPANY_PATTERN.findall("中投集团有限公司")
        assert "中投集团有限公司" in matches

    def test_simple_company(self):
        matches = _COMPANY_PATTERN.findall("万达公司")
        assert "万达公司" in matches

    def test_limited_liability_company(self):
        matches = _COMPANY_PATTERN.findall("鑫达投资管理有限责任公司")
        assert "鑫达投资管理有限责任公司" in matches

    def test_multiple_companies_in_query(self):
        matches = _COMPANY_PATTERN.findall(
            "鑫达投资管理有限公司 华创地产股份有限公司"
        )
        assert "鑫达投资管理有限公司" in matches
        assert "华创地产股份有限公司" in matches

    def test_no_company_in_query(self):
        matches = _COMPANY_PATTERN.findall("今天天气怎么样")
        assert len(matches) == 0

    def test_deduplication(self):
        matches = _COMPANY_PATTERN.findall("鑫达公司鑫达公司")
        assert len(matches) >= 2  # findall returns all occurrences


class TestRiskKeywords:
    def test_risk_keywords_match(self):
        assert _RISK_KEYWORDS.search("风险传导路径")
        assert _RISK_KEYWORDS.search("异常交易分析")
        assert _RISK_KEYWORDS.search("合规检查")
        assert _RISK_KEYWORDS.search("公司治理报告")
        assert _RISK_KEYWORDS.search("监管处罚")

    def test_non_risk_query(self):
        assert _RISK_KEYWORDS.search("今天天气怎么样") is None


# ── Integration tests: IntentAgent.parse() fallback ───────────────────────


@pytest.mark.anyio
class TestIntentAgentFallback:
    async def test_llm_returns_empty_string_fallback_extracts_company(self):
        """When LLM returns empty string, fallback extracts company entity."""
        with patch(
            "dra_ma.agents.layer1_perception.intent_agent.call_llm",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = ""

            intent = await IntentAgent.parse("鑫达投资管理有限公司的风险传导路径")

            assert "鑫达投资管理有限公司" in intent.Start_Entities
            assert len(intent.Start_Entities) == 1
            assert "鑫达投资管理有限公司" == intent.Start_Entities[0]

    async def test_llm_returns_invalid_json_fallback_extracts_company(self):
        """When LLM returns non-JSON text, fallback extracts company entity."""
        with patch(
            "dra_ma.agents.layer1_perception.intent_agent.call_llm",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = "This is not valid JSON output from the model"

            intent = await IntentAgent.parse("鑫达投资管理有限公司的风险传导路径")

            assert "鑫达投资管理有限公司" in intent.Start_Entities

    async def test_fallback_with_risk_hint_sets_answer_type(self):
        """When intent_hint=risk_analysis, Expected_Answer_Type is risk_evidence."""
        with patch(
            "dra_ma.agents.layer1_perception.intent_agent.call_llm",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = ""

            intent = await IntentAgent.parse(
                "鑫达投资管理有限公司的风险传导路径",
                intent_hint="risk_analysis",
            )

            assert intent.Expected_Answer_Type == "risk_evidence"

    async def test_fallback_with_risk_keywords_sets_answer_type(self):
        """When query contains risk keywords, Expected_Answer_Type is risk_evidence."""
        with patch(
            "dra_ma.agents.layer1_perception.intent_agent.call_llm",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = ""

            intent = await IntentAgent.parse("鑫达公司的合规风险报告")

            assert intent.Expected_Answer_Type == "risk_evidence"
            assert "鑫达公司" in intent.Start_Entities

    async def test_fallback_without_risk_has_empty_answer_type(self):
        """When no risk hint or keywords, Expected_Answer_Type is empty."""
        with patch(
            "dra_ma.agents.layer1_perception.intent_agent.call_llm",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = ""

            intent = await IntentAgent.parse("上海华创机电科技有限公司的注册信息")

            assert intent.Expected_Answer_Type == ""
            assert "上海华创机电科技有限公司" in intent.Start_Entities

    async def test_fallback_bracket_notation_takes_priority(self):
        """Bracket notation [Entity] takes priority over pattern match."""
        with patch(
            "dra_ma.agents.layer1_perception.intent_agent.call_llm",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = ""

            intent = await IntentAgent.parse("[中投集团]的控股关系")

            assert "中投集团" in intent.Start_Entities
            # Bracket entity takes priority; pattern match is not run
            assert len(intent.Start_Entities) == 1

    async def test_fallback_no_entity_in_query(self):
        """When no company name or brackets, entities is empty."""
        with patch(
            "dra_ma.agents.layer1_perception.intent_agent.call_llm",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = ""

            intent = await IntentAgent.parse("今天有什么新闻")

            assert intent.Start_Entities == []

    async def test_fallback_reasoning_field_indicates_rule_based(self):
        """The reasoning field documents that fallback was used."""
        with patch(
            "dra_ma.agents.layer1_perception.intent_agent.call_llm",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = ""

            intent = await IntentAgent.parse("鑫达投资管理有限公司")

            assert "RULE-BASED FALLBACK" in intent.reasoning
            assert "LLM failed" in intent.reasoning

    async def test_fallback_returns_hop_one(self):
        """Fallback always returns Expected_Hop=1."""
        with patch(
            "dra_ma.agents.layer1_perception.intent_agent.call_llm",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = "非JSON响应"

            intent = await IntentAgent.parse("鑫达公司的信息")

            assert intent.Expected_Hop == 1

    async def test_normal_llm_response_not_affected(self):
        """When LLM returns valid JSON, normal path works unchanged."""
        with patch(
            "dra_ma.agents.layer1_perception.intent_agent.call_llm",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = (
                '{"reasoning": "step1=鑫达公司 step2=company step3=1 step4=none",'
                '"Start_Entities": ["鑫达投资管理有限公司"],'
                '"Constraint_Filters": [],'
                '"Expected_Hop": 1,'
                '"Expected_Answer_Type": "organization"}'
            )

            intent = await IntentAgent.parse("鑫达投资管理有限公司的信息")

            assert intent.Start_Entities == ["鑫达投资管理有限公司"]
            assert intent.Expected_Answer_Type == "organization"
            assert "RULE-BASED FALLBACK" not in intent.reasoning


# ── _resolve_path_ids unit tests ─────────────────────────────────────────

class TestResolvePathIds:
    def test_maps_node_names_to_ids(self):
        nodes = [
            {"id": "n1", "name": "鑫达投资管理有限公司", "properties": {"name": "鑫达投资管理有限公司"}},
            {"id": "n2", "name": "华创地产股份有限公司", "properties": {"name": "华创地产股份有限公司"}},
        ]
        edges = [
            {"id": "e1", "source": "n1", "target": "n2", "label": "INVEST"},
        ]
        llm_paths = [{
            "path_id": "p1",
            "nodes": ["鑫达投资管理有限公司", "华创地产股份有限公司"],
            "relations": ["投资"],
            "risk_level": "high",
            "risk_description": "A投资B",
            "confidence": 0.92,
        }]
        resolved = _resolve_path_ids(llm_paths, nodes, edges)
        assert len(resolved) == 1
        assert resolved[0]["path_id"] == "p1"
        assert resolved[0]["node_ids"] == ["n1", "n2"]
        assert resolved[0]["edge_ids"] == ["e1"]
        assert resolved[0]["risk_level"] == "high"
        assert resolved[0]["confidence"] == 0.92
        assert resolved[0]["path_text"] == "A投资B"
        # Backward-compatible fields
        assert resolved[0]["affected_entities"] == ["鑫达投资管理有限公司", "华创地产股份有限公司"]
        assert resolved[0]["path_description"] == "A投资B"

    def test_demo_paths_get_resolved(self):
        """Demo paths with node_ids already set still get edge_ids inferred."""
        nodes = [
            {"id": "n1", "properties": {"name": "鑫达公司"}},
            {"id": "n2", "properties": {"name": "华创公司"}},
        ]
        edges = [
            {"id": "e1", "source": "n1", "target": "n2", "label": "INVEST"},
        ]
        demo_paths = [{
            "path_id": "RP-001",
            "node_ids": ["n1", "n2"],
            "nodes": ["鑫达公司", "华创公司"],
            "risk_level": "high",
            "description": "风险描述",
            "confidence": 0.85,
        }]
        resolved = _resolve_path_ids(demo_paths, nodes, edges)
        assert resolved[0]["node_ids"] == ["n1", "n2"]
        assert resolved[0]["edge_ids"] == ["e1"]
        assert resolved[0]["affected_entities"] == ["鑫达公司", "华创公司"]

    def test_unresolvable_nodes_graceful_degradation(self):
        nodes = [{"id": "n1", "properties": {"name": "公司A"}}]
        edges = []
        paths = [{
            "path_id": "p1",
            "nodes": ["不存在的公司"],
            "risk_level": "low",
            "confidence": 0.5,
        }]
        resolved = _resolve_path_ids(paths, nodes, edges)
        assert resolved[0]["node_ids"] == []
        assert resolved[0]["edge_ids"] == []
        assert resolved[0]["affected_entities"] == []

    def test_empty_paths(self):
        assert _resolve_path_ids([], [], []) == []

    def test_name_resolution_via_multiple_fields(self):
        """Name resolution checks name, label, title, and property fields."""
        nodes = [
            {"id": "n1", "label": "中投集团"},
            {"id": "n2", "properties": {"COMPANY_NM": "万达公司"}},
        ]
        edges = [{"id": "e1", "source": "n1", "target": "n2"}]
        paths = [{
            "path_id": "p1",
            "nodes": ["中投集团", "万达公司"],
            "risk_level": "medium",
            "confidence": 0.7,
        }]
        resolved = _resolve_path_ids(paths, nodes, edges)
        assert resolved[0]["node_ids"] == ["n1", "n2"]
        assert resolved[0]["edge_ids"] == ["e1"]
