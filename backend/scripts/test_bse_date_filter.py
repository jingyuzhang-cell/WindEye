"""Diagnostic: verify BSE date filter actually works and page content changes."""
import os, sys, time, logging
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")

from data_collection.scrapers.utils import create_driver, find_with_fallback
from data_collection.scrapers.risk_event_scraper import _apply_date_filter, _normalize_date_value

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data_collection', 'scrapers', 'data', 'risk_events', 'bse')
os.makedirs(DATA_DIR, exist_ok=True)

driver = create_driver(download_dir=DATA_DIR)
try:
    # Use the working URL
    url = "https://www.bse.cn/disclosure/disciplinary_aciton.html"
    driver.get(url)
    time.sleep(5)
    print(f"Page title: {driver.title}")

    # Count result rows BEFORE date filter
    try:
        rows_before = len(driver.find_elements("xpath", "//tbody/tr"))
    except Exception:
        rows_before = 0
    print(f"Rows before date filter: {rows_before}")

    # Apply a broad date filter (last 30 days)
    date_start = "2026-06-12"
    date_end = "2026-07-12"
    _apply_date_filter(driver, "bse", date_start, date_end)
    time.sleep(3)

    # Count result rows AFTER date filter
    try:
        rows_after = len(driver.find_elements("xpath", "//tbody/tr"))
    except Exception:
        rows_after = 0
    print(f"Rows after date filter: {rows_after}")

    # Count PDF links
    pdf_links = driver.find_elements("xpath", "//a[contains(@href, '.pdf')]")
    print(f"PDF links found: {len(pdf_links)}")

    # Show first 3 rows' text for inspection
    rows = driver.find_elements("xpath", "//tbody/tr")
    for i, row in enumerate(rows[:5]):
        text = (row.text or "").strip()[:200]
        print(f"  Row {i+1}: {text}")

    # Check if there's a "no results" message
    page_text = driver.page_source
    if "暂无" in page_text or "没有" in page_text:
        print("NOTE: Page contains 'no results' text")

finally:
    driver.quit()
