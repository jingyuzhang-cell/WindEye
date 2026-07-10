# 图谱查询 API 智能剪枝与文档调整方案

## 1. 目标

针对 `POST /api/v1/graph/search-all` 和 `POST /api/v1/graph/expand/{node_id}`：

1. 不再单纯依赖 `limit/nodeLimit` 做结果截断。
2. 在遍历阶段识别银行、基金、证券、监管机构、时间等高出度低区分度节点。
3. 一跳命中高出度节点时保留该节点和与中心节点的关系，但默认不再继续向二跳扩散。
4. 优先返回风险传导、群体发现、社区报告更有价值的证据子图。
5. 在响应中明确返回剪枝说明，让前端和外部调用方知道哪些节点被保留、终止扩展或过滤。

## 2. 当前问题

当前 2 跳 `cascade` 查询在徐工集团样例中：

| API | depth | limit | 节点 | 边 | 三元组 | 说明 |
|---|---:|---:|---:|---:|---:|---|
| `/api/v1/graph/expand/{node_id}` | 1 | 500 | 454 | 451 | 451 | 已对齐 search-all |
| `/api/v1/graph/expand/{node_id}` | 2 | 500 | 500 | 540 | 371 | 达到 nodeLimit |
| `/api/v1/graph/expand/{node_id}` | 2 | 1000 | 1000 | 1066 | 886 | 仍达到 nodeLimit |

这说明 2 跳不是没有数据，而是扩散到高出度节点后，结果规模很快被节点上限截断。截断后的图谱可能包含大量低价值公共节点，反而挤占真正有效的风险证据。

## 3. 推荐算法

算法名称：`degree_aware_evidence_pruning`

### 3.1 核心原则

1. 中心节点必须保留。
2. 一跳强关系必须保留，例如 `GUARANTEE`、`CONTROLLER`、`CONTROL`、`INVEST`、`CAUSE`、`TRIGGERS`。
3. Event、Feature、Regulation 证据层优先保留。
4. 银行、基金、证券、监管机构、时间等高出度节点可作为一跳证据节点保留，但默认不继续进入下一跳 frontier。
5. 超过阈值的高出度节点不做全量邻居查询，只保留摘要统计和少量强关系样本。
6. 最后仍需 `limit/nodeLimit`，但它作为安全阀，不作为主要剪枝手段。

### 3.2 默认阈值

| 参数 | 默认值 | 说明 |
|---|---:|---|
| `maxExpandDegree` | 200 | 节点度数超过该值时，默认不继续扩展到下一跳 |
| `maxHubSample` | 20 | 高出度节点最多保留的强关系邻居样本数 |
| `subjectBudgetRatio` | 0.25 | Subject 层最多占返回节点预算的 25% |
| `evidenceBudgetRatio` | 0.70 | Event/Feature/Regulation 合计至少预留约 70% |
| `minEvidencePerLayer` | 20 | 有证据时每个证据层尽量保留的最低数量 |

### 3.3 高出度节点类型

默认识别以下标签为低区分度高出度候选：

```text
BANK, PFUND, PFCOMPANY, SECURITY, REGULATOR, EXCHANGE, TIME, Law, Regulation
```

说明：

- 银行、基金、证券通常连接大量主体，如果继续向二跳扩展，会迅速产生无关主体。
- 法规类节点可以保留，但通常作为证据链终点，不向外反向扩展。
- 公司和个人不默认禁止扩展，但当其度数超过阈值且关系不是强风险关系时，也只保留为 terminal。

### 3.4 遍历规则

对每个候选边 `(current)-[r]-(neighbor)`：

1. 计算 `neighborDegree`。
2. 识别 `neighborLayer` 和 `neighborLabels`。
3. 计算是否高出度：

```text
isHighDegree = neighborDegree > maxExpandDegree
isLowSignalHub = labels 命中 BANK/PFUND/PFCOMPANY/SECURITY/REGULATOR/EXCHANGE/TIME 等
```

4. 决策：

| 条件 | 动作 |
|---|---|
| neighbor 是中心节点 | 保留 |
| 关系是强关系 | 保留；是否继续扩展由节点度数和层级决定 |
| neighbor 是 Event/Feature/Regulation | 保留，并按层级方向继续有限扩展 |
| neighbor 是高出度银行/基金/证券等 | 保留为 terminal，不进入下一跳 |
| neighbor 是普通 Subject | 保留为 terminal，默认不继续扩散 |
| neighbor 是高出度且弱关系 | 可过滤或只保留摘要，默认不扩展 |

