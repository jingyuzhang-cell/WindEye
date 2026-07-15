from __future__ import annotations

from api.governance_routes import ComplianceReportRequest, compliance_report


def test_compliance_report_uses_online_new_report(monkeypatch):
    seed_node = {
        "id": "node-company-1",
        "labels": ["COMPANY"],
        "properties": {"COMPANY_NM": "测试科技股份有限公司"},
    }
    subject_node = seed_node
    person_node = {
        "id": "node-person-1",
        "labels": ["PERSON"],
        "properties": {"PERSON_NM": "张三"},
    }
    event_node = {
        "id": "node-event-1",
        "labels": ["EVENT"],
        "properties": {"name": "信息披露违规"},
    }
    law_node = {
        "id": "node-law-1",
        "labels": ["Law"],
        "properties": {"name": "证券法"},
    }
    security_node = {
        "id": "4:a33932a8-3530-4bd7-bb14-ce721f494adf:363269",
        "labels": ["SECURITY"],
        "properties": {"SECURITYNm": "徐工转债", "SECURITYType": "债券"},
    }
    regulator_node = {
        "id": "node-reg-1",
        "labels": ["REGULATOR"],
        "properties": {"name": "中国证监会"},
    }

    community_payload = {
        "success": True,
        "seedNodes": [seed_node],
        "subgraph": {
            "nodes": [subject_node, person_node, event_node, law_node, security_node, regulator_node],
            "edges": [
                {"id": "edge-0", "source": "4:a33932a8-3530-4bd7-bb14-ce721f494adf:363269", "target": "node-company-1", "type": "ISSUES"},
                {"id": "edge-1", "source": "node-company-1", "target": "node-event-1", "type": "INVOLVED_IN"},
                {"id": "edge-2", "source": "node-person-1", "target": "node-company-1", "type": "SERVES_AS"},
                {"id": "edge-3", "source": "node-event-1", "target": "node-law-1", "type": "COMPLIES_WITH"},
                {"id": "edge-4", "source": "node-reg-1", "target": "node-event-1", "type": "SUPERVISES"},
            ],
        },
        "communities": [
            {"communityId": 0, "memberNodeIds": ["node-company-1", "node-person-1", "node-event-1"]},
            {"communityId": 1, "memberNodeIds": ["node-law-1", "node-reg-1"]},
        ],
        "entityCommunityMap": {
            "node-company-1": {"communityId": 0},
            "node-event-1": {"communityId": 0},
            "node-law-1": {"communityId": 1},
        },
        "communityGraph": {
            "nodes": [{"communityId": 0}, {"communityId": 1}],
            "edges": [{"source": 0, "target": 1, "weight": 0.8}],
        },
        "summary": {
            "seedNodeCount": 1,
            "nodeCount": 5,
            "edgeCount": 4,
            "communityCount": 2,
            "seedCommunityId": 0,
        },
    }

    risk_payload = {
        "success": True,
        "riskPaths": [
            {
                "pathId": "path-1",
                "riskLevel": "high",
                "score": 92,
                "pathDescription": "4:a33932a8-3530-4bd7-bb14-ce721f494adf:363269 通过发行关系关联至 测试科技股份有限公司，随后 测试科技股份有限公司 通过违规关系关联至 信息披露违规",
                "nodeIds": ["4:a33932a8-3530-4bd7-bb14-ce721f494adf:363269", "node-company-1", "node-event-1", "node-law-1"],
                "edgeIds": ["edge-0", "edge-1", "edge-3"],
                "relations": ["发行", "违规", "法规约束"],
                "communityPath": [0, 1],
            }
        ],
        "communityRiskPaths": [
            {"sourceCommunityId": 0, "targetCommunityId": 1, "riskLevel": "high", "score": 92}
        ],
        "summary": {
            "seedNodeCount": 1,
            "nodeCount": 5,
            "edgeCount": 4,
            "communityCount": 2,
            "candidatePathCount": 1,
            "riskPathCount": 1,
            "highRiskCount": 1,
            "mediumRiskCount": 0,
            "lowRiskCount": 0,
        },
    }

    def fake_export(response, req):
        return {
            "format": "docx",
            "fileName": "WIND-COMP-test.docx",
            "filePath": "D:\\Code\\WindEye\\backend\\report_outputs\\WIND-COMP-test.docx",
            "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "sizeBytes": 2048,
            "generatedAt": "2026-07-14 12:00:00",
        }

    monkeypatch.setattr("api.governance_routes.community_discovery", lambda req: community_payload)
    monkeypatch.setattr("api.governance_routes.risk_paths", lambda req: risk_payload)
    monkeypatch.setattr("api.governance_routes._export_compliance_report_docx", fake_export)
    monkeypatch.setattr("api.governance_routes._apply_export_delivery_options", lambda file, req: file)

    response = compliance_report(
        ComplianceReportRequest(
            query="分析测试科技股份有限公司的协同治理风险",
            seedNames=["测试科技股份有限公司"],
            maxHop=2,
            maxPathLength=4,
            exportFormats=["docx"],
            responseMode="full",
            reportOptions={"includeDownloadUrl": False, "includeServerPath": True},
        )
    )

    assert response["success"] is True
    assert response["pipelineTrace"]["engineMode"] == "online_new_report"
    assert response["defaultFormat"] == "docx"
    assert response["exportFiles"]["docx"]["fileName"] == "WIND-COMP-test.docx"
    assert response["export_files"]["docx"]["fileName"] == "WIND-COMP-test.docx"
    assert response["report"]["title"] == "测试科技股份有限公司协同治理社区报告"
    assert len(response["report"]["reportSections"]) >= 6
    assert response["report_sections"] == response["report"]["reportSections"]
    assert response["compliance_indicator_details"]
    assert response["viewModel"]["reportPanel"] == "compliance-report"
    assert "4:a33932a8-3530-4bd7-bb14-ce721f494adf:363269" not in response["markdown_report"]
    assert "徐工转债" in response["markdown_report"]
    assert "发行关系" in response["markdown_report"]


