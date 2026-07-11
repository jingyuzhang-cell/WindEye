"""Risk Event Scraper — 风险事件爬取 (SSE/SZSE/BSE disciplinary actions & litigation).

Sources: sse (上交所), szse (深交所), bse (北交所)
Temp dir: data/risk_events/{source}/
"""

from __future__ import annotations

import logging
import os
import random
import re
import time
from datetime import date, datetime

from data_collection.scrapers.utils import (
    create_driver,
    download_pdf,
    ensure_dir,
    find_with_fallback,
    log_element_failure,
    safe_pdf_name,
    wait_for_downloads,
)

DATA_DIR = os.getenv("SCRAPER_DATA_DIR") or os.path.join(os.path.dirname(__file__), "data")

logger = logging.getLogger(__name__)


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
    selector_map = {
        "sse": {
            "start": [
                ("input startDate", "//input[contains(@name,'start') or contains(@id,'start') or contains(@placeholder,'开始')]"),
                ("input start date", "//input[contains(@class,'start') or contains(@class,'from')]"),
            ],
            "end": [
                ("input endDate", "//input[contains(@name,'end') or contains(@id,'end') or contains(@placeholder,'结束')]"),
                ("input end date", "//input[contains(@class,'end') or contains(@class,'to')]"),
            ],
            "submit": [
                ("search button", "//button[contains(.,'查询') or contains(.,'搜索')]"),
                ("search link", "//a[contains(.,'查询') or contains(.,'搜索')]"),
            ],
        },
        "szse": {
            "start": [
                ("input startDate", "//input[contains(@name,'start') or contains(@id,'start') or contains(@placeholder,'开始')]"),
                ("layui start", "//input[contains(@class,'start')]"),
            ],
            "end": [
                ("input endDate", "//input[contains(@name,'end') or contains(@id,'end') or contains(@placeholder,'结束')]"),
                ("layui end", "//input[contains(@class,'end')]"),
            ],
            "submit": [
                ("search button", "//button[contains(.,'查询') or contains(.,'搜索')]"),
                ("search link", "//a[contains(.,'查询') or contains(.,'搜索')]"),
            ],
        },
        "bse": {
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
        },
    }
    selectors = selector_map.get(exchange, selector_map["sse"])
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


def _report_progress(cb, downloaded: int, target: int, save_dir: str, filename: str) -> None:
    """Invoke progress callback if provided, for SSE streaming to frontend."""
    if cb is None:
        return
    try:
        file_path = os.path.join(save_dir, filename)
        if not os.path.isfile(file_path):
            file_path = os.path.join(save_dir, safe_pdf_name(filename))
            filename = os.path.basename(file_path)
        source = os.path.basename(os.path.normpath(save_dir))
        size_bytes = os.path.getsize(file_path) if os.path.isfile(file_path) else 0
        collected_at = (
            datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat()
            if os.path.isfile(file_path)
            else datetime.now().isoformat()
        )
        cb({
            "downloaded_count": downloaded,
            "target_count": target or 0,
            "file": {
                "source": source,
                "fileName": filename,
                "filePath": file_path,
                "sizeBytes": size_bytes,
                "collectedAt": collected_at,
            },
        })
    except Exception:
        pass


def _download_pdf_with_fallback(driver, pdf_url: str, save_dir: str, raw_title: str, referer: str = "") -> bool:
    target_name = safe_pdf_name(raw_title or pdf_url.split("/")[-1].split("?")[0])
    target_path = os.path.join(save_dir, target_name)
    if os.path.exists(target_path):
        logger.info("Skip existing: %s", target_name)
        return True  # Already collected — skip, not a new download
    cookies = {}
    try:
        cookies = {item["name"]: item["value"] for item in driver.get_cookies()}
    except Exception:
        cookies = {}
    ok = download_pdf(pdf_url, target_path, cookies=cookies, referer=referer or getattr(driver, "current_url", ""))
    if ok:
        logger.info("Downloaded PDF via HTTP fallback: %s", os.path.basename(target_path))
    return ok

# ── Real scrapers ───────────────────────────────────────────────────────────


