"""Tests for data collection scrapers.

Covers: demo mode, utility functions, sentiment parsing, and real scraping integration.
"""

from __future__ import annotations

import os
import tempfile
from unittest.mock import patch

import pytest


# ── Demo scraper tests ─────────────────────────────────────────────────────


class TestDemoScrapers:
    """Fast tests for demo/mock scrapers — no network or WebDriver needed."""

    def test_demo_risk_event_sse(self):
        from data_collection.scrapers.risk_event_scraper import run_risk_event_demo

        result = run_risk_event_demo({"source": "sse", "max_pages": 3})
        assert result["source"] == "sse"
        assert 5 <= result["files_downloaded"] <= 60
        assert result["records"] == result["files_downloaded"]
        assert os.path.isdir(result["save_dir"])
        assert "risk_events" in result["save_dir"]

    def test_demo_risk_event_szse(self):
        from data_collection.scrapers.risk_event_scraper import run_risk_event_demo

        result = run_risk_event_demo({"source": "szse", "max_pages": 2})
        assert result["source"] == "szse"
        assert result["files_downloaded"] >= 0
        assert result["records"] >= 0

    def test_demo_risk_event_bse(self):
        from data_collection.scrapers.risk_event_scraper import run_risk_event_demo

        result = run_risk_event_demo({"source": "bse", "max_pages": 2})
        assert result["source"] == "bse"
        assert result["files_downloaded"] >= 0

    def test_demo_risk_sentiment(self):
        from data_collection.scrapers.risk_sentiment_scraper import run_risk_sentiment_demo

        result = run_risk_sentiment_demo({"source": "stockstar", "max_pages": 3})
        assert result["source"] == "stockstar"
        assert 5 <= result["files_downloaded"] <= 105
        assert result["records"] == result["files_downloaded"]
        assert os.path.isdir(result["save_dir"])

    def test_demo_risk_sentiment_eastmoney(self):
        from data_collection.scrapers.risk_sentiment_scraper import run_risk_sentiment_demo

        result = run_risk_sentiment_demo({"source": "eastmoney", "max_pages": 3})
        assert result["source"] == "eastmoney"
        assert 5 <= result["files_downloaded"] <= 105
        assert result["records"] == result["files_downloaded"]
        assert os.path.isdir(result["save_dir"])

    def test_demo_event_titles_not_empty(self):
        from data_collection.scrapers.risk_event_scraper import DEMO_EVENT_TITLES

        assert len(DEMO_EVENT_TITLES) == 20
        for title in DEMO_EVENT_TITLES:
            assert title and isinstance(title, str)
            assert any("一" <= c <= "鿿" for c in title), f"No Chinese chars in: {title}"

    def test_demo_sentiment_titles_not_empty(self):
        from data_collection.scrapers.risk_sentiment_scraper import DEMO_SENTIMENT_TITLES

        assert len(DEMO_SENTIMENT_TITLES) == 20
        for title in DEMO_SENTIMENT_TITLES:
            assert title and isinstance(title, str)
            assert any("一" <= c <= "鿿" for c in title), f"No Chinese chars in: {title}"


# ── Utility function tests ─────────────────────────────────────────────────


