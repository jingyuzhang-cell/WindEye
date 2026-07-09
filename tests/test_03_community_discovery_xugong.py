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
    api = "/api/v1/governance/community-discovery"
    body = {
        # The fuzzy search step has already confirmed the company node.
        # Use seedIds only so this test validates the selected entity, not
        # a broad multi-seed name resolution result.
        "seedNames": [],
        "seedIds": [seed_id] if seed_id else [],
        "maxHop": 2,
        "method": "auto",
        "communityMode": "expanded",
        "minCommunitySize": 2,
        "pathLimit": 5000,
        "maxNodes": 1000,
        "responseMode": "full",
        "includeRawSubgraph": True,
        "includeCommunityGraph": True,
    }
    result = call_json(base_url, "POST", api, body)
    response = result.get("response")
    payload_body = response if isinstance(response, dict) else {}
    summary = payload_body.get("summary", {}) if isinstance(payload_body, dict) else {}
    subgraph = payload_body.get("subgraph", {}) if isinstance(payload_body.get("subgraph"), dict) else {}
    connected = payload_body.get("connectedSubgraph", {}) if isinstance(payload_body.get("connectedSubgraph"), dict) else {}
    community_graph = payload_body.get("communityGraph", {}) if isinstance(payload_body.get("communityGraph"), dict) else {}
    entity_map = payload_body.get("entityCommunityMap", {}) if isinstance(payload_body.get("entityCommunityMap"), dict) else {}
    communities = payload_body.get("communities", []) if isinstance(payload_body.get("communities"), list) else []
    community_edges = payload_body.get("communityEdges", []) if isinstance(payload_body.get("communityEdges"), list) else []
    visualization = payload_body.get("visualization", {}) if isinstance(payload_body.get("visualization"), dict) else {}

    full_json_complete = bool(
        result.get("statusCode") == 200
        and result.get("isJson")
        and payload_body.get("success") is True
        and isinstance(payload_body.get("seedNodes"), list)
        and isinstance(payload_body.get("candidateSeeds"), list)
        and isinstance(payload_body.get("selectedSeedIds"), list)
        and isinstance(summary, dict)
        and isinstance(communities, list)
        and isinstance(entity_map, dict)
        and isinstance(community_edges, list)
        and isinstance(community_graph.get("nodes", []), list)
        and isinstance(community_graph.get("edges", []), list)
        and isinstance(subgraph.get("nodes", []), list)
        and isinstance(subgraph.get("edges", []), list)
        and isinstance(connected.get("nodes", []), list)
        and isinstance(connected.get("edges", []), list)
        and isinstance(visualization, dict)
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
            "seedNodeCount": len(payload_body.get("seedNodes", [])) if isinstance(payload_body, dict) else 0,
            "selectedSeedCount": len(payload_body.get("selectedSeedIds", [])) if isinstance(payload_body, dict) else 0,
            "candidateSeedCount": len(payload_body.get("candidateSeeds", [])) if isinstance(payload_body, dict) else 0,
            "summaryNodeCount": summary.get("nodeCount"),
            "summaryEdgeCount": summary.get("edgeCount"),
            "communityCount": summary.get("communityCount"),
            "seedCommunityId": summary.get("seedCommunityId"),
            "communityListCount": len(communities),
            "entityCommunityMapCount": len(entity_map),
            "communityGraphNodeCount": len(community_graph.get("nodes", [])) if isinstance(community_graph, dict) else 0,
            "communityGraphEdgeCount": len(community_graph.get("edges", [])) if isinstance(community_graph, dict) else 0,
            "subgraphNodeCount": subgraph.get("nodeCount", len(subgraph.get("nodes", []))) if isinstance(subgraph, dict) else 0,
            "subgraphEdgeCount": subgraph.get("edgeCount", len(subgraph.get("edges", []))) if isinstance(subgraph, dict) else 0,
            "connectedSubgraphNodeCount": connected.get("nodeCount", len(connected.get("nodes", []))) if isinstance(connected, dict) else 0,
            "connectedSubgraphEdgeCount": connected.get("edgeCount", len(connected.get("edges", []))) if isinstance(connected, dict) else 0,
        },
    )
    save_result("03_community_discovery_xugong.json", payload)
    if payload_body:
        save_result("03_community_discovery_xugong_full_response.json", payload_body)
    print_row(payload)
    return 0 if full_json_complete else 1


if __name__ == "__main__":
    raise SystemExit(main())
