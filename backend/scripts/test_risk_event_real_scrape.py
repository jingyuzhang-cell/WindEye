"""Quick smoke test: verify SZSE and BSE can download real PDFs."""

from __future__ import annotations

import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["SCRAPER_HEADLESS"] = "true"


def main() -> int:
    from data_collection.scrapers.risk_event_scraper import run_risk_event_scraper

    tmpdir = tempfile.mkdtemp(prefix="risk_event_real_")
    os.environ["SCRAPER_DATA_DIR"] = tmpdir
    failures: list[str] = []

    for source in ("szse", "bse"):
        print(f"\n=== Testing {source.upper()} ===")
        try:
            result = run_risk_event_scraper(
                {
                    "source": source,
                    "max_pages": 1,
                    "max_files": 2,
                    "headless": True,
                }
            )
            print(f"files_downloaded: {result['files_downloaded']}")
            print(f"save_dir: {result['save_dir']}")

            save_dir = result["save_dir"]
            if not os.path.isdir(save_dir):
                failures.append(f"{source}: save_dir missing")
                continue

            pdfs = [name for name in os.listdir(save_dir) if name.lower().endswith(".pdf")]
            if not pdfs:
                failures.append(f"{source}: no PDF files downloaded")
                continue

            for name in pdfs:
                path = os.path.join(save_dir, name)
                size = os.path.getsize(path)
                with open(path, "rb") as handle:
                    valid = handle.read(4) == b"%PDF"
                print(f"  {name}: {size:,} bytes, valid_pdf={valid}")
                if not valid or size < 1024:
                    failures.append(f"{source}: invalid PDF {name}")
        except Exception as exc:
            print(f"ERROR: {exc}")
            failures.append(f"{source}: {exc}")

    print("\n=== Summary ===")
    if failures:
        for item in failures:
            print(f"FAIL: {item}")
        return 1

    print("OK: SZSE and BSE both downloaded valid PDFs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
