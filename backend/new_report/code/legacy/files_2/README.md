# 监管违规穿透式查询系统 - 修改版本

## 📋 修改概览

本次修改主要包含两个方面：

### 1️⃣ 去除 Markdown 格式
- ✅ 添加了 `remove_markdown_formatting()` 函数
- ✅ 自动清理 API 返回内容中的所有 markdown 标记
- ✅ 输出纯文本格式的分析报告

### 2️⃣ 更新层级关系文件
- ✅ 从 `community_hierarchy_v2.xlsx` 升级到 `community_hierarchy_v3_fixed.xlsx`
- ✅ 兼容新文件的扩展列（score, evidence等）

## 📁 文件清单

### 主要程序文件
1. **regulatory_query_system.py** ⭐ (已修改)
   - 主程序文件
   - 包含 markdown 格式清理功能
   - 更新了层级文件读取路径

2. **test_system.py** ⭐ (已修改)
   - 数据验证和测试脚本
   - 更新了层级文件检查逻辑

3. **config.py** (未修改)
   - 配置文件
   - API密钥和参数设置

4. **run_examples.py** (未修改)
   - 示例运行脚本
   - 包含3个预设案例

### 辅助文件
5. **demo_markdown_removal.py** (新增)
   - Markdown 格式清理效果演示
   - 可独立运行查看清理效果

6. **修改说明.md** (新增)
   - 详细的修改说明文档
   - 包含代码对比和使用指南

7. **README.md** (本文件)
   - 快速入门指南

## 🚀 快速开始

### 1. 数据准备
确保 `data/` 目录包含以下文件：
```
data/
├── regulatory_visualization_data.json
├── responsibility_visualization_data.json
├── violation_visualization_data.json
├── 监管机构社区报告.xlsx
├── 责任方社区报告.xlsx
├── 违规行为社区报告.xlsx
├── community_hierarchy_v3_fixed.xlsx  ⬅️ 新文件
└── merged_regulatory_unified.txt
```

### 2. 测试系统
```bash
python test_system.py
```

### 3. 查看格式清理效果
```bash
python demo_markdown_removal.py
```

### 4. 运行示例
```bash
python run_examples.py
```

### 5. 交互式使用
```bash
python regulatory_query_system.py
```

## 📊 输出说明

运行后会在 `output/` 目录生成：

| 文件名 | 说明 | 格式变化 |
|--------|------|---------|
| final_analysis.txt | 综合分析报告 | ✅ 已去除 markdown |
| community_reports.txt | 社区详细报告 | ✅ 已去除 markdown |
| event_network.png | 事件链路可视化图 | 无变化 |
| analysis_summary.xlsx | Excel汇总报告 | 无变化 |

## ✨ 主要改进

### Markdown 格式清理功能

**清理前：**
```markdown
# 监管违规事件分析报告

## 一、主要责任方

**1. 上市公司董事长**
- 法律地位：高级管理人员
- 违规行为：`内幕交易`
```

**清理后：**
```
监管违规事件分析报告

一、主要责任方

上市公司董事长
• 法律地位：高级管理人员
• 违规行为：内幕交易
```

## 🔧 关键代码修改

### 1. 新增格式清理函数（regulatory_query_system.py）
```python
def remove_markdown_formatting(text: str) -> str:
    """去除文本中的markdown格式"""
    # 去除代码块、粗体、斜体、标题等各种markdown标记
    # ... (详见代码)
    return text.strip()
```

### 2. API调用修改
```python
def call_deepseek_api(self, prompt: str, max_tokens: int = 2000) -> str:
    # ...
    content = response.json()['choices'][0]['message']['content']
    return remove_markdown_formatting(content)  # ⬅️ 新增清理步骤
```

### 3. 文件路径更新
```python
# regulatory_query_system.py 第107行
self.community_hierarchy = pd.read_excel(
    f"{self.data_dir}/community_hierarchy_v3_fixed.xlsx"  # ⬅️ 更新文件名
)

# test_system.py 第96行
hierarchy_file = f"{data_dir}/community_hierarchy_v3_fixed.xlsx"  # ⬅️ 同步更新
```

## ⚠️ 注意事项

1. **API配置**：确保在 `config.py` 中设置有效的 DeepSeek API Key

2. **数据文件**：
   - 必须使用新的 `community_hierarchy_v3_fixed.xlsx`
   - 旧的 `community_hierarchy_v2.xlsx` 不再使用

3. **中文显示**：
   - Windows 用户无需额外配置
   - Linux/Mac 用户可能需要安装中文字体

4. **输出目录**：程序会自动创建 `output/` 目录

## 📞 技术支持

如有问题，请查看：
- 详细说明：`修改说明.md`
- 格式演示：运行 `demo_markdown_removal.py`
- 系统测试：运行 `test_system.py`

## 📝 版本信息

- **修改日期**：2025-02-10
- **主要变更**：
  1. ✅ 添加 markdown 格式自动清理
  2. ✅ 升级到 community_hierarchy_v3_fixed.xlsx
- **兼容性**：向后兼容，保持原有功能不变

---

**修改完成，所有代码已就绪！** 🎉
