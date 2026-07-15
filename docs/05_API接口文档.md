# 05 — API 接口文档

## 5.1 概述

BiDA-KG 系统 API 按**核心功能能力**组织，每个能力独立成章，便于开发者按需查找。所有接口统一挂载在 `/api/v1` 下，通过 JWT Token 认证。

| 章节 | 核心能力 | 涉及路由 | 接口数 |
|------|---------|---------|--------|
| 5.2 | 图谱查询与可视化 | `/api/v1/graph` | 10 |
| 5.3 | 实体识别与对齐 | `/api/v1/chat` (SSE), `/api/v1/pipeline` | 5 |
| 5.4 | 群体发现 | `/api/v1/graph`, `/api/v1/chat` (SSE) | 4 |
| 5.5 | 风险传导分析 | `/api/v1/graph`, `/api/v1/chat` (SSE), `/api/v1/risk` | 8 |
| 5.6 | 合规分析 | `/api/v1/chat` (SSE) | 3 |
| 5.7 | 协同治理社区报告 | `/api/v1/chat` (SSE), `/api/v1/risk` | 7 |
| 5.8 | 数据采集与管线 | `/api/v1/pipeline` | 12 |
| 5.9 | 通用规范 | — | — |

**统一入口：** `POST /api/v1/chat/unified-stream` 是协同治理的主入口。用户输入自然语言 query 后，后端 DRA-MA 引擎通过 SSE 流式依次推送实体识别、图谱检索、群体发现、风险传导、合规分析、风险评分、治理方案和最终报告。

---

## 5.2 图谱查询与可视化

**能力描述：** 提供四层知识图谱（主体→事件→特征→法规）的统计概览、关键词检索、节点展开和子图查询，驱动前端 G6 可视化。

**数据来源：** Neo4j 图数据库，Cypher 只读查询。

### 5.2.1 API 清单

| API | 方法 | 输入 | 输出 | 用途 |
|-----|------|------|------|------|
| `/api/v1/graph/summary-stats` | GET | 无 | `total_nodes`、`total_relationships`、`layers[]`（每层含 `layer`、`layer_code`、`node_count`、`rel_count`、`node_types`、`rel_types`、`cross_layer_rels`） | 四层总览统计，驱动页面顶部统计卡片 |
| `/api/v1/graph/statistics` | GET | Query：`layer=all/Subject/Event/Feature/Regulation` | `total`、`details` | 单层统计卡片和节点类型分布 |
| `/api/v1/graph/cross-stats` | GET | 无 | `cross_layer_rels`，含层间关系数量和关系类型 | 跨层连接统计 |
| `/api/v1/graph/data` | GET | Query：`layer`、`relationType`、`limit`、`depth` | `nodes`、`edges`（节点含 `id/element_id/name/type/properties`，边含 `source/target/relation/properties`） | 页面初始化加载图谱，支持按层级和关系类型筛选 |
| `/api/v1/graph/search-all` | GET | Query：`q` 必填，`depth`、`layer`、`limit` | 以匹配节点为中心的跨层 `nodes`、`edges` | 按节点名称模糊查询所有层级（主搜索框） |
| `/api/v1/graph/search` | GET | Query：`q`、`layer`、`nodeType`、`relType`、`layers`、`limit` | 过滤后的 `nodes`、`edges`；无条件时返回空图 | 按节点类型、关系类型组合精确检索 |
| `/api/v1/graph/subgraph/{node_id}` | GET | Path：`node_id`；Query：`layer`、`limit` | 指定节点的 1 跳邻居 `nodes`、`edges` | 单击节点展开直接关联子图 |
| `/api/v1/graph/expand/{node_id}` | GET | Path：`node_id`；Query：`depth`、`limit` | 指定节点 N 跳范围内的 `nodes`、`edges` | 双击节点展开更深层关联（1-5 跳） |
| `/api/v1/graph/risk-distribution` | GET | 无 | `Subject/Event/Feature/Regulation` 各层的 `high/medium/low/total` | 风险可视化看板，各层风险等级分布 |
| `/api/v1/graph/high-risk-entities` | GET | Query：`limit` | `data` 高风险实体列表、`total`（含名称、标签、预警次数、状态、关联关系） | 首页或看板展示重点风险主体 |

### 5.2.2 核心数据结构

