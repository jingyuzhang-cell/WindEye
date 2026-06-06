"""Risk Event Scraper — 风险事件爬取 (SSE/SZSE/BSE disciplinary actions & litigation).

Sources: sse (上交所), szse (深交所), bse (北交所)
Temp dir: data/risk_events/{source}/
"""

from __future__ import annotations

import logging
import os
import random
import time

from data_collection.scrapers.utils import (
    create_chrome_driver,
    ensure_dir,
    find_with_fallback,
    log_element_failure,
    wait_for_downloads,
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

logger = logging.getLogger(__name__)

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

    if date_start or date_end:
        logger.warning(
            "SSE: date_start=%s date_end=%s — date filtering on SSE requires "
            "interacting with the website's date picker (not yet implemented). "
            "All pages within max_pages=%s will be scraped.",
            date_start, date_end, max_pages,
        )

    TYPE_MAP = {
        "股票交易异常波动和澄清": "13",
        "诉讼和仲裁": "26",
        "风险警示": "31",
    }

    driver = create_chrome_driver(download_dir=save_dir)
    try:
        url = "https://www.sse.com.cn/disclosure/listedinfo/announcement/"
        logger.info(f"SSE: opening {url}")
        driver.get(url)
        main_window = driver.current_window_handle
        time.sleep(5)

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
                log_element_failure(
                    logger, "SSE-category", f"checkbox {name} (type_id={type_id})",
                    page_url=url,
                )
                continue
            try:
                driver.execute_script("arguments[0].click();", elem)
                logger.info("SSE: checked category '%s' via %s", name, matched_desc)
                time.sleep(1.5)
            except Exception as e:
                log_element_failure(
                    logger, "SSE-category", f"click {name}", matched_xpath, e, url,
                )

        time.sleep(3)
        rename_tasks: dict[str, str] = {}

        for page in range(1, max_pages + 1):
            logger.info(f"SSE: scraping page {page}/{max_pages}")
            try:
                time.sleep(2)
                files_before = set(os.listdir(save_dir))
                pdf_links = driver.find_elements("xpath", "//a[contains(@href, '.pdf')]")
                queued_before = len(rename_tasks)
                seen_urls: set[str] = set()
                for a_elem in pdf_links:
                    # Check max_files per-file (before clicking more links)
                    if max_files > 0:
                        already_downloaded = len([f for f in os.listdir(save_dir) if f.endswith(".pdf")])
                        if already_downloaded + len(rename_tasks) - queued_before >= max_files:
                            logger.info("SSE: reached max_files=%s, stopping on this page", max_files)
                            break
                    pdf_url = a_elem.get_attribute("href")
                    if not pdf_url or pdf_url in seen_urls:
                        continue
                    raw_title = (a_elem.text or "").strip().replace("\n", "")
                    if not raw_title or "点击下载" in raw_title:
                        continue
                    seen_urls.add(pdf_url)
                    clean_title = raw_title.replace("/", "-").replace("\\", "-").replace(":", "-").replace("*", "").replace("?", "").replace('"', "").replace("<", "").replace(">", "").replace("|", "")
                    original_filename = pdf_url.split("/")[-1].split("?")[0]
                    rename_tasks[original_filename] = f"{clean_title}.pdf"
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
                logger.info("SSE page %d: download verification — %d new files (%d before → %d after)",
                            page, len(new_files), len(files_before), len(files_after))

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
                rename_tasks.clear()

                # Per-page check: stop pagination if max_files already reached
                if max_files > 0:
                    current_count = len([f for f in os.listdir(save_dir) if f.endswith(".pdf")])
                    if current_count >= max_files:
                        logger.info("SSE: reached max_files=%s (current=%s), stopping", max_files, current_count)
                        break

                if page < max_pages:
                    try:
                        candidates = [
                            ("pagination next link", "//div[contains(@class, 'pagination-box')]//a[contains(text(), '下一页')]"),
                            ("pagination next li", "//li[contains(@class, 'next')]//a"),
                            ("generic next link", "//a[contains(text(), '下一页') or contains(text(), '下页')]"),
                        ]
                        next_btn, _, _ = find_with_fallback(driver, candidates, timeout=3)
                        if next_btn is None:
                            logger.info("SSE: no next page button found, stopping")
                            break
                        driver.execute_script("arguments[0].click();", next_btn)
                        time.sleep(4)
                    except Exception:
                        logger.info("SSE: no next page button, stopping")
                        break
            except Exception as e:
                logger.error(f"SSE: error on page {page}: {e}")
                break

    finally:
        driver.quit()

    files = [f for f in os.listdir(save_dir) if f.endswith(".pdf")] if os.path.isdir(save_dir) else []
    return {"source": source, "files_downloaded": len(files), "records": len(files), "save_dir": save_dir}


def _scrape_szse(config: dict) -> dict:
    """深交所 — 自律监管措施."""
    source = config.get("source", "szse")
    max_pages = min(config.get("max_pages", 5), 50)
    max_files = config.get("max_files", 0) or 0
    date_start = config.get("date_start", "")
    date_end = config.get("date_end", "")
    save_dir = os.path.join(DATA_DIR, "risk_events", source)
    os.makedirs(save_dir, exist_ok=True)

    if date_start or date_end:
        logger.warning(
            "SZSE: date_start=%s date_end=%s — date filtering not yet implemented. "
            "All pages within max_pages=%s will be scraped.",
            date_start, date_end, max_pages,
        )

    driver = create_chrome_driver(download_dir=save_dir)
    try:
        url = "https://www.szse.cn/disclosure/supervision/measure/pushish/index.html"
        logger.info(f"SZSE: opening {url}")
        driver.get(url)
        main_window = driver.current_window_handle
        rename_tasks: dict[str, str] = {}

        for page in range(1, max_pages + 1):
            logger.info(f"SZSE: scraping page {page}/{max_pages}")
            try:
                time.sleep(2)
                files_before = set(os.listdir(save_dir))
                rows = driver.find_elements("xpath", "//tbody/tr")
                queued_before = len(rename_tasks)
                for row in rows:
                    # Check max_files per-file (before clicking more links)
                    if max_files > 0:
                        already_downloaded = len([f for f in os.listdir(save_dir) if f.endswith(".pdf")])
                        if already_downloaded + len(rename_tasks) - queued_before >= max_files:
                            logger.info("SZSE: reached max_files=%s, stopping on this page", max_files)
                            break
                    try:
                        title_elem = row.find_element("xpath", "./td[contains(@class, 'text-left')]")
                        a_elem = row.find_element("xpath", ".//a[@encode-open]")
                        raw_title = title_elem.text.strip().replace("\n", "")
                        clean_title = raw_title.replace("/", "-").replace(":", "-").replace("*", "").replace("?", "").replace('"', "").replace("<", "").replace(">", "").replace("|", "")
                        encode_open = a_elem.get_attribute("encode-open")
                        if encode_open:
                            original_filename = encode_open.split("/")[-1]
                            rename_tasks[original_filename] = f"{clean_title}.pdf"
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
                    current_count = len([f for f in os.listdir(save_dir) if f.endswith(".pdf")])
                    if current_count >= max_files:
                        logger.info("SZSE: reached max_files=%s (current=%s), stopping", max_files, current_count)
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

    files = [f for f in os.listdir(save_dir) if f.endswith(".pdf")] if os.path.isdir(save_dir) else []
    return {"source": source, "files_downloaded": len(files), "records": len(files), "save_dir": save_dir}


def _scrape_bse(config: dict) -> dict:
    """北交所 — 自律监管措施."""
    source = config.get("source", "bse")
    max_pages = min(config.get("max_pages", 5), 50)
    max_files = config.get("max_files", 0) or 0
    date_start = config.get("date_start", "")
    date_end = config.get("date_end", "")
    save_dir = os.path.join(DATA_DIR, "risk_events", source)
    os.makedirs(save_dir, exist_ok=True)

    if date_start or date_end:
        logger.warning(
            "BSE: date_start=%s date_end=%s — date filtering not yet implemented. "
            "All pages within max_pages=%s will be scraped.",
            date_start, date_end, max_pages,
        )

    driver = create_chrome_driver(download_dir=save_dir)
    try:
        BSE_URLS = [
            "https://www.bse.cn/disclosure/disciplinary_aciton.html",
            "https://www.bse.cn/disclosure/disciplinary_action.html",
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
        main_window = driver.current_window_handle
        rename_tasks: dict[str, str] = {}

        for page in range(1, max_pages + 1):
            logger.info(f"BSE: scraping page {page}/{max_pages}")
            try:
                time.sleep(2)
                files_before = set(os.listdir(save_dir))
                pdf_links = driver.find_elements("xpath", "//a[contains(@href, '.pdf')]")
                queued_before = len(rename_tasks)
                for a_elem in pdf_links:
                    # Check max_files per-file (before clicking more links)
                    if max_files > 0:
                        already_downloaded = len([f for f in os.listdir(save_dir) if f.endswith(".pdf")])
                        if already_downloaded + len(rename_tasks) - queued_before >= max_files:
                            logger.info("BSE: reached max_files=%s, stopping on this page", max_files)
                            break
                    try:
                        raw_title = a_elem.get_attribute("title") or a_elem.text
                        if not raw_title:
                            continue
                        clean_title = raw_title.strip().replace("/", "-").replace(":", "-").replace("*", "").replace("?", "").replace('"', "").replace("<", "").replace(">", "").replace("|", "").replace("\n", "")
                        href = a_elem.get_attribute("href")
                        if href:
                            original_filename = href.split("/")[-1]
                            rename_tasks[original_filename] = f"{clean_title}.pdf"
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
                rename_tasks.clear()

                # Per-page check: stop pagination if max_files already reached
                if max_files > 0:
                    current_count = len([f for f in os.listdir(save_dir) if f.endswith(".pdf")])
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

    files = [f for f in os.listdir(save_dir) if f.endswith(".pdf")] if os.path.isdir(save_dir) else []
    return {"source": source, "files_downloaded": len(files), "records": len(files), "save_dir": save_dir}


def run_risk_event_scraper(config: dict) -> dict:
    """Entry point: dispatch to source-specific scraper."""
    source = config.get("source", "sse")
    scraper_fns = {"sse": _scrape_sse, "szse": _scrape_szse, "bse": _scrape_bse}
    fn = scraper_fns.get(source, _scrape_sse)
    logger.info(f"RiskEvent scraper: running {source}")
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
