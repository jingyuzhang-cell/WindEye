from __future__ import annotations

import urllib.parse

from api_test_common import (
    call_json,
    parse_args,
    print_row,
    resolve_company_node,
    save_result,
    wrap_result,
)


def main() -> int:
    base_url, company = parse_args()
    resolved = resolve_company_node(base_url, company)
    node_id = resolved.get("nodeId", "")
    if not node_id:
        payload = {
            "api": "/api/v1/graph/expand/{node_id}",
            "expectedStatus": 200,
            "statusCode": None,
            "isJson": True,
            "conclusion": "未找到可展开节点",
            "company": company,
            "resolution": resolved,
            "raw": None,
        }
        save_result("02_expand_xugong.json", payload)
        print_row(payload)
        return 1

    encoded_id = urllib.parse.quote(node_id, safe="")
    api = f"/api/v1/graph/expand/{encoded_id}"
    body = {
        "depth": 1,
        "limit": 1000,
        "relationWhitelist": [],
        "layerWhitelist": [],
        "includeCrossLayer": True,
        "includeProperties": True,
        "traversalMode": "cascade",
        "prunePolicy": "degree_aware",
        "maxExpandDegree": 200,
        "keepHighDegreeNode": True,
        "includePruningSummary": True,
    }
    result = call_json(base_url, "POST", api, body)
    response = result.get("response")
    graph_payload = response if isinstance(response, dict) else {}
    triples = graph_payload.get("triples", []) if isinstance(graph_payload, dict) else []
    summary = graph_payload.get("summary", {}) if isinstance(graph_payload, dict) else {}
    pruning = summary.get("pruning", {}) if isinstance(summary, dict) else {}
    graph_ok = bool(
        result.get("statusCode") == 200
        and result.get("isJson")
        and isinstance(graph_payload, dict)
        and isinstance(graph_payload.get("centerNode"), dict)
        and isinstance(graph_payload.get("nodes"), list)
        and isinstance(graph_payload.get("edges"), list)
        and isinstance(triples, list)
        and len(triples) > 0
    )
    payload = wrap_result(
        "/api/v1/graph/expand/{node_id}",
        result,
        expected_status=200,
        extra={
            "company": company,
            "resolution": resolved,
            "graphJsonComplete": graph_ok,
            "nodeCount": len(graph_payload.get("nodes", [])) if isinstance(graph_payload, dict) else 0,
            "edgeCount": len(graph_payload.get("edges", [])) if isinstance(graph_payload, dict) else 0,
            "tripleCount": len(triples),
            "prunePolicy": pruning.get("policy"),
            "maxExpandDegree": pruning.get("maxExpandDegree"),
            "terminalHubCount": pruning.get("terminalHubCount", 0),
            "blockedExpansionCount": pruning.get("blockedExpansionCount", 0),
        },
    )
    save_result("02_expand_xugong.json", payload)
    if graph_payload:
        save_result("02_expand_xugong_graph.json", graph_payload)
    save_result(
        "02_expand_xugong_triples.json",
        {
            "api": "/api/v1/graph/expand/{node_id}",
            "company": company,
            "nodeId": node_id,
            "tripleCount": len(triples),
            "triples": triples,
        },
    )
    print_row(payload)
    return 0 if graph_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