```typescript
// 图谱节点
interface GraphNode {
  element_id: string;           // Neo4j 元素 ID
  labels: string[];             // 标签列表 (e.g. ['Subject', 'COMPANY'])
  properties: Record<string, any>;
  // 前端渲染扩展
  id: string;                   // = element_id
  typeKey: string;              // 类型键 (COMPANY, EVENT, RiskFeature...)
  layer: number;                // 层级索引 0-3
  color: string;                // 节点颜色
  name: string;                 // 显示名称
}

// 图谱边
interface GraphEdge {
  element_id: string;
  type: string;                 // 关系类型 (INVEST, GUARANTEE, TRIGGERS...)
  startNodeElementId: string;
  endNodeElementId: string;
  properties: Record<string, any>;
  // 前端渲染扩展
  source: string;               // = startNodeElementId
  target: string;               // = endNodeElementId
  label: string;
  style: { stroke: string; lineWidth: number; endArrow: boolean };
}

// 层级统计
interface LayerStats {
  layer: string;                // "Subject" | "Event" | "Feature" | "Regulation"
  layer_label: string;          // "主体层" | "事件层" | "特征层" | "法规层"
  node_count: number;
  node_type_count: number;
  node_types: string[];
  rel_count: number;
  rel_type_count: number;
  rel_types: string[];
}
```

### 5.2.3 典型调用流

```
页面初始化
  ├── GET /graph/summary-stats    → 顶部统计卡片
  ├── GET /graph/statistics?layer=all → 各层详情
  └── GET /graph/data?limit=100   → 初始图谱渲染

用户搜索
  ├── GET /graph/search-all?q=鑫达&depth=2  → 跨层关键词检索
  └── 结果 merge 到当前图谱

节点交互
  ├── 单击节点 → GET /graph/subgraph/{id}    → 1跳子图
  └── 双击节点 → GET /graph/expand/{id}?depth=3  → N跳展开
```

---

## 5.3 实体识别与对齐

**能力描述：** 从用户自然语言 query 中识别风险主体/查询主体，通过 5 级级联匹配对齐到知识图谱中的真实实体，解决简称、别名、曾用名等匹配问题。

**核心组件：** IntentAgent（意图识别 + 实体抽取）→ EntityResolver（5 级级联对齐）

### 5.3.1 API 清单

| API | 方法 | 输入 | 输出 | 用途 |
|-----|------|------|------|------|
| `/api/v1/chat/unified-stream` → `entities` 事件 | SSE | 来自 `query` 字段；内部由 IntentAgent 抽取原始实体，EntityResolver 对齐 | `resolved[]`（已对齐实体）、`unresolved[]`（未解析实体）、`resolved_count`、`unresolved_count` | 协同治理主链路中的实体识别与对齐 |
| `/api/v1/chat/route` | POST | JSON：`query` | `route`（`graph`/`risk`/`clarify`）、`clarify_message` | 意图路由：判断用户问题是图谱查询还是风险分析 |
| `/api/v1/pipeline/entities/{source}` | GET | Path：`source` 数据源标识 | `success`、`data`：`records_processed`、`stats`、可选 `entities`、`records` | 查看某数据源最近构建中解析抽取出的实体（批量管线） |
| `/api/v1/pipeline/extract/{stage}` | POST | Path：`stage=subject_extraction/event_extraction/feature_extraction/regulation_linking`；Query：`source` | `nodes`、`edges`、`node_count`、`edge_count`、`cypher_statements`、`cypher_preview` | 单阶段 Dify 抽取（主体/事件/特征/法规），返回预览图谱 |
| `/api/v1/chat/upload` | POST | FormData：`file`（`.txt`/`.md`/`.docx`/`.pdf`） | `data.filename`、`data.text`、`data.char_count`、`data.truncated` | 上传文本文件抽取正文，供问答/分析使用 |

### 5.3.2 实体对齐 5 级级联

```
原始实体名称 → EntityResolver
  ├── Level 1: 精确匹配      → 统一社会信用代码 / 身份证哈希
  ├── Level 2: 别名匹配      → 曾用名、简称映射表
  ├── Level 3: 包含匹配      → 名称包含关系（如"鑫达" ⊆ "鑫达投资有限公司"）
  ├── Level 4: 模糊匹配      → TfIdf + 余弦相似度，阈值 ≥ 0.85
  └── Level 5: LLM 回退      → 前4级均失败时，LLM 语义推理匹配
```

