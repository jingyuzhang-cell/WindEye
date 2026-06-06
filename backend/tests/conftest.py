"""Shared fixtures and configuration for scraper tests."""

from __future__ import annotations

import os
import sys
import tempfile
from typing import Generator

import pytest

# Ensure backend/ is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Prevent Neo4jClient.from_env() from failing at import time during tests
os.environ.setdefault("NEO4J_PASSWORD", "fake-for-testing")


def pytest_configure(config):
    config.addinivalue_line("markers", "slow: real scraping with network (requires Chrome/WebDriver)")
    config.addinivalue_line("markers", "demo: demo mode tests (no network needed)")
    config.addinivalue_line("markers", "sentiment: sentiment scraper tests (may require network)")


# ── Directory fixtures ─────────────────────────────────────────────────────

@pytest.fixture
def scraper_data_dir() -> Generator[str, None, None]:
    """Isolated temporary directory for scraper test outputs."""
    with tempfile.TemporaryDirectory(prefix="scraper_test_") as d:
        yield d


# ── Event scraper configs ──────────────────────────────────────────────────

@pytest.fixture
def event_config_sse(scraper_data_dir: str) -> dict:
    return {"source": "sse", "keywords": ["诉讼"], "date_range": None, "max_pages": 1}


@pytest.fixture
def event_config_szse(scraper_data_dir: str) -> dict:
    return {"source": "szse", "keywords": ["处罚"], "date_range": None, "max_pages": 1}


@pytest.fixture
def event_config_bse(scraper_data_dir: str) -> dict:
    return {"source": "bse", "keywords": ["违规"], "date_range": None, "max_pages": 1}


# ── Sentiment scraper configs ──────────────────────────────────────────────

@pytest.fixture
def sentiment_config(scraper_data_dir: str) -> dict:
    return {"source": "stockstar", "max_pages": 1}


# ── WebDriver availability check ───────────────────────────────────────────

@pytest.fixture
def check_webdriver_available() -> None:
    """Skip test if Chrome/Chromedriver is not available."""
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.service import Service
    except ImportError:
        pytest.skip("selenium not installed")

    # Try to find chromedriver
    import shutil
    driver_path = os.getenv("CHROMEDRIVER_PATH", "")
    if driver_path and os.path.isfile(driver_path):
        return
    if shutil.which("chromedriver"):
        return
    # Selenium Manager may auto-download, so don't skip — just warn
    import warnings
    warnings.warn("chromedriver not found on PATH; Selenium Manager will attempt auto-download")
