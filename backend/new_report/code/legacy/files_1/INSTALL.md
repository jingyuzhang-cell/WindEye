# 监管违规穿透式查询系统 - 安装和使用说明

## 📋 系统概述

本系统实现了基于实验流程文档的完整穿透式查询功能：
1. ✅ 从事件中提取关键词（调用DeepSeek API）
2. ✅ 将关键词与社区节点匹配
3. ✅ 构建链路/路径
4. ✅ 可视化网络
5. ✅ 结合社区报告生成最终答案

## 🚀 快速开始（3步）

### 第1步：配置API密钥

编辑 `regulatory_query_system.py` 文件第17行：
```python
API_KEY = "sk-your-deepseek-api-key"  # 填入您的DeepSeek API密钥
```

或者编辑 `config.py` 文件：
```python
API_KEY = "sk-your-deepseek-api-key"
```

### 第2步：安装依赖

```bash
pip install -r requirements.txt --break-system-packages
```

或手动安装：
```bash
pip install pandas openpyxl networkx matplotlib requests --break-system-packages
```

### 第3步：运行系统

#### 方式A：运行测试验证
```bash
python3 test_system.py
```

#### 方式B：运行示例
```bash
python3 run_examples.py
```

#### 方式C：输入自定义事件
```bash
python3 regulatory_query_system.py
```

## 📝 输入格式

系统启动后，按照提示输入事件描述：

```
请输入事件描述（输入完成后按Enter，再输入'END'并按Enter结束）：
某上市公司董事长在公司重大资产重组信息公开前，
利用内幕信息通过亲属账户买入公司股票，获利500万元。
证监会对其立案调查。
END
```

**注意事项**：
- 可以输入多行
- 描述越详细越好
- 明确提及：责任方、违规行为、监管机构
- 输入完成后输入 `END` 并回车

## 📊 输出文件

所有结果保存在 `/mnt/user-data/outputs/` 目录：

| 文件名 | 类型 | 说明 |
|--------|------|------|
| `event_network.png` | 图片 | 网络可视化图 |
| `community_reports.txt` | 文本 | 社区报告汇总 |
| `final_analysis.txt` | 文本 | AI综合分析报告 |
| `analysis_summary.xlsx` | Excel | 汇总表格 |

## 🔍 系统工作流程

```
用户输入事件 
    ↓
步骤1: DeepSeek API提取实体（责任方、违规行为、监管机构）
    ↓
步骤2: 与三种视角的社区节点匹配
    ↓
步骤3: 基于community_hierarchy_v2.xlsx构建链路
    ↓
步骤4: 生成网络可视化图
    ↓
步骤5: 获取相关社区报告
    ↓
步骤6: DeepSeek生成综合分析
    ↓
输出：PNG图、TXT报告、Excel表格
```

## 📂 数据文件说明

系统需要以下数据文件（应在 `/mnt/user-data/uploads/` 目录）：

### 社区结构数据（JSON）
- `regulatory_visualization_data.json` - 监管机构视角
- `responsibility_visualization_data.json` - 责任方视角  
- `violation_visualization_data.json` - 违规行为视角

### 社区报告（Excel）
- `监管机构社区报告.xlsx` - 11个社区报告
- `责任方社区报告.xlsx` - 15个社区报告
- `违规行为社区报告.xlsx` - 13个社区报告

### 关系数据
- `community_hierarchy_v2.xlsx` - 174条社区关联关系

### 知识图谱
- `merged_regulatory_unified.txt` - 599个节点，1427条关系

## 🎯 示例事件

### 示例1：内幕交易
```
某上市公司董事长王某在公司重大资产重组信息公开前，
利用职务便利获取的内幕信息，通过亲属账户买入公司股票，
获利500万元。证监会对其立案调查。
END
```

### 示例2：信息披露违规
```
某科技公司在年度报告中虚增收入2亿元，
隐瞒重大对外担保事项，误导投资者。
财务总监和审计机构均涉嫌参与造假。
交易所对公司及相关责任人进行问询和处分。
END
```

### 示例3：操纵市场
```
某私募基金通过连续交易、对倒等方式，
操纵多只小盘股价格，影响市场秩序。
涉案金额达5000万元，证监会已对其采取监管措施。
END
```

## ⚙️ 系统参数配置

在 `config.py` 中可以调整以下参数：

```python
# API配置
API_BASE = "https://api.deepseek.com/v1"
API_KEY = "your-api-key"
MAX_TOKENS = 4000
TEMPERATURE = 0.3

# 可视化配置
FIGURE_SIZE = (16, 12)
DPI = 300
NODE_SIZE = 3000
FONT_SIZE = 8

# 匹配配置
MIN_KEYWORD_LENGTH = 2
FUZZY_MATCH_THRESHOLD = 0.6
```

## 🐛 故障排除

### 问题1：API调用失败
```
错误: API调用失败: 401
```
**解决方案**：检查API_KEY是否正确配置

### 问题2：未匹配到社区
```
匹配到的社区：
  责任方社区: []
  违规行为社区: []
  监管机构社区: []
```
**解决方案**：
- 使用更具体的实体名称
- 系统会自动启用关键词模糊匹配
- 检查事件描述是否包含相关法律术语

### 问题3：中文显示乱码
**解决方案**：
- Linux: `sudo apt-get install fonts-wqy-zenhei`
- 或在代码中指定其他中文字体

### 问题4：缺少依赖
```
ModuleNotFoundError: No module named 'pandas'
```
**解决方案**：
```bash
pip install -r requirements.txt --break-system-packages
```

## 📚 文档索引

- `README.md` - 完整使用文档（3000+字）
- `QUICKSTART.md` - 快速入门指南
- `PROJECT_OVERVIEW.md` - 项目总览
- `INSTALL.md` - 本文件

## 🔧 高级用法

### 批量处理事件
修改 `regulatory_query_system.py`，添加批量处理逻辑：

```python
events = [
    "事件1描述",
    "事件2描述",
    "事件3描述"
]

for i, event in enumerate(events):
    print(f"\n处理事件 {i+1}/{len(events)}")
    system.query(event, output_dir=f"/mnt/user-data/outputs/event_{i+1}")
```

### 自定义匹配规则
在 `match_communities()` 方法中添加自定义逻辑：

```python
# 添加同义词匹配
synonyms = {
    "上市公司": ["股份公司", "公开公司"],
    "证监会": ["中国证监会", "证券监督管理委员会"]
}
```

### 调整可视化样式
在 `visualize_network()` 方法中修改：

```python
color_map = {
    'responsibility': '#your_color',
    'violation': '#your_color',
    'regulatory': '#your_color'
}
```

## 📊 系统性能

- **数据加载时间**: ~2秒
- **单次查询时间**: 30-120秒（取决于API响应）
- **支持事件长度**: 建议100-500字
- **并发处理**: 不支持（API限制）

## 🎓 学习资源

1. **社区检测算法**：了解Louvain算法
2. **知识图谱**：学习Neo4j和图数据库
3. **DeepSeek API**：参考官方文档
4. **NetworkX**：学习图可视化

## 📮 技术支持

如遇到问题：
1. 查看系统日志输出
2. 运行 `test_system.py` 验证数据
3. 检查 API 配置和余额
4. 阅读完整文档 `README.md`

---

**版本**: 1.0  
**更新**: 2026-02-09  
**作者**: Claude AI  
**许可**: 仅供学习研究使用
