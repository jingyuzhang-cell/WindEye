from __future__ import annotations

from api_test_common import (
    call_json,
    parse_args,
    print_row,
    save_result,
    search_all_body,
    wrap_result,
)


def main() -> int:
    base_url, company = parse_args()
    api = "/api/v1/graph/search-all"
    body = search_all_body(company, depth=1, traversal_mode="cascade")
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
        and isinstance(graph_payload.get("matchedNodes"), list)
        and isinstance(graph_payload.get("nodes"), list)
        and isinstance(graph_payload.get("edges"), list)
        and isinstance(triples, list)
        and len(triples) > 0
    )
    payload = wrap_result(
        api,
        result,
        expected_status=200,
        extra={
            "company": company,
            "graphJsonComplete": graph_ok,
            "matchedNodeCount": len(graph_payload.get("matchedNodes", [])) if isinstance(graph_payload, dict) else 0,
            "nodeCount": len(graph_payload.get("nodes", [])) if isinstance(graph_payload, dict) else 0,
            "edgeCount": len(graph_payload.get("edges", [])) if isinstance(graph_payload, dict) else 0,
            "tripleCount": len(triples),
            "prunePolicy": pruning.get("policy"),
            "maxExpandDegree": pruning.get("maxExpandDegree"),
            "terminalHubCount": pruning.get("terminalHubCount", 0),
            "blockedExpansionCount": pruning.get("blockedExpansionCount", 0),
        },
    )
    save_result("01_search_all_xugong.json", payload)
    if graph_payload:
        save_result("01_search_all_xugong_graph.json", graph_payload)
    save_result(
        "01_search_all_xugong_triples.json",
        {
            "api": api,
            "company": company,
            "tripleCount": len(triples),
            "triples": triples,
        },
    )
    print_row(payload)
    return 0 if graph_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
