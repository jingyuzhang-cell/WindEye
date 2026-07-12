"""Smoke test: verify WebDriver can reach SSE/SZSE/BSE exchange websites.

Usage: python scripts/test_exchange_connectivity.py
Set SCRAPER_HEADLESS=true in .env for headless mode.
"""
# -*- coding: utf-8 -*-
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data_collection.scrapers.utils import create_driver

EXCHANGES = {
    "SSE": "https://www.sse.com.cn/disclosure/listedinfo/announcement/",
    "SZSE": "https://www.szse.cn/disclosure/supervision/measure/pushish/index.html",
    "BSE": "https://www.bse.cn/disclosure/disciplinary_aciton.html",
}


def main():
    headless = os.getenv("SCRAPER_HEADLESS", "").strip().lower() in {"1", "true", "yes", "on"}

    print("=" * 60)
    print("WebDriver Exchange Connectivity Test")
    print(f"Headless: {headless}")
    print("=" * 60)

    driver = None
    try:
        print("\n[1] Creating WebDriver...")
        driver = create_driver(headless=headless, page_load_timeout=30.0)
        browser_name = driver.capabilities.get('browserName', 'unknown')
        print(f"    [OK] WebDriver created: {browser_name}")

        for name, url in EXCHANGES.items():
            print(f"\n[2] Testing {name}...")
            print(f"    URL: {url}")
            try:
                driver.get(url)
                time.sleep(4)
                title = driver.title or "(no title)"
                print(f"    Title: {title[:100]}")
                print(f"    Current URL: {driver.current_url[:120]}")

                # Check for common blocking indicators
                page_source = driver.page_source[:5000].lower()
                blocked_keywords = []
                for kw in ["captcha", "验证码", "访问被拒绝", "access denied", "403", "forbidden"]:
                    if kw in page_source:
                        blocked_keywords.append(kw)
                if blocked_keywords:
                    print(f"    [WARN] Possible anti-scraping detected: {blocked_keywords}")
                elif len(driver.page_source) < 500:
                    print("    [WARN] Very short page content, may be blocked")
                else:
                    print("    [OK] Page loaded normally")

                # Count PDF links
                pdf_links = driver.find_elements("xpath", "//a[contains(@href, '.pdf')]")
                print(f"    PDF links found: {len(pdf_links)}")

                # Count table rows
                rows = driver.find_elements("xpath", "//tbody/tr")
                if rows:
                    print(f"    Table rows: {len(rows)}")

            except Exception as e:
                print(f"    [FAIL] {e}")

    except Exception as e:
        print(f"\n[FAIL] WebDriver creation failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if driver:
            driver.quit()
            print("\n[DONE] WebDriver closed")


if __name__ == "__main__":
    main()
