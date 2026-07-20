"""Beijing Stock Exchange risk-event scraper entry point."""

from __future__ import annotations

from .risk_event_scraper import _scrape_bse


def run(config: dict) -> dict:
    """Scrape real BSE disciplinary PDFs using the BSE page parser."""
    return _scrape_bse({**config, "source": "bse", "headless": True})
