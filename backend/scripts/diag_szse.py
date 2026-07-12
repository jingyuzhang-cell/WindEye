"""Diagnose SZSE encode-open — find the real download mechanism by clicking.

Usage: cd backend && python scripts/diag_szse.py
"""
# -*- coding: utf-8 -*-
import os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from data_collection.scrapers.utils import create_driver

URL = "https://www.szse.cn/disclosure/supervision/measure/pushish/index.html"

save_dir = os.path.join(os.path.dirname(__file__), "..",
                        "data_collection", "scrapers", "data",
                        "risk_events", "szse")
os.makedirs(save_dir, exist_ok=True)

driver = create_driver(download_dir=save_dir, headless=False, page_load_timeout=30.0)
try:
    print("[1] Loading page...")
    driver.get(URL)
    time.sleep(5)
    main_win = driver.current_window_handle
    print(f"    Title: {driver.title}")

    # Get first encode-open link
    row = driver.find_element(
        "xpath",
        "//table[contains(@class,'table-tab1')]//tbody/tr[1]//a[@encode-open]"
    )
    encode_open = row.get_attribute("encode-open")
    print(f"\n[2] First encode-open: {encode_open}")

    # Try to decode it by looking at JS
    print("\n[3] Looking for decode function in page scripts...")
    all_scripts = driver.find_elements("xpath", "//script")
    for s in all_scripts:
        text = s.get_attribute("innerHTML") or ""
        src = s.get_attribute("src") or ""
        if "encode" in (text + src).lower() or "open" in (text + src).lower():
            print(f"    src={src[:120]}")
            if text and len(text) < 2000:
                for line in text.split("\n"):
                    if "encode" in line.lower() or "open" in line.lower():
                        print(f"    >>> {line.strip()[:200]}")

    # Click and observe the new tab
    print("\n[4] Clicking link and observing new tab...")
    windows_before = set(driver.window_handles)
    print(f"    Windows before: {windows_before}")
    driver.execute_script("arguments[0].click();", row)
    time.sleep(5)

    windows_after = set(driver.window_handles)
    new_windows = windows_after - windows_before
    print(f"    New windows: {new_windows}")

    for handle in new_windows:
        driver.switch_to.window(handle)
        time.sleep(2)
        print(f"    New tab URL: {driver.current_url[:200]}")
        print(f"    New tab title: {driver.title}")
        # Check if it's a PDF
        ps = driver.page_source[:200]
        print(f"    Page start: {ps[:150]}")

        # If it loaded a real URL, try to download from it
        real_url = driver.current_url
        if real_url and real_url != URL and "javascript:" not in real_url:
            print(f"\n    *** Real URL found! Downloading via requests... ***")
            # Get cookies from driver
            cookies = {c["name"]: c["value"] for c in driver.get_cookies()}
            from data_collection.scrapers.utils import download_pdf
            ok = download_pdf(real_url, os.path.join(save_dir, "test_szse_real.pdf"),
                            cookies=cookies, referer=URL)
            print(f"    Download result: {'OK' if ok else 'FAILED'}")

        driver.close()

    driver.switch_to.window(main_win)
    print(f"\n[DONE]")

finally:
    time.sleep(2)
    driver.quit()
    print("Quit")