class TestScraperUtilities:
    """Unit tests for shared scraper utilities."""

    def test_is_valid_pdf_positive(self, scraper_data_dir):
        from data_collection.scrapers.utils import is_valid_pdf

        path = os.path.join(scraper_data_dir, "test.pdf")
        with open(path, "wb") as f:
            f.write(b"%PDF-1.4\n%content\n" + b"x" * 1024)
        assert is_valid_pdf(path)

    def test_is_valid_pdf_negative_size(self, scraper_data_dir):
        from data_collection.scrapers.utils import is_valid_pdf

        path = os.path.join(scraper_data_dir, "small.pdf")
        with open(path, "wb") as f:
            f.write(b"%PDF-1.4\n")
        assert not is_valid_pdf(path)

    def test_is_valid_pdf_negative_magic(self, scraper_data_dir):
        from data_collection.scrapers.utils import is_valid_pdf

        path = os.path.join(scraper_data_dir, "fake.pdf")
        with open(path, "wb") as f:
            f.write(b"Not a PDF file\x00" + b"x" * 1024)
        assert not is_valid_pdf(path)

    def test_is_valid_pdf_nonexistent(self):
        from data_collection.scrapers.utils import is_valid_pdf

        assert not is_valid_pdf("/nonexistent/path/file.pdf")

    def test_safe_filename_strips_invalid_chars(self):
        from data_collection.scrapers.utils import safe_filename

        result = safe_filename('含非法字符\\/:*?"<>|的文件名')
        assert "\\" not in result
        assert "/" not in result
        assert ":" not in result
        assert "*" not in result
        assert "?" not in result
        assert '"' not in result
        assert "<" not in result
        assert ">" not in result
        assert "|" not in result
        assert "含非法字符" in result

    def test_safe_pdf_name_adds_extension(self):
        from data_collection.scrapers.utils import safe_pdf_name

        assert safe_pdf_name("test").endswith(".pdf")
        assert safe_pdf_name("test.pdf").endswith(".pdf")

    def test_ensure_dir_creates(self, scraper_data_dir):
        from data_collection.scrapers.utils import ensure_dir

        new_dir = os.path.join(scraper_data_dir, "sub", "nested")
        ensure_dir(new_dir)
        assert os.path.isdir(new_dir)

    def test_load_existing_pdf_names(self, scraper_data_dir):
        from data_collection.scrapers.utils import load_existing_pdf_names

        pdf_dir = os.path.join(scraper_data_dir, "pdfs")
        os.makedirs(pdf_dir, exist_ok=True)
        # Create valid PDF files
        for name in ["a.pdf", "b.pdf", "c.txt"]:
            path = os.path.join(pdf_dir, name)
            with open(path, "wb") as f:
                f.write(b"%PDF-1.4\n" + b"x" * 1024)

        names = load_existing_pdf_names(pdf_dir)
        assert "a.pdf" in names
        assert "b.pdf" in names
        assert "c.txt" not in names

    def test_server_default_headless_linux(self):
        from data_collection.scrapers.utils import _server_default_headless

        with patch.dict(os.environ, {}, clear=False):
            with patch("platform.system", return_value="Linux"):
                assert _server_default_headless() is True

    def test_server_default_headless_env_override(self):
        from data_collection.scrapers.utils import _server_default_headless

        with patch.dict(os.environ, {"SCRAPER_HEADLESS": "false"}, clear=False):
            with patch("platform.system", return_value="Linux"):
                assert _server_default_headless() is False


class TestRiskEventDateFiltering:
    def test_normalize_date_value(self):
        from data_collection.scrapers.risk_event_scraper import _normalize_date_value

        assert _normalize_date_value("2026/7/1") == "2026-07-01"
        assert _normalize_date_value("2026年7月1日") == "2026-07-01"
        assert _normalize_date_value("2026-07-01") == "2026-07-01"

    def test_extract_date_from_text(self):
        from data_collection.scrapers.risk_event_scraper import _extract_date_from_text

        assert _extract_date_from_text("公告日期：2026年7月1日") == "2026-07-01"
        assert _extract_date_from_text("披露时间 2026-07-02") == "2026-07-02"

    def test_date_in_range(self):
        from data_collection.scrapers.risk_event_scraper import _date_in_range

        assert _date_in_range("公告日期：2026年7月1日", "2026-07-01", "2026-07-31")
        assert not _date_in_range("公告日期：2026年6月30日", "2026-07-01", "2026-07-31")
        assert not _date_in_range("公告日期：2026年8月1日", "2026-07-01", "2026-07-31")
        assert _date_in_range("没有日期字段", "2026-07-01", "2026-07-31")


# ── Sentiment parsing tests ────────────────────────────────────────────────


