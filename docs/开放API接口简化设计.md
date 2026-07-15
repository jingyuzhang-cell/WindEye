# 开放治理 API 简化设计

## 1. 设计目标

对外开放的治理分析接口只保留“分析谁、分析多深、要不要完整结果”这类业务参数。

内部已有的 `/api/v1/governance/*` 接口继续保留，仍然服务于前端内部编排、算法调试和工程联调；新增的 `/api/v1/public/governance/*` 则面向外部集成方，统一隐藏算法选择、关系白名单、社区模式、路径控制等技术细节。

## 2. 新增接口

本次新增 3 个开放接口：

1. `POST /api/v1/public/governance/community-discovery`
2. `POST /api/v1/public/governance/risk-paths`
3. `POST /api/v1/public/governance/compliance-report`

它们都复用内部能力，不重写底层算法链路。

## 3. 统一请求原则

### 3.1 通用请求体

```json
{
  "subjectName": "鑫达投资管理有限公司",
  "subjectId": "",
  "depth": 3,
  "responseMode": "summary"
}
```

### 3.2 字段说明

| 字段 | 必填 | 默认值 | 说明 |
|---|---|---:|---|
| `subjectName` | 条件必填 | - | 主体名称，适合外部系统直接传名称 |
| `subjectId` | 条件必填 | - | 图谱节点 ID，优先级高于 `subjectName` |
| `depth` | 否 | `3` | 分析深度，统一映射到内部 `maxHop` |
| `responseMode` | 否 | `summary` | `summary` 返回摘要；`full` 返回补充图谱上下文 |

约束：`subjectName` 与 `subjectId` 至少传一个。

## 4. 统一响应外壳

### 4.1 成功

```json
{
  "success": true,
  "traceId": "trc-community-1752570000000",
  "data": {},
  "summary": {},
  "warnings": []
}
```

### 4.2 失败

```json
{
  "success": false,
  "traceId": "trc-public-1752570000000",
  "errorCode": "SUBJECT_REQUIRED",
  "message": "subjectName 和 subjectId 至少填写一个"
}
```

## 5. 三个接口的简化契约

### 5.1 群体发现

**接口**

```http
POST /api/v1/public/governance/community-discovery
```

**请求示例**

```json
{
  "subjectName": "鑫达投资管理有限公司",
  "depth": 3,
  "responseMode": "summary"
}
```

**响应示例**

```json
{
  "success": true,
  "traceId": "trc-community-1752570000000",
  "data": {
    "subject": {
      "id": "company-001",
      "name": "鑫达投资管理有限公司",
      "type": "COMPANY"
    },
    "targetCommunity": {
      "communityId": 7,
      "name": "鑫达投资管理有限公司关联群体",
      "size": 18,
      "riskScore": 83.5,
      "riskLevel": "high"
    },
    "keyMembers": [
      {
        "id": "company-001",
        "name": "鑫达投资管理有限公司",
        "type": "COMPANY",
        "role": "core"
      },
      {
        "id": "person-001",
        "name": "张某",
        "type": "PERSON",
        "role": "bridge"
      }
    ]
  },
  "summary": {
    "communityCount": 3,
    "memberCount": 18,
    "coreNodeCount": 1,
    "bridgeNodeCount": 1
  },
  "warnings": []
}
```

`responseMode=full` 时额外返回：

- `data.graph`
- `data.communities`

### 5.2 风险传导路径

**接口**

```http
POST /api/v1/public/governance/risk-paths
```

**请求示例**

```json
{
  "subjectName": "鑫达投资管理有限公司",
  "depth": 3,
  "maxPaths": 10,
  "minRiskLevel": "medium",
  "responseMode": "summary"
}
```

**附加字段**

| 字段 | 默认值 | 说明 |
|---|---:|---|
| `maxPaths` | `10` | 最大返回路径数 |
| `minRiskLevel` | `medium` | 路径最低风险等级：`low` / `medium` / `high` |

**响应示例**

