# 社区报告代码学习与替换方案

生成时间：2026-07-09

## 1. 现状结论

`backend/report` 中的新社区报告代码主要是离线 GraphRAG/多视角社区报告体系，核心能力包括：

1. `run_pipeline/run_pipeline.py`
   - 统一串联三步：GNN/Leiden 社区发现、社区报告生成、社区层级映射。
   - 适合做离线产物生产，不适合直接作为在线 API 请求路径。

2. `run_pipeline/step2_community_reports.py`
   - 读取三视角聚类结果 CSV。
   - 为 `责任方`、`违规行为`、`监管机构` 三类社区生成 Excel 报告。
   - 输出字段稳定：`id, community, level, title, parent, children, summary, key_words, findings, rank, rating_explanation, full_content_json`。

3. `run_pipeline/step3_hierarchy_mapping.py`
   - 读取三类社区报告。
   - 基于 Section/Law 重叠和语义相似度构建 `责任方 -> 违规行为 -> 监管机构` 的层级链。
   - 输出 `community_hierarchy_gnn.xlsx`、质量报告和层级可视化。

4. `hierarchical_graphrag_core.py`
   - 定义 `Community`、`HierarchyNode`。
   - 提供多视角社区层级结构、事件实体抽取、跨社区链路推理、RAG 答案生成的核心思路。

5. `files (2)/regulatory_query_system_v5.py`
   - 是目前最完整的查询型原型。
   - 能加载三视角社区报告、层级文件和统一图谱数据。
   - 查询流程为：事件实体抽取 -> 社区匹配 -> 社区路径 -> 节点路径 -> 三元组证据 -> LLM 综合分析 -> 输出报告。

当前线上 API 的社区/报告能力位于：

- `POST /api/v1/governance/community-discovery`
- `POST /api/v1/governance/risk-paths`
- `POST /api/v1/governance/reports`
- `POST /api/v1/chat/unified-stream`

但开放 API 配置和测试文档仍写着：

- `POST /api/v1/governance/compliance-report`

该路由当前未注册，实测返回 JSON 404。

## 2. 替换目标

把现有在线报告从“实时子图 + 简化治理报告”升级为：

1. 使用离线产出的三视角社区报告作为高质量社区知识库。
2. 在线查询时复用已生成的社区报告、社区层级图和节点路径证据。
3. 报告结构统一输出：
   - 风险主体
   - 群体发现
   - 社区责任链路
   - 节点级证据路径
   - 法规/合规依据
   - 风险传导解释
   - 治理建议
4. 输出目录统一支持 `backend/report_outputs`。

## 3. 推荐目录整理

建议新增线上适配层，不直接把 `backend/report/files (2)` 里的原型代码塞进 API：

```text
backend/
  report/
    run_pipeline/
      step1_gnn_clustering.py
      step2_community_reports.py
      step3_hierarchy_mapping.py
    community_reports/
      责任方社区报告.xlsx
      违规行为社区报告.xlsx
      监管机构社区报告.xlsx
    build_hierarchy_links_output/
      community_hierarchy_v3_fixed.xlsx
  dra_ma/
    reporting/
      community_report_loader.py      # 新增：加载三视角社区报告和层级关系
      community_report_adapter.py     # 新增：把离线报告转为线上 JSON
      community_report_service.py     # 新增：查询、匹配、拼装报告
```

## 4. 替换实施步骤

### 阶段 1：冻结离线产物格式

以 `step2_community_reports.py` 的 Excel 字段为标准格式：

- `community`
- `title`
- `summary`
- `key_words`
- `findings`
- `rank`
- `rating_explanation`
- `full_content_json`

以 `community_hierarchy_v3_fixed.xlsx` 或 `step3_hierarchy_mapping.py` 输出为层级标准：

- `source_perspective`
- `source_community_id`
- `target_perspective`
- `target_community_id`
- `relation_type`
- `score`
- `is_strong_link`
- `evidence`

### 阶段 2：新增社区报告加载器

