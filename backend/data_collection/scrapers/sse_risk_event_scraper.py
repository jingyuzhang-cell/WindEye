"""Shanghai Stock Exchange risk-event scraper entry point."""

from __future__ import annotations

from .risk_event_scraper import _scrape_sse


def run(config: dict) -> dict:
    """Scrape real SSE announcement PDFs using the SSE page parser."""
    return _scrape_sse({**config, "source": "sse", "headless": True})