def _scrape_sse(config: dict) -> dict:
    """上交所 — 风险事件公告 (股票交易异常波动/诉讼和仲裁/风险警示)."""
    source = config.get("source", "sse")
    max_pages = min(config.get("max_pages", 5), 50)
    max_files = config.get("max_files", 0) or 0
    date_start = config.get("date_start", "")
    date_end = config.get("date_end", "")
    save_dir = os.path.join(DATA_DIR, "risk_events", source)
    os.makedirs(save_dir, exist_ok=True)

    TYPE_MAP = {
        "股票交易异常波动和澄清": "13",
        "诉讼和仲裁": "26",
        "风险警示": "31",
    }

    progress_cb = config.get("progress_callback")

    driver = create_driver(download_dir=save_dir)
    try:
        url = "https://www.sse.com.cn/disclosure/listedinfo/announcement/"
        logger.info("SSE: opening %s", url)
        driver.get(url)
        main_window = driver.current_window_handle
        time.sleep(5)

        _apply_date_filter(driver, "sse", date_start, date_end)

        logger.info("SSE: applying announcement category filters")
        for name, type_id in TYPE_MAP.items():
            candidates = [
                ("span by name", f"//span[@name='{type_id}']"),
                ("input checkbox by name", f"//input[@type='checkbox'][@name='{type_id}']"),
                ("label by data-id", f"//label[@data-id='{type_id}']"),
                ("div filter option", f"//div[contains(@class,'filter')]//*[@data-value='{type_id}']"),
            ]
            elem, matched_desc, matched_xpath = find_with_fallback(driver, candidates, timeout=3)
            if elem is None:
                log_element_failure(logger, "SSE-category", f"checkbox {name} (type_id={type_id})", page_url=url)
                continue
            try:
                driver.execute_script("arguments[0].click();", elem)
                logger.info("SSE: checked category '%s' via %s", name, matched_desc)
                time.sleep(1.5)
            except Exception as e:
                log_element_failure(logger, "SSE-category", f"click {name}", matched_xpath, e, url)

        time.sleep(3)
        rename_tasks: dict[str, str] = {}
        downloaded_count = 0  # Only new files this session

        for page in range(1, max_pages + 1):
            logger.info("SSE: scraping page %d/%d", page, max_pages)
            try:
                time.sleep(2)
                files_before = set(os.listdir(save_dir))
                pdf_links = driver.find_elements("xpath", "//a[contains(@href, '.pdf')]")
                seen_urls: set[str] = set()
                for a_elem in pdf_links:
                    if max_files > 0:
                        if downloaded_count + len(rename_tasks) >= max_files:
                            logger.info("SSE: reached max_files=%d, stopping", max_files)
                            break
                    pdf_url = a_elem.get_attribute("href")
                    if not pdf_url or pdf_url in seen_urls:
                        continue
                    raw_title = (a_elem.text or "").strip().replace("\n", "")
                    if not raw_title or "点击下载" in raw_title:
                        continue
                    parent_text = ""
                    try:
                        parent_text = a_elem.find_element("xpath", "./ancestor::*[self::li or self::tr or self::dd][1]").text
                    except Exception:
                        parent_text = raw_title
                    if not _date_in_range(parent_text, date_start, date_end):
                        continue
                    seen_urls.add(pdf_url)
                    # Skip if already collected
                    if os.path.exists(os.path.join(save_dir, safe_pdf_name(raw_title))):
                        continue
                    if _download_pdf_with_fallback(driver, pdf_url, save_dir, raw_title, referer=url):
                        downloaded_count += 1
                        _report_progress(progress_cb, downloaded_count, max_files, save_dir, raw_title + ".pdf")
                        continue
                    clean_title = safe_pdf_name(raw_title)
                    original_filename = pdf_url.split("/")[-1].split("?")[0]
                    rename_tasks[original_filename] = clean_title
                    driver.execute_script(f"window.open('{pdf_url}', '_blank');")
                    time.sleep(2.5)
                    if len(driver.window_handles) > 1:
                        for handle in driver.window_handles:
                            if handle != main_window:
                                driver.switch_to.window(handle)
                                driver.close()
                        driver.switch_to.window(main_window)

                wait_for_downloads(save_dir)
                time.sleep(1)
                files_after = set(os.listdir(save_dir))
                new_files = files_after - files_before
                logger.info("SSE page %d: %d new files (%d -> %d)", page, len(new_files), len(files_before), len(files_after))

                for old_name, new_name in rename_tasks.items():
                    old_path = os.path.join(save_dir, old_name)
                    new_path = os.path.join(save_dir, new_name)
                    if os.path.exists(old_path):
                        if os.path.exists(new_path):
                            base, ext = os.path.splitext(new_name)
                            new_path = os.path.join(save_dir, f"{base}_{int(time.time() * 1000)}{ext}")
                        try:
                            os.rename(old_path, new_path)
                        except OSError:
                            pass
                    downloaded_count += 1
                    _report_progress(progress_cb, downloaded_count, max_files, save_dir, new_name)
                rename_tasks.clear()

                if max_files > 0 and downloaded_count >= max_files:
                    logger.info("SSE: reached max_files=%d, stopping pagination", max_files)
                    break

                if page < max_pages:
                    try:
                        candidates = [
                            ("pagination next", "//div[contains(@class,'pagination')]//a[contains(text(),'下一页')]"),
                            ("pagination next li", "//li[contains(@class,'next')]//a"),
                            ("generic next", "//a[contains(text(),'下一页') or contains(text(),'下页')]"),
                        ]
                        next_btn, _, _ = find_with_fallback(driver, candidates, timeout=3)
                        if next_btn is None:
                            logger.info("SSE: no next page button, stopping")
                            break
                        driver.execute_script("arguments[0].click();", next_btn)
                        time.sleep(4)
                    except Exception:
                        logger.info("SSE: next page failed, stopping")
                        break
            except Exception as e:
                logger.error("SSE: page %d error: %s", page, e)
                break
    finally:
        driver.quit()

    return {"source": source, "files_downloaded": downloaded_count, "records": downloaded_count, "save_dir": save_dir}


