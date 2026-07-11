"""Web scrapers for multi-source data acquisition.

Two scrapers: risk_event (风险事件) and risk_sentiment (风险舆情).
Temp directories: KG_DATA_DIR/temp/risk_events/{source}/ and KG_DATA_DIR/temp/risk_sentiment/
"""

import logging

logger = logging.getLogger(__name__)

from data_collection.scrapers.risk_event_scraper import (
    run_risk_event_scraper,
)

SCRAPER_REGISTRY = {
    "risk_event": run_risk_event_scraper,
}

# risk_sentiment scraper — optional
try:
    from data_collection.scrapers.risk_sentiment_scraper import (
        run_risk_sentiment_scraper,
    )
    SCRAPER_REGISTRY["risk_sentiment"] = run_risk_sentiment_scraper
except ImportError:
    logger.info("risk_sentiment_scraper not available (file missing)")

__all__ = [
    "run_risk_event_scraper",
    "SCRAPER_REGISTRY",
]
