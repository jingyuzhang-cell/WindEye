"""Integrity checks for locally collected official exchange PDFs."""

from pathlib import Path

from pypdf import PdfReader


DATA_ROOT = Path(__file__).parents[1] / "data_collection" / "scrapers" / "data" / "risk_events"


def test_each_exchange_has_five_complete_pdfs():
    for exchange in ("sse", "szse", "bse"):
        valid_files = []
        for path in sorted((DATA_ROOT / exchange).glob("*.pdf")):
            payload = path.read_bytes()
            assert len(payload) >= 1024, f"PDF is too small: {path}"
            assert payload.startswith(b"%PDF"), f"Missing PDF header: {path}"
            assert b"%%EOF" in payload[-4096:], f"Missing PDF EOF marker: {path}"
            assert len(PdfReader(str(path)).pages) > 0, f"PDF has no readable pages: {path}"
            valid_files.append(path)

        assert len(valid_files) >= 5, f"{exchange} has only {len(valid_files)} valid PDFs"