def _scrape_szse(config: dict) -> dict:
    """深交所 — 自律监管措施."""
    source = config.get("source", "szse")
    max_pages = min(config.get("max_pages", 5), 50)
    max_files = config.get("max_files", 0) or 0
    date_start = config.get("date_start", "")
    date_end = config.get("date_end", "")
    save_dir = os.path.join(DATA_DIR, "risk_events", source)
    os.makedirs(save_dir, exist_ok=True)
    progress_cb = config.get("progress_callback")
    downloaded_count = 0  # Only new files this session

    driver = create_driver(download_dir=save_dir, headless=bool(config.get("headless", False)))
    try:
        url = "https://www.szse.cn/disclosure/supervision/measure/pushish/index.html"
        logger.info(f"SZSE: opening {url}")
        driver.get(url)
        main_window = driver.current_window_handle
        time.sleep(4)
        _apply_date_filter(driver, "szse", date_start, date_end)
        rename_tasks: dict[str, str] = {}

        for page in range(1, max_pages + 1):
            logger.info(f"SZSE: scraping page {page}/{max_pages}")
            try:
                time.sleep(2)
                files_before = set(os.listdir(save_dir))
                rows = driver.find_elements("xpath", "//tbody/tr")
                for row in rows:
                    if max_files > 0:
                        if downloaded_count >= max_files:
                            logger.info("SZSE: reached max_files=%s, stopping on this page", max_files)
                            break
                    try:
                        if not _date_in_range(row.text, date_start, date_end):
                            continue
                        title_elem = row.find_element("xpath", "./td[contains(@class, 'text-left')]")
                        a_elem = row.find_element("xpath", ".//a[@encode-open]")
                        raw_title = title_elem.text.strip().replace("\n", "")
                        clean_title = safe_pdf_name(raw_title)
                        encode_open = a_elem.get_attribute("encode-open")
                        href = a_elem.get_attribute("href")
                        # Skip if already collected
                        if os.path.exists(os.path.join(save_dir, safe_pdf_name(raw_title))):
                            continue
                        if href and _download_pdf_with_fallback(driver, href, save_dir, raw_title, referer=url):
                            downloaded_count += 1
                            _report_progress(progress_cb, downloaded_count, max_files, save_dir, raw_title + ".pdf")
                            continue
                        if encode_open:
                            original_filename = encode_open.split("/")[-1]
                            rename_tasks[original_filename] = clean_title
                        driver.execute_script("arguments[0].click();", a_elem)
                        time.sleep(2.5)
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
                logger.info("SZSE page %d: download verification — %d new files (%d before → %d after)",
                            page, len(new_files), len(files_before), len(files_after))

                for old_name, new_name in rename_tasks.items():
                    old_path = os.path.join(save_dir, old_name)
                    new_path = os.path.join(save_dir, new_name)
                    if os.path.exists(old_path):
                        if os.path.exists(new_path):
                            base, ext = os.path.splitext(new_name)
                            new_path = os.path.join(save_dir, f"{base}_{int(time.time())}{ext}")
                        try:
                            os.rename(old_path, new_path)
                        except OSError:
                            pass
                rename_tasks.clear()

                # Per-page check: stop pagination if max_files already reached
                if max_files > 0:
                    if downloaded_count >= max_files:
                        logger.info("SZSE: reached max_files=%s (current=%s), stopping", max_files, downloaded_count)
                        break

                if page < max_pages:
                    try:
                        candidates = [
                            ("pagination li.next a", "//ul[contains(@class, 'pagination')]//li[contains(@class, 'next')]/a"),
                            ("pagination next link", "//a[contains(text(), '下一页') or contains(text(), '下页')]"),
                            ("generic next li", "//li[contains(@class, 'next')]//a"),
                        ]
                        next_btn, _, _ = find_with_fallback(driver, candidates, timeout=3)
                        if next_btn is None:
                            logger.info("SZSE: no next page button found, stopping")
                            break
                        driver.execute_script("arguments[0].click();", next_btn)
                        time.sleep(4)
                    except Exception:
                        logger.info("SZSE: no next page button, stopping")
                        break
            except Exception as e:
                logger.error(f"SZSE: error on page {page}: {e}")
                break
    finally:
        driver.quit()

    return {"source": source, "files_downloaded": downloaded_count, "records": downloaded_count, "save_dir": save_dir}


