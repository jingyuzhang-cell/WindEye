from __future__ import annotations

from api.governance_routes import (
    CommunityDiscoveryRequest,
    ComplianceReportRequest,
    community_discovery,
    compliance_report,
)


def test_community_discovery_uses_resolved_seed_ids(monkeypatch):
    captured: dict[str, object] = {}

    class FakeGraphAnalytics:
        def __init__(self, db_client=None):
            captured["db_client"] = db_client

        def discover_seeded_communities(self, **kwargs):
            captured["discover_kwargs"] = kwargs
            return {
                "success": True,
                "selected_method": "wcc",
                "fallback_reason": "",
                "seed_nodes": [
                    {
                        "id": "kg-node-001",
                        "labels": ["COMPANY"],
                        "properties": {"COMPANY_NM": "徐工机械股份有限公司"},
                    }
                ],
                "candidate_seeds": [],
                "selected_seed_ids": ["kg-node-001"],
                "seed_selection": {},
                "node_count": 3,
                "edge_count": 2,
                "community_count": 1,
                "seed_community_id": 0,
                "communities": [],
                "entity_community_map": {},
                "connected_subgraph": {"nodes": [], "edges": []},
                "subgraph": {"nodes": [], "edges": []},
                "community_edges": [],
                "community_graph": {"nodes": [], "edges": []},
            }

    monkeypatch.setattr(
        "api.governance_routes._resolve_seed_entities",
        lambda seed_names, seed_ids, preferred_type="COMPANY": {
            "requestedSeedNames": seed_names,
            "requestedSeedIds": seed_ids,
            "resolvedSeedNames": ["徐工机械股份有限公司"],
            "resolvedSeedIds": ["kg-node-001"],
            "resolvedEntities": [
                {
                    "raw": "徐工集团工程机械股份有限公司",
                    "canonicalName": "徐工机械股份有限公司",
                    "kgNodeId": "kg-node-001",
                    "matchType": "alias",
                    "matchScore": 0.95,
                    "confidence": 0.93,
                }
            ],
            "candidateEntities": [],
            "unresolvedSeedNames": [],
            "usedResolver": True,
        },
    )
    monkeypatch.setattr("kg_query.analytics.graph_analytics.GraphAnalytics", FakeGraphAnalytics)

    response = community_discovery(
        CommunityDiscoveryRequest(seedNames=["徐工集团工程机械股份有限公司"], maxHop=2)
    )

    assert captured["discover_kwargs"]["seed_names"] == ["徐工机械股份有限公司"]
    assert captured["discover_kwargs"]["seed_ids"] == ["kg-node-001"]
    assert response["entityResolution"]["resolvedSeedIds"] == ["kg-node-001"]
    assert response["entityResolution"]["resolvedSeedNames"] == ["徐工机械股份有限公司"]


def test_compliance_report_propagates_resolved_seed_ids(monkeypatch):
    calls: dict[str, object] = {}

    monkeypatch.setattr(
        "api.governance_routes._resolve_seed_entities",
        lambda seed_names, seed_ids, preferred_type="COMPANY": {
            "requestedSeedNames": seed_names,
            "requestedSeedIds": seed_ids,
            "resolvedSeedNames": ["徐工机械股份有限公司"],
            "resolvedSeedIds": ["kg-node-001"],
            "resolvedEntities": [
                {
                    "raw": "徐工集团工程机械股份有限公司",
                    "canonicalName": "徐工机械股份有限公司",
                    "kgNodeId": "kg-node-001",
                    "matchType": "alias",
                    "matchScore": 0.95,
                    "confidence": 0.93,
                }
            ],
            "candidateEntities": [],
            "unresolvedSeedNames": [],
            "usedResolver": True,
        },
    )

    def fake_community_discovery(req):
        calls["community_req"] = req.model_dump()
        return {
            "success": True,
            "seedNodes": [
                {
                    "id": "kg-node-001",
                    "labels": ["COMPANY"],
                    "properties": {"COMPANY_NM": "徐工机械股份有限公司"},
                }
            ],
            "subgraph": {"nodes": [], "edges": []},
            "communities": [],
            "summary": {"communityCount": 0},
        }

    def fake_risk_paths(req):
        calls["risk_req"] = req.model_dump()
        return {
            "success": True,
            "riskPaths": [],
            "communityRiskPaths": [],
            "summary": {"riskPathCount": 0, "highRiskCount": 0},
        }

    def fake_export(response, req):
        return {
            "format": "docx",
            "fileName": "resolved-report.docx",
            "filePath": "D:\\Code\\WindEye\\backend\\report_outputs\\resolved-report.docx",
            "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "sizeBytes": 1024,
            "generatedAt": "2026-07-14 13:00:00",
        }

    monkeypatch.setattr("api.governance_routes.community_discovery", fake_community_discovery)
    monkeypatch.setattr("api.governance_routes.risk_paths", fake_risk_paths)
    monkeypatch.setattr("api.governance_routes._export_compliance_report_docx", fake_export)
    monkeypatch.setattr("api.governance_routes._apply_export_delivery_options", lambda file, req: file)

    response = compliance_report(
        ComplianceReportRequest(
            query="徐工集团工程机械股份有限公司的治理报告",
            seedNames=["徐工集团工程机械股份有限公司"],
            exportFormats=["docx"],
            responseMode="full",
        )
    )

    assert calls["community_req"]["seedNames"] == ["徐工机械股份有限公司"]
    assert calls["community_req"]["seedIds"] == ["kg-node-001"]
    assert calls["risk_req"]["seedNames"] == ["徐工机械股份有限公司"]
    assert calls["risk_req"]["seedIds"] == ["kg-node-001"]
    assert response["pipelineTrace"]["requestedSeedNames"] == ["徐工集团工程机械股份有限公司"]
    assert response["pipelineTrace"]["resolvedSeedNames"] == ["徐工机械股份有限公司"]
    assert response["entityResolution"]["resolvedSeedIds"] == ["kg-node-001"]