```json
{
  "success": true,
  "traceId": "trc-risk-1752570000000",
  "data": {
    "subject": {
      "id": "company-001",
      "name": "鑫达投资管理有限公司",
      "type": "COMPANY"
    },
    "paths": [
      {
        "pathId": "path-001",
        "riskLevel": "high",
        "riskScore": 92,
        "description": "鑫达投资通过股权控制关系关联华创贸易，后者涉及资金占用风险事件。",
        "nodes": [
          {"id": "company-001", "name": "鑫达投资管理有限公司", "type": "COMPANY"},
          {"id": "company-002", "name": "华创贸易有限责任公司", "type": "COMPANY"},
          {"id": "event-001", "name": "关联方资金占用事件", "type": "EVENT"}
        ],
        "relations": ["CONTROLLER", "TRIGGERS"],
        "evidence": []
      }
    ]
  },
  "summary": {
    "pathCount": 1,
    "highRiskCount": 1,
    "mediumRiskCount": 0,
    "lowRiskCount": 0,
    "communityCount": 3
  },
  "warnings": []
}
```

`responseMode=full` 时额外返回：

- `data.communityDiscovery`
- `data.communityPaths`
- `data.viewModel`

### 5.3 协同治理社区报告

**接口**

```http
POST /api/v1/public/governance/compliance-report
```

**请求示例**

```json
{
  "subjectName": "鑫达投资管理有限公司",
  "depth": 3,
  "maxPaths": 10,
  "includeDocx": true,
  "responseMode": "summary"
}
```

**附加字段**

| 字段 | 默认值 | 说明 |
|---|---:|---|
| `query` | 自动生成 | 不传时自动拼接“请分析某主体的协同治理社区报告” |
| `maxPaths` | `10` | 内部报告阶段使用的路径上限 |
| `includeDocx` | `true` | 是否自动生成 DOCX 元数据 |

**响应示例**

```json
{
  "success": true,
  "traceId": "trc-report-1752570000000",
  "data": {
    "subject": {
      "id": "company-001",
      "name": "鑫达投资管理有限公司",
      "type": "COMPANY"
    },
    "riskAssessment": {
      "riskLevel": "high",
      "totalScore": 82.6,
      "summary": "总体风险较高。"
    },
    "complianceAssessment": {
      "matchedRuleCount": 3,
      "violationCount": 2
    },
    "keyFindings": [
      "主体存在高风险跨社区传导链路",
      "关联方治理动作需要优先落地"
    ],
    "responsibleEntities": [],
    "governanceActions": [],
    "report": {
      "reportId": "WIND-COMP-001",
      "title": "鑫达投资管理有限公司协同治理社区报告",
      "generatedAt": "2026-07-15 10:00:00",
      "download": {
        "fileName": "WIND-COMP-001.docx",
        "downloadUrl": "/api/v1/governance/compliance-report/files/WIND-COMP-001.docx",
        "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }
    }
  },
  "summary": {
    "riskLevel": "high",
    "totalScore": 82.6,
    "pathCount": 5,
    "exported": true
  },
  "warnings": []
}
```

`responseMode=full` 时额外返回：

- `data.pipelineTrace`
- `data.reportSections`
- `data.riskPaths`
- `data.communityRiskPaths`

## 6. 与内部接口的映射关系

| 对外接口 | 内部复用接口 | 说明 |
|---|---|---|
| `/api/v1/public/governance/community-discovery` | `/api/v1/governance/community-discovery` | 公共接口只做参数收敛和响应裁剪 |
| `/api/v1/public/governance/risk-paths` | `/api/v1/governance/risk-paths` | 公共接口做风险等级过滤、路径条数裁剪 |
| `/api/v1/public/governance/compliance-report` | `/api/v1/governance/compliance-report` | 继续复用内部串联链路：群体发现 → 风险路径 → 在线社区报告 |

## 7. 后端实现位置

| 文件 | 作用 |
|---|---|
| `backend/api/governance_routes.py` | 新增 `public_router`、简化请求模型、响应映射函数和 3 个 public 端点 |
| `backend/api/router.py` | 挂载 `public_router` |
| `backend/tests/test_public_governance_api.py` | 新增对外简化接口测试 |

## 8. 默认策略

公共接口不再允许外部直接传入这些内部算法参数：

- `method`
- `communityMode`
- `riskRelationWhitelist`
- `pathLimit`
- `subgraphPathLimit`
- `maxBranchPerNode`
- `entityCommunityMap`
- `communityGraph`
- `viewModel`

这些配置全部由服务端默认策略接管。

## 9. 验证结果

本次实现已完成以下校验：

1. `python -m compileall backend/api/governance_routes.py backend/api/router.py backend/tests/test_public_governance_api.py`
2. `python -m pytest backend/tests/test_public_governance_api.py backend/tests/test_governance_seed_resolution.py backend/tests/test_compliance_report_new_report.py -q`

测试结果：`6 passed`
