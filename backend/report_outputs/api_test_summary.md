# 五个本地开发 API JSON 测试摘要

生成时间：2026-07-09

测试基址：

```text
http://127.0.0.1:8001
```

输出目录：

```text
D:\Code\WindEye\backend\report_outputs
```

## 测试结果

| 序号 | API | 状态码 | 是否 JSON | 是否 2xx | 输出文件 |
|---|---|---:|---|---|---|
| 1 | `POST /api/v1/graph/search-all` | 200 | 是 | 是 | `01_search_all.json` |
| 2 | `POST /api/v1/graph/expand/{node_id}` | 200 | 是 | 是 | `02_expand_node.json` |
| 3 | `POST /api/v1/governance/community-discovery` | 200 | 是 | 是 | `03_community_discovery.json` |
| 4 | `POST /api/v1/governance/risk-paths` | 200 | 是 | 是 | `04_risk_paths.json` |
| 5 | `POST /api/v1/governance/compliance-report` | 404 | 是 | 否 | `05_compliance_report.json` |

补充验证：

| API | 状态码 | 是否 JSON | 是否 2xx | 输出文件 |
|---|---:|---|---|---|
| `POST /api/v1/governance/reports` | 200 | 是 | 是 | `05b_governance_reports_actual_path.json` |

## 结论

1. 五个开放 API 路径均能返回 JSON。
2. 前四个开放 API 返回 200 JSON。
3. 第五个开放 API `/api/v1/governance/compliance-report` 当前未注册，返回 JSON 404：`{"detail": "Not Found"}`。
4. 当前真实可用的协同治理报告接口是 `/api/v1/governance/reports`，已返回 200 JSON。

## 本次自动选取的测试种子

```json
{
  "searchQuery": "徐工",
  "seedName": "濉溪县徐工装载机配件有限公司",
  "seedId": "4:a33932a8-3530-4bd7-bb14-ce721f494adf:284511"
}
```

## 生成文件

- `run_api_json_tests.py`
- `run_api_json_tests.ps1`
- `00_port_check.json`
- `01_search_all.json`
- `02_expand_node.json`
- `03_community_discovery.json`
- `04_risk_paths.json`
- `05_compliance_report.json`
- `05b_governance_reports_actual_path.json`
- `summary.json`
- `open_api_docx_extracted.txt`
- `open_api_docx_endpoints.json`
- `community_report_replacement_plan.md`
- `api_test_summary.md`

## 后续必须处理

开放 API 配置位于 `backend/api/admin_routes.py`：

```python
{
    "key": "compliance_report",
    "name": "协同治理社区报告",
    "method": "POST",
    "path": "/api/v1/governance/compliance-report",
}
```

实际路由位于 `backend/api/router.py`：

```text
POST /api/v1/governance/reports
```

建议新增兼容路由 `/api/v1/governance/compliance-report`，转调现有 `/api/v1/governance/reports` 逻辑，避免第三方调用文档和后端实现不一致。
