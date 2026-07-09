from __future__ import annotations

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
    seed_name = resolved.get("nodeName") or company
    seed_id = resolved.get("nodeId", "")
    api = "/api/v1/governance/risk-paths"
    body = {
        "seedNames": [],
        "seedIds": [seed_id] if seed_id else [],
        "maxHop": 2,
        "maxPathLength": 4,
        "method": "auto",
        "communityMode": "expanded",
        "includeCommunityDiscovery": True,
        "includeCommunityPath": True,
        "includeNodePath": True,
        "subgraphPathLimit": 5000,
        "riskPathLimit": 10,
        "maxBranchPerNode": 10,
        "minRiskScore": 0,
        "responseMode": "full",
    }
    result = call_json(base_url, "POST", api, body)
    response = result.get("response")
    payload_body = response if isinstance(response, dict) else {}
    summary = payload_body.get("summary", {}) if isinstance(payload_body.get("summary"), dict) else {}
    community_discovery = (
        payload_body.get("communityDiscovery", {})
        if isinstance(payload_body.get("communityDiscovery"), dict)
        else {}
    )
    risk_paths = payload_body.get("riskPaths", []) if isinstance(payload_body.get("riskPaths"), list) else []
    community_risk_paths = (
        payload_body.get("communityRiskPaths", [])
        if isinstance(payload_body.get("communityRiskPaths"), list)
        else []
    )
    view_model = payload_body.get("viewModel", {}) if isinstance(payload_body.get("viewModel"), dict) else {}
    full_json_complete = bool(
        result.get("statusCode") == 200
        and result.get("isJson")
        and payload_body.get("success") is True
        and isinstance(summary, dict)
        and isinstance(payload_body.get("seedNodes"), list)
        and isinstance(community_discovery, dict)
        and isinstance(risk_paths, list)
        and isinstance(community_risk_paths, list)
        and isinstance(view_model.get("highlightNodeIds", []), list)
        and isinstance(view_model.get("highlightEdgeIds", []), list)
        and isinstance(view_model.get("highlightCommunityIds", []), list)
    )
    payload = wrap_result(
        api,
        result,
        expected_status=200,
        extra={
            "company": company,
            "seedName": seed_name,
            "seedId": seed_id,
            "resolution": resolved,
            "responseMode": body["responseMode"],
            "fullJsonComplete": full_json_complete,
            "seedNodeCount": summary.get("seedNodeCount"),
            "nodeCount": summary.get("nodeCount"),
            "edgeCount": summary.get("edgeCount"),
            "communityCount": summary.get("communityCount"),
            "candidatePathCount": summary.get("candidatePathCount"),
            "riskPathCount": summary.get("riskPathCount"),
            "highRiskCount": summary.get("highRiskCount"),
            "mediumRiskCount": summary.get("mediumRiskCount"),
            "lowRiskCount": summary.get("lowRiskCount"),
            "riskPathListCount": len(risk_paths),
            "communityRiskPathCount": len(community_risk_paths),
            "highlightNodeCount": len(view_model.get("highlightNodeIds", [])) if isinstance(view_model, dict) else 0,
            "highlightEdgeCount": len(view_model.get("highlightEdgeIds", [])) if isinstance(view_model, dict) else 0,
            "highlightCommunityCount": len(view_model.get("highlightCommunityIds", [])) if isinstance(view_model, dict) else 0,
            "communityDiscoveryKeys": sorted(community_discovery.keys()),
            "warnings": payload_body.get("warnings", []),
        },
    )
    save_result("04_risk_paths_xugong.json", payload)
    if payload_body:
        save_result("04_risk_paths_xugong_full_response.json", payload_body)
    print_row(payload)
    return 0 if full_json_complete else 1


if __name__ == "__main__":
    raise SystemExit(main())
