# API 与配置参考

## 配置文件

统一配置文件是 [backend/.env](/D:/Code/WindEye/backend/.env:1)。

## 关键环境变量

- `DEEPSEEK_API_KEY`：离线社区报告和层级映射优先使用
- `LLM_API_KEY`：当 `DEEPSEEK_API_KEY` 为空时作为回退
- `DEEPSEEK_API_BASE`：DeepSeek/OpenAI 兼容接口地址
- `DEEPSEEK_MODEL`：离线报告默认模型

## 代码配置入口

统一入口位于 [report_settings.py](/D:/Code/WindEye/backend/new_report/code/report_settings.py:1)。

它负责：

- 加载 `backend/.env`
- 按仓库目录自动推导输入路径与输出路径
- 创建标准输出目录
- 统一 LLM 相关配置

## 外部接口引用

当前在线 API 读取离线社区报告的入口位于 [governance_routes.py](/D:/Code/WindEye/backend/api/governance_routes.py:251)，默认读取 `backend/report_outputs/community_reports`。
