"""Free data-source channels for executive crawling.

Implements:
- ``AiqichaSource`` — 百度爱企查 (free tier, HTML scraping)
- ``GsxtSource`` — 国家企业信用信息公示系统 (stub: CAPTCHA-gated)

Both sources inherit from ``ExecutiveDataSource`` and respect the
rate limiter configured in ``rate_limiter.py``.
"""

from __future__ import annotations

import logging
import os
import re
import time
from typing import Optional

import requests
from bs4 import BeautifulSoup

from .base import ExecutiveDataSource, ExecutiveResult, LegalPersonResult
from data_collection.scrapers.utils import retry_on_network_error

logger = logging.getLogger(__name__)

# ── User-Agent rotation ──────────────────────────────────────────────────

_USER_AGENTS = [
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
]

_UA_INDEX = 0


def _rotate_ua() -> str:
    global _UA_INDEX
    ua = _USER_AGENTS[_UA_INDEX]
    _UA_INDEX = (_UA_INDEX + 1) % len(_USER_AGENTS)
    return ua


# ── Shared helpers ───────────────────────────────────────────────────────

def _clean_name(raw: str) -> str:
    """Strip whitespace, remove common noise characters from names."""
    if not raw:
        return ""
    name = raw.strip()
    # Remove parenthetical annotations like "(董事长)" from already-split names
    name = re.sub(r"[（(][^)）]*[)）]", "", name)
    name = re.sub(r"\s+", "", name)
    return name


def _extract_credit_code_from_html(soup: BeautifulSoup) -> str | None:
    """Try to locate a unified social credit code in a detail page."""
    # Common patterns on Chinese business registry pages
    patterns = [
        r"统一社会信用代码[：:]\s*([0-9A-Za-z]{18})",
        r"信用代码[：:]\s*([0-9A-Za-z]{18})",
    ]
    text = soup.get_text()
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            return m.group(1)
    return None


# =========================================================================
# AiqichaSource — 百度爱企查
# =========================================================================