class TestSentimentParsing:
    """Static parsing tests for sentiment scraper — no network needed."""

    def test_list_page_url_first(self):
        from data_collection.scrapers.risk_sentiment_scraper import _list_page_url

        url = _list_page_url(1)
        assert url == "https://finance.stockstar.com/list/1221.shtml"

    def test_list_page_url_nth(self):
        from data_collection.scrapers.risk_sentiment_scraper import _list_page_url

        url = _list_page_url(3)
        assert url == "https://finance.stockstar.com/list/1221_3.shtml"

    def test_is_article_url_valid(self):
        from data_collection.scrapers.risk_sentiment_scraper import _is_article_url

        assert _is_article_url("https://stockstar.com/news/123.shtml", "stockstar.com")

    def test_is_article_url_list_page_rejected(self):
        from data_collection.scrapers.risk_sentiment_scraper import _is_article_url

        assert not _is_article_url("https://stockstar.com/list/1221.shtml", "stockstar.com")

    def test_is_article_url_javascript_rejected(self):
        from data_collection.scrapers.risk_sentiment_scraper import _is_article_url

        assert not _is_article_url("javascript:void(0)", "stockstar.com")

    def test_is_article_url_hash_rejected(self):
        from data_collection.scrapers.risk_sentiment_scraper import _is_article_url

        assert not _is_article_url("#section", "stockstar.com")

    def test_extract_links_from_html(self):
        from data_collection.scrapers.risk_sentiment_scraper import _extract_links

        html = """
        <html><body>
        <a href="/news/123.shtml">Article 1</a>
        <a href="/list/1221.shtml">List page (skip)</a>
        <a href="javascript:void(0)">JS (skip)</a>
        <a href="/news/456.shtml">Article 2</a>
        <a href="/news/123.shtml">Duplicate</a>
        </body></html>
        """
        links = _extract_links(html, "https://finance.stockstar.com/list/1221.shtml")
        assert len(links) == 2
        assert any("123.shtml" in l for l in links)
        assert any("456.shtml" in l for l in links)

    def test_parse_article_with_h1(self):
        from data_collection.scrapers.risk_sentiment_scraper import _parse_article

        html = """
        <html><head><title>Site Title - Article</title></head><body>
        <h1>市场风险预警分析</h1>
        <div class="article_content"><p>A股市场近期波动加剧。</p><p>投资者需关注风险。</p></div>
        </body></html>
        """
        title, body = _parse_article(html)
        assert title == "市场风险预警分析"
        assert "A股市场近期波动加剧" in body

    def test_parse_article_fallback_to_og_title(self):
        from data_collection.scrapers.risk_sentiment_scraper import _parse_article

        html = """
        <html><head>
        <meta property="og:title" content="OG Title Here">
        </head><body>
        <div class="article_content"><p>Body text.</p></div>
        </body></html>
        """
        title, body = _parse_article(html)
        assert title == "OG Title Here"

    def test_parse_article_empty_body(self):
        from data_collection.scrapers.risk_sentiment_scraper import _parse_article

        html = '<html><body><h1>Title</h1><div class="article_content"></div></body></html>'
        title, body = _parse_article(html)
        assert title == "Title"
        assert body == ""

    def test_parse_article_script_removal(self):
        from data_collection.scrapers.risk_sentiment_scraper import _parse_article

        html = """
        <html><body>
        <h1>标题</h1>
        <div class="article_content">
        <p>正常内容</p>
        <script>alert('should be removed');</script>
        <p>更多内容</p>
        </div>
        </body></html>
        """
        title, body = _parse_article(html)
        assert "标题" == title
        assert "正常内容" in body
        assert "alert" not in body
        assert "更多内容" in body

    def test_save_article_creates_file(self, scraper_data_dir):
        from data_collection.scrapers.risk_sentiment_scraper import _save_article

        path = _save_article("测试标题", "正文内容", "http://example.com/article", scraper_data_dir)
        assert os.path.isfile(path)
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        assert "测试标题" in content
        assert "正文内容" in content
        assert "http://example.com/article" in content


# ── Real scraper integration tests ─────────────────────────────────────────


