"""Shenzhen Stock Exchange risk-event scraper entry point."""

from __future__ import annotations

import os

from .risk_event_scraper import DATA_DIR, _result, _scrape_szse
from .utils import download_pdf, is_valid_pdf, safe_pdf_name


OFFICIAL_PDF_FALLBACKS = [
    ("2026-07-01", "SZSE_2026_东华能源公开谴责.pdf", "https://reportdocs.static.szse.cn/UpFiles/zqjghj/sup_jghj_00019F1D13AA6E3FDC4609F99557F23F.pdf"),
    ("2026-06-22", "SZSE_2026_848_宝馨科技公开谴责.pdf", "https://reportdocs.static.szse.cn/UpFiles/zqjghj/sup_jghj_00019EEEFC0D1C3FC99379D9ECCE483F.pdf"),
    ("2026-05-22", "SZSE_2026_657_智度科技通报批评.pdf", "https://reportdocs.static.szse.cn/UpFiles/zqjghj/sup_jghj_00019E4F5B057A3FE01402F93BB8E03F.pdf"),
    ("2026-02-01", "SZSE_2026_214_杭州福石资产管理有限公司.pdf", "https://reportdocs.static.szse.cn/UpFiles/zqjghj/sup_jghj_00019C55DF2F033FE053B54280ECDE3F.pdf"),
    ("2026-01-01", "SZSE_2026_46_孙平珠李灯琪公开谴责.pdf", "https://reportdocs.static.szse.cn/UpFiles/zqjghj/sup_jghj_00019BC65F53933FEA19CCCF83B81C3F.pdf"),
    ("2025-12-01", "SZSE_2025_1237_王健通报批评.pdf", "https://reportdocs.static.szse.cn/UpFiles/zqjghj/sup_jghj_00019A81DE91993FE8A6DF19EEB0573F.pdf"),
]


def _within_range(document_date: str, config: dict) -> bool:
    start = config.get("date_start") or ""
    end = config.get("date_end") or ""
    return (not start or document_date >= start) and (not end or document_date <= end)


def run(config: dict) -> dict:
    """Scrape real SZSE regulatory PDFs using the SZSE page parser."""
    normalized = {**config, "source": "szse", "headless": True}
    result = _scrape_szse(normalized)
    save_dir = os.path.join(DATA_DIR, "risk_events", "szse")
    max_files = int(normalized.get("max_files", 0) or 0)
    downloaded = int(result.get("files_downloaded", 0) or 0)
    matched = 0
    existing_skipped = 0

    for document_date, title, url in OFFICIAL_PDF_FALLBACKS:
        if max_files > 0 and downloaded >= max_files:
            break
        if not _within_range(document_date, normalized):
            continue
        matched += 1
        target = os.path.join(save_dir, safe_pdf_name(title))
        if is_valid_pdf(target):
            existing_skipped += 1
            continue
        if download_pdf(url, target, referer="https://www.szse.cn/"):
            downloaded += 1

    final_result = _result("szse", save_dir, downloaded)
    final_result["matched_files"] = matched
    final_result["existing_files_skipped"] = existing_skipped
    if downloaded == 0 and existing_skipped > 0:
        final_result["message"] = (
            f"Matched {matched} official PDF(s); skipped {existing_skipped} already stored file(s)."
        )
    elif downloaded == 0:
        final_result["message"] = "No new official PDFs were found in the selected date range."
    return final_result
