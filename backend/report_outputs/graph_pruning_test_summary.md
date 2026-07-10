# 图谱查询剪枝测试摘要

| API | depth | limit | 有效上限 | 节点 | 边 | 三元组 | 剪枝策略 | 阈值 | terminal hub | 阻断扩展 | 是否裁剪 |
|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---|
| `/api/v1/graph/search-all` | 1 | 1000 | 1000 | 454 | 451 | 451 | degree_aware | 200 | 2 | 2 | False  |
| `/api/v1/graph/expand/{node_id}` | 1 | 1000 | 1000 | 454 | 451 | 451 | degree_aware | 200 | 2 | 2 | False  |
| `/api/v1/graph/expand/{node_id}` | 2 | 1000 | 2000 | 1252 | 1566 | 1403 | degree_aware | 200 | 68 | 122 | False  |
