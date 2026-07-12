"""Real SZSE scraper test — download actual PDF files from 深交所.

Usage:
    cd backend
    python scripts/test_szse_real_scrape.py
"""
# -*- coding: utf-8 -*-
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data_collection.scrapers.risk_event_scraper import _scrape_szse


def main():
    # Output dir
    data_dir = os.path.join(os.path.dirname(__file__), "..",
                            "data_collection", "scrapers", "data",
                            "risk_events", "szse")
    os.makedirs(data_dir, exist_ok=True)

    # Count existing files
    existing = [f for f in os.listdir(data_dir) if f.lower().endswith(".pdf")]

    print("=" * 60)
    print("SZSE Real Scrape Test")
    print(f"Output dir: {data_dir}")
    print(f"Existing PDFs: {len(existing)}")
    print("=" * 60)

    config = {
        "source": "szse",
        "max_pages": 1,
        "max_files": 1,
        "date_start": "",
        "date_end": "",
        "headless": False,  # show browser
    }

    print("\nConfig:")
    for k, v in config.items():
        print(f"  {k}: {v}")

    print("\n[1] Starting scrape...")
    t0 = time.time()
    result = _scrape_szse(config)
    elapsed = time.time() - t0

    print(f"\n[DONE] Elapsed: {elapsed:.1f}s")
    print(f"  Files downloaded: {result['files_downloaded']}")
    print(f"  Records:         {result['records']}")
    print(f"  Save dir:        {result['save_dir']}")
    if result.get("error"):
        print(f"  Error:           {result['error']}")

    # List downloaded files
    pdfs = [f for f in os.listdir(data_dir) if f.lower().endswith(".pdf")]
    print(f"\n  PDFs in output dir: {len(pdfs)}")
    for f in sorted(pdfs, key=lambda x: os.path.getmtime(os.path.join(data_dir, x)), reverse=True)[:10]:
        fpath = os.path.join(data_dir, f)
        size_kb = os.path.getsize(fpath) / 1024
        mtime = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(os.path.getmtime(fpath)))
        is_valid = "(valid)" if size_kb > 1 else "(SMALL!)"
        print(f"    [{mtime}] {f[:80]}  {size_kb:.1f}KB {is_valid}")


if __name__ == "__main__":
    main()
