"""Risk Event Scraper - BSE disciplinary actions.

Source: bse
Temp dir: data/risk_events/bse/

Note: SSE/SZSE removed from the active crawl path because they are not reliably reachable.
"""

from __future__ import annotations

import logging
import os
import re
import time
from datetime import date, datetime
from typing import Any, Callable

from data_collection.scrapers.utils import (
    create_driver,
    download_pdf,
    ensure_dir,
    find_with_fallback,
    log_element_failure,
    safe_pdf_name,
    wait_for_new_file,
    wait_for_downloads,
)

DATA_DIR = os.getenv("SCRAPER_DATA_DIR") or os.path.join(os.path.dirname(__file__), "data")

logger = logging.getLogger(__name__)

SOURCE_LABELS = {
    "bse": "北交所",
}


def _format_size(size: int) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB"):
        if value < 1024 or unit == "MB":
            return f"{int(value)}{unit}" if unit == "B" else f"{value:.0f}{unit}"
        value = value / 1024
    return f"{value:.0f}MB"


def _remove_demo_files(save_dir: str) -> None:
    if not os.path.isdir(save_dir):
        return
    for filename in os.listdir(save_dir):
        if not filename.startswith("DEMO_"):
            continue
        path = os.path.join(save_dir, filename)
        if os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                logger.warning("Failed to remove demo file before real crawl: %s", path)


def _list_saved_files(save_dir: str, source: str, existing_names: set[str] | None = None) -> list[dict]:
    existing_names = existing_names or set()
    files: list[dict] = []
    if not os.path.isdir(save_dir):
        return files
    for filename in sorted(os.listdir(save_dir)):
        if filename.startswith("DEMO_"):
            continue
        if not filename.lower().endswith(".pdf") or filename in existing_names:
            continue
        path = os.path.join(save_dir, filename)
        info = _file_info_from_path(source, path)
        if info:
            files.append(info)
    return files


def _pdf_names(save_dir: str) -> set[str]:
    if not os.path.isdir(save_dir):
        return set()
    return {f for f in os.listdir(save_dir) if f.lower().endswith(".pdf")}


def _pdf_identity(filename: str) -> str:
    stem, _ = os.path.splitext(filename)
    stem = re.sub(r"_\d{10,17}$", "", stem)
    return stem.strip().lower()


def _pdf_exists_for_name(save_dir: str, filename: str) -> bool:
    target_identity = _pdf_identity(filename)
    return any(_pdf_identity(existing) == target_identity for existing in _pdf_names(save_dir))


def _file_info_from_path(source: str, path: str) -> dict[str, Any] | None:
    if not os.path.isfile(path):
        return None
    filename = os.path.basename(path)
    if filename.startswith("DEMO_") or not filename.lower().endswith(".pdf"):
        return None
    size = os.path.getsize(path)
    return {
        "source": source,
        "sourceLabel": SOURCE_LABELS.get(source, source),
        "fileName": filename,
        "savedName": filename,
        "filePath": path,
        "sizeBytes": size,
        "sizeDisplay": _format_size(size),
        "collectedAt": datetime.fromtimestamp(os.path.getmtime(path)).isoformat(timespec="seconds"),
    }


def _emit_file_progress(config: dict, source: str, path: str, downloaded_count: int) -> None:
    callback: Callable[[dict[str, Any]], None] | None = config.get("progress_callback")
    if callback is None:
        return
    file_info = _file_info_from_path(source, path)
    if not file_info:
        return
    callback({
        "source": source,
        "downloaded_count": downloaded_count,
        "target_count": int(config.get("max_files", 0) or 0),
        "file": file_info,
    })


def _normalize_date_value(value: str) -> str:
    if not value:
        return ""
    text = str(value).strip().replace("/", "-").replace(".", "-")
    match = re.search(r"(\d{4})[-年](\d{1,2})[-月](\d{1,2})", text)
    if not match:
        return ""
    year, month, day = match.groups()
    return f"{year}-{int(month):02d}-{int(day):02d}"


def _parse_date_value(value: str) -> date | None:
    normalized = _normalize_date_value(value)
    if not normalized:
        return None
    return datetime.strptime(normalized, "%Y-%m-%d").date()


def _extract_date_from_text(text: str) -> str:
    if not text:
        return ""
    match = re.search(r"(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日?)", text)
    return _normalize_date_value(match.group(1)) if match else ""


def _date_in_range(text: str, date_start: str, date_end: str) -> bool:
    if not date_start and not date_end:
        return True
    current = _parse_date_value(_extract_date_from_text(text))
    if current is None:
        return True
    start = _parse_date_value(date_start)
    end = _parse_date_value(date_end)
    if start and current < start:
        return False
    if end and current > end:
        return False
    return True


