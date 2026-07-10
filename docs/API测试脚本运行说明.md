# API 测试脚本运行说明

本文说明如何运行 `api-tests` 目录下的 API 调用脚本，并将接口返回 JSON 保存到 `output` 目录。

## 1. 目录说明

```text
C:\Users\15819\Desktop\系统文档\调用API
├─ api-tests
│  ├─ test_01_search_all.ps1
│  ├─ test_02_expand_node.ps1
│  ├─ test_03_community_discovery.ps1
│  ├─ test_04_risk_paths.ps1
│  ├─ test_05_compliance_report.ps1
│  └─ run_all_and_save.ps1
└─ output
   ├─ 00_port_check.json
   ├─ 01_search_all.json
   ├─ 02_expand_node.json
   ├─ 03_community_discovery.json
   ├─ 04_risk_paths.json
   ├─ 05_compliance_report.json
   └─ summary.json
```

## 2. 默认服务地址

脚本默认调用：

```text
http://10.0.226.101:8001
```

如需改成其他服务地址，可以使用脚本参数 `-BaseUrl`，也可以设置环境变量 `API_BASE_URL`。

## 3. 推荐运行方式：一次调用全部 API 并保存 JSON

在 PowerShell 中进入项目目录：

```powershell
cd "C:\Users\15819\Desktop\系统文档\调用API"
```

运行总控脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\api-tests\run_all_and_save.ps1 -BaseUrl "http://10.0.226.101:8001" -OutputDir "C:\Users\15819\Desktop\系统文档\调用API\output" -TimeoutSec 120
```

该脚本会依次执行：

| 序号 | API | 输出文件 |
|---|---|---|
| 0 | 端口连通性检测 | `output\00_port_check.json` |
| 1 | `POST /api/v1/graph/search-all` | `output\01_search_all.json` |
| 2 | `POST /api/v1/graph/expand/{node_id}` | `output\02_expand_node.json` |
| 3 | `POST /api/v1/governance/community-discovery` | `output\03_community_discovery.json` |
| 4 | `POST /api/v1/governance/risk-paths` | `output\04_risk_paths.json` |
| 5 | `POST /api/v1/governance/compliance-report` | `output\05_compliance_report.json` |
| 汇总 | 全部接口调用汇总 | `output\summary.json` |

说明：

- `-TimeoutSec 120` 表示每个接口最多等待 120 秒。
- `community-discovery` 返回数据较大，建议使用 120 秒或更长超时。
- 如果运行环境存在网络隔离，应在能访问 `http://10.0.226.101:8001/knowledge-graph` 的主机网络环境中执行。

## 4. 单独运行每个 API 脚本

### 4.1 关键字全图检索

```powershell
powershell -ExecutionPolicy Bypass -File .\api-tests\test_01_search_all.ps1 -BaseUrl "http://10.0.226.101:8001"
```

调用接口：

```text
POST /api/v1/graph/search-all
```

### 4.2 N 度扩展子图

默认节点 ID 为 `company_001`：

```powershell
powershell -ExecutionPolicy Bypass -File .\api-tests\test_02_expand_node.ps1 -BaseUrl "http://10.0.226.101:8001"
```

指定节点 ID：

```powershell
powershell -ExecutionPolicy Bypass -File .\api-tests\test_02_expand_node.ps1 -BaseUrl "http://10.0.226.101:8001" -NodeId "company_001"
```

调用接口：

```text
POST /api/v1/graph/expand/{node_id}
```

### 4.3 风险主体社区发现

```powershell
powershell -ExecutionPolicy Bypass -File .\api-tests\test_03_community_discovery.ps1 -BaseUrl "http://10.0.226.101:8001"
```

调用接口：

```text
POST /api/v1/governance/community-discovery
```

### 4.4 风险传导路径分析

```powershell
powershell -ExecutionPolicy Bypass -File .\api-tests\test_04_risk_paths.ps1 -BaseUrl "http://10.0.226.101:8001"
```

调用接口：

```text
POST /api/v1/governance/risk-paths
```

### 4.5 协同合规分析报告

```powershell
powershell -ExecutionPolicy Bypass -File .\api-tests\test_05_compliance_report.ps1 -BaseUrl "http://10.0.226.101:8001"
```

调用接口：

```text
POST /api/v1/governance/compliance-report
```

注意：当前实测该路径返回 `404 Not Found`，说明服务器上可能未注册该路由，或网关没有转发到对应后端服务。

## 5. 单脚本输出保存方式

单个 `test_*.ps1` 脚本默认把 JSON 打印到控制台，不自动写入 `output`。如需保存单个接口结果，可以使用：

```powershell
powershell -ExecutionPolicy Bypass -File .\api-tests\test_01_search_all.ps1 -BaseUrl "http://10.0.226.101:8001" *> .\output\01_search_all_manual.json
```

更推荐使用 `run_all_and_save.ps1`，因为它会自动生成标准文件名和 `summary.json`。

## 6. 常见问题

### 6.1 浏览器能打开前端，但脚本连接失败

如果浏览器能打开：

```text
http://10.0.226.101:8001/knowledge-graph
```

但脚本提示：

```text
TcpTestSucceeded: False
Unable to connect to the remote server
```

通常说明脚本运行环境和浏览器运行环境的网络权限不同，例如沙箱网络、VPN、代理或防火墙策略不同。应在能访问该前端页面的同一主机网络环境中运行脚本。

### 6.2 `community-discovery` 超时

该接口可能返回几十 MB JSON，计算和传输时间较长。建议运行总控脚本时设置：

```powershell
-TimeoutSec 120
```

必要时可继续增大到 `180` 或 `300`。

### 6.3 `compliance-report` 返回 404

`404 Not Found` 表示请求已经到达服务器，但服务器没有找到该路由。需要确认后端实际接口路径是否仍为：

```text
POST /api/v1/governance/compliance-report
```

也需要确认网关是否将该路径转发到后端服务。

