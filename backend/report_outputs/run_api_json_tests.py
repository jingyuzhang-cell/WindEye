from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8001"
OUT_DIR = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(r"D:\Code\WindEye\backend\report_outputs")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def save_json(filename: str, obj: Any) -> None:
    (OUT_DIR / filename).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def call_json(name: str, method: str, path: str, body: Any | None = None, timeout: int = 120) -> dict[str, Any]:
    url = BASE_URL.rstrip("/") + path
    payload = None
    headers = {"Accept": "application/json"}
    if body is not None:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    status = None
    content_type = ""
    raw = ""
    error = None
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = int(resp.status)
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        status = int(exc.code)
        content_type = exc.headers.get("Content-Type", "")
        raw = exc.read().decode("utf-8", errors="replace")
        error = str(exc)
    except Exception as exc:
        error = str(exc)

    parsed = None
    is_json = False
    if raw:
        try:
            parsed = json.loads(raw)
            is_json = True
        except Exception:
            parsed = raw

    return {
        "name": name,
        "method": method,
        "path": path,
        "url": url,
        "statusCode": status,
        "ok": bool(status is not None and 200 <= status < 300),
        "contentType": content_type,
        "isJson": is_json,
        "error": error,
        "requestBody": body,
        "response": parsed,
        "testedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }


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


summary: list[dict[str, Any]] = []

port = call_json("port_check", "GET", "/health", None, timeout=10)
save_json("00_port_check.json", port)

search_result = None
search_query = None
search_nodes: list[dict[str, Any]] = []
for query in ["徐工", "徐工集团", "华创", "行为人", "证券法", "公司"]:
    body = {
        "query": query,
        "layer": "all",
        "depth": 1,
        "nodeLimit": 30,
        "edgeLimit": 80,
        "outputFormat": "both",
        "responseMode": "full",
        "includeProperties": True,
    }
    candidate = call_json("graph_search_all", "POST", "/api/v1/graph/search-all", body)
    resp = candidate.get("response") if isinstance(candidate.get("response"), dict) else {}
    nodes = list(resp.get("nodes") or []) + list(resp.get("matchedNodes") or [])
    if candidate["isJson"] and nodes:
        search_result = candidate
        search_query = query
        search_nodes = nodes
        break
    if search_result is None:
        search_result = candidate
        search_query = query

if isinstance(search_result, dict):
    search_result["selectedSearchQuery"] = search_query
save_json("01_search_all.json", search_result)
summary.append(search_result)

seed_node = search_nodes[0] if search_nodes else {}
seed_id = node_id(seed_node)
seed_name = node_name(seed_node) or "徐工集团工程机械股份有限公司"

if seed_id:
    expand_body = {
        "depth": 1,
        "nodeLimit": 30,
        "edgeLimit": 80,
        "responseMode": "full",
        "includeProperties": True,
    }
    encoded_id = urllib.parse.quote(seed_id, safe="")
    expand = call_json("graph_expand", "POST", f"/api/v1/graph/expand/{encoded_id}", expand_body)
else:
    expand = {
        "name": "graph_expand",
        "method": "POST",
        "path": "/api/v1/graph/expand/{node_id}",
        "statusCode": None,
        "ok": False,
        "contentType": "",
        "isJson": True,
        "error": "Skipped: no node id returned by search-all",
        "requestBody": None,
        "response": {"detail": "Skipped because search-all returned no usable node id."},
        "testedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
save_json("02_expand_node.json", expand)
summary.append(expand)

community_body = {
    "seedNames": [seed_name] if seed_name else [],
    "seedIds": [seed_id] if seed_id else [],
    "maxHop": 2,
    "method": "auto",
    "communityMode": "expanded",
    "minCommunitySize": 2,
    "pathLimit": 1000,
    "maxNodes": 300,
    "responseMode": "summary",
    "includeRawSubgraph": False,
    "includeCommunityGraph": True,
}
community = call_json("community_discovery", "POST", "/api/v1/governance/community-discovery", community_body)
save_json("03_community_discovery.json", community)
summary.append(community)

risk_body = {
    "seedNames": [seed_name] if seed_name else [],
    "seedIds": [seed_id] if seed_id else [],
    "maxHop": 2,
    "maxPathLength": 4,
    "method": "auto",
    "communityMode": "expanded",
    "includeCommunityDiscovery": True,
    "includeCommunityPath": True,
    "includeNodePath": True,
    "subgraphPathLimit": 1000,
    "riskPathLimit": 10,
    "maxBranchPerNode": 10,
    "minRiskScore": 0,
    "responseMode": "full",
}
risk = call_json("risk_paths", "POST", "/api/v1/governance/risk-paths", risk_body)
save_json("04_risk_paths.json", risk)
summary.append(risk)

report_body = {
    "query": f"分析{seed_name}的风险传导、群体发现和协同治理社区报告",
    "focusEntities": [seed_name] if seed_name else [],
    "maxHop": 2,
    "exportFormats": ["markdown"],
    "sessionId": "api-json-test",
    "roundId": 1,
}
compliance = call_json("compliance_report_open_api_path", "POST", "/api/v1/governance/compliance-report", report_body)
save_json("05_compliance_report.json", compliance)
summary.append(compliance)

actual_report = call_json("governance_reports_actual_path", "POST", "/api/v1/governance/reports", report_body)
save_json("05b_governance_reports_actual_path.json", actual_report)

summary_obj = {
    "baseUrl": BASE_URL,
    "outputDir": str(OUT_DIR),
    "selectedSeed": {"id": seed_id, "name": seed_name, "searchQuery": search_query},
    "allFiveReturnedJson": all(item.get("isJson") for item in summary),
    "allFiveStatusOk": all(item.get("ok") for item in summary),
    "results": [
        {
            "name": item.get("name"),
            "path": item.get("path"),
            "statusCode": item.get("statusCode"),
            "ok": item.get("ok"),
            "isJson": item.get("isJson"),
            "error": item.get("error"),
        }
        for item in summary
    ],
    "actualReportPathCheck": {
        "path": "/api/v1/governance/reports",
        "statusCode": actual_report.get("statusCode"),
        "ok": actual_report.get("ok"),
        "isJson": actual_report.get("isJson"),
        "error": actual_report.get("error"),
    },
    "testedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
}
save_json("summary.json", summary_obj)
print(json.dumps(summary_obj, ensure_ascii=False, indent=2))
