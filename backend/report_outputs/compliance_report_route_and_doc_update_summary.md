# compliance-report 路由与开放 API 文档更新摘要

测试对象：徐工集团工程机械股份有限公司

## 后端接口

新增接口：

`POST /api/v1/governance/compliance-report`

接口输入支持：

- `query`
- `seedNodes`
- `subgraph`
- `communities`
- `communityDiscovery`
- `riskPaths`
- `anomalyFindings`
- `complianceIndicatorConfig`
- `reportOptions`
- `exportFormats`

接口输出：

- `success`
- `apiVersion`
- `traceId`
- `reportId`
- `generatedAt`
- `subject`
- `defaultFormat=docx`
- `compliance`
- `complianceIndicators`
- `governance`
- `report`
- `exportFiles.docx`
- `communityReportSources`
- `viewModel`
- `warnings`

生成逻辑：

1. 外部只调用 `/api/v1/governance/compliance-report`，传入 `seedIds` 或 `seedNames`。
2. 接口内部先执行 `community-discovery`，生成 `seedNodes/subgraph/communities/communityGraph/entityCommunityMap`。
3. 接口内部再执行 `risk-paths`，生成 `riskPaths/communityRiskPaths/viewModel`。
4. 尝试读取 `backend/report/community_reports/*.xlsx`，补充离线社区报告摘要来源。
5. 生成 `compliance`、`complianceIndicators`、`governance.actions`、`report.markdownReport`、`viewModel`。
6. 默认调用 `DocxExporter` 生成完整 Word（`.docx`）报告，落盘到 `backend/report_outputs`。
7. 通过 `exportFiles.docx` 和 `report.filePath` 返回 Word 文件名、绝对路径、MIME 类型和文件大小。
8. 通过 `pipelineTrace` 返回内部编排摘要，包括 `communityDiscoveryGenerated`、`riskPathsGenerated`、`communitySuccess`、`riskSuccess`、`communityCount`、`riskPathCount`。

## 本地测试结果

| API | 状态码 | 是否 JSON | Word 报告完整 | 结论 |
|---|---:|---|---|---|
| `/api/v1/governance/compliance-report` | 200 | 是 | 是 | 正常 |

关键指标：

| 指标 | 实测值 |
|---|---:|
| riskLevel | high |
| complianceScore | 55 |
| governanceActionCount | 3 |
| recommendationCount | 3 |
| markdownLength | 705 |
| highlightNodeCount | 10 |
| highlightEdgeCount | 11 |
| communityReportSourceCount | 6 |

内部编排：

| 指标 | 实测值 |
|---|---|
| communityDiscoveryGenerated | true |
| riskPathsGenerated | true |
| communitySuccess | true |
| riskSuccess | true |
| communityCount | 14 |
| riskPathCount | 10 |

Word 报告结构校验：

| 指标 | 实测值 |
|---|---|
| defaultFormat | docx |
| fileName | WIND-COMP-1783604044307.docx |
| filePath | D:\Code\WindEye\backend\report_outputs\WIND-COMP-1783604044307.docx |
| sizeBytes | 42322 |
| python-docx 可读取 | true |
| 正文包含徐工主体 | true |
| paragraphCount | 24 |
| tableCount | 8 |

说明：已尝试使用文档渲染工具生成 PNG 预览，但本机缺少 LibreOffice/soffice，可视化渲染 QA 未完成；已完成 `python-docx` 结构校验。

## 文档更新

已更新：

`docs/开放API接口文档.docx`

补充内容：

1. 将 `/api/v1/governance/compliance-report` 说明更新为当前 200 元信息响应 + 默认 Word 报告输出。
2. 追加第 12 章：`徐工集团工程机械股份有限公司完整 Request/Response 示例`。
3. 第 12 章覆盖五个开放 API：
   - 跨层关键词搜索 API
   - N 跳展开子图 API
   - 风险主体群体发现 API
   - 风险传导路径分析 API
   - 协同治理社区报告 API
4. Response 示例保留完整字段结构，大数组使用代表项，并明确 `exportFiles.docx`、`report.filePath`、`defaultFormat=docx`。

## 输出文件

- `backend/report_outputs/05_compliance_report_xugong.json`
- `backend/report_outputs/05_compliance_report_xugong_request.json`
- `backend/report_outputs/05_compliance_report_xugong_response.json`
- `backend/report_outputs/WIND-COMP-1783604044307.docx`
- `backend/report_outputs/open_api_docx_extracted.txt`
