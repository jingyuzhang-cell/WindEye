# 07 — Neo4j 图谱 Schema 定义

> 本文档基于 `backend/config/sample_data.cypher` 中的样本数据和 `backend/kg_construction/ontology/ontology_finance.json` 中的本体定义，完整记录 BiDA-KG 知识图谱中所有节点 Labels、属性 (Properties) 和关系类型 (Relations)。

---

## 7.1 五层架构概览

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 4: Regulation (法规/行动层)                            │
│  Labels: Regulation, Law, Action, RegulatoryAuthority        │
├──────────────────────────────────────────────────────────────┤
│  Layer 3: Feature (特征层)                                    │
│  Labels: Feature, RiskFeature, RiskFactor                    │
├──────────────────────────────────────────────────────────────┤
│  Layer 2: Event (事件层)                                      │
│  Labels: Event, EVENT, TIME, REGULATOR                       │
├──────────────────────────────────────────────────────────────┤
│  Layer 1: Subject (主体层)                                    │
│  Labels: Subject, COMPANY, PERSON, PFCOMPANY, PFUND, SECURITY│
├──────────────────────────────────────────────────────────────┤
│  Layer 0: Closure (闭包层)                                    │
│  Labels: RiskReport                                          │
└──────────────────────────────────────────────────────────────┘
```

| 层级 | Layer Label | 中文名称 | 下属 Labels | 说明 |
|------|-------------|---------|-------------|------|
| 1 | `Subject` | 主体层 | COMPANY, PERSON, PFCOMPANY, PFUND, SECURITY | 企业、自然人、私募公司、私募基金、证券 |
| 2 | `Event` | 事件层 | EVENT, TIME, REGULATOR | 风险事件、时间节点、监管机构 |
| 3 | `Feature` | 特征层 | RiskFeature, RiskFactor | 风险特征、风险因子 |
| 4 | `Regulation` | 法规层 | Law, Regulation, Action | 法律、法规条款、处置动作 |
| 0 | — | 闭包层 | RiskReport | 协同治理报告（运行时生成） |

**说明：** 除闭包层外，每个节点同时具有 Layer Label 和具体类型 Label。例如一个企业节点同时拥有 `COMPANY` 和 `Subject` 两个 Label。

---

## 7.2 节点 Labels 定义

### 7.2.1 主体层 (Subject)

#### COMPANY — 企业

| 属性 | 类型 | 必填 | 说明 | 来源 |
|------|------|------|------|------|
| `name` | String | 是 | 节点显示名称（主键） | sample_data |
| `COMPANY_NM` | String | 是 | 企业全称 | sample_data |
| `ORGNUM` | String | 否 | 统一社会信用代码 / 注册号 | sample_data |
| `STATUS` | String | 否 | 经营状态（存续/吊销/注销/迁出） | sample_data |
| `REG_CAPITAL` | String | 否 | 注册资本（含单位，如"500000万"） | sample_data |
| `WARNING_NUM` | Integer | 否 | 预警数量 | sample_data |
| `RISK_INFO` | String(JSON) | 否 | 风险信息 JSON 数组 | sample_data |
| `zh_name` | String | 否 | 中文名称（别名） | pipeline |
| `aliases` | Array[String] | 否 | 别名列表 | pipeline |
| `name_list` | Array[String] | 否 | 历史名称列表 | pipeline |
| `source` | String | 否 | 数据来源标识 | pipeline |
| `confidence` | Float | 否 | 实体置信度 (0.0–1.0) | pipeline |
| `created_at` | DateTime | 否 | 创建时间 | pipeline |
| `last_seen` | DateTime | 否 | 最后更新时间 | pipeline |
| `layer` | String | 否 | 所属层级 | pipeline |
| `extraction_method` | String | 否 | 抽取方法 | pipeline |

**样本节点数量：** 13

#### PERSON — 自然人

| 属性 | 类型 | 必填 | 说明 | 来源 |
|------|------|------|------|------|
| `name` | String | 是 | 节点显示名称（主键） | sample_data |
| `PERSON_NM` | String | 是 | 自然人姓名 | sample_data |
| `POSITION` | String | 否 | 职位（董事长/总经理/财务总监等） | sample_data |
| `ID` | String | 否 | 身份证号 | sample_data |
| `zh_name` | String | 否 | 中文名称（别名） | pipeline |
| `aliases` | Array[String] | 否 | 别名列表 | pipeline |
| `title` | String | 否 | 称谓 | pipeline |
| `source` | String | 否 | 数据来源标识 | pipeline |
| `confidence` | Float | 否 | 实体置信度 (0.0–1.0) | pipeline |
| `created_at` | DateTime | 否 | 创建时间 | pipeline |
| `last_seen` | DateTime | 否 | 最后更新时间 | pipeline |

**样本节点数量：** 9

#### PFCOMPANY — 私募公司

| 属性 | 类型 | 必填 | 说明 | 来源 |
|------|------|------|------|------|
| `name` | String | 是 | 节点显示名称（主键） | pipeline |
| `COMPANY_NM` | String | 是 | 私募公司全称 | pipeline |
| `source` | String | 否 | 数据来源标识 | pipeline |

#### PFUND — 私募基金

| 属性 | 类型 | 必填 | 说明 | 来源 |
|------|------|------|------|------|
| `name` | String | 是 | 节点显示名称（主键） | pipeline |
| `source` | String | 否 | 数据来源标识 | pipeline |

#### SECURITY — 证券

| 属性 | 类型 | 必填 | 说明 | 来源 |
|------|------|------|------|------|
| `name` | String | 是 | 节点显示名称（主键） | pipeline |
| `source` | String | 否 | 数据来源标识 | pipeline |

### 7.2.2 事件层 (Event)

#### EVENT — 事件

| 属性 | 类型 | 必填 | 说明 | 来源 |
|------|------|------|------|------|
| `name` | String | 是 | 事件名称（主键） | sample_data |
| `title` | String | 是 | 事件标题 | sample_data |
| `EVENT_TITLE` | String | 是 | 事件标题（冗余） | sample_data |
| `EVENT_DATE` | String | 否 | 事件发生日期 (yyyy-MM-dd) | sample_data |
| `EVENT_TYPE` | String | 否 | 事件类型（司法执行/刑事立案/股权冻结/行政调查/债务违约/数据安全/产品召回等） | sample_data |
| `IMPACT_LEVEL` | Enum | 否 | 影响等级（high/medium/low） | sample_data |
| `action_type` | String | 否 | 处置类型（被执行人/刑事立案/股权冻结/行政调查/债务违约等） | sample_data |
| `event_category` | String | 否 | 事件分类（司法/刑事/监管/金融/安全/质量/环保） | sample_data |
| `text` | String | 否 | 事件详细描述 | sample_data |
| `parent_event` | String | 否 | 父事件名称（子事件专用） | sample_data |
| `source` | String | 否 | 数据来源标识 | pipeline |
| `confidence` | Float | 否 | 实体置信度 (0.0–1.0) | pipeline |
| `created_at` | DateTime | 否 | 创建时间 | pipeline |

**样本节点数量：** 13（含 2 个子事件）

#### TIME — 时间

| 属性 | 类型 | 必填 | 说明 | 来源 |
|------|------|------|------|------|
| `id` | String | 是 | 时间标识（主键，格式 yyyy-MM-dd） | sample_data |
| `normalized_time` | String | 是 | 归一化时间字符串 | sample_data |

**样本节点数量：** 13

#### REGULATOR — 监管机构

| 属性 | 类型 | 必填 | 说明 | 来源 |
|------|------|------|------|------|
| `name` | String | 是 | 监管机构名称 | pipeline |
| `source` | String | 否 | 数据来源标识 | pipeline |

### 7.2.3 特征层 (Feature)

#### RiskFeature — 风险特征

| 属性 | 类型 | 必填 | 说明 | 来源 |
|------|------|------|------|------|
| `feature_nm` | String | 是 | 特征名称（主键） | sample_data |
| `feature_type` | String | 否 | 特征类型（股权穿透异常/担保链风险/高管交叉任职等） | sample_data |
| `id` | String | 是 | 特征编号（如 F001） | sample_data |
| `e_id` | String | 否 | 关联实体编号 | sample_data |
| `e_text` | String | 否 | 特征详细描述 | sample_data |
| `source` | String | 否 | 数据来源标识 | pipeline |
| `confidence` | Float | 否 | 置信度 (0.0–1.0) | pipeline |
| `created_at` | DateTime | 否 | 创建时间 | pipeline |

**样本节点数量：** 11

#### RiskFactor — 风险因子

| 属性 | 类型 | 必填 | 说明 | 来源 |
|------|------|------|------|------|
| `factor_nm` | String | 是 | 因子名称（主键） | sample_data |
| `e_id` | String | 否 | 关联实体编号（如 FK001） | sample_data |
| `FACTOR` | String | 否 | 因子层级（1/2/3） | sample_data |
| `RISK` | String | 否 | 风险等级（1 最高/2/3） | sample_data |
| `RISK_TYPE` | String | 否 | 风险类型 | sample_data |
| `IMPORTANCE` | String | 否 | 重要性权重（负值，如 -2/-3） | sample_data |
| `NOTICE_DT` | String | 否 | 通知日期 | sample_data |

**样本节点数量：** 6

### 7.2.4 法规层 (Regulation)

#### Law — 法律

| 属性 | 类型 | 必填 | 说明 | 来源 |
|------|------|------|------|------|
| `regulation_title` | String | 是 | 法律全称 | sample_data |
| `regulation_name` | String | 是 | 法律简称（主键） | sample_data |
| `regulation_id` | String | 是 | 法律编号（如 L001） | sample_data |
| `regulation_text` | String | 否 | 法律全文 | sample_data |

**样本节点数量：** 7（民法典/证券法/公司法/刑法/公司法解释五/网络安全法/个人信息保护法/环境保护法/反垄断法 — 9 部法律，7 个节点）

#### Regulation — 法规条款

| 属性 | 类型 | 必填 | 说明 | 来源 |
|------|------|------|------|------|
| `regulation_title` | String | 是 | 条款全文 | sample_data |
| `regulation_name` | String | 是 | 条款简称（如"证券法第82条"） | sample_data |
| `regulation_id` | String | 是 | 条款编号（如 R001） | sample_data |

**样本节点数量：** 9 条

#### Action — 处置动作

| 属性 | 类型 | 必填 | 说明 | 来源 |
|------|------|------|------|------|
| `action_type` | String | 是 | 动作类型（冻结/发函/现场检查/司法移送/持续监控） | sample_data |
| `action_name` | String | 否 | 动作名称 | sample_data |

**样本节点数量：** 5

### 7.2.5 运行时标签

以下 Labels 不在样本数据中出现，但在代码层（`_ALL_LABELS` / ETL pipeline / 治理引擎）中使用：

| Label | 用途 | 场景 |
|-------|------|------|
| `Entity` | 通用实体基类 | ETL 导入阶段 |
| `NODE` | 通用节点基类 | ETL 导入阶段 |
| `Section` | 文档章节 | 法规文本解析 |
| `Responsibility` | 责任主体 | 合规分析 |
| `PartyWithResponsibility` | 有责方 | 合规分析 |
| `Actor` | 参与方（Dify 遗留） | 数据同步 |
| `RegulatoryAuthority` | 监管机构详情 | 监管机构管理 |
| `ChatSession` | 聊天会话 | KnowledgeQA 持久化 |
| `ChatMessage` | 聊天消息 | KnowledgeQA 持久化 |
| `RiskReport` | 风险报告（Closure 层） | 协同治理 |
| `EntityAlias` | 实体别名 | 实体对齐 |

### 7.2.6 搜索属性

系统通过以下属性进行关键词检索（定义于 `ontology_finance.json` 的 `search_properties`）：

```
name, COMPANY_NM, PERSON_NM, title, factor_nm, feature_nm, report_id
```

---

## 7.3 关系类型定义

### 7.3.1 主体层内部关系

#### INVEST — 投资关系

| 属性 | 说明 |
|------|------|
| **源 → 目标** | `COMPANY` → `COMPANY` |
| **语义** | 股权投资 / 持股关系 |
| **属性** | `ratio` (String, 持股比例), `amount` (String, 出资金额) |
| **风险权重** | 1.00（最高） |
| **来源** | sample_data |

#### GUARANTEE — 担保关系

| 属性 | 说明 |
|------|------|
| **源 → 目标** | `COMPANY` → `COMPANY` |
| **语义** | 对外担保 / 互保 |
| **属性** | `amount` (String, 担保金额), `start_date` (String, 担保起始日期) |
| **风险权重** | 0.98 |
| **来源** | sample_data |

#### CONTROLLER — 实际控制

| 属性 | 说明 |
|------|------|
| **源 → 目标** | `PERSON` → `COMPANY` |
| **语义** | 自然人实际控制企业 |
| **风险权重** | 0.95 |
| **来源** | sample_data |

#### WORK — 任职关系

| 属性 | 说明 |
|------|------|
| **源 → 目标** | `PERSON` → `COMPANY` |
| **语义** | 高管任职 / 员工雇佣 |
| **属性** | `position` (String, 职位名称) |
| **风险权重** | 0.60 |
| **来源** | sample_data |

#### COOPERATE — 合作关系

| 属性 | 说明 |
|------|------|
| **源 → 目标** | `PERSON` → `PERSON` 或 `COMPANY` → `COMPANY` |
| **语义** | 商业合作 / 联合投资 / 战略合作 |
| **属性** | `relation` (String, 合作类型), `type` (String), `start_date` (String) |
| **风险权重** | 0.40 |
| **来源** | sample_data |

### 7.3.2 事件层内部关系

#### CAUSE — 因果关系

| 属性 | 说明 |
|------|------|
| **源 → 目标** | `EVENT` → `EVENT` |
| **语义** | 事件 A 导致事件 B（因果链推理） |
| **风险权重** | 0.75 |
| **来源** | sample_data |

#### BELONG — 事件归属时间

| 属性 | 说明 |
|------|------|
| **源 → 目标** | `EVENT` → `TIME` |
| **语义** | 事件发生时间归属 |
| **来源** | sample_data |

### 7.3.3 特征层内部关系

#### BELONG — 因子归属特征

| 属性 | 说明 |
|------|------|
| **源 → 目标** | `RiskFactor` → `RiskFeature` |
| **语义** | 风险因子归属于风险特征 |
| **来源** | sample_data |

### 7.3.4 法规层内部关系

#### BELONG — 法规归属法律

| 属性 | 说明 |
|------|------|
| **源 → 目标** | `Regulation` → `Law` |
| **语义** | 法规条款归属于其上位法律 |
| **来源** | sample_data |

#### TRIGGERS — 法规触发动作

| 属性 | 说明 |
|------|------|
| **源 → 目标** | `Regulation` → `Action` |
| **语义** | 违反法规→对应的处置动作 |
| **来源** | sample_data |

### 7.3.5 跨层关系

#### MENTION — 事件提及

| 属性 | 说明 |
|------|------|
| **源 → 目标** | `EVENT` → `COMPANY` 或 `EVENT` → `PERSON` |
| **语义** | 事件涉及/提及某一主体 |
| **层级** | Event → Subject |
| **风险权重** | 0.50 |
| **来源** | sample_data |

#### TRIGGERS — 事件触发特征

| 属性 | 说明 |
|------|------|
| **源 → 目标** | `EVENT` → `RiskFeature` |
| **语义** | 风险事件触发风险特征提取 |
| **层级** | Event → Feature |
| **风险权重** | 0.70 |
| **来源** | sample_data |

#### REFLECTS — 风险体现

| 属性 | 说明 |
|------|------|
| **源 → 目标** | `RiskFeature` → `COMPANY` 或 `RiskFeature` → `PERSON` |
| **语义** | 风险特征体现在具体主体上 |
| **层级** | Feature → Subject |
| **风险权重** | 0.65 |
| **来源** | sample_data |

#### COMPLIES_WITH — 合规关联

| 属性 | 说明 |
|------|------|
| **源 → 目标** | `EVENT` → `Regulation` 或 `RiskFeature` → `Regulation` |
| **语义** | 事件/特征与法规条款的合规匹配 |
| **层级** | Event → Regulation  /  Feature → Regulation |
| **风险权重** | 0.55 |
| **来源** | sample_data |

### 7.3.6 Pipeline 预留关系类型

以下关系类型定义于 ETL 管道配置和数据采集层，尚未出现在样本数据中：

| 关系类型 | 源层 | 目标层 | 语义 | 风险权重 |
|---------|------|------|------|---------|
| `RECEIVES` | Subject | Event | 主体接收事件通知 | 0.30 |
| `INVOLVED_IN` | Subject | Event | 主体卷入事件 | 0.45 |
| `MENTIONED_IN` | Subject | Event | 主体在事件中被提及 | 0.35 |
| `REPORTS` | COMPANY | RegulatoryAuthority | 企业向监管机构报告 | — |
| `HAS_RESPONSIBLE_PARTY` | Regulation | Responsibility | 法规规定责任方 | — |
| `HAS_REGULATOR` | Regulation | RegulatoryAuthority | 法规由监管机构执行 | — |
| `BASED_ON` | RiskFactor | Law | 风险因子基于法律定义 | — |
| `FULFILLS` | Action | Regulation | 处置动作履行法规要求 | — |
| `EXECUTES` | RegulatoryAuthority | Action | 监管机构执行处置动作 | — |
| `SUBJECT_TO` | Subject | Regulation | 主体受法规约束 | — |
| `REGULATES` | Regulation | Subject | 法规监管某一类主体 | — |
| `IN_ACCORDANCE_WITH` | Action | Law | 处置动作依据法律 | — |

### 7.3.7 关系类型汇总

| 关系类型 | 样本数据中出现 | 语义 | 所属层内/跨层 |
|---------|:---:|------|:---:|
| `INVEST` | 是 | 股权投资 | Subject 层内 |
| `GUARANTEE` | 是 | 对外担保 | Subject 层内 |
| `CONTROLLER` | 是 | 实际控制 | Subject 层内 |
| `WORK` | 是 | 高管任职 | Subject 层内 |
| `COOPERATE` | 是 | 商业合作 | Subject 层内 |
| `CAUSE` | 是 | 事件因果 | Event 层内 |
| `MENTION` | 是 | 事件提及主体 | Event → Subject |
| `TRIGGERS` | 是 | 事件触发特征 / 法规触发动作 | Event→Feature / Regulation 层内 |
| `REFLECTS` | 是 | 风险特征体现于主体 | Feature → Subject |
| `COMPLIES_WITH` | 是 | 合规匹配 | Event/Feature → Regulation |
| `BELONG` | 是 | 归属（事件→时间 / 因子→特征 / 法规→法律） | 多层层内 |

---

## 7.4 跨层关系矩阵

下表展示四层之间的主要关系类型（标注「样本数据中存在」的关系）：

|  | 主体层 (Subject) | 事件层 (Event) | 特征层 (Feature) | 法规层 (Regulation) |
|--|:--:|:--:|:--:|:--:|
| **主体层** | INVEST, GUARANTEE, CONTROLLER, WORK, COOPERATE | MENTION (E→S, 逆向) | REFLECTS (F→S, 逆向) | — |
| **事件层** | MENTION | CAUSE, BELONG (E→TIME) | TRIGGERS | COMPLIES_WITH |
| **特征层** | REFLECTS | — | BELONG (Factor→Feature) | COMPLIES_WITH |
| **法规层** | — | — | — | BELONG (Reg→Law), TRIGGERS (Reg→Action) |

**解读方式：** 行 = 源层，列 = 目标层。例如「事件层」行「主体层」列的 `MENTION (E→S)` 表示 EVENT → COMPANY/PERSON。

---

## 7.5 索引与约束

生产环境中建议在 Neo4j 中建立以下索引和唯一约束：

### 7.5.1 唯一约束

```cypher
CREATE CONSTRAINT company_name_unique IF NOT EXISTS FOR (n:COMPANY) REQUIRE n.name IS UNIQUE;
CREATE CONSTRAINT person_name_unique  IF NOT EXISTS FOR (n:PERSON)  REQUIRE n.name IS UNIQUE;
CREATE CONSTRAINT event_name_unique   IF NOT EXISTS FOR (n:EVENT)   REQUIRE n.name IS UNIQUE;
CREATE CONSTRAINT time_id_unique      IF NOT EXISTS FOR (n:TIME)    REQUIRE n.id IS UNIQUE;
```

### 7.5.2 属性索引

```cypher
CREATE INDEX company_nm_idx      IF NOT EXISTS FOR (n:COMPANY) ON (n.COMPANY_NM);
CREATE INDEX person_nm_idx       IF NOT EXISTS FOR (n:PERSON)  ON (n.PERSON_NM);
CREATE INDEX event_title_idx     IF NOT EXISTS FOR (n:EVENT)   ON (n.EVENT_TITLE);
CREATE INDEX event_date_idx      IF NOT EXISTS FOR (n:EVENT)   ON (n.EVENT_DATE);
CREATE INDEX feature_nm_idx      IF NOT EXISTS FOR (n:RiskFeature) ON (n.feature_nm);
CREATE INDEX factor_nm_idx       IF NOT EXISTS FOR (n:RiskFactor) ON (n.factor_nm);
CREATE INDEX regulation_name_idx IF NOT EXISTS FOR (n:Regulation) ON (n.regulation_name);
CREATE INDEX law_name_idx        IF NOT EXISTS FOR (n:Law)     ON (n.regulation_name);
```

### 7.5.3 全文索引（可选）

```cypher
CREATE FULLTEXT INDEX entity_fulltext IF NOT EXISTS
FOR (n:COMPANY|PERSON|EVENT|RiskFeature|RiskFactor|Regulation|Law)
ON EACH [n.name, n.COMPANY_NM, n.PERSON_NM, n.title, n.feature_nm, n.factor_nm];
```

---

## 7.6 样本数据统计

基于 `backend/config/sample_data.cypher` 中的三个企业群体（华创控股/恒达科技/东方能源）：

### 7.6.1 节点统计

| Layer | Label | 数量 | 说明 |
|-------|-------|:---:|------|
| Subject | COMPANY | 13 | 华创系 7 + 恒达 3 + 东方 3 |
| Subject | PERSON | 9 | 华创系 5 + 恒达 2 + 东方 2 |
| Subject | PFCOMPANY | 0 | 样本未覆盖 |
| Subject | PFUND | 0 | 样本未覆盖 |
| Subject | SECURITY | 0 | 样本未覆盖 |
| Event | EVENT | 13 | 华创系 7 + 恒达 3 + 东方 3（含 2 个子事件） |
| Event | TIME | 13 | 覆盖 2024-03 至 2025-04 的各关键时间点 |
| Event | REGULATOR | 0 | 样本未覆盖 |
| Feature | RiskFeature | 11 | 华创系 5 + 恒达 3 + 东方 3 |
| Feature | RiskFactor | 6 | 华创系通用 6 个 |
| Regulation | Law | 9 | 华创系 5 + 恒达 2 + 东方 2 |
| Regulation | Regulation | 9 | 华创系 5 + 恒达 2 + 东方 2 |
| Regulation | Action | 5 | 华创系通用 5 个 |
| **合计** | | **88** | |

### 7.6.2 关系统计

| 关系类型 | 数量 | 主要涉及的 Label 组合 |
|---------|:---:|------|
| INVEST | ~15 | COMPANY → COMPANY |
| GUARANTEE | ~7 | COMPANY → COMPANY |
| CONTROLLER | 4 | PERSON → COMPANY |
| WORK | ~12 | PERSON → COMPANY |
| COOPERATE | 2 | PERSON→PERSON / COMPANY→COMPANY |
| CAUSE | 5 | EVENT → EVENT |
| BELONG | ~20 | EVENT→TIME / RiskFactor→RiskFeature / Regulation→Law |
| MENTION | ~14 | EVENT → COMPANY / PERSON |
| TRIGGERS | ~12 | EVENT→RiskFeature / Regulation→Action |
| REFLECTS | ~12 | RiskFeature → COMPANY / PERSON |
| COMPLIES_WITH | ~10 | EVENT/Feature → Regulation |
| **合计** | **~113** | |

### 7.6.3 群体分布

| 群体 | 核心企业 | 企业数 | 自然人 | 事件 | 跨群连接 |
|------|---------|:---:|:---:|:---:|------|
| 华创控股 | 华创控股集团 | 7 | 5 | 7 | →恒达 (鑫达投资→恒达科技) →东方 (华创控股→东方新能源) |
| 恒达科技 | 恒达科技 | 3 | 2 | 3 | →华创 (恒达云→海通金融担保) |
| 东方能源 | 东方能源集团 | 3 | 2 | 3 | ←华创 (马晓燕任职华创贸易) |

三个群体通过战略投资 + 人物交叉任职形成连通图，内部连接密度远高于跨群连接，Louvain 社区发现算法可正确识别群体边界。

---

## 7.7 关系的风险权重参考

DRA-MA 风险分析引擎使用以下权重进行风险路径评分（仅列出样本数据中出现的关系类型）：

| 关系类型 | 风险权重 | 风险等级 |
|---------|:---:|:---:|
| `INVEST` | 1.00 | high |
| `GUARANTEE` | 0.98 | high |
| `CONTROLLER` | 0.95 | high |
| `CAUSE` | 0.75 | medium |
| `TRIGGERS` | 0.70 | medium |
| `REFLECTS` | 0.65 | medium |
| `WORK` | 0.60 | medium |
| `COMPLIES_WITH` | 0.55 | medium |
| `MENTION` | 0.50 | medium |
| `COOPERATE` | 0.40 | medium |
| `BELONG` | 0.35 | low |

---

## 7.8 Schema 数据来源对照

| 来源文件 | 提供内容 |
|---------|---------|
| `backend/config/sample_data.cypher` | 实际节点属性、关系类型、样本值 |
| `backend/kg_construction/ontology/ontology_finance.json` | 层级→Label 映射、搜索属性、匹配策略 |
| `backend/api/graph_routes.py` | `_ALL_LABELS`、`_LAYER_LABEL_MAP`、Label 分组逻辑 |
| `backend/dra_ma/risk_engine/plugins/risk_analyst.py` | 风险路径分析、关系风险权重 |
| `backend/dra_ma/tools/community_discovery_tools.py` | 群体发现（WCC/Louvain） |
| `backend/kg_query/analytics/community/` | 7 种社区发现算法注册 |