def _scrape_bse(config: dict) -> dict:
    """北交所 — 自律监管措施."""
    source = config.get("source", "bse")
    max_pages = min(config.get("max_pages", 5), 50)
    max_files = config.get("max_files", 0) or 0
    date_start = config.get("date_start", "")
    date_end = config.get("date_end", "")
    save_dir = os.path.join(DATA_DIR, "risk_events", source)
    os.makedirs(save_dir, exist_ok=True)
    progress_cb = config.get("progress_callback")
    downloaded_count = 0  # Only new files this session

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
        rename_tasks: dict[str, str] = {}

        for page in range(1, max_pages + 1):
            logger.info(f"BSE: scraping page {page}/{max_pages}")
            try:
                time.sleep(2)
                files_before = set(os.listdir(save_dir))
                pdf_links = driver.find_elements("xpath", "//a[contains(@href, '.pdf')]")
                for a_elem in pdf_links:
                    if max_files > 0:
                        if downloaded_count >= max_files:
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
                        href = a_elem.get_attribute("href")
                        # Skip if already collected
                        if os.path.exists(os.path.join(save_dir, safe_pdf_name(raw_title))):
                            continue
                        if href and _download_pdf_with_fallback(driver, href, save_dir, raw_title, referer=url):
                            downloaded_count += 1
                            _report_progress(progress_cb, downloaded_count, max_files, save_dir, raw_title + ".pdf")
                            continue
                        if href:
                            original_filename = href.split("/")[-1].split("?")[0]
                            rename_tasks[original_filename] = clean_title
                        driver.execute_script("arguments[0].click();", a_elem)
                        time.sleep(2.5)
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

                for old_name, new_name in rename_tasks.items():
                    old_path = os.path.join(save_dir, old_name)
                    new_path = os.path.join(save_dir, new_name)
                    if os.path.exists(old_path):
                        if os.path.exists(new_path):
                            base, ext = os.path.splitext(new_name)
                            new_path = os.path.join(save_dir, f"{base}_{int(time.time())}{ext}")
                        try:
                            os.rename(old_path, new_path)
                        except OSError:
                            pass
                    downloaded_count += 1
                    _report_progress(progress_cb, downloaded_count, max_files, save_dir, new_name)
                rename_tasks.clear()

                # Per-page check: stop pagination if max_files already reached
                if max_files > 0:
                    if downloaded_count >= max_files:
                        logger.info("BSE: reached max_files=%s (current=%s), stopping", max_files, downloaded_count)
                        break

                if page < max_pages:
                    try:
                        candidates = [
                            ("a.next", "//a[@class='next']"),
                            ("a.lastpage to go to last", "//a[@class='lastpage']"),
                            ("pagination next link", "//a[contains(text(), '下一页') or contains(text(), '下页')]"),
                            ("generic a.next class", "//a[contains(@class, 'next')]"),
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

    return {"source": source, "files_downloaded": downloaded_count, "records": downloaded_count, "save_dir": save_dir}


def run_risk_event_scraper(config: dict) -> dict:
    """Entry point: dispatch to source-specific scraper."""
    source = config.get("source", "sse")
    max_pages = int(config.get("max_pages", 5) or 0)
    if max_pages <= 0:
        save_dir = os.path.join(DATA_DIR, "risk_events", source)
        ensure_dir(save_dir)
        return {"source": source, "files_downloaded": 0, "records": 0, "save_dir": save_dir}
    scraper_fns = {"sse": _scrape_sse, "szse": _scrape_szse, "bse": _scrape_bse}
    fn = scraper_fns.get(source, _scrape_sse)
    logger.info(
        "RiskEvent scraper: source=%s headless=%s data_dir=%s",
        source,
        config.get("headless", False) or os.getenv("SCRAPER_HEADLESS", ""),
        DATA_DIR,
    )
    return fn(config)


# ── Demo / Mock ─────────────────────────────────────────────────────────────

DEMO_EVENT_TITLES = [
    "关于收到中国证券监督管理委员会立案告知书的公告",
    "关于公司股票交易异常波动的公告",
    "关于涉及诉讼的公告",
    "关于收到行政处罚决定书的公告",
    "关于公司股票交易被实施退市风险警示的公告",
    "关于控股股东所持股份被司法冻结的公告",
    "关于公司及实际控制人收到监管函的公告",
    "关于重大资产重组进展暨风险提示公告",
    "关于公司股票被实施其他风险警示的公告",
    "关于收到民事判决书的公告",
    "关于控股股东部分股份被司法拍卖的进展公告",
    "关于收到纪律处分决定书的公告",
    "关于公司股票存在终止上市风险的提示性公告",
    "关于子公司涉及重大诉讼的公告",
    "关于收到责令改正措施决定的公告",
    "关于被债权人申请重整的提示性公告",
    "关于违规担保事项的进展公告",
    "关于公司及相关人员收到警示函的公告",
    "关于业绩预告修正暨亏损扩大的公告",
    "关于公司股票交易异常波动暨风险提示的公告",
]


def run_risk_event_demo(config: dict) -> dict:
    """Demo mode — generate realistic mock PDF files without WebDriver.

    Creates actual PDF files (with valid PDF headers) so they flow through
    the ETL pipeline identically to real scraped files.
    """
    source = config.get("source", "sse")
    source_labels = {"sse": "上交所", "szse": "深交所", "bse": "北交所"}
    label = source_labels.get(source, source)
    max_pages = min(config.get("max_pages", 5), 50)
    max_files = config.get("max_files", 0) or 0

    save_dir = os.path.join(DATA_DIR, "risk_events", source)
    ensure_dir(save_dir)

    # Clean up previous demo files so counts are accurate per-run
    for old_name in os.listdir(save_dir):
        old_path = os.path.join(save_dir, old_name)
        if os.path.isfile(old_path) and old_name.startswith("DEMO_"):
            try:
                os.remove(old_path)
            except OSError:
                pass

    num_files = min(random.randint(8, 20), max_pages * 15)
    if max_files > 0:
        num_files = min(num_files, max_files)
    demo_companies = ["华泽钴镍", "康美药业", "乐视网", "獐子岛", "獐盛", "辅仁药业",
                       "ST保力", "易见股份", "恒大地产", "浪奇", "爱迪尔", "东方集团",
                       "中泰化学", "蓝盾股份", "富控互动", "金正大", "美尚生态"]

    files_created = 0
    for i in range(num_files):
        title = random.choice(DEMO_EVENT_TITLES)
        company = random.choice(demo_companies)
        date_str = f"2026-{(i % 5) + 1:02d}-{(i % 28) + 1:02d}"
        filename = f"DEMO_{label}_{date_str}_{company}_{title[:25]}.pdf"
        filename = filename.replace("/", "-").replace("\\", "-").replace(":", "-").replace("*", "").replace("?", "").replace('"', "").replace("<", "").replace(">", "").replace("|", "")

        filepath = os.path.join(save_dir, filename)
        _write_minimal_pdf(filepath, title, company, date_str)
        files_created += 1

    logger.info("Demo RiskEvent [%s]: %d mock PDF files created in %s", source, files_created, save_dir)
    return {
        "source": source,
        "files_downloaded": files_created,
        "records": files_created,
        "save_dir": save_dir,
    }


def _write_minimal_pdf(filepath: str, title: str, company: str, date_str: str) -> None:
    """Write a minimal but valid PDF file for demo/testing purposes."""
    pdf_content = (
        f"%PDF-1.4\n"
        f"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        f"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        f"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n"
        f"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n"
        f"trailer<</Size 4/Root 1 0 R>>\n"
        f"startxref\n190\n%%EOF\n"
        f"\n"
        f"=== DEMO RISK EVENT ===\n"
        f"Title: {title}\n"
        f"Company: {company}\n"
        f"Date: {date_str}\n"
        f"Source: WindEye Demo Scraper\n"
        f"Content: This is a mock risk event document for ETL pipeline testing.\n"
    )
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(pdf_content)