### 5.3.3 核心数据结构

```typescript
// SSE entities 事件
interface EntitiesEvent {
  resolved: ResolvedEntity[];
  unresolved: UnresolvedEntity[];
  resolved_count: number;
  unresolved_count: number;
}

interface ResolvedEntity {
  raw: string;                  // 用户原始输入
  canonical_name: string;       // KG 中的标准名称
  kg_node_id: string;           // Neo4j 节点 elementId
  match_type: 'exact' | 'alias' | 'contains' | 'fuzzy' | 'llm_fallback';
  confidence: number;           // 0.0 - 1.0
}

interface UnresolvedEntity {
  raw: string;                  // 未能对齐的原始名称
  reason: string;               // 失败原因
}
```

### 5.3.4 典型调用流

```
用户输入 "鑫达投资的风险传导"
  │
  ├── POST /chat/route         → route: "risk"
  │
  └── POST /chat/unified-stream
        │
        ├── [IntentAgent] 抽取原始实体: ["鑫达投资"]
        │
        ├── [EntityResolver] 5级级联对齐
        │     └── Level 3 包含匹配 → "鑫达投资有限公司" (confidence: 0.92)
        │
        └── SSE entities 事件:
              resolved: [{ raw: "鑫达投资", canonical_name: "鑫达投资有限公司", ... }]
              unresolved: []
```

---

## 5.4 群体发现

**能力描述：** 在图谱子图中发现社区结构，识别关联群体、桥接节点和实体角色，为风险传导路径分析和协同治理提供群体视图。

**算法：** 小规模图（n < 50）使用 WCC 连通分量，大规模图使用 Louvain 社区发现。

### 5.4.1 API 清单

| API | 方法 | 输入 | 输出 | 用途 |
|-----|------|------|------|------|
| `/api/v1/public/governance/community-discovery` | POST | JSON：`subjectName`、`subjectId`、`depth`、`responseMode` | `data.subject`、`data.targetCommunity`、`data.keyMembers`、`summary` | **对外简化版群体发现接口**，隐藏算法参数 |
| `/api/v1/graph/communities` | GET | Query：`layer`、`method`（`louvain`/`wcc`）、`max_nodes`、`min_community_size` | `communities[]`（含成员列表、规模、密度、模块度） | 全局/按层社区发现 |
| `/api/v1/graph/communities/seed-subgraph` | POST | JSON：`seedNames`、`seedIds`、`maxHop`、`method`、`minCommunitySize`、`pathLimit` | `seed_nodes`、`subgraph`、`connected_subgraph`、`communities`、`entity_community_map`、`visualization.flow` | 从指定风险主体出发抽取 N 跳网络并群体发现 |
| `/api/v1/chat/unified-stream` → `community` 事件 | SSE | 输入来自统一流的证据子图 | `communities[]`、`algorithm`、`modularity` | 协同治理流程中的群体发现 |
| `/api/v1/chat/unified-stream` → `entity_community_map` 事件 | SSE | 输入同上 | 实体→群体归属映射 + 角色标注（`bridge`/`hub`/`member`） | 驱动前端社区着色和桥接节点高亮 |

> 说明：`/api/v1/public/governance/community-discovery` 复用内部 `/api/v1/governance/community-discovery`，但不再对外暴露 `method`、`communityMode`、`pathLimit` 等工程参数。

### 5.4.2 核心数据结构

```typescript
// 社区
interface Community {
  community_id: number;
  size: number;
  members: string[];            // 成员 entity name 列表
  density: number;              // 社区密度
  internal_edges: number;
  external_edges: number;
}

// 实体→社区映射
interface EntityCommunityEntry {
  name: string;                 // 实体名称
  communities: number[];        // 所属社区 ID 列表
  communityRoles: string[];     // 角色：bridge / hub / member
}

// 社区发现结果
interface CommunityResult {
  communities: Community[];
  algorithm: 'louvain' | 'wcc';
  modularity?: number;
  entity_community_map: EntityCommunityEntry[];
}
```

### 5.4.3 前端社区着色规则