def test_compliance_report_accepts_simplified_request_and_returns_summary(monkeypatch):
    def fake_resolve(seed_names, seed_ids, preferred_type="COMPANY"):
        assert seed_names == ["徐工集团工程机械股份有限公司"]
        return {
            "requestedSeedNames": seed_names,
            "requestedSeedIds": seed_ids,
            "resolvedSeedNames": ["徐工机械股份有限公司"],
            "resolvedSeedIds": ["kg-node-001"],
            "resolvedEntities": [
                {
                    "raw": "徐工集团工程机械股份有限公司",
                    "canonicalName": "徐工机械股份有限公司",
                    "kgNodeId": "kg-node-001",
                    "entityType": "COMPANY",
                    "matchType": "alias",
                    "matchScore": 0.95,
                    "confidence": 0.93,
                }
            ],
            "candidateEntities": [],
            "unresolvedSeedNames": [],
            "usedResolver": True,
        }

    def fake_community(req):
        assert req.seedNames == ["徐工机械股份有限公司"]
        assert req.seedIds == ["kg-node-001"]
        assert req.maxHop == 3
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
            "summary": {"communityCount": 2},
        }

    def fake_risk(req):
        assert req.seedNames == ["徐工机械股份有限公司"]
        assert req.seedIds == ["kg-node-001"]
        assert req.maxHop == 3
        return {
            "success": True,
            "riskPaths": [{"pathId": "path-1"}],
            "communityRiskPaths": [{"sourceCommunityId": 1, "targetCommunityId": 2}],
            "summary": {"riskPathCount": 1, "highRiskCount": 1},
        }

    def fake_build(report_req):
        assert report_req.query == "请分析徐工机械股份有限公司的协同治理社区报告"
        return {
            "success": True,
            "traceId": "trc-summary-1",
            "reportId": "WIND-COMP-001",
            "generatedAt": "2026-07-15 16:00:00",
            "seedNodes": [
                {
                    "id": "kg-node-001",
                    "labels": ["COMPANY"],
                    "properties": {"COMPANY_NM": "徐工机械股份有限公司"},
                }
            ],
            "subject": "徐工机械股份有限公司",
            "report": {
                "title": "徐工机械股份有限公司协同治理社区报告",
                "executiveSummary": "总体风险较高。",
                "reportSections": [
                    {"title": "执行摘要", "summary": "总体风险较高。"},
                    {"title": "治理建议", "summary": "建议关注担保与关联交易。"},
                ],
            },
            "compliance": {
                "riskLevel": "high",
                "score": 82.6,
                "matchedRules": [{"code": "R1"}],
                "violations": [{"id": "v1"}],
            },
            "complianceIndicators": {"totalScore": 82.6, "riskLevel": "high"},
            "governance": {
                "actions": [{"title": "立即核查", "owner": "风控部"}],
                "responsibleEntities": [{"name": "徐工机械股份有限公司", "role": "被监管对象"}],
            },
            "riskPaths": [{"pathId": "path-1"}],
            "warnings": [],
        }

    def fake_export(response, req):
        assert req.exportWord is True
        return {
            "format": "docx",
            "fileName": "WIND-COMP-001.docx",
            "filePath": "D:\\Code\\WindEye\\backend\\report_outputs\\WIND-COMP-001.docx",
            "downloadUrl": "/api/v1/governance/compliance-report/files/WIND-COMP-001.docx",
            "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "sizeBytes": 4096,
            "generatedAt": "2026-07-15 16:00:00",
        }

    monkeypatch.setattr("api.governance_routes._resolve_seed_entities", fake_resolve)
    monkeypatch.setattr("api.governance_routes.community_discovery", fake_community)
    monkeypatch.setattr("api.governance_routes.risk_paths", fake_risk)
    monkeypatch.setattr("api.governance_routes._build_compliance_report", fake_build)
    monkeypatch.setattr("api.governance_routes._export_compliance_report_docx", fake_export)
    monkeypatch.setattr("api.governance_routes._apply_export_delivery_options", lambda file, req: file)

    response = compliance_report(
        ComplianceReportRequest(
            subjectName="徐工集团工程机械股份有限公司",
            depth=3,
            exportWord=True,
            responseMode="summary",
        )
    )

    assert response["success"] is True
    assert response["subject"]["name"] == "徐工机械股份有限公司"
    assert response["riskLevel"] == "high"
    assert response["totalScore"] == 82.6
    assert response["report"]["title"] == "徐工机械股份有限公司协同治理社区报告"
    assert response["report"]["download"]["fileName"] == "WIND-COMP-001.docx"
    assert response["stats"]["pathCount"] == 1
    assert response["entityResolution"]["resolvedSeedIds"] == ["kg-node-001"]
