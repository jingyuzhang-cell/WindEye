"""Pydantic schemas for multi-agent crawl task requests and responses."""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class DataType(str, Enum):
    RISK_EVENT = "risk_event"
    RISK_SENTIMENT = "risk_sentiment"


class CrawlMode(str, Enum):
    QUICK = "quick"
    COMPLEX = "complex"
    TEMPLATE = "template"


class CrawlStage(str, Enum):
    PARSING = "parsing"
    MATCHING = "matching"
    CRAWLING = "crawling"
    ASSESSING = "assessing"
    TRIGGER_ETL = "trigger_etl"
    COMPLETED = "completed"
    FAILED = "failed"


class CrawlTaskRequest(BaseModel):
    mode: CrawlMode = CrawlMode.QUICK
    data_type: DataType = DataType.RISK_EVENT
    sources: list[str] = Field(default_factory=list)
    date_start: Optional[str] = None
    date_end: Optional[str] = None
    keywords: list[str] = Field(default_factory=list)
    max_pages: int = Field(default=5, ge=1, le=50)
    max_files: int = Field(default=0, ge=0, le=500, description="Max files to download per source (0 = unlimited)")
    natural_language_query: Optional[str] = None
    template_id: Optional[str] = None


class CrawlTaskResponse(BaseModel):
    task_id: str
    status: str
    stage: CrawlStage
    progress: float = 0.0
    started_at: Optional[str] = None
    result: Optional[dict] = None
    error: Optional[str] = None