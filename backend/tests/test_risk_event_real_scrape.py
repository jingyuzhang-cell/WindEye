"""Real scrape smoke test for SZSE and BSE risk event scrapers."""

from __future__ import annotations

import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.mark.slow
@pytest.mark.skipif(
    os.getenv("RUN_BROWSER_TESTS", "").lower() != "true",
    reason="Set RUN_BROWSER_TESTS=true to run browser-based scraping tests",
)
def test_szse_and_bse_download_real_pdfs():
    from data_collection.scrapers.risk_event_scraper import run_risk_event_scraper

    tmpdir = tempfile.mkdtemp(prefix="risk_event_real_")
    os.environ["SCRAPER_DATA_DIR"] = tmpdir
    os.environ["SCRAPER_HEADLESS"] = "true"

    for source in ("szse", "bse"):
        result = run_risk_event_scraper(
            {
                "source": source,
                "max_pages": 1,
                "max_files": 2,
                "headless": True,
            }
        )
        assert result["source"] == source
        assert result["files_downloaded"] >= 1, f"{source}: expected at least 1 PDF"

        save_dir = result["save_dir"]
        pdfs = [name for name in os.listdir(save_dir) if name.lower().endswith(".pdf")]
        assert pdfs, f"{source}: no PDF files in {save_dir}"

        for name in pdfs:
            path = os.path.join(save_dir, name)
            with open(path, "rb") as handle:
                assert handle.read(4) == b"%PDF", f"{source}: invalid PDF header for {name}"
            assert os.path.getsize(path) > 1024, f"{source}: PDF too small: {name}"
