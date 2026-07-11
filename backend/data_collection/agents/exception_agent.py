"""Retry Handler — retry logic and fallback strategies."""

from __future__ import annotations

import asyncio
import logging
import os

logger = logging.getLogger(__name__)

_DEFAULT_PER_SOURCE_TIMEOUT = 900  # 15 min per source


class RetryHandler:
    """Handle crawl failures with retry and fallback.

    Wraps scraper execution with:
    - Per-source timeout (CRAWL_SOURCE_TIMEOUT_SECONDS, default 900s)
    - Exponential backoff retry on failure/timeout/empty results
    """

    MAX_RETRIES = 3
    RETRY_DELAY = 5

    def _source_timeout(self, config: dict) -> float:
        """Per-source timeout, scaled by max_pages (min 300s, configurable)."""
        base = float(os.getenv("CRAWL_SOURCE_TIMEOUT_SECONDS", str(_DEFAULT_PER_SOURCE_TIMEOUT)))
        max_pages = config.get("max_pages", 5)
        return max(base, max_pages * 120)

    async def execute_with_retry(self, scraper_fn, config: dict) -> dict:
        """Execute scraper with timeout and exponential backoff retry.

        Args:
            scraper_fn: The scraper function to call (accepts config dict).
            config: Configuration dict to pass to the scraper.

        Returns:
            Result dict from the scraper, or an error dict on all failures.
        """
        last_error = None
        timeout = self._source_timeout(config)
        source = config.get("source", "unknown")

        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                logger.info(
                    "[Attempt %d/%d] Running scraper: %s (timeout=%.0fs)",
                    attempt, self.MAX_RETRIES, source, timeout,
                )
                result = await asyncio.wait_for(
                    asyncio.to_thread(scraper_fn, config),
                    timeout=timeout,
                )

                if result and (result.get("files_downloaded", 0) > 0 or result.get("records", 0) > 0):
                    result["attempts"] = attempt
                    return result

                if result is not None and not config.get("retry_empty_results", False):
                    result["attempts"] = attempt
                    result["empty_result"] = True
                    logger.info(
                        "[Attempt %d] Scraper returned no new files; treating the empty date range as completed",
                        attempt,
                    )
                    return result

                logger.warning("[Attempt %d] Scraper returned empty results, retrying...", attempt)
                last_error = Exception("Empty results from scraper")

            except asyncio.TimeoutError:
                last_error = Exception(
                    f"Scraper timed out after {timeout:.0f}s for source '{source}'"
                )
                logger.error("[Attempt %d] %s", attempt, last_error)

            except Exception as e:
                logger.error("[Attempt %d] Scraper failed: %s", attempt, e)
                last_error = e

            if attempt < self.MAX_RETRIES:
                delay = self.RETRY_DELAY * (2 ** (attempt - 1))
                await asyncio.sleep(delay)

        return {
            "source": source,
            "files_downloaded": 0,
            "records": 0,
            "save_dir": "",
            "error": str(last_error),
            "attempts": self.MAX_RETRIES,
        }