### 3.5 排序评分

当候选节点超过预算时，按评分保留，而不是按数据库返回顺序截断。

建议分数：

```text
score =
  centerBonus
  + strongRelationBonus
  + evidenceLayerBonus
  + riskPropertyBonus
  + keywordMatchBonus
  + recencyBonus
  - highDegreePenalty
  - lowSignalLabelPenalty
```

权重建议：

| 因子 | 权重 |
|---|---:|
| 中心节点 | +1000 |
| 强关系 `GUARANTEE/CONTROLLER/CONTROL/INVEST` | +300 |
| Event/Feature/Regulation | +200 |
| 含 `RISK_INFO/FACTOR_INFO/RISK_LIST` | +150 |
| 名称或内容包含查询词 | +120 |
| 高出度节点 | -200 |
| 银行/基金/证券/时间等低区分度标签 | -150 |

### 3.6 响应新增剪枝摘要

在 `summary` 下新增：

```json
{
  "pruning": {
    "policy": "degree_aware_evidence_pruning",
    "maxExpandDegree": 200,
    "prunedNodeCount": 123,
    "terminalHubCount": 8,
    "blockedExpansionCount": 456,
    "blockedByReason": {
      "high_degree": 300,
      "low_signal_label": 100,
      "layer_budget": 56
    },
    "terminalHubs": [
      {
        "id": "xxx",
        "name": "某银行",
        "degree": 1024,
        "labels": ["BANK", "COMPANY"],
        "reason": "degree>200; kept as terminal; not expanded to hop2"
      }
    ]
  }
}
```

同时在 `warnings` 中增加可读提示：

```text
HIGH_DEGREE_NODE_TERMINATED: 节点“某银行”度数 1024 超过阈值 200，已保留一跳关系但不继续二跳扩展。
PRUNING_APPLIED: 已启用 degree_aware_evidence_pruning，优先保留风险证据层和强关系。
```

## 4. API 参数调整

两个接口统一增加以下可选字段：

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `traversalMode` | string | `bfs` 或现有业务默认 | `bfs/cascade`。治理链路建议使用 `cascade` |
| `prunePolicy` | string | `degree_aware` | 剪枝策略：`none/degree_aware/evidence_first` |
| `maxExpandDegree` | number | `200` | 超过该度数的节点默认不进入下一跳 |
| `highDegreeLabels` | string[] | 内置列表 | 指定银行、基金、证券等低区分度标签 |
| `keepHighDegreeNode` | boolean | `true` | 是否保留高出度节点本身和一跳边 |
| `includePruningSummary` | boolean | `true` | 是否返回剪枝摘要 |

兼容性：

- 不传这些字段时保持现有行为，但后端建议默认开启 `degree_aware`。
- 前端图谱交互可以使用 `bfs + degree_aware`。
- 风险传导、群体发现、社区报告建议使用 `cascade + degree_aware`。

## 5. 后端改造点

文件：`backend/api/graph_routes.py`

### 5.1 数据模型

扩展 `SearchAllRequest` 和 `ExpandRequest`：

- `prunePolicy`
- `maxExpandDegree`
- `highDegreeLabels`
- `keepHighDegreeNode`
- `includePruningSummary`

### 5.2 新增配置对象

新增内部配置：

```python
class PruningConfig:
    policy: str
    max_expand_degree: int
    high_degree_labels: set[str]
    keep_high_degree_node: bool
    include_summary: bool
```

### 5.3 新增决策函数

新增函数：

- `build_pruning_config(req)`
- `is_low_signal_hub(labels)`
- `classify_expansion_candidate(node, degree, relation, hop, config)`
- `score_graph_candidate(node, edge, relation, query, degree, config)`
- `prune_ranked_subgraph(nodes, edges, center_ids, node_limit, edge_limit, config)`

### 5.4 修改普通 BFS 展开

在 `expand_subgraph()` 中：

1. 每一跳 frontier 批量获取度数。
2. 对一跳邻居先判断是否高出度。
3. 高出度节点若命中低区分度标签：
   - 加入 `visited_ids`
   - 记录为 terminal hub
   - 不加入 `next_frontier`
4. 若高出度但强关系：
   - 保留节点与边
   - 默认不继续扩散，除非 `forceExpandHub=true`
5. `summary` 增加 `pruning`。

### 5.5 修改 cascade 展开

在 `_search_subject_cascade()` 中：

