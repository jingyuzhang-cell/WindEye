"""Data Source Matcher — map structured requirements to scraper configs."""

from __future__ import annotations


class SourceMatcher:
    """Match parsed requirements to available scraper configurations."""

    SOURCE_CAPABILITIES = {
        "risk_event": {
            "sse": {"keywords": True, "date_range": True, "max_pages": 50, "label": "上交所风险事件"},
            "szse": {"keywords": True, "date_range": True, "max_pages": 50, "label": "深交所自律监管措施"},
            "bse": {"keywords": True, "date_range": True, "max_pages": 50, "label": "北交所纪律处分"},
        },
        "risk_sentiment": {
            "stockstar": {"keywords": False, "date_range": False, "max_pages": 10, "label": "证券之星财经新闻"},
        },
    }

    def match(self, parsed_requirements: dict) -> dict:
        """Generate scraper configs from parsed requirements.

        Returns: {data_type, scraper_configs: {source: config}, total_sources}
        """
        data_type = parsed_requirements.get("data_type", "risk_event")
        requested_sources = parsed_requirements.get("sources", [])
        all_capabilities = self.SOURCE_CAPABILITIES.get(data_type, {})

        if not requested_sources:
            requested_sources = list(all_capabilities.keys())

        scraper_configs = {}
        for src in requested_sources:
            if src in all_capabilities:
                caps = all_capabilities[src]
                scraper_configs[src] = {
                    "source": src,
                    "data_type": data_type,
                    "keywords": parsed_requirements.get("keywords", []),
                    "date_start": parsed_requirements.get("date_start"),
                    "date_end": parsed_requirements.get("date_end"),
                    "max_pages": min(
                        parsed_requirements.get("max_pages", 5),
                        caps.get("max_pages", 10),
                    ),
                    "max_files": parsed_requirements.get("max_files", 0),
                    "headless": True,
                }

        return {
            "data_type": data_type,
            "scraper_configs": scraper_configs,
            "total_sources": len(scraper_configs),
        }