def _set_date_input(driver, selectors: list[tuple[str, str]], value: str) -> bool:
    if not value:
        return True
    normalized = _normalize_date_value(value)
    if not normalized:
        return False
    elem, desc, xpath = find_with_fallback(driver, selectors, timeout=2)
    if elem is None:
        return False
    try:
        driver.execute_script(
            """
            const input = arguments[0];
            const value = arguments[1];
            input.removeAttribute('readonly');
            input.focus();
            input.value = '';
            input.dispatchEvent(new Event('input', {bubbles: true}));
            input.value = value;
            input.dispatchEvent(new Event('input', {bubbles: true}));
            input.dispatchEvent(new Event('change', {bubbles: true}));
            input.blur();
            """,
            elem,
            normalized,
        )
        logger.info("Date filter: set %s via %s => %s", normalized, desc, xpath)
        return True
    except Exception as exc:
        log_element_failure(logger, "date-input", f"set {normalized}", xpath, exc, getattr(driver, "current_url", ""))
        return False


def _click_trigger(driver, selectors: list[tuple[str, str]]) -> bool:
    elem, desc, xpath = find_with_fallback(driver, selectors, timeout=2)
    if elem is None:
        return False
    try:
        driver.execute_script("arguments[0].click();", elem)
        logger.info("Date filter: clicked trigger via %s", desc)
        return True
    except Exception as exc:
        log_element_failure(logger, "date-trigger", "click trigger", xpath, exc, getattr(driver, "current_url", ""))
        return False


def _apply_date_filter(driver, exchange: str, date_start: str, date_end: str) -> bool:
    if not date_start and not date_end:
        return True
    exchange = exchange.lower()
    selectors = {
        "start": [
            ("input startDate", "//input[contains(@name,'start') or contains(@id,'start') or contains(@placeholder,'开始')]"),
            ("input start date", "//input[contains(@class,'start')]"),
        ],
        "end": [
            ("input endDate", "//input[contains(@name,'end') or contains(@id,'end') or contains(@placeholder,'结束')]"),
            ("input end date", "//input[contains(@class,'end')]"),
        ],
        "submit": [
            ("search button", "//button[contains(.,'查询') or contains(.,'搜索')]"),
            ("search link", "//a[contains(.,'查询') or contains(.,'搜索')]"),
        ],
    }
    start_ok = _set_date_input(driver, selectors["start"], date_start)
    end_ok = _set_date_input(driver, selectors["end"], date_end)
    submit_ok = _click_trigger(driver, selectors["submit"])
    if submit_ok:
        time.sleep(4)
    applied = (start_ok or not date_start) and (end_ok or not date_end) and submit_ok
    logger.info(
        "%s: date filter applied=%s start=%s end=%s",
        exchange.upper(),
        applied,
        _normalize_date_value(date_start),
        _normalize_date_value(date_end),
    )
    return applied


def _count_downloaded_pdfs(save_dir: str) -> int:
    return len([f for f in os.listdir(save_dir) if f.lower().endswith(".pdf")]) if os.path.isdir(save_dir) else 0


def _download_pdf_with_fallback(driver, pdf_url: str, save_dir: str, raw_title: str, referer: str = "") -> str | None:
    target_name = safe_pdf_name(raw_title or pdf_url.split("/")[-1].split("?")[0])
    if _pdf_exists_for_name(save_dir, target_name):
        logger.info("Skip existing PDF: %s", target_name)
        return None
    target_path = os.path.join(save_dir, target_name)
    cookies = {}
    try:
        cookies = {item["name"]: item["value"] for item in driver.get_cookies()}
    except Exception:
        cookies = {}
    ok = download_pdf(pdf_url, target_path, cookies=cookies, referer=referer or getattr(driver, "current_url", ""))
    if ok:
        logger.info("Downloaded PDF via HTTP fallback: %s", os.path.basename(target_path))
        return target_path
    return None


def _rename_downloaded_file(downloaded_path: str, save_dir: str, raw_title: str) -> str | None:
    target_name = safe_pdf_name(raw_title)
    target_path = os.path.join(save_dir, target_name)
    if os.path.abspath(downloaded_path) == os.path.abspath(target_path):
        return downloaded_path
    if _pdf_exists_for_name(save_dir, target_name):
        logger.info("Skip duplicate downloaded PDF: %s", target_name)
        try:
            os.remove(downloaded_path)
        except OSError:
            pass
        return None
    try:
        os.rename(downloaded_path, target_path)
        return target_path
    except OSError:
        return downloaded_path

# ── Real scrapers ───────────────────────────────────────────────────────────


