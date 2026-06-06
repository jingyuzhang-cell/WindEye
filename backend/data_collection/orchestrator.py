"""Collaborative Crawling Orchestrator.

Integrates 4 specialized modules for intelligent web crawling.
Yields SSE events for real-time progress streaming.
Supports 3 modes: QUICK (no LLM), COMPLEX (LLM parsing), TEMPLATE (predefined).
Supports DEMO_MODE for testing without Selenium WebDrivers.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

from api.crawl_schemas import CrawlTaskRequest, DataType
from data_collection.agents.exception_agent import RetryHandler
from data_collection.agents.quality_agent import QualityAssessor
from data_collection.agents.requirement_agent import RequirementParser
from data_collection.agents.source_matching_agent import SourceMatcher
from data_collection.scrapers import DEMO_SCRAPER_REGISTRY, SCRAPER_REGISTRY

logger = logging.getLogger(__name__)

CRAWL_TEMPLATES = {
    "litigation_events": {
        "id": "litigation_events",
        "label": "诉讼仲裁事件",
        "mode": "quick",
        "data_type": "risk_event",
        "sources": ["sse", "szse", "bse"],
        "keywords": ["诉讼", "仲裁", "纠纷"],
        "max_pages": 3,
    },
    "regulatory_violations": {
        "id": "regulatory_violations",
        "label": "违规处罚事件",
        "mode": "quick",
        "data_type": "risk_event",
        "sources": ["sse", "szse", "bse"],
        "keywords": ["违规", "处罚", "监管函", "警示函"],
        "max_pages": 5,
    },
    "financial_fraud": {
        "id": "financial_fraud",
        "label": "财务造假事件",
        "mode": "quick",
        "data_type": "risk_event",
        "sources": ["sse", "szse", "bse"],
        "keywords": ["财务造假", "信息披露违规", "虚增收入", "利润造假"],
        "max_pages": 5,
    },
    "executive_violations": {
        "id": "executive_violations",
        "label": "高管违规事件",
        "mode": "quick",
        "data_type": "risk_event",
        "sources": ["sse", "szse", "bse"],
        "keywords": ["高管", "违规", "减持", "内幕交易"],
        "max_pages": 5,
    },
    "financial_sentiment": {
        "id": "financial_sentiment",
        "label": "财经舆情",
        "mode": "quick",
        "data_type": "risk_sentiment",
        "sources": ["stockstar"],
        "max_pages": 10,
    },
}


class CrawlOrchestrator:
    """Orchestration for intelligent web crawling with SSE streaming."""

    def __init__(self, demo_mode: bool | None = None):
        if demo_mode is None:
            demo_mode = os.getenv("CRAWL_DEMO_MODE", "true").lower() == "true"
        self.demo_mode = demo_mode
        self.req_parser = RequirementParser()
        self.source_matcher = SourceMatcher()
        self.quality_assessor = QualityAssessor()
        self.retry_handler = RetryHandler()
        mode_label = "DEMO (mock data, no WebDriver)" if self.demo_mode else "REAL (Chrome/Edge WebDriver)"
        logger.info("CrawlOrchestrator initialized in %s mode", mode_label)

    @staticmethod
    def get_templates() -> list[dict]:
        return [{"id": t["id"], "label": t["label"], "data_type": t.get("data_type")} for t in CRAWL_TEMPLATES.values()]

    async def execute(self, req: CrawlTaskRequest) -> AsyncGenerator[dict, None]:
        """Execute crawl pipeline, yielding SSE events."""
        task_id = f"crawl_{uuid.uuid4().hex[:12]}"
        started_at = datetime.now(timezone.utc).isoformat()
        registry = DEMO_SCRAPER_REGISTRY if self.demo_mode else SCRAPER_REGISTRY

        yield {"event": "start", "data": {"task_id": task_id, "mode": req.mode.value, "started_at": started_at, "demo_mode": self.demo_mode}}

        # Stage 1: Requirement Parsing
        await asyncio.sleep(0.3)
        yield {"event": "stage", "data": {"stage": "parsing", "progress": 5, "message": "需求解析中..."}}

        if req.mode.value == "quick":
            parsed = self.req_parser.parse_quick_mode(req)
            await asyncio.sleep(0.2)
        elif req.mode.value == "template":
            template = CRAWL_TEMPLATES.get(req.template_id, {})
            if not template:
                yield {"event": "error", "data": {"message": f"Unknown template: {req.template_id}"}}
                return
            template_req = CrawlTaskRequest(
                mode="quick",
                data_type=DataType(template.get("data_type", "risk_event")),
                sources=template.get("sources", []),
                keywords=template.get("keywords", []),
                date_start=template.get("date_start"),
                date_end=template.get("date_end"),
                max_pages=template.get("max_pages", 5),
                max_files=req.max_files if hasattr(req, 'max_files') else 0,
            )
            parsed = self.req_parser.parse_quick_mode(template_req)
            await asyncio.sleep(0.2)
        else:
            yield {"event": "stage", "data": {"stage": "parsing", "progress": 10, "message": "LLM解析自然语言需求..."}}
            try:
                parsed = await asyncio.to_thread(self.req_parser.parse_complex_mode, req.natural_language_query or "")
                parsed["mode"] = "complex"
                await asyncio.sleep(0.3)
            except Exception as e:
                yield {"event": "error", "data": {"message": f"NL parsing failed: {e}"}}
                return

        yield {"event": "stage", "data": {"stage": "parsing", "progress": 20, "message": f"解析完成: {json.dumps(parsed, ensure_ascii=False)}"}}

        # Stage 2: Data Source Matching
        await asyncio.sleep(0.3)
        yield {"event": "stage", "data": {"stage": "matching", "progress": 25, "message": "匹配数据源..."}}
        matched = self.source_matcher.match(parsed)
        scraper_configs = matched.get("scraper_configs", {})
        await asyncio.sleep(0.2)
        yield {"event": "stage", "data": {"stage": "matching", "progress": 30, "message": f"匹配到 {matched['total_sources']} 个数据源"}}

        # Stage 3: Scraper Execution
        scraper_fn = registry.get(matched["data_type"])
        if not scraper_fn:
            yield {"event": "error", "data": {"message": f"Unknown data type: {matched['data_type']}"}}
            return

        all_results = []
        total_sources = len(scraper_configs)
        for i, (src_key, src_config) in enumerate(scraper_configs.items()):
            progress = 30 + int(50 * (i + 1) / max(total_sources, 1))
            await asyncio.sleep(0.3)
            yield {"event": "stage", "data": {"stage": "crawling", "progress": progress, "message": f"爬取中 [{i+1}/{total_sources}]: {src_key}", "source": src_key}}
            try:
                if self.demo_mode:
                    result = scraper_fn(src_config)
                    await asyncio.sleep(0.5)
                else:
                    result = await self.retry_handler.execute_with_retry(scraper_fn, src_config)
            except Exception as e:
                result = {"source": src_key, "files_downloaded": 0, "records": 0, "save_dir": "", "error": str(e)}
            all_results.append(result)
            yield {"event": "source_result", "data": result}

        # Stage 4: Quality Assessment
        await asyncio.sleep(0.3)
        yield {"event": "stage", "data": {"stage": "assessing", "progress": 85, "message": "质量评估中..."}}
        quality_results = [self.quality_assessor.assess(r) for r in all_results]
        overall_quality = sum(q["quality_score"] for q in quality_results) / max(len(quality_results), 1)
        await asyncio.sleep(0.2)
        yield {"event": "stage", "data": {"stage": "assessing", "progress": 90, "message": f"质量评分: {overall_quality:.0%}"}}

        # Stage 5: Auto-trigger ETL
        await asyncio.sleep(0.3)
        yield {"event": "stage", "data": {"stage": "trigger_etl", "progress": 95, "message": "自动触发ETL流水线..."}}
        etl_triggers = []
        for result, qa in zip(all_results, quality_results):
            if qa["passed"]:
                etl_triggers.append({"source": result.get("source"), "auto_trigger": True})
        yield {"event": "stage", "data": {"stage": "trigger_etl", "progress": 98, "message": f"ETL触发完成: {len(etl_triggers)} 个数据源待处理"}}

        # Complete
        final_result = {
            "task_id": task_id,
            "status": "completed",
            "started_at": started_at,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "mode": req.mode.value,
            "demo_mode": self.demo_mode,
            "total_sources": total_sources,
            "total_files_downloaded": sum(r.get("files_downloaded", 0) for r in all_results),
            "total_records": sum(r.get("records", 0) for r in all_results),
            "quality_score": overall_quality,
            "etl_triggered": len(etl_triggers),
            "source_results": all_results,
        }
        yield {"event": "complete", "data": final_result}