| 节点类型 | 判定条件 | 样式 |
|---------|---------|------|
| 普通成员 | 仅属 1 个社区 | 实线边框 + 社区颜色填充 |
| 桥接节点 (Bridge) | 属于 ≥2 个社区 或 `communityRoles` 含 `bridge` | 虚线边框 `[4, 2]` + 1.2x 尺寸 |
| 核心节点 (Hub) | `communityRoles` 含 `hub` | 粗边框 `lineWidth: 3` + 最大尺寸 |

调色板：12 色循环（`#1890ff`、`#f5222d`、`#52c41a`、`#fa8c16`、`#722ed1`、`#13c2c2`、`#eb2f96`、`#faad14`、`#2f54eb`、`#a0d911`、`#f759ab`、`#5cdbd3`）。

---

## 5.5 风险传导分析

**能力描述：** 基于知识图谱子图，识别实体间风险传导路径、检测异常模式、计算节点中心性，回答"风险从哪里来、到哪里去、影响多大"。

**分析维度：** 股权传导、人事关联、担保链、资金轨迹、事件因果。

### 5.5.1 API 清单

| API | 方法 | 输入 | 输出 | 用途 |
|-----|------|------|------|------|
| `/api/v1/public/governance/risk-paths` | POST | JSON：`subjectName`、`subjectId`、`depth`、`maxPaths`、`minRiskLevel`、`responseMode` | `data.subject`、`data.paths[]`、`summary` | **对外简化版风险传导路径接口**，隐藏关系白名单和路径枚举细节 |
| `/api/v1/chat/unified-stream` → `candidate_risk_paths` 事件 | SSE | 证据子图 + 已对齐实体 | 候选风险路径列表（含 `path_id`、`risk_level`、`affected_entities`、`confidence`） | 风险路径初筛 |
| `/api/v1/chat/unified-stream` → `risk_paths` 事件 | SSE | 候选路径 + LLM 分析 | `path_id`、`risk_level`（`high`/`medium`/`low`/`insufficient_evidence`）、`affected_entities[]`、`node_ids[]`、`edge_ids[]`、`path_description`、`confidence` | 经 LLM 确认的风险传导路径（前端据此高亮图谱路径） |
| `/api/v1/chat/unified-stream` → `anomaly_findings` 事件 | SSE | 风险路径 + 子图 | 异常发现列表（含异常类型、描述、置信度） | 异常模式标记 |
| `/api/v1/graph/centrality` | GET | Query：`type=pagerank/betweenness`、`layer`、`top_n` | `success`、`type`、`nodes[]` 中心性排名和分数 | 识别核心节点、桥接节点或关键传导节点 |
| `/api/v1/graph/cycles` | GET | Query：`layer`、`max_cycles` | `success`、`cycles[]`、`count` | 环路检测（循环投资、循环担保、关联闭环） |
| `/api/v1/graph/risk-distribution` | GET | 无 | 各层 `high/medium/low/total` | 各层风险等级分布概览 |
| `/api/v1/graph/high-risk-entities` | GET | Query：`limit` | `data` 高风险实体列表、`total` | 重点风险主体清单 |
| `/api/v1/risk/analyze-stream` | GET | Query：`query`、`sessionId`、`roundId`、`maxHop`、可选 `communityId`、`focusEntities`、`fileContent` | SSE 事件流 | 流式风险分析（兼容独立调用） |

> 说明：`/api/v1/public/governance/risk-paths` 默认由后端自动决定图扩展与路径枚举策略，外部只关心主体、深度、风险等级和返回数量。

### 5.5.2 核心数据结构

```typescript
// 风险路径
interface RiskPath {
  path_id: string;
  risk_level: 'high' | 'medium' | 'low' | 'insufficient_evidence';
  affected_entities: string[];  // 受影响实体名称列表
  node_ids: string[];           // 路径上节点 elementId（前端高亮）
  edge_ids: string[];           // 路径上边 elementId（前端高亮）
  path_description: string;     // LLM 生成的路径描述
  confidence: number;           // 0.0 - 1.0
  transmission_type?: string;   // 传导类型：equity/personnel/guarantee/fund/event_causal
}

// 异常发现
interface AnomalyFinding {
  type: string;                 // 异常类型
  description: string;          // 描述
  affected_entities: string[];  // 涉及实体
  confidence: number;           // 置信度
  evidence: string[];           // 证据列表
}

// 风险分布
interface RiskDistribution {
  Subject: { high: number; medium: number; low: number; total: number };
  Event: { high: number; medium: number; low: number; total: number };
  Feature: { high: number; medium: number; low: number; total: number };
  Regulation: { high: number; medium: number; low: number; total: number };
}

// 中心性节点
interface CentralityNode {
  node_id: string;
  name: string;
  score: number;                // PageRank 或 Betweenness 分数
  rank: number;
}
```

