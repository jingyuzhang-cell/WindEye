"""Data Collection Module — multi-source heterogeneous data acquisition.

Sub-modules:
- scrapers:    Web crawlers (2 types: risk_event, risk_sentiment)
- agents:      Collaborative crawling modules for intelligent crawling
- orchestrator: Crawl orchestrator with SSE streaming
- api_sync:    REST API integration for official data interfaces
- file_import: Offline file parsing (CSV, Excel, PDF, images)
- dify:        Dify workflow integration for LLM-based entity extraction
"""

__all__ = ["scrapers", "agents", "orchestrator", "api_sync", "file_import", "dify"]
