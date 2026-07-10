# 风险传导路径与协同治理社区报告 API 本地测试摘要

测试对象：徐工集团工程机械股份有限公司

## 4. 风险传导路径分析 API

接口：`POST /api/v1/governance/risk-paths`

测试链路：
1. 先通过 `/api/v1/graph/search-all` 模糊搜索并确认企业节点。
2. 获取 node_id：`4:a33932a8-3530-4bd7-bb14-ce721f494adf:1083761`。
3. 风险路径请求仅传 `seedIds`，使用 `responseMode=full`。

### 请求参数

```json
{
  "seedNames": [],
  "seedIds": ["4:a33932a8-3530-4bd7-bb14-ce721f494adf:1083761"],
  "maxHop": 2,
  "maxPathLength": 4,
  "method": "auto",
  "communityMode": "expanded",
  "includeCommunityDiscovery": true,
  "includeCommunityPath": true,
  "includeNodePath": true,
  "subgraphPathLimit": 5000,
  "riskPathLimit": 10,
  "maxBranchPerNode": 10,
  "minRiskScore": 0,
  "responseMode": "full"
}
```

### 测试结果

| API | 状态码 | 是否 JSON | full JSON 完整 | 结论 |
|---|---:|---|---|---|
| `/api/v1/governance/risk-paths` | 200 | 是 | 是 | 正常 |

| 指标 | 实测值 |
|---|---:|
| seedNodeCount | 1 |
| summary.nodeCount | 500 |
| summary.edgeCount | 643 |
| communityCount | 26 |
| candidatePathCount | 100 |
| riskPathCount | 10 |
| highRiskCount / mediumRiskCount / lowRiskCount | 10 / 0 / 0 |
| riskPaths | 10 |
| communityRiskPaths | 4 |
| viewModel.highlightNodeIds | 15 |
| viewModel.highlightEdgeIds | 21 |
| viewModel.highlightCommunityIds | 7 |

文档一致性结论：`risk-paths` 的实际 full JSON 与文档主响应字段一致，包含 `summary`、`seedNodes`、`communityDiscovery`、`riskPaths`、`communityRiskPaths`、`viewModel`、`warnings`。文档已在优化版中补充本次测试结果，并把 `seedNames/seedIds` 调整为条件必填说明。

## 5. 协同治理社区报告 API

接口：`POST /api/v1/governance/compliance-report`

### 测试结果

| API | 状态码 | 是否 JSON | 与文档一致 | 结论 |
|---|---:|---|---|---|
| `/api/v1/governance/compliance-report` | 404 | 是 | 否 | 路由未注册 |

实际返回：

```json
{
  "detail": "Not Found"
}
```

文档一致性结论：当前服务没有注册 `/api/v1/governance/compliance-report`，无法返回文档定义的 `compliance`、`complianceIndicators`、`governance`、`report`、`viewModel`。文档已在优化版中标注该差异，并建议新增兼容路由，内部复用现有 `/api/v1/governance/reports` 或新的社区报告服务。

## 输出文件

- `backend/report_outputs/04_risk_paths_xugong.json`
- `backend/report_outputs/04_risk_paths_xugong_full_response.json`
- `backend/report_outputs/05_compliance_report_xugong.json`
- `docs/开放API接口文档_补全版_风险路径报告优化.docx`
- `backend/report_outputs/open_api_docx_extracted.txt`