### 5.5.3 典型调用流

```
协同治理流程中:
  │
  ├── [DRAEngine] 实体统计 + 子图查询
  │
  ├── SSE candidate_risk_paths → 候选风险路径（图算法初筛）
  │
  ├── [RiskAnalyst Plugin] LLM 分析候选路径
  │     ├── 股权传导: A → 控股60% → B → 控股40% → C
  │     ├── 人事关联: A.法人 ≡ B.大股东 (张三)
  │     └── 担保链: A → 担保 → D → 担保 → E
  │
  ├── SSE risk_paths → 确认的风险路径（含描述和置信度）
  │
  └── SSE anomaly_findings → 异常模式标记

独立图分析:
  ├── GET /graph/centrality?type=pagerank → 核心节点排名
  ├── GET /graph/cycles → 循环检测结果
  └── GET /graph/risk-distribution → 风险分布视图
```

---

## 5.6 合规分析

**能力描述：** 将风险分析结论与四层图谱中的法规/行动层（Regulation Layer）进行匹配，输出违规认定、匹配法条、建议处置动作和合规风险等级。

**匹配流程：** 风险行为 → 检索法规层 → 匹配适用法条 → 提取违规要件 → 逐一比对 → 输出合规判定。

### 5.6.1 API 清单

| API | 方法 | 输入 | 输出 | 用途 |
|-----|------|------|------|------|
| `/api/v1/chat/unified-stream` → `compliance` 事件 | SSE | 风险路径 + 异常发现 + 法规层数据 | `regulation`（法规名称）、`clause`（条款）、`violation`（违规点）、`suggested_action`（建议动作）、`confidence` | 风险行为→法规匹配结果 |
| `/api/v1/chat/unified-stream` → `compliance_scores` 事件 | SSE | 合规匹配上下文 | 节点/指标维度的合规评分 | 量化合规风险等级 |
| `/api/v1/chat/unified-stream` → `compliance_indicators` 事件 | SSE | 合规匹配上下文 | 一级/二级/三级合规指标、客观分、证据 | 多级合规指标体系，驱动"合规分析"面板 |

### 5.6.2 核心数据结构

```typescript
// 合规匹配结果
interface ComplianceMatch {
  regulation: string;           // 法规名称（如《公司法》）
  clause: string;               // 具体条款（如"第20条"）
  violation: string;            // 违规认定描述
  suggested_action: string;     // 建议处置动作
  confidence: number;           // 匹配置信度 0.0 - 1.0
}

// 合规指标
interface ComplianceIndicator {
  level: 1 | 2 | 3;            // 指标层级
  name: string;                 // 指标名称
  score: number;                // 客观分
  weight: number;               // 权重
  evidence: string[];           // 证据说明
  children?: ComplianceIndicator[];  // 子指标
}

// 合规评分
interface ComplianceScores {
  overall_score: number;        // 综合合规得分 (0-100)
  risk_level: 'high' | 'medium' | 'low';
  dimension_scores: Record<string, number>;  // 各维度得分
}
```

### 5.6.3 典型调用流

```
协同治理流程中:
  │
  ├── [Analyst] 完成风险路径和异常分析
  │
  ├── [Compliance Plugin] 法规匹配
  │     ├── 检索 Neo4j 法规层: MATCH (r:Regulation)-[REGULATES]->...
  │     └── LLM 违规则件比对
  │
  ├── SSE compliance → 法规条款匹配结果
  ├── SSE compliance_scores → 合规得分
  └── SSE compliance_indicators → 多级合规指标详情
```

---

## 5.7 协同治理社区报告

**能力描述：** 汇总风险主体、群体发现、风险传导路径、异常发现和合规分析结果，生成结构化协同治理社区报告，输出治理建议、升级规则和监控清单。支持查看历史报告和导出 Word 文档。

**报告链路：** 风险主体识别 → 群体发现 → 风险传导路径 → 合规分析 → 风险评分 → 治理方案 → 协同治理社区报告