class AiqichaSource(ExecutiveDataSource):
    """Fetch legal rep and executives from 百度爱企查 (aiqicha.baidu.com).

    Uses HTTP requests + BeautifulSoup to scrape the public search and
    detail pages.  Rate-limited to ~1 req / 3 s by default.

    Limitations
    -----------
    - Heavily JavaScript-rendered; basic HTML parsing may miss data
      if Baidu deploys aggressive anti-bot measures.
    - No ID card numbers available on the free public pages.
    - May trigger CAPTCHA after ~20-30 requests from a single IP.
    """

    source_name = "aiqicha"
    priority = 0
    channel_type = "free"

    BASE_URL = "https://aiqicha.baidu.com"
    SEARCH_URL = "https://aiqicha.baidu.com/s"
    _TIMEOUT = 15.0

    def __init__(self) -> None:
        super().__init__()
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": _rotate_ua(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Referer": "https://aiqicha.baidu.com/",
        })

    # -- internal helpers ---------------------------------------------------

    @retry_on_network_error(max_attempts=3, base_delay=2.0)
    def _get(self, url: str, params: dict | None = None) -> requests.Response:
        """HTTP GET with retry and timeout."""
        self._session.headers["User-Agent"] = _rotate_ua()
        resp = self._session.get(url, params=params, timeout=self._TIMEOUT)
        resp.raise_for_status()

        # Detect anti-bot page
        text_snippet = resp.text[:500].lower() if resp.text else ""
        if any(kw in text_snippet for kw in ("验证", "captcha", "请点击", "滑块")):
            logger.warning(
                "%s: CAPTCHA or verification page detected for URL %s",
                self.source_name, url,
            )
        return resp

    def _search_company(
        self, company_name: str, credit_code: str | None = None
    ) -> str | None:
        """Search for a company and return its detail page URL, or None."""
        # Prefer credit code for accuracy
        query = credit_code if credit_code else company_name
        params = {"q": query, "t": "0"}  # t=0 → 企业

        try:
            resp = self._get(self.SEARCH_URL, params=params)
        except Exception:
            logger.exception("%s: search request failed for '%s'", self.source_name, query)
            return None

        soup = BeautifulSoup(resp.text, "html.parser")

        # Try multiple selectors for search result links
        selectors = [
            "a[href*='/company_detail_']",
            ".result-list a[href*='/company_detail']",
            ".search-result a[href*='/company_detail']",
            "a[href*='company_detail']",
        ]

        for sel in selectors:
            links = soup.select(sel)
            for link in links:
                href = link.get("href", "")
                if href and "company_detail" in href:
                    # Also verify the company name matches (fuzzy)
                    link_text = link.get_text(strip=True)
                    if (company_name[:4] in link_text or
                            (credit_code and credit_code[:6] in link_text)):
                        if href.startswith("http"):
                            return href
                        return self.BASE_URL + href

        # Fallback: return the first detail link even without name match
        for sel in selectors:
            links = soup.select(sel)
            for link in links:
                href = link.get("href", "")
                if href and "company_detail" in href:
                    if href.startswith("http"):
                        return href
                    return self.BASE_URL + href

        logger.info("%s: no search result for '%s'", self.source_name, query)
        return None

    def _parse_detail_page(self, html: str) -> dict:
        """Extract legal rep and executives from a company detail page.

        Returns a dict with keys ``legal_rep`` (dict or None) and
        ``executives`` (list of dicts).
        """
        result: dict = {"legal_rep": None, "executives": []}
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(" ", strip=True)

        # --- Legal representative ---
        # Common label patterns on Chinese business registry pages
        legal_patterns = [
            r"法定代表人[：:]\s*([^\s，,]{2,6})",
            r"法定代表人\s*[　]?\s*([^\s，,]{2,6})",
            r"负责人[：:]\s*([^\s，,]{2,6})",
        ]
        for pat in legal_patterns:
            m = re.search(pat, text)
            if m:
                name = _clean_name(m.group(1))
                if name and len(name) >= 2:
                    result["legal_rep"] = {"name": name, "position": "法定代表人"}
                    break

        # If no regex match, try structured table rows
        if not result["legal_rep"]:
            rows = soup.select("tr, .info-row, .info-item")
            for row in rows:
                row_text = row.get_text(" ", strip=True)
                if "法定代表人" in row_text or "法人" in row_text:
                    # Extract the name — look for Chinese characters after the label
                    m = re.search(r"(?:法定代表人|法人)[：:\s]*([^\s]{2,6})", row_text)
                    if m:
                        name = _clean_name(m.group(1))
                        if name:
                            result["legal_rep"] = {"name": name, "position": "法定代表人"}
                            break

        # --- Executives (主要人员) ---
        # Look for sections labeled "主要人员" or "高管"
        exec_section_patterns = [
            r"主要人员[：:](.*?)(?:股东|出资|变更|工商|$)",
            r"高管[：:](.*?)(?:股东|出资|变更|工商|$)",
        ]

        for pat in exec_section_patterns:
            m = re.search(pat, text, re.DOTALL)
            if m:
                section_text = m.group(1)
                # Extract name-position pairs: "张三 董事长", "李四 监事"
                pairs = re.findall(
                    r"([^\s，,]{2,4})\s*(?:董事长|总经理|董事|监事|经理|财务负责人|执行董事[^兼]*|副董事长[^兼]*)",
                    section_text,
                )
                for name_raw in pairs:
                    name = _clean_name(name_raw)
                    if name:
                        # Try to get the position from context
                        pos_m = re.search(
                            rf"{re.escape(name_raw)}\s*([^\s，,]{{2,10}})",
                            section_text,
                        )
                        pos = pos_m.group(1) if pos_m else "高管"
                        result["executives"].append({
                            "name": name,
                            "position": _clean_name(pos),
                        })
                if result["executives"]:
                    break

        # Structured table fallback for executives
        if not result["executives"]:
            exec_tables = soup.select(
                "table:has(th:contains('姓名')), "
                ".person-table, "
                ".executive-list"
            )
            for table in exec_tables:
                rows = table.select("tr")
                for row in rows[1:]:  # skip header
                    cells = row.select("td")
                    if len(cells) >= 2:
                        name = _clean_name(cells[0].get_text())
                        position = cells[1].get_text(strip=True)
                        if name and len(name) >= 2:
                            result["executives"].append({
                                "name": name,
                                "position": position,
                            })

        return result

    # -- public API ---------------------------------------------------------

    def _fetch_legal_representative(
        self, company_name: str, credit_code: str | None
    ) -> LegalPersonResult | None:
        detail_url = self._search_company(company_name, credit_code)
        if not detail_url:
            return None

        try:
            resp = self._get(detail_url)
        except Exception:
            logger.exception("%s: failed to fetch detail page for '%s'",
                             self.source_name, company_name)
            return None

        parsed = self._parse_detail_page(resp.text)
        lp = parsed.get("legal_rep")
        if lp and lp.get("name"):
            return LegalPersonResult(
                name=lp["name"],
                id_card=None,  # Not available on free tier
                position=lp.get("position", "法定代表人"),
            )
        return None

    def _fetch_executives(
        self, company_name: str, credit_code: str | None
    ) -> list[ExecutiveResult]:
        detail_url = self._search_company(company_name, credit_code)
        if not detail_url:
            return []

        try:
            resp = self._get(detail_url)
        except Exception:
            logger.exception("%s: failed to fetch detail page for '%s'",
                             self.source_name, company_name)
            return []

        parsed = self._parse_detail_page(resp.text)
        results: list[ExecutiveResult] = []
        for exec_data in parsed.get("executives", []):
            if exec_data.get("name"):
                results.append(ExecutiveResult(
                    name=exec_data["name"],
                    id_card=None,
                    position=exec_data.get("position", ""),
                ))
        return results


