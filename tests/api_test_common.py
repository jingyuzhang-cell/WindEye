from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "http://localhost:8001"
DEFAULT_COMPANY = "徐工集团工程机械股份有限公司"
OUTPUT_DIR = Path(__file__).resolve().parent / "output"
REPORT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "backend" / "report_outputs"


def parse_args() -> tuple[str, str]:
    base_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE_URL
    company = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_COMPANY
    return base_url.rstrip("/"), company


def call_json(
    base_url: str,
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    timeout: int = 120,
) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    status_code = None
    content_type = ""
    raw = ""
    error = None

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status_code = int(resp.status)
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        status_code = int(exc.code)
        content_type = exc.headers.get("Content-Type", "")
        raw = exc.read().decode("utf-8", errors="replace")
        error = str(exc)
    except Exception as exc:
        error = str(exc)

    parsed: Any = raw
    is_json = False
    if raw:
        try:
            parsed = json.loads(raw)
            is_json = True
        except Exception:
            is_json = False

    return {
        "url": url,
        "method": method,
        "path": path,
        "statusCode": status_code,
        "ok": bool(status_code is not None and 200 <= status_code < 300),
        "contentType": content_type,
        "isJson": is_json,
        "error": error,
        "requestBody": body,
        "response": parsed,
        "testedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }


def save_result(filename: str, payload: dict[str, Any]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / filename
    content = json.dumps(payload, ensure_ascii=False, indent=2)
    path.write_text(content, encoding="utf-8")
    REPORT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORT_OUTPUT_DIR / filename
    try:
        report_path.write_text(content, encoding="utf-8")
    except OSError:
        report_path.unlink(missing_ok=True)
        report_path.write_text(content, encoding="utf-8")
    return path


def node_name(node: dict[str, Any]) -> str:
    props = node.get("properties") if isinstance(node.get("properties"), dict) else {}
    return str(
        node.get("name")
        or node.get("label")
        or node.get("title")
        or props.get("name")
        or props.get("COMPANY_NM")
        or props.get("PERSON_NM")
        or ""
    )


def node_id(node: dict[str, Any]) -> str:
    return str(node.get("id") or node.get("element_id") or node.get("elementId") or "")


def search_all_body(
    company: str,
    query: str | None = None,
    *,
    depth: int = 1,
    limit: int = 1000,
    node_limit: int | None = None,
    edge_limit: int | None = None,
    traversal_mode: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "query": query or company,
        "layer": "all",
        "depth": depth,
        "limit": limit,
        "type": "all",
        "relationWhitelist": [],
        "outputFormat": "both",
        "includeProperties": True,
        "deduplicate": True,
        "prunePolicy": "degree_aware",
        "maxExpandDegree": 200,
        "keepHighDegreeNode": True,
        "includePruningSummary": True,
    }
    if node_limit is not None:
        body["nodeLimit"] = node_limit
    if edge_limit is not None:
        body["edgeLimit"] = edge_limit
    if traversal_mode:
        body["traversalMode"] = traversal_mode
    return body


def extract_nodes(response: Any) -> list[dict[str, Any]]:
    if not isinstance(response, dict):
        return []
    nodes: list[dict[str, Any]] = []
    for key in ("matchedNodes", "nodes"):
        value = response.get(key)
        if isinstance(value, list):
            nodes.extend(item for item in value if isinstance(item, dict))
    seen = set()
    unique = []
    for node in nodes:
        nid = node_id(node)
        if nid and nid not in seen:
            seen.add(nid)
            unique.append(node)
    return unique


def choose_company_node(company: str, nodes: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not nodes:
        return None

    def score(node: dict[str, Any]) -> tuple[int, int]:
        name = node_name(node)
        labels = " ".join(str(label) for label in node.get("labels", []))
        company_like = 1 if "COMPANY" in labels.upper() or "公司" in name else 0
        if name == company:
            return (100, company_like)
        if company in name or name in company:
            return (90, company_like)
        if "徐工集团工程机械股份有限公司" in name:
            return (80, company_like)
        if "徐工集团" in name:
            return (70, company_like)
        if "徐工" in name:
            return (60, company_like)
        return (0, company_like)

    ranked = sorted(nodes, key=score, reverse=True)
    return ranked[0]


def resolve_company_node(base_url: str, company: str) -> dict[str, Any]:
    attempts = []
    queries = [company, "徐工集团", "徐工"]
    for query in queries:
        body = search_all_body(company, query=query, depth=1)
        result = call_json(base_url, "POST", "/api/v1/graph/search-all", body)
        nodes = extract_nodes(result.get("response"))
        chosen = choose_company_node(company, nodes)
        attempts.append({
            "query": query,
            "statusCode": result.get("statusCode"),
            "isJson": result.get("isJson"),
            "nodeCount": len(nodes),
            "chosen": {
                "id": node_id(chosen) if chosen else "",
                "name": node_name(chosen) if chosen else "",
            },
        })
        if chosen and node_id(chosen):
            return {
                "node": chosen,
                "nodeId": node_id(chosen),
                "nodeName": node_name(chosen),
                "attempts": attempts,
            }
    return {"node": None, "nodeId": "", "nodeName": "", "attempts": attempts}


def conclusion(result: dict[str, Any], expected_status: int = 200) -> str:
    if result.get("statusCode") == expected_status and result.get("isJson"):
        return "正常" if 200 <= expected_status < 300 else "符合预期"
    if result.get("statusCode") == 404 and result.get("isJson"):
        return "路由未注册"
    if not result.get("isJson"):
        return "非 JSON 响应"
    return "异常"


def wrap_result(
    api: str,
    result: dict[str, Any],
    *,
    expected_status: int = 200,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "api": api,
        "expectedStatus": expected_status,
        "statusCode": result.get("statusCode"),
        "isJson": result.get("isJson"),
        "conclusion": conclusion(result, expected_status),
        "raw": result,
    }
    if extra:
        payload.update(extra)
    return payload


def print_row(payload: dict[str, Any]) -> None:
    is_json = "是" if payload.get("isJson") else "否"
    print(f"| `{payload['api']}` | {payload.get('statusCode')} | {is_json} | {payload.get('conclusion')} |")