### 5.7.1 API 清单

| API | 方法 | 输入 | 输出 | 用途 |
|-----|------|------|------|------|
| `/api/v1/public/governance/compliance-report` | POST | JSON：`subjectName`、`subjectId`、`depth`、`maxPaths`、`includeDocx`、`responseMode` | `data.subject`、`riskAssessment`、`complianceAssessment`、`keyFindings`、`governanceActions`、`report.download` | **对外简化版协同治理社区报告接口** |
| `/api/v1/chat/unified-stream` → `scoring` 事件 | SSE | 风险路径 + 异常发现 + 合规数据 | 6 维评分（`relation_complexity`/`risky_relation`/`community_density`/`transmission`/`compliance`/`evidence`）+ 权重 + LLM 调整幅度 + 调整原因 | 多维风险评分，驱动"风险评分详情"面板 |
| `/api/v1/chat/unified-stream` → `governance` 事件 | SSE | 评分 + 风险路径 + 合规结果 | `actions[]`（含 `target`、`risk_issue`、`measure`、`priority`、`department`）、`escalation_rules[]`（含 `condition`、`action`、`timeline`）、`monitoring_checklist[]` | 治理动作、升级规则和监控清单 |
| `/api/v1/chat/unified-stream` → `report` 事件 | SSE | 全部上游结果 | `executive_summary`、`risk_paths[]`、`anomaly_findings[]`、`compliance_matches[]`、`governance_plan`、`markdown_report`、`recommendations[]` | 最终协同治理社区报告 |
| `/api/v1/risk/reports` | GET | Query：`page`、`limit`、`risk_level` | 报告列表（含报告编号、时间、风险等级、摘要、Markdown 内容等） | 查看历史协同治理报告 |
| `/api/v1/risk/reports/{report_id}` | GET | Path：`report_id` | 报告详情（含完整字段和 Markdown 内容） | 查看单份报告详情 |
| `/api/v1/risk/reports/export-docx` | POST | JSON：`report`、`reportId`、`queryText` | `.docx` 文件二进制流 | 将当前报告导出为 Word 文档 |
| `/api/v1/risk/analyze` | POST | JSON：风险分析请求体 | 完整风险分析报告 JSON | 非流式风险分析（兼容接口） |

> 说明：`/api/v1/public/governance/compliance-report` 继续复用内部链路 `community-discovery -> risk-paths -> compliance-report`，只是把请求和输出整理成更稳定的开放契约。

### 5.7.2 核心数据结构

```typescript
// 风险评分（6维）
interface RiskScores {
  dimensions: RiskDimension[];
  overall_score: number;        // 综合风险评分 (0-100)
  risk_level: 'high' | 'medium' | 'low' | 'insufficient_evidence';
  llm_adjustment?: number;      // LLM 调整幅度
  llm_adjustment_reason?: string;
}

interface RiskDimension {
  dimension: string;            // relation_complexity | risky_relation | community_density | transmission | compliance | evidence
  score: number;                // 0-100
  weight: number;               // 权重百分比
  explanation: string;          // 评分说明
}

// 治理方案
interface GovernancePlan {
  actions: GovernanceAction[];
  escalation_rules: EscalationRule[];
  monitoring_checklist: string[];
}

interface GovernanceAction {
  target: string;               // 目标主体
  risk_issue: string;           // 风险问题
  measure: string;              // 治理措施
  priority: 'critical' | 'high' | 'medium' | 'low';
  department: string;           // 责任部门
}

interface EscalationRule {
  condition: string;            // 触发条件
  action: string;               // 升级动作
  timeline: string;             // 时间要求
}

// 协同治理社区报告
interface GovernanceReport {
  report_id: string;
  executive_summary: string;    // 治理结论摘要
  related_entities: string[];   // 关联风险主体
  communities: Community[];     // 群体发现结果
  risk_paths: RiskPath[];       // 风险传导路径
  anomaly_findings: AnomalyFinding[];
  compliance_matches: ComplianceMatch[];
  governance_plan: GovernancePlan;
  recommendations: string[];    // 建议措施
  markdown_report: string;      // 完整 Markdown 报告
  created_at: string;           // ISO 8601
}
```

### 5.7.3 治理建议类型

