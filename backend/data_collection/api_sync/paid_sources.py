"""Paid data-source channels for executive crawling.

Implements:
- ``QccSource`` — 企查查 (qcc.com) Open API
- ``TianyanchaSource`` — 天眼查 (tianyancha.com) API
- ``DemoSource`` — In-memory demo data for development & testing

Paid sources auto-skip when their API key is not configured.
DemoSource uses realistic sample data based on the existing
``sample_data.cypher`` company nodes.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import requests

from .base import ExecutiveDataSource, ExecutiveResult, LegalPersonResult
from data_collection.scrapers.utils import retry_on_network_error

logger = logging.getLogger(__name__)


# =========================================================================
# QccSource — 企查查 Open API
# =========================================================================

class QccSource(ExecutiveDataSource):
    """Fetch data from 企查查 Open API (openapi.qcc.com).

    Requires ``QCC_API_KEY`` environment variable.
    API docs: https://openapi.qcc.com/document

    The API returns structured JSON with fields like:
    - legalPerson.name, legalPerson.idCard
    - partners / executives lists
    """

    source_name = "qcc"
    priority = 10
    channel_type = "paid"

    BASE_URL = "https://openapi.qcc.com/api/enterprise"

    def __init__(self) -> None:
        super().__init__()
        self._api_key = os.getenv("QCC_API_KEY", "")
        self._enabled = bool(self._api_key)

        if not self._enabled:
            logger.info("%s: QCC_API_KEY not set — channel disabled", self.source_name)
            return

        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": self._api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "WindEye-Crawler/1.0",
        })

    # -- internal -----------------------------------------------------------

    def _api_enabled(self) -> bool:
        if not self._enabled:
            logger.debug("%s: skipped (no API key)", self.source_name)
        return self._enabled

    @retry_on_network_error(max_attempts=3, base_delay=2.0)
    def _call_api(
        self, endpoint: str, params: dict
    ) -> dict | None:
        """Call a QCC API endpoint and return parsed JSON.

        Returns None on any error (logged internally).
        """
        url = f"{self.BASE_URL}/{endpoint}"
        try:
            resp = self._session.get(url, params=params, timeout=15.0)
            resp.raise_for_status()
            data = resp.json()

            # QCC uses a common response envelope
            code = data.get("code", data.get("status", -1))
            if code not in (200, 0, "200"):
                msg = data.get("msg", data.get("message", "unknown error"))
                logger.warning(
                    "%s: API error for %s: %s (code=%s)",
                    self.source_name, params.get("name", params.get("creditCode")),
                    msg, code,
                )
                return None

            return data.get("result", data.get("data", data))
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 429:
                logger.warning(
                    "%s: rate limited (429). Consider reducing concurrency.", self.source_name
                )
            else:
                logger.exception("%s: HTTP error calling %s", self.source_name, endpoint)
            return None
        except Exception:
            logger.exception("%s: exception calling %s", self.source_name, endpoint)
            return None

    def _get_basic_info(
        self, company_name: str, credit_code: str | None
    ) -> dict | None:
        """Fetch basic enterprise info including legal person."""
        params: dict = {"name": company_name}
        if credit_code:
            params["creditCode"] = credit_code
        return self._call_api("getBasicInfo", params)

    # -- public API ---------------------------------------------------------

    def _fetch_legal_representative(
        self, company_name: str, credit_code: str | None
    ) -> LegalPersonResult | None:
        if not self._api_enabled():
            return None

        info = self._get_basic_info(company_name, credit_code)
        if not info:
            return None

        legal = info.get("legalPerson") or info.get("legalPersonInfo") or {}
        name = legal.get("name", "")
        if not name:
            return None

        return LegalPersonResult(
            name=name,
            id_card=legal.get("idCard") or legal.get("idCardMask"),
            position="法定代表人",
        )

    def _fetch_executives(
        self, company_name: str, credit_code: str | None
    ) -> list[ExecutiveResult]:
        if not self._api_enabled():
            return []

        # QCC provides executives in the basic info or a separate endpoint
        info = self._get_basic_info(company_name, credit_code)
        if not info:
            return []

        exec_list = info.get("executives") or info.get("mainPersonnel") or []
        results: list[ExecutiveResult] = []
        for item in exec_list:
            name = item.get("name", "")
            if not name:
                continue
            results.append(ExecutiveResult(
                name=name,
                id_card=item.get("idCard") or item.get("idCardMask"),
                position=item.get("position", item.get("title", "")),
            ))
        return results


# =========================================================================
# TianyanchaSource — 天眼查 API
# =========================================================================

class TianyanchaSource(ExecutiveDataSource):
    """Fetch data from 天眼查 API (tianyancha.com).

    Requires ``TIANYANCHA_API_KEY`` environment variable.
    """

    source_name = "tianyancha"
    priority = 11
    channel_type = "paid"

    BASE_URL = "https://openapi.tianyancha.com/api/v3"

    def __init__(self) -> None:
        super().__init__()
        self._api_key = os.getenv("TIANYANCHA_API_KEY", "")
        self._enabled = bool(self._api_key)

        if not self._enabled:
            logger.info("%s: TIANYANCHA_API_KEY not set — channel disabled", self.source_name)
            return

        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": self._api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "WindEye-Crawler/1.0",
        })

    def _api_enabled(self) -> bool:
        if not self._enabled:
            logger.debug("%s: skipped (no API key)", self.source_name)
        return self._enabled

    @retry_on_network_error(max_attempts=3, base_delay=2.0)
    def _call_api(self, endpoint: str, params: dict) -> dict | None:
        url = f"{self.BASE_URL}/{endpoint}"
        try:
            resp = self._session.get(url, params=params, timeout=15.0)
            resp.raise_for_status()
            data = resp.json()

            code = data.get("error_code", 0)
            if code != 0:
                msg = data.get("reason", "unknown error")
                logger.warning(
                    "%s: API error for %s: %s (code=%s)",
                    self.source_name, params.get("keyword"), msg, code,
                )
                return None

            return data.get("result", data)
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 429:
                logger.warning("%s: rate limited (429).", self.source_name)
            else:
                logger.exception("%s: HTTP error calling %s", self.source_name, endpoint)
            return None
        except Exception:
            logger.exception("%s: exception calling %s", self.source_name, endpoint)
            return None

    def _fetch_legal_representative(
        self, company_name: str, credit_code: str | None
    ) -> LegalPersonResult | None:
        if not self._api_enabled():
            return None

        info = self._call_api("company/baseInfo", {"keyword": company_name})
        if not info:
            return None

        legal_name = info.get("legalPersonName", "") or info.get("legalPerson", "")
        if not legal_name:
            return None

        return LegalPersonResult(
            name=legal_name,
            id_card=None,  # 天眼查 typically masks this in base info
            position="法定代表人",
        )

    def _fetch_executives(
        self, company_name: str, credit_code: str | None
    ) -> list[ExecutiveResult]:
        if not self._api_enabled():
            return []

        info = self._call_api("company/baseInfo", {"keyword": company_name})
        if not info:
            return []

        staff_list = info.get("staffList") or info.get("employees") or []
        results: list[ExecutiveResult] = []
        for item in staff_list:
            name = item.get("name", "")
            if not name:
                continue
            results.append(ExecutiveResult(
                name=name,
                id_card=None,
                position=item.get("position", item.get("type", "")),
            ))
        return results


# =========================================================================
# DemoSource — In-memory demo data for development & testing
# =========================================================================

# Realistic demo data keyed by company name (exact match).
# Mirrors the 13 COMPANY nodes from sample_data.cypher.
_DEMO_DATA: dict[str, dict] = {
    "华创控股集团有限公司": {
        "legal_rep": {"name": "张明远", "id_card": "310000198001010001", "position": "法定代表人"},
        "executives": [
            {"name": "张明远", "position": "董事长"},
            {"name": "李建国", "position": "总经理"},
            {"name": "王丽华", "position": "财务总监"},
            {"name": "孙志强", "position": "监事"},
        ],
    },
    "华创地产股份有限公司": {
        "legal_rep": {"name": "张明远", "id_card": "310000198001010001", "position": "法定代表人"},
        "executives": [
            {"name": "张明远", "position": "董事长"},
            {"name": "刘伟民", "position": "总经理"},
            {"name": "陈芳", "position": "财务负责人"},
            {"name": "周建华", "position": "副总经理"},
        ],
    },
    "华创贸易有限责任公司": {
        "legal_rep": {"name": "李建国", "id_card": "310000198205020002", "position": "法定代表人"},
        "executives": [
            {"name": "李建国", "position": "执行董事"},
            {"name": "赵丽", "position": "财务经理"},
        ],
    },
    "鑫达投资管理有限公司": {
        "legal_rep": {"name": "王丽华", "id_card": "310000198308030003", "position": "法定代表人"},
        "executives": [
            {"name": "张明远", "position": "执行董事"},
            {"name": "王丽华", "position": "总经理"},
            {"name": "陈晓峰", "position": "监事"},
            {"name": "马艳红", "position": "风控总监"},
        ],
    },
    "中远建设工程有限公司": {
        "legal_rep": {"name": "赵志强", "id_card": "310000196507040004", "position": "法定代表人"},
        "executives": [
            {"name": "赵志强", "position": "董事长"},
            {"name": "杨冠军", "position": "总工程师"},
            {"name": "何大伟", "position": "项目经理"},
        ],
    },
    "海通金融服务有限公司": {
        "legal_rep": {"name": "赵志强", "id_card": "310000196507040004", "position": "法定代表人"},
        "executives": [
            {"name": "赵志强", "position": "董事长"},
            {"name": "王丽华", "position": "财务负责人"},
            {"name": "陈晓峰", "position": "监事"},
            {"name": "吴涛", "position": "风控总监"},
        ],
    },
    "天元科技发展有限公司": {
        "legal_rep": {"name": "陈晓峰", "id_card": "310000197809050005", "position": "法定代表人"},
        "executives": [
            {"name": "陈晓峰", "position": "总经理"},
            {"name": "徐明辉", "position": "技术总监"},
            {"name": "梁欣怡", "position": "运营总监"},
        ],
    },
    "恒达科技有限公司": {
        "legal_rep": {"name": "刘志伟", "id_card": None, "position": "法定代表人"},
        "executives": [
            {"name": "刘志伟", "position": "董事长"},
            {"name": "张伟强", "position": "总经理"},
        ],
    },
    "恒达技术开发有限公司": {
        "legal_rep": {"name": "刘志伟", "id_card": None, "position": "法定代表人"},
        "executives": [
            {"name": "刘志伟", "position": "董事长"},
            {"name": "王新宇", "position": "研发总监"},
        ],
    },
    "恒达信息系统有限公司": {
        "legal_rep": {"name": "张伟强", "id_card": None, "position": "法定代表人"},
        "executives": [
            {"name": "张伟强", "position": "总经理"},
            {"name": "刘志伟", "position": "执行董事"},
        ],
    },
    "东方能源集团有限公司": {
        "legal_rep": {"name": "王锦程", "id_card": None, "position": "法定代表人"},
        "executives": [
            {"name": "王锦程", "position": "董事长"},
            {"name": "霍建国", "position": "总经理"},
        ],
    },
    "东方能源销售有限公司": {
        "legal_rep": {"name": "霍建国", "id_card": None, "position": "法定代表人"},
        "executives": [
            {"name": "霍建国", "position": "总经理"},
            {"name": "王锦程", "position": "董事"},
        ],
    },
    "东方新能源开发有限公司": {
        "legal_rep": {"name": "孙志远", "id_card": None, "position": "法定代表人"},
        "executives": [
            {"name": "孙志远", "position": "执行董事"},
            {"name": "黄丽萍", "position": "财务部经理"},
        ],
    },
}


class DemoSource(ExecutiveDataSource):
    """In-memory demo source that returns realistic data for the 13 known
    COMPANY nodes from ``sample_data.cypher``.

    Used when no real API keys are configured, so the crawler can
    still be exercised end-to-end in development.

    Companies not in the demo dictionary receive an empty result
    (logged at INFO level).
    """

    source_name = "demo"
    priority = 999  # last resort
    channel_type = "demo"

    def __init__(self, custom_data: dict | None = None) -> None:
        super().__init__()
        self._data: dict[str, dict] = custom_data if custom_data else _DEMO_DATA
        logger.info(
            "%s: loaded demo data for %d companies",
            self.source_name, len(self._data),
        )

    def _lookup(self, company_name: str) -> dict | None:
        # Exact match
        if company_name in self._data:
            return self._data[company_name]
        # Fuzzy: try substring match
        for key in self._data:
            if company_name in key or key in company_name:
                logger.debug("%s: fuzzy match '%s' -> '%s'", self.source_name, company_name, key)
                return self._data[key]
        logger.info("%s: no demo data for '%s'", self.source_name, company_name)
        return None

    def _fetch_legal_representative(
        self, company_name: str, credit_code: str | None
    ) -> LegalPersonResult | None:
        data = self._lookup(company_name)
        if not data:
            return None
        lp = data.get("legal_rep", {})
        if not lp or not lp.get("name"):
            return None
        return LegalPersonResult(
            name=lp["name"],
            id_card=lp.get("id_card"),
            position=lp.get("position", "法定代表人"),
        )

    def _fetch_executives(
        self, company_name: str, credit_code: str | None
    ) -> list[ExecutiveResult]:
        data = self._lookup(company_name)
        if not data:
            return []
        results: list[ExecutiveResult] = []
        for exec_data in data.get("executives", []):
            if exec_data.get("name"):
                results.append(ExecutiveResult(
                    name=exec_data["name"],
                    id_card=exec_data.get("id_card"),
                    position=exec_data.get("position", ""),
                ))
        return results