新增 `CommunityReportLoader`：

- 启动时或首次请求时加载三份 Excel。
- 加载层级关系文件。
- 建立索引：
  - `(perspective, community_id) -> report`
  - `keyword -> community`
  - `node_id -> community`
  - `community_id -> hierarchy edges`
- 支持热更新：当 `backend/report/community_reports` 文件修改后可重新加载。

### 阶段 3：新增线上报告适配器

新增 `CommunityReportAdapter`，把离线报告转成前端/接口可读 JSON：

```json
{
  "perspective": "responsibility",
  "communityId": 3,
  "title": "...",
  "summary": "...",
  "keywords": [],
  "findings": [],
  "rank": 8.5,
  "evidence": [],
  "source": "offline_community_report"
}
```

### 阶段 4：接入现有治理管线

在当前 `GovernanceOrchestrator` 中接入：

1. `CommunityModule`
   - 继续负责实时 k-hop 社区发现。
   - 额外输出匹配到的离线社区报告 `offlineCommunityReports`。

2. `RiskPathModule`
   - 风险路径保留当前实时枚举。
   - 为每条路径补充：
     - 所属社区报告摘要
     - 社区层级链路
     - 相关法规/责任/违规/监管解释

3. `ReporterModule`
   - 将 `offlineCommunityReports` 和 `communityHierarchyPaths` 纳入最终报告 prompt。
   - 报告字段增加：
     - `community_report_sources`
     - `community_hierarchy_paths`
     - `node_evidence_paths`
     - `regulatory_basis`

### 阶段 5：修正开放 API 第 5 项

当前有不一致：

- 开放 API 配置：`POST /api/v1/governance/compliance-report`
- 实际可用接口：`POST /api/v1/governance/reports`

建议二选一：

1. 推荐兼容方案：新增 `/api/v1/governance/compliance-report`，内部转调 `create_governance_report`。
2. 文档修正方案：把开放 API 配置和测试脚本改为 `/api/v1/governance/reports`。

为了兼容已有文档和第三方脚本，推荐第 1 种。

### 阶段 6：输出目录统一

所有测试、调试和离线转换结果统一输出到：

```text
D:\Code\WindEye\backend\report_outputs
```

建议文件：

- `community_report_replacement_plan.md`
- `api_test_summary.md`
- `summary.json`
- `01_search_all.json`
- `02_expand_node.json`
- `03_community_discovery.json`
- `04_risk_paths.json`
- `05_compliance_report.json`
- `05b_governance_reports_actual_path.json`

## 5. 新报告接口建议响应结构

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "report_id": "WIND-RPT-XXXX",
    "query_summary": "...",
    "executive_summary": "...",
    "risk_subjects": [],
    "community_info": {},
    "offline_community_reports": [],
    "community_hierarchy_paths": [],
    "risk_paths": [],
    "node_evidence_paths": [],
    "regulatory_basis": [],
    "anomaly_findings": [],
    "compliance_matches": [],
    "risk_scores": {},
    "governance_plan": {},
    "recommendations": [],
    "markdown_report": ""
  }
}
```

## 6. 验收标准

1. `POST /api/v1/governance/compliance-report` 返回 200 JSON。
2. `POST /api/v1/governance/reports` 保持兼容。
3. 报告中能看到三视角社区报告来源。
4. 风险路径能映射到社区层级链。
5. 前端 `RiskReportPanel` 能展示：
   - 群体发现
   - 风险传导路径
   - 协同治理社区报告
6. API 测试输出全部写入 `backend/report_outputs`。

## 7. 优先级

P0：

- 补 `/api/v1/governance/compliance-report` 路由兼容。
- 建立 `CommunityReportLoader`。
- 把离线社区报告挂到 `/api/v1/governance/reports` 输出。

P1：

- 在 `RiskPathModule` 中补社区层级链。
- 报告 prompt 纳入三视角社区摘要。

P2：

- 增加离线报告热更新。
- 增加报告质量评分、来源追踪、可视化导出。