| 建议类型 | 说明 | 适用场景 |
|---------|------|---------|
| **风险核查** | 对关键主体、资金链路和股权关系进行重点核查 | 高风险传导路径、异常资金环流 |
| **合规补充** | 补充披露、关联关系说明或内部决策材料 | 法规匹配到违规嫌疑但证据不足 |
| **持续观察** | 跟踪风险传导路径上的主体状态变化 | 中等风险、监控清单项 |
| **升级研判** | 对高风险路径触发进一步研判和人工复核 | 风险评分 ≥ 80 或触发升级规则 |

### 5.7.4 典型调用流

```
协同治理主链路（由 unified-stream 统一触发）:

  [IntentAgent]  → 意图识别 + 实体抽取
        │
  [EntityResolver] → 5级级联实体对齐
        │
  [DRAEngine] → 子图查询 + 实体统计 + 群体发现
        │
  [RiskAnalyst]  → 风险路径 + 异常发现
        │
  [Compliance]   → 法规匹配 + 合规评分 + 合规指标
        │
  [Scoring]      → 6维风险评分 + LLM调整
        │
  [Governance]   → 治理动作 + 升级规则 + 监控清单
        │
  [Reporter]     → 执行摘要 + Markdown报告 + 建议措施
        │
        ▼
  前端切换到"治理报告"面板，展示：
    ├── 风险评分详情 Section (scoring)
    ├── 风险路径 Section (risk_paths)
    ├── 综合报告 Section (report)
    └── 协同治理方案 Section (governance)

报告持久化与导出:
  ├── 报告自动保存到 Neo4j / PostgreSQL
  ├── GET /risk/reports → 报告历史列表
  ├── GET /risk/reports/{id} → 报告详情
  └── POST /risk/reports/export-docx → Word 导出
```

---

## 5.8 数据采集与管线

**能力描述：** 数据采集、ETL 管线执行、Dify 知识抽取，为知识图谱构建提供数据来源和自动化流程。

**主链路：** 数据采集 → ETL 管线（crawl→parse→extract→link→resolve→import→index）→ Dify 抽取 → Neo4j 入库。

### 5.8.1 API 清单

| API | 方法 | 输入 | 输出 | 用途 |
|-----|------|------|------|------|
| `/api/v1/pipeline/status` | GET | 无 | `status=idle/running`；运行中返回 `current_run` | 查询构建任务是否正在运行 |
| `/api/v1/pipeline/run` | POST | Query：`source` 必填；可选 `start_stage`、`end_stage` | `message`、`source`、`start_stage`、`end_stage` | 启动 ETL 主流程 |
| `/api/v1/pipeline/runs` | GET | Query：`limit`、`include_data` | `runs` 历史记录、`total` | 查看历史构建记录和阶段统计 |
| `/api/v1/pipeline/sources` | GET | 无 | `sources` 列表、`count` | 获取配置化数据源 |
| `/api/v1/pipeline/data-sources` | GET | 无 | `sources`、`total` | 扫描磁盘文件数据源 |
| `/api/v1/pipeline/files/{source}` | GET | Path：`source` | 文件列表、`total` | 查看数据源目录下的待处理文件 |
| `/api/v1/pipeline/files/{source}` | DELETE | Path：`source` | `deleted` 计数 | 清理数据源目录文件 |
| `/api/v1/pipeline/crawl/run` | POST | JSON：`mode`、`data_type`、`sources`、`date_start`、`date_end`、`keywords`、`max_pages`、`max_files`、`natural_language_query`、`template_id` | SSE：`start`、`stage`、`source_result`、`complete`、`error` | 启动外部数据采集任务 |
| `/api/v1/pipeline/crawl/templates` | GET | 无 | `templates`、`total` | 获取一键采集模板 |
| `/api/v1/pipeline/crawl/parse-nl` | POST | Query：`query` | `success`、`data`（数据类型、关键词、时间范围、来源） | 自然语言→采集参数 |
| `/api/v1/pipeline/crawl/sources` | GET | 无 | `sources` | 查询采集源能力 |
| `/api/v1/pipeline/crawl/tasks` | GET | Query：`limit` | `tasks`、`total` | 查看采集任务历史 |

---

## 5.9 统一流式入口与通用规范

### 5.9.1 统一流式分析 API（主入口）