# =========================================================================
# GsxtSource — 国家企业信用信息公示系统 (stub)
# =========================================================================

class GsxtSource(ExecutiveDataSource):
    """Stub for 国家企业信用信息公示系统 (www.gsxt.gov.cn).

    The GSXT website requires:
    1. A per-session CAPTCHA to perform any search.
    2. Frequent verification challenges during browsing.
    3. JavaScript rendering for most content.

    This makes automated batch crawling impractical without:
    - Manual CAPTCHA solving (or a paid solving service).
    - Selenium / Playwright for JavaScript rendering.
    - A large pool of residential proxies.

    For production use, prefer paid APIs (企查查 / 天眼查) or use the
    official GSXT API if available through a government data programme.

    This stub returns empty results with a log message explaining the
    situation.  To attempt a manual session, set the environment
    variable ``GSXT_COOKIES`` to a JSON string of cookies obtained
    from a browser session where the CAPTCHA has already been solved.
    """

    source_name = "gsxt"
    priority = 1
    channel_type = "free"

    BASE_URL = "https://www.gsxt.gov.cn"

    def __init__(self) -> None:
        super().__init__()
        self._cookies: dict = {}
        cookies_json = os.getenv("GSXT_COOKIES", "")
        if cookies_json:
            try:
                import json
                self._cookies = json.loads(cookies_json)
                logger.info("%s: using %d cookies from GSXT_COOKIES env var",
                             self.source_name, len(self._cookies))
            except Exception:
                logger.warning("%s: GSXT_COOKIES is set but not valid JSON", self.source_name)

    def _fetch_legal_representative(
        self, company_name: str, credit_code: str | None
    ) -> LegalPersonResult | None:
        if not self._cookies:
            logger.debug(
                "%s: skipped — no cookies. Set GSXT_COOKIES env var "
                "with a valid session to enable GSXT crawling.",
                self.source_name,
            )
            return None

        # If cookies are available, attempt a basic search + parse
        logger.info(
            "%s: not yet implemented. Cookies are configured but "
            "search logic is a stub.", self.source_name,
        )
        return None

    def _fetch_executives(
        self, company_name: str, credit_code: str | None
    ) -> list[ExecutiveResult]:
        if not self._cookies:
            logger.debug("%s: skipped — no session cookies.", self.source_name)
            return []
        logger.info("%s: executives search not yet implemented.", self.source_name)
        return []