@pytest.mark.slow
class TestRealScrapers:
    """Integration tests requiring network and Chrome WebDriver.

    Run with: CRAWL_DEMO_MODE=false pytest -v -m slow
    """

    def test_event_scraper_registry_structure(self):
        """Verify the scraper registry has expected entries."""
        from data_collection.scrapers import SCRAPER_REGISTRY, DEMO_SCRAPER_REGISTRY

        assert "risk_event" in SCRAPER_REGISTRY
        assert "risk_sentiment" in SCRAPER_REGISTRY
        assert "risk_event" in DEMO_SCRAPER_REGISTRY
        assert "risk_sentiment" in DEMO_SCRAPER_REGISTRY

    def test_event_scraper_dispatches_correctly(self):
        """Verify run_risk_event_scraper dispatches to correct sub-scraper."""
        from data_collection.scrapers.risk_event_scraper import run_risk_event_scraper

        # Each source should be recognized
        for source in ["sse", "szse", "bse"]:
            result = run_risk_event_scraper({"source": source, "max_pages": 0})
            # In demo mode (default), max_pages=0 means no pages, so result should be minimal
            assert result["source"] == source

    def test_sentiment_scraper_dispatches_correctly(self):
        """Verify run_risk_sentiment_scraper dispatches correctly."""
        from data_collection.scrapers.risk_sentiment_scraper import run_risk_sentiment_scraper

        result = run_risk_sentiment_scraper({"source": "stockstar", "max_pages": 0})
        assert result["source"] == "stockstar"

    @pytest.mark.skipif(
        not os.getenv("CRAWL_DEMO_MODE", "true").lower() == "false",
        reason="Set CRAWL_DEMO_MODE=false to run real scraping tests",
    )
    def test_stockstar_list_page_fetch(self):
        """Fetch real Stockstar list page and verify article extraction."""
        from data_collection.scrapers.risk_sentiment_scraper import (
            _fetch,
            _extract_links,
            _list_page_url,
        )

        # Note: _fetch now has retry decorator
        url = _list_page_url(1)
        html = _fetch(url)
        assert html and len(html) > 1000, "Expected substantial HTML content"

        links = _extract_links(html, url)
        assert len(links) > 0, f"Expected at least 1 article link, got 0 from {url}"

    @pytest.mark.skipif(
        not os.getenv("CRAWL_DEMO_MODE", "true").lower() == "false",
        reason="Set CRAWL_DEMO_MODE=false to run real scraping tests",
    )
    def test_stockstar_article_parse(self):
        """Fetch and parse a single real Stockstar article."""
        from data_collection.scrapers.risk_sentiment_scraper import (
            _fetch,
            _extract_links,
            _list_page_url,
            _parse_article,
        )

        url = _list_page_url(1)
        html = _fetch(url)
        links = _extract_links(html, url)
        if not links:
            pytest.skip("No article links found on Stockstar list page")

        art_html = _fetch(links[0])
        title, body = _parse_article(art_html)
        assert title, "Article title should not be empty"
        assert body, "Article body should not be empty"

    @pytest.mark.skipif(
        not os.getenv("RUN_BROWSER_TESTS", "").lower() == "true",
        reason="Set RUN_BROWSER_TESTS=true to run browser-based scraping tests (requires Chrome)",
    )
    def test_sse_page_loads(self, check_webdriver_available):
        """Verify SSE page loads and has expected content."""
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options

        opts = Options()
        opts.add_argument("--headless")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--window-size=1920,1080")

        driver = webdriver.Chrome(options=opts)
        try:
            driver.get("https://www.sse.com.cn/disclosure/listedinfo/announcement/")
            import time
            time.sleep(5)
            title = driver.title
            assert title, "Page title should not be empty"
            assert "上海" in title or "sse" in title.lower() or "SSE" in title, \
                f"Unexpected page title: {title}"
        finally:
            driver.quit()

    @pytest.mark.skipif(
        not os.getenv("RUN_BROWSER_TESTS", "").lower() == "true",
        reason="Set RUN_BROWSER_TESTS=true for browser tests",
    )
    def test_szse_page_loads(self, check_webdriver_available):
        """Verify SZSE page loads."""
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options

        opts = Options()
        opts.add_argument("--headless")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--window-size=1920,1080")

        driver = webdriver.Chrome(options=opts)
        try:
            driver.get("https://www.szse.cn/disclosure/supervision/measure/pushish/index.html")
            import time
            time.sleep(5)
            title = driver.title
            assert title, "Page title should not be empty"
            assert "深圳" in title or "szse" in title.lower() or "SZSE" in title, \
                f"Unexpected page title: {title}"
        finally:
            driver.quit()

    @pytest.mark.skipif(
        not os.getenv("RUN_BROWSER_TESTS", "").lower() == "true",
        reason="Set RUN_BROWSER_TESTS=true for browser tests",
    )
    def test_bse_page_loads(self, check_webdriver_available):
        """Verify BSE page loads with corrected URL."""
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options

        opts = Options()
        opts.add_argument("--headless")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--window-size=1920,1080")

        driver = webdriver.Chrome(options=opts)
        try:
            # Test both URLs
            for url in [
                "https://www.bse.cn/disclosure/disciplinary_action.html",
                "https://www.bse.cn/disclosure/disciplinary_aciton.html",
            ]:
                driver.get(url)
                import time
                time.sleep(4)
                title = driver.title
                if "北证" in title or "bse" in title.lower() or title:
                    break

            assert title, "Page title should not be empty"
        finally:
            driver.quit()