| API | 方法 | 输入 | 输出 | 用途 |
|-----|------|------|------|------|
| `/api/v1/chat/unified-stream` | POST | JSON：`query`（必填）、`sessionId`、`roundId`、`maxHop`（默认 3）、`intentHint`（`graph_qa`/`risk_analysis`）、`fileContent` | SSE 事件流（16 种事件） | **协同治理主入口**，前端所有问答均优先走此接口 |

**intentHint 路由：**
- `graph_qa` → 展示查询子图和问答回复（图谱视图模式）
- `risk_analysis` → 进入完整的 7 阶段协同治理报告流程（治理报告模式）

### 5.9.2 完整 SSE 事件流

```
POST /api/v1/chat/unified-stream
  │
  ├── event: stage       data: {"stage": "intent", ...}          ← 意图识别阶段
  ├── event: stage       data: {"stage": "resolve", ...}         ← 实体对齐阶段
  ├── event: entities    data: { resolved: [...], ... }          ← 5.3 实体识别与对齐
  ├── event: stage       data: {"stage": "retrieve", ...}        ← 图谱检索阶段
  ├── event: subgraph    data: { nodes: [...], edges: [...] }    ← 5.2 图谱查询
  ├── event: entity_stats data: { ... }                          ← 实体统计
  ├── event: stage       data: {"stage": "analyze", ...}         ← 图谱分析阶段
  ├── event: community   data: { communities: [...], ... }       ← 5.4 群体发现
  ├── event: entity_community_map data: { ... }                  ← 5.4 实体-社区映射
  ├── event: candidate_risk_paths data: { ... }                  ← 5.5 候选风险路径
  ├── event: risk_paths  data: { path_id, risk_level, ... }      ← 5.5 风险传导
  ├── event: anomaly_findings data: { ... }                      ← 5.5 异常发现
  ├── event: stage       data: {"stage": "compliance", ...}      ← 合规分析阶段
  ├── event: compliance  data: { regulation, clause, ... }       ← 5.6 合规分析
  ├── event: compliance_scores data: { ... }                     ← 5.6 合规评分
  ├── event: compliance_indicators data: { ... }                 ← 5.6 合规指标
  ├── event: stage       data: {"stage": "scoring", ...}         ← 风险评分阶段
  ├── event: scoring     data: { dimensions: [...], ... }        ← 5.7 风险评分
  ├── event: stage       data: {"stage": "governance", ...}      ← 治理方案阶段
  ├── event: governance  data: { actions: [...], ... }           ← 5.7 治理方案
  ├── event: stage       data: {"stage": "report", ...}          ← 报告生成阶段
  ├── event: report      data: { executive_summary, ... }        ← 5.7 协同治理报告
  ├── event: done        data: {"message": "分析完成"}            ← 完成
  └── event: error       data: {"error": "..."}                  ← 错误
```

### 5.9.3 兼容接口

| API | 方法 | 输入 | 输出 | 用途 |
|-----|------|------|------|------|
| `/api/v1/chat/recommend` | POST | JSON：`query`、`history`、`sessionId`、`roundId` | 图谱问答结果、推荐实体、子图数据 | 非流式兼容接口，适合简单关系查询 |

### 5.9.4 健康检查

| API | 方法 | 输入 | 输出 | 用途 |
|-----|------|------|------|------|
| `/health` | GET | 无 | `{"status": "ok"}` | 服务可用性检测（前端 15s 轮询） |

### 5.9.5 认证与安全

- 所有 `/api/v1/*` 接口需携带 JWT Token：`Authorization: Bearer <token>`
- Token 有效期 ≤ 2 小时，支持刷新机制
- RBAC 四级权限：管理员 / 分析师 / 审核员 / 只读
- Cypher 注入防护：Retriever Agent 仅生成 MATCH/RETURN 只读语句

### 5.9.6 响应格式

```json
// 成功
{ "success": true, "data": { ... }, "error": null }

// 错误
{ "success": false, "data": null, "error": { "code": "ENTITY_NOT_FOUND", "message": "未找到匹配的实体" } }
```

### 5.9.7 超时与重试

| 接口类型 | 超时 | 重试策略 |
|---------|------|---------|
| 普通 JSON 接口 | 30s | 前端自动重试 1 次 |
| SSE 流式接口 | 300s | 不支持重试，需重新发起请求 |
| 文件上传接口 | 60s | 不支持重试 |
