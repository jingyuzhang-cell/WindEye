from __future__ import annotations

from api.governance_routes import (
    PublicCommunityDiscoveryRequest,
    PublicComplianceReportRequest,
    PublicRiskPathsRequest,
    public_community_discovery,
    public_compliance_report,
    public_risk_paths,
)


def test_public_community_discovery_simplifies_payload(monkeypatch):
    def fake_internal(req):
        assert req.seedNames == ["鑫达投资管理有限公司"]
        return {
            "success": True,
            "traceId": "trc-community-1",
            "seedNodes": [
                {
                    "id": "company-001",
                    "labels": ["COMPANY"],
                    "properties": {"COMPANY_NM": "鑫达投资管理有限公司"},
                }
            ],
            "communities": [
                {"communityId": 7, "memberNodeIds": ["company-001", "person-001"], "riskScore": 83.5}
            ],
            "entityCommunityMap": {
                "company-001": {"id": "company-001", "name": "鑫达投资管理有限公司", "type": "COMPANY", "communityId": 7, "role": "core"},
                "person-001": {"id": "person-001", "name": "张某", "type": "PERSON", "communityId": 7, "role": "bridge"},
            },
            "summary": {"communityCount": 2, "nodeCount": 18, "seedCommunityId": 7},
            "warnings": [],
        }

    monkeypatch.setattr("api.governance_routes.community_discovery", fake_internal)

    response = public_community_discovery(
        PublicCommunityDiscoveryRequest(subjectName="鑫达投资管理有限公司")
    )

    assert response["success"] is True
    assert response["data"]["subject"]["name"] == "鑫达投资管理有限公司"
    assert response["data"]["targetCommunity"]["communityId"] == 7
    assert response["data"]["targetCommunity"]["riskLevel"] == "high"
    assert response["summary"]["bridgeNodeCount"] == 1


def test_public_risk_paths_filters_by_level_and_count(monkeypatch):
    def fake_internal(req):
        assert req.seedNames == ["鑫达投资管理有限公司"]
        return {
            "success": True,
            "traceId": "trc-risk-1",
            "seedNodes": [
                {
                    "id": "company-001",
                    "labels": ["COMPANY"],
                    "properties": {"COMPANY_NM": "鑫达投资管理有限公司"},
                }
            ],
            "riskPaths": [
                {"pathId": "p1", "riskLevel": "low", "score": 58, "description": "低风险路径", "nodeIds": ["a", "b"]},
                {"pathId": "p2", "riskLevel": "medium", "score": 71, "description": "中风险路径", "nodeIds": ["a", "c"]},
                {"pathId": "p3", "riskLevel": "high", "score": 92, "description": "高风险路径", "nodeIds": ["a", "d"]},
            ],
            "summary": {"communityCount": 3},
            "warnings": ["test-warning"],
        }

    monkeypatch.setattr("api.governance_routes.risk_paths", fake_internal)

    response = public_risk_paths(
        PublicRiskPathsRequest(
            subjectName="鑫达投资管理有限公司",
            maxPaths=1,
            minRiskLevel="medium",
        )
    )

    assert response["success"] is True
    assert len(response["data"]["paths"]) == 1
    assert response["data"]["paths"][0]["pathId"] == "p2"
    assert response["summary"]["pathCount"] == 1
    assert response["warnings"] == ["test-warning"]


def test_public_compliance_report_returns_compact_shape(monkeypatch):
    def fake_internal(req):
        assert req.seedNames == ["鑫达投资管理有限公司"]
        assert req.exportFormats == ["docx"]
        return {
            "success": True,
            "traceId": "trc-report-1",
            "subject": "鑫达投资管理有限公司",
            "reportId": "WIND-COMP-001",
            "generatedAt": "2026-07-15 10:00:00",
            "riskPaths": [{"pathId": "p1"}],
            "report": {
                "title": "鑫达投资管理有限公司协同治理社区报告",
                "executiveSummary": "总体风险较高。",
                "reportSections": [
                    {"title": "执行摘要", "summary": "总体风险较高。"},
                    {"title": "治理建议", "summary": "建议立即核查关联交易。"},
                ],
            },
            "compliance": {
                "riskLevel": "high",
                "score": 82.6,
                "matchedRules": [{"code": "R1"}],
                "violations": [{"pathId": "p1"}],
            },
            "complianceIndicators": {"totalScore": 82.6, "riskLevel": "high"},
            "governance": {
                "actions": [{"title": "立即核查", "owner": "风控部"}],
                "responsibleEntities": [{"name": "鑫达投资管理有限公司", "role": "被监管对象"}],
            },
            "exportFiles": {
                "docx": {
                    "fileName": "WIND-COMP-001.docx",
                    "downloadUrl": "/api/v1/governance/compliance-report/files/WIND-COMP-001.docx",
                    "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                }
            },
            "warnings": [],
        }

    monkeypatch.setattr("api.governance_routes.compliance_report", fake_internal)

    response = public_compliance_report(
        PublicComplianceReportRequest(subjectName="鑫达投资管理有限公司")
    )

    assert response["success"] is True
    assert response["data"]["subject"]["name"] == "鑫达投资管理有限公司"
    assert response["data"]["riskAssessment"]["riskLevel"] == "high"
    assert response["data"]["report"]["download"]["fileName"] == "WIND-COMP-001.docx"
    assert response["summary"]["exported"] is True
