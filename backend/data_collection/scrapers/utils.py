"""Shared browser and download utilities for scrapers.

Consolidates common/browser.py and common/download.py into a single module.
"""

from __future__ import annotations

import functools
import logging
import os
import re
import shutil
import time
from html import unescape
from typing import Optional, Set

import requests
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.edge.service import Service as EdgeService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

logger = logging.getLogger(__name__)


# ── Browser drivers ──────────────────────────────────────────────────────

def _chrome_driver_path() -> Optional[str]:
    """Find chromedriver: explicit env var > standard locations > PATH > None."""
    explicit = os.getenv("CHROMEDRIVER_PATH", "")
    if explicit and os.path.isfile(explicit):
        return explicit
    # Common chromedriver locations (including manually downloaded ones)
    candidates = [
        r"D:\chromedriver-win64-148\chromedriver.exe",
        r"D:\chromedriver-win64\chromedriver.exe",
        r"C:\Program Files\Google\Chrome\Application\chromedriver.exe",
    ]
    for p in candidates:
        if os.path.isfile(p):
            return p
    found = shutil.which("chromedriver")
    if found:
        return found
    return None


def _add_anti_detection(driver: webdriver.Chrome | webdriver.Edge) -> None:
    """Hide webdriver-specific JS properties to work around bot detection."""
    script = """
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
    """
    try:
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": script})
    except Exception:
        pass


def create_chrome_driver(
    download_dir: Optional[str] = None,
    headless: bool = False,
    page_load_strategy: str = "normal",
    page_load_timeout: float = 60.0,
) -> webdriver.Chrome:
    """Create a Chrome WebDriver with consistent options and anti-detection.

    Sets page_load_timeout to prevent driver.get() from hanging indefinitely
    on slow/unreachable sites (default 60s, configurable via env var).
    """
    options = webdriver.ChromeOptions()
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--ignore-certificate-errors")
    options.add_argument("--ignore-ssl-errors")

    if headless:
        options.add_argument("--headless")

    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    options.page_load_strategy = page_load_strategy

    if download_dir:
        os.makedirs(download_dir, exist_ok=True)
        prefs = {
            "download.default_directory": os.path.abspath(download_dir),
            "download.prompt_for_download": False,
            "plugins.always_open_pdf_externally": True,
            "profile.default_content_setting_values.automatic_downloads": 1,
        }
        options.add_experimental_option("prefs", prefs)

    driver_path = _chrome_driver_path()
    if driver_path:
        logger.info("Using chromedriver at: %s", driver_path)
        driver = webdriver.Chrome(service=ChromeService(driver_path), options=options)
    else:
        logger.info("chromedriver not found on PATH or standard locations, trying auto-discovery...")
        try:
            driver = webdriver.Chrome(options=options)
        except Exception as e:
            raise RuntimeError(
                "Chrome WebDriver 未找到，无法启动真实爬虫。\n"
                "请下载 Chrome 浏览器和对应版本的 chromedriver:\n"
                "  1. 下载 Chrome: https://www.google.com/chrome/\n"
                "  2. 下载 chromedriver: https://chromedriver.chromium.org/\n"
                "  3. 将 chromedriver.exe 放到以下位置之一:\n"
                "     - D:\\chromedriver-win64\\chromedriver.exe\n"
                "     - C:\\Program Files\\Google\\Chrome\\Application\\chromedriver.exe\n"
                "     - 添加到系统 PATH\n"
                f"原始错误: {e}"
            ) from e

    timeout = float(os.getenv("CHROME_PAGE_LOAD_TIMEOUT", str(page_load_timeout)))
    driver.set_page_load_timeout(timeout)
    driver.set_script_timeout(timeout)
    logger.info("ChromeDriver page_load_timeout=%.0fs, script_timeout=%.0fs", timeout, timeout)

    _add_anti_detection(driver)
    return driver


def create_edge_driver(
    download_dir: Optional[str] = None,
    headless: bool = False,
    page_load_timeout: float = 60.0,
) -> webdriver.Edge:
    """Create an Edge WebDriver with consistent options and anti-detection."""
    options = webdriver.EdgeOptions()
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument(
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0"
    )

    if headless:
        options.add_argument("--headless")

    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    if download_dir:
        os.makedirs(download_dir, exist_ok=True)
        prefs = {
            "download.default_directory": os.path.abspath(download_dir),
            "download.prompt_for_download": False,
            "plugins.always_open_pdf_externally": True,
            "profile.default_content_setting_values.automatic_downloads": 1,
        }
        options.add_experimental_option("prefs", prefs)

    edge_driver_path = os.getenv("EDGEDRIVER_PATH", "")
    if edge_driver_path and os.path.isfile(edge_driver_path):
        driver = webdriver.Edge(service=EdgeService(edge_driver_path), options=options)
    else:
        driver = webdriver.Edge(options=options)

    timeout = float(os.getenv("CHROME_PAGE_LOAD_TIMEOUT", str(page_load_timeout)))
    driver.set_page_load_timeout(timeout)
    driver.set_script_timeout(timeout)

    _add_anti_detection(driver)
    return driver


