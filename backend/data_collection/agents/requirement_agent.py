"""Requirement Parsing Agent — NL to structured crawl parameters.

Quick mode: No LLM, just transform dropdown params.
Complex mode: Uses DeepSeek LLM for NL parsing.
"""

from __future__ import annotations

import json
import logging
import os

from api.crawl_schemas import CrawlTaskRequest
from config.settings import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a financial risk data collection requirement parser.
Parse the user's natural language query into structured crawl parameters.
Output ONLY valid JSON with these keys:
- data_type: "risk_event" | "risk_sentiment"
- sources: list of source identifiers (sse, szse, bse for risk_event; stockstar for risk_sentiment)
- date_start: YYYY-MM-DD or null
- date_end: YYYY-MM-DD or null
- keywords: list of strings
- max_pages: integer 1-50
- confidence: float 0.0-1.0 indicating how confident you are in the parse
"""


class RequirementParsingAgent:
    """Parse user requirements into structured crawl parameters."""

    def parse_quick_mode(self, request: CrawlTaskRequest) -> dict:
        """No LLM needed — just transform dropdown params to config dict."""
        return {
            "data_type": request.data_type.value if hasattr(request.data_type, "value") else request.data_type,
            "sources": request.sources,
            "date_start": request.date_start,
            "date_end": request.date_end,
            "keywords": request.keywords,
            "max_pages": request.max_pages,
            "max_files": request.max_files,
        }

    def parse_complex_mode(self, nl_query: str) -> dict:
        """Use LLM to parse natural language into structured params.

        Falls back to keyword-based parsing if LLM is unavailable.
        """
        api_key = os.getenv("LLM_API_KEY", settings.LLM_API_KEY or "")
        if not api_key:
            logger.warning("No LLM API key configured, using keyword fallback for NL parsing")
            return self._keyword_fallback(nl_query)

        try:
            from openai import OpenAI

            client = OpenAI(api_key=api_key, base_url=settings.LLM_BASE_URL)
            response = client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": nl_query},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            parsed = json.loads(response.choices[0].message.content)
            parsed["confidence"] = parsed.get("confidence", 0.5)
            return parsed
        except Exception as e:
            logger.warning(f"LLM parsing failed, using keyword fallback: {e}")
            return self._keyword_fallback(nl_query)

    def _keyword_fallback(self, nl_query: str) -> dict:
        """Rule-based fallback when LLM is not available."""
        q = nl_query.lower()

        data_type = "risk_event"
        if any(kw in q for kw in ["新闻", "舆情", "news", "财经", "市场", "情绪", "sentiment"]):
            data_type = "risk_sentiment"

        sources: list[str] = []
        if data_type == "risk_event":
            if any(kw in q for kw in ["上交所", "上", "sse", "沪"]):
                sources.append("sse")
            if any(kw in q for kw in ["深交所", "深", "szse"]):
                sources.append("szse")
            if any(kw in q for kw in ["北交所", "北", "bse"]):
                sources.append("bse")
            if not sources:
                sources = ["sse", "szse", "bse"]
        elif data_type == "risk_sentiment":
            sources.append("stockstar")

        keywords: list[str] = []
        if "诉讼" in q:
            keywords.append("诉讼")
        if "仲裁" in q:
            keywords.append("仲裁")
        if "造假" in q:
            keywords.append("财务造假")
        if "违规" in q:
            keywords.append("违规")
        if "高管" in q:
            keywords.append("高管")
        if "处罚" in q:
            keywords.append("处罚")
        if "监管" in q:
            keywords.append("监管")

        return {
            "data_type": data_type,
            "sources": sources,
            "date_start": None,
            "date_end": None,
            "keywords": keywords,
            "max_pages": 5,
            "max_files": 0,
            "confidence": 0.3,
        }