def _scrape_bse(config: dict) -> dict:
    """北交所 — 自律监管措施."""
    source = config.get("source", "bse")
    max_pages = min(config.get("max_pages", 5), 50)
    max_files = config.get("max_files", 0) or 0
    date_start = config.get("date_start", "")
    date_end = config.get("date_end", "")
    save_dir = os.path.join(DATA_DIR, "risk_events", source)
    os.makedirs(save_dir, exist_ok=True)
    _remove_demo_files(save_dir)
    existing_pdfs = _pdf_names(save_dir)

    driver = create_driver(download_dir=save_dir, headless=bool(config.get("headless", False)))
    try:
        BSE_URLS = [
            "https://www.bse.cn/disclosure/disciplinary_action.html",
            "https://www.bse.cn/disclosure/disciplinary_aciton.html",
        ]
        url = BSE_URLS[0]
        logger.info("BSE: opening %s", url)
        driver.get(url)
        time.sleep(4)
        # If primary URL failed (page title doesn't contain expected text), try fallback
        if "北证" not in (driver.title or "") and "纪律" not in (driver.title or ""):
            url = BSE_URLS[1]
            logger.info("BSE: primary URL failed, trying fallback %s", url)
            driver.get(url)
            time.sleep(4)
        _apply_date_filter(driver, "bse", date_start, date_end)
        main_window = driver.current_window_handle

        for page in range(1, max_pages + 1):
            logger.info(f"BSE: scraping page {page}/{max_pages}")
            try:
                time.sleep(2)
                files_before = set(os.listdir(save_dir))
                pdf_links = driver.find_elements("xpath", "//a[contains(@href, '.pdf')]")
                for a_elem in pdf_links:
                    if max_files > 0:
                        if len(_pdf_names(save_dir) - existing_pdfs) >= max_files:
                            logger.info("BSE: reached max_files=%s, stopping on this page", max_files)
                            break
                    try:
                        raw_title = a_elem.get_attribute("title") or a_elem.text
                        if not raw_title:
                            continue
                        parent_text = ""
                        try:
                            parent_text = a_elem.find_element("xpath", "./ancestor::*[self::li or self::tr or self::dd or self::div][1]").text
                        except Exception:
                            parent_text = raw_title
                        if not _date_in_range(parent_text, date_start, date_end):
                            continue
                        clean_title = safe_pdf_name(raw_title.strip().replace("\n", ""))
                        if _pdf_exists_for_name(save_dir, clean_title):
                            logger.info("BSE: skip existing announcement %s", clean_title)
                            continue
                        href = a_elem.get_attribute("href")
                        fallback_path = None
                        if href and not href.lower().startswith("javascript:"):
                            fallback_path = _download_pdf_with_fallback(driver, href, save_dir, raw_title, referer=url)
                        if fallback_path:
                            _emit_file_progress(config, source, fallback_path, len(_pdf_names(save_dir) - existing_pdfs))
                            continue
                        before_click_files = set(os.listdir(save_dir))
                        driver.execute_script("arguments[0].click();", a_elem)
                        downloaded_path = wait_for_new_file(save_dir, before_click_files, timeout=20, poll_interval=1.0)
                        if downloaded_path:
                            final_path = _rename_downloaded_file(downloaded_path, save_dir, clean_title)
                            _emit_file_progress(config, source, final_path, len(_pdf_names(save_dir) - existing_pdfs))
                        time.sleep(1.5)
                        if len(driver.window_handles) > 1:
                            for handle in driver.window_handles:
                                if handle != main_window:
                                    driver.switch_to.window(handle)
                                    driver.close()
                            driver.switch_to.window(main_window)
                    except Exception:
                        continue

                wait_for_downloads(save_dir)
                files_after = set(os.listdir(save_dir))
                new_files = files_after - files_before
                logger.info("BSE page %d: download verification — %d new files (%d before → %d after)",
                            page, len(new_files), len(files_before), len(files_after))

                if max_files > 0:
                    current_count = len(_pdf_names(save_dir) - existing_pdfs)
                    if current_count >= max_files:
                        logger.info("BSE: reached max_files=%s (current=%s), stopping", max_files, current_count)
                        break

                if page < max_pages:
                    try:
                        candidates = [
                            ("pagination next link", "//a[contains(text(), '下一页') or contains(text(), '下页')]"),
                            ("pagination li.next a", "//li[contains(@class, 'next')]//a"),
                            ("generic next button", "//div[contains(@class, 'pagination')]//a[last()]"),
                        ]
                        next_btn, _, _ = find_with_fallback(driver, candidates, timeout=3)
                        if next_btn is None:
                            logger.info("BSE: no next page button found, stopping")
                            break
                        driver.execute_script("arguments[0].click();", next_btn)
                        time.sleep(4)
                    except Exception:
                        logger.info("BSE: no next page button, stopping")
                        break
            except Exception as e:
                logger.error(f"BSE: error on page {page}: {e}")
                break
    finally:
        driver.quit()

    files = _list_saved_files(save_dir, source, existing_pdfs)
    return {"source": source, "files_downloaded": len(files), "records": len(files), "save_dir": save_dir, "files": files}


def run_risk_event_scraper(config: dict) -> dict:
    """Entry point: dispatch to source-specific scraper."""
    source = "bse"
    max_pages = int(config.get("max_pages", 5) or 0)
    if max_pages <= 0:
        save_dir = os.path.join(DATA_DIR, "risk_events", source)
        ensure_dir(save_dir)
        return {"source": source, "files_downloaded": 0, "records": 0, "save_dir": save_dir}
    fn = _scrape_bse
    logger.info(
        "RiskEvent scraper: source=%s headless=%s data_dir=%s",
        source,
        config.get("headless", False) or os.getenv("SCRAPER_HEADLESS", ""),
        DATA_DIR,
    )
    return fn(config)