1. Subject→Subject 阶段加入度数门控。
2. Event/Feature/Regulation 阶段继续保留证据优先。
3. 高出度 Subject、BANK、PFUND、SECURITY、REGULATOR 进入 terminal，不继续做下一跳。
4. 节点超过预算时，用评分排序替代当前简单的分层裁剪。

## 6. 文档调整方案

文档：`docs/开放API接口文档_补全版.docx`

### 6.1 通用约定新增小节

在“2.通用约定”后新增：

标题：`2.x 图谱查询上限与智能剪枝约定`

内容：

- `limit/nodeLimit` 是安全上限，不代表直接按数据库返回顺序截断。
- 图谱查询默认启用 `degree_aware_evidence_pruning`。
- 高出度节点默认阈值为 200。
- 高出度银行、基金、证券、监管机构、时间等节点可保留为一跳 terminal，但不继续二跳扩展。
- 返回 `summary.pruning` 和 `warnings` 说明剪枝情况。

### 6.2 search-all 章节调整

在 `4.2 Request` 中新增字段：

- `traversalMode`
- `prunePolicy`
- `maxExpandDegree`
- `highDegreeLabels`
- `keepHighDegreeNode`
- `includePruningSummary`

在 `4.4 Response` 中新增：

- `triples`
- `summary.traversalMode`
- `summary.pruning`

### 6.3 expand 章节调整

在 `5.1 Request` 中新增同样字段。

在示例中加入：

```json
{
  "depth": 2,
  "limit": 500,
  "traversalMode": "cascade",
  "prunePolicy": "degree_aware",
  "maxExpandDegree": 200,
  "keepHighDegreeNode": true,
  "includePruningSummary": true
}
```

在 Response 示例中加入：

- `triples`
- `subgraph.triples`
- `summary.tripleCount`
- `summary.pruning`

### 6.4 warning/error 说明

新增 warning code：

| code | 含义 |
|---|---|
| `PRUNING_APPLIED` | 已启用智能剪枝 |
| `HIGH_DEGREE_NODE_TERMINATED` | 高出度节点被保留但不继续扩展 |
| `LOW_SIGNAL_HUB_FILTERED` | 低价值高出度节点被过滤 |
| `NODE_LIMIT_REACHED_AFTER_PRUNING` | 智能剪枝后仍达到节点上限 |
| `EDGE_LIMIT_REACHED_AFTER_PRUNING` | 智能剪枝后仍达到边上限 |

## 7. 测试方案

### 7.1 徐工集团样例

测试脚本：

- `tests/test_01_search_all_xugong.py`
- `tests/test_02_expand_xugong.py`

新增测试点：

1. `depth=1, traversalMode=cascade, prunePolicy=degree_aware`
   - 两个 API 返回节点、边、三元组数量应一致或高度一致。
2. `depth=2, maxExpandDegree=200`
   - 不应再被银行、基金类节点无限扩散。
   - `summary.pruning.terminalHubCount > 0`。
   - `summary.pruning.blockedExpansionCount > 0`。
3. 验证高出度节点：
   - 节点本身存在于 `nodes`。
   - 与中心或证据节点的一跳边存在。
   - 不出现在二跳 frontier 扩展结果中。

### 7.2 输出文件

继续输出到：

- `backend/report_outputs/01_search_all_xugong*.json`
- `backend/report_outputs/02_expand_xugong*.json`
- 新增 `backend/report_outputs/graph_pruning_test_summary.md`

## 8. 实施顺序

1. 补充请求模型字段。
2. 新增剪枝配置和候选点评分函数。
3. 改造 `expand_subgraph()` 的 BFS frontier 决策。
4. 改造 `_search_subject_cascade()` 的 Subject 扩散和最终排序裁剪。
5. 更新两个测试脚本，增加 `maxExpandDegree=200` 和 pruning 断言。
6. 跑 `depth=1` 对齐测试。
7. 跑 `depth=2` 剪枝测试。
8. 更新 `docs/开放API接口文档_补全版.docx`。
9. 渲染 DOCX 做视觉检查。
10. 输出测试总结和文档路径。

## 9. 验收标准

1. `depth=1` 下 `search-all` 和 `expand cascade` 对齐。
2. `depth=2` 不再单纯依赖 `nodeLimit` 截断，而是返回带 `summary.pruning` 的有效证据子图。
3. 高出度银行/基金/证券节点保留为 terminal，不进入下一跳。
4. 返回 JSON 包含 `nodes/edges/triples/summary.pruning/warnings`。
5. API 文档明确说明上限、剪枝策略、参数和 warning code。