# ── Download helpers ──────────────────────────────────────────────────────

def wait_for_downloads(
    directory: str,
    timeout: int = 60,
    poll_interval: float = 1.0,
) -> bool:
    """Wait until no .crdownload or .tmp files exist in *directory*."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        downloading = any(
            name.lower().endswith((".crdownload", ".tmp"))
            for name in os.listdir(directory)
        )
        if not downloading:
            return True
        time.sleep(poll_interval)
    return False


def wait_for_new_file(
    directory: str,
    before_files: Set[str],
    timeout: int = 45,
    poll_interval: float = 1.0,
) -> Optional[str]:
    """Wait for a new, fully-downloaded file (>1KB) to appear.

    Returns the absolute path of the newest file, or None on timeout.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            current = set(os.listdir(directory))
        except FileNotFoundError:
            time.sleep(poll_interval)
            continue

        new_files = current - before_files
        done = []
        for name in new_files:
            low = name.lower()
            if low.endswith((".crdownload", ".tmp")):
                continue
            full = os.path.join(directory, name)
            if os.path.isfile(full) and os.path.getsize(full) > 1024:
                done.append(full)

        if done:
            done.sort(key=lambda p: os.path.getmtime(p), reverse=True)
            return done[0]

        time.sleep(poll_interval)
    return None


def safe_filename(title: str, max_len: int = 120) -> str:
    """Sanitize a string into a safe filename."""
    title = unescape(title or "").strip()
    title = re.sub(r'[\\/:*?"<>|]', "", title)
    title = " ".join(title.split())
    if not title:
        title = "untitled"
    if len(title) > max_len:
        title = title[:max_len].rstrip()
    return title


def safe_pdf_name(title: str, max_len: int = 120) -> str:
    """Sanitize a title into a safe .pdf filename."""
    name = safe_filename(title, max_len)
    if not name.lower().endswith(".pdf"):
        name += ".pdf"
    return name


def is_valid_pdf(path: str, min_size: int = 1024) -> bool:
    """Check if a file exists, has minimum size, and starts with PDF magic bytes."""
    if not os.path.isfile(path) or os.path.getsize(path) < min_size:
        return False
    try:
        with open(path, "rb") as f:
            magic = f.read(4)
        return magic == b"%PDF"
    except OSError:
        return False


def load_existing_pdf_names(*directories: str) -> Set[str]:
    """Collect lowercase .pdf basenames (>1KB) from one or more directories."""
    names: Set[str] = set()
    for d in directories:
        if not d or not os.path.isdir(d):
            continue
        try:
            for name in os.listdir(d):
                if name.lower().endswith(".pdf") and os.path.getsize(os.path.join(d, name)) > 1024:
                    names.add(name.lower())
        except OSError:
            pass
    return names


def ensure_dir(*paths: str) -> None:
    """Create directories if they don't exist."""
    for p in paths:
        os.makedirs(p, exist_ok=True)


# ── Scraper robustness helpers ──────────────────────────────────────────────

def find_with_fallback(
    driver: webdriver.Chrome,
    xpath_candidates: list[tuple[str, str]],
    timeout: float = 5.0,
):
    """Try multiple XPath selectors, returning (element, matched_description, xpath).

    Returns (None, None, None) if none matched.
    """
    for desc, xpath in xpath_candidates:
        try:
            elem = WebDriverWait(driver, timeout).until(
                EC.presence_of_element_located((By.XPATH, xpath))
            )
            logger.info("Structure check: matched '%s' -> %s", desc, xpath)
            return elem, desc, xpath
        except Exception:
            continue
    logger.error(
        "Structure change detected: none of %d selectors matched. Candidates: %s",
        len(xpath_candidates),
        [x[1] for x in xpath_candidates],
    )
    return None, None, None


def log_element_failure(
    scraper_logger,
    page_label: str,
    element_desc: str,
    xpath: str = "",
    exception: Exception | None = None,
    page_url: str = "",
) -> None:
    """Structured logging for element-not-found or interaction failures."""
    scraper_logger.error(
        "Scraper element failure: page=%s element=%s xpath=%s url=%s error=%s",
        page_label,
        element_desc,
        xpath,
        page_url,
        str(exception) if exception else "unknown",
    )


def retry_on_network_error(max_attempts: int = 3, base_delay: float = 2.0):
    """Decorator: retry function on network-related exceptions with exponential backoff."""
    NETWORK_ERRORS = (
        requests.ConnectionError,
        requests.Timeout,
        requests.HTTPError,
        ConnectionError,
        TimeoutError,
        OSError,
    )

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_err = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except NETWORK_ERRORS as e:
                    last_err = e
                    if attempt < max_attempts:
                        delay = base_delay * (2 ** (attempt - 1))
                        logger.warning(
                            "Retry %d/%d after %.1fs: %s - %s",
                            attempt, max_attempts, delay, func.__name__, e,
                        )
                        time.sleep(delay)
                except Exception:
                    raise
            raise last_err  # type: ignore[misc]

        return wrapper

    return decorator
