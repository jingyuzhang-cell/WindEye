# 风险主体群体发现 API 本地测试摘要

测试对象：徐工集团工程机械股份有限公司

测试链路：
1. 先调用 `/api/v1/graph/search-all` 模糊搜索并确认企业节点。
2. 获取 node_id：`4:a33932a8-3530-4bd7-bb14-ce721f494adf:1083761`。
3. 再调用 `POST /api/v1/governance/community-discovery`，请求体仅传 `seedIds`，使用 `responseMode=full`。

## 请求参数

```json
{
  "seedNames": [],
  "seedIds": ["4:a33932a8-3530-4bd7-bb14-ce721f494adf:1083761"],
  "maxHop": 2,
  "method": "auto",
  "communityMode": "expanded",
  "minCommunitySize": 2,
  "pathLimit": 5000,
  "maxNodes": 1000,
  "responseMode": "full",
  "includeRawSubgraph": true,
  "includeCommunityGraph": true
}
```

## 测试结果

| API | 状态码 | 是否 JSON | full JSON 完整 | 结论 |
|---|---:|---|---|---|
| `/api/v1/governance/community-discovery` | 200 | 是 | 是 | 正常 |

| 指标 | 实测值 |
|---|---:|
| seedNodeCount | 1 |
| selectedSeedCount | 1 |
| candidateSeedCount | 1 |
| summary.nodeCount | 1000 |
| summary.edgeCount | 1143 |
| communityCount | 13 |
| seedCommunityId | 1 |
| communities | 13 |
| entityCommunityMap | 802 |
| communityGraph.nodes | 13 |
| communityGraph.edges | 13 |
| subgraph.nodeCount | 2332 |
| subgraph.edgeCount | 2475 |
| connectedSubgraph.nodeCount | 1000 |
| connectedSubgraph.edgeCount | 1143 |

## 文档一致性结论

`responseMode=full` 时，实际返回包含文档定义的核心字段：`success`、`apiVersion`、`traceId`、`elapsedMs`、`selectedMethod`、`fallbackReason`、`seedNodes`、`candidateSeeds`、`selectedSeedIds`、`seedSelection`、`summary`、`communities`、`entityCommunityMap`、`communityEdges`、`communityGraph`、`subgraph`、`connectedSubgraph`、`visualization`、`warnings`。

此前 `responseMode=summary` 测试没有返回 `communities`、`entityCommunityMap`、`communityGraph`、`subgraph` 等字段，是接口设计预期，不是接口异常。文档已补充 `summary/full` 返回模式说明。

## 已更新文件

- `tests/test_03_community_discovery_xugong.py`
- `backend/api/governance_routes.py`
- `docs/开放API接口文档_补全版.docx`
- `backend/report_outputs/03_community_discovery_xugong.json`
- `backend/report_outputs/03_community_discovery_xugong_full_response.json`
- `backend/report_outputs/open_api_docx_extracted.txt`
