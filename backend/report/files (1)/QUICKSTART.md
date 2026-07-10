# 快速入门指南

## 第一步：配置API密钥

在 `regulatory_query_system.py` 文件的第17行填入您的DeepSeek API密钥：

```python
API_KEY = "sk-xxxxxxxxxxxxxxxx"  # 替换为您的真实API密钥
```

## 第二步：测试系统

运行测试脚本验证数据加载：

```bash
python3 test_system.py
```

如果所有检查通过，您将看到：
```
✓ 所有检查通过！系统可以正常运行。
```

## 第三步：运行示例

### 方式A：运行预设示例

```bash
python3 run_examples.py
```

然后选择1、2或3来运行不同的示例事件。

### 方式B：输入自定义事件

```bash
python3 regulatory_query_system.py
```

然后输入您的事件描述，输入完成后输入`END`并回车。

## 输出文件位置

所有结果将保存在 `/mnt/user-data/outputs/` 目录：

- `event_network.png` - 网络可视化图
- `community_reports.txt` - 社区报告汇总
- `final_analysis.txt` - AI综合分析
- `analysis_summary.xlsx` - Excel汇总表

## 示例事件格式

```
某上市公司董事长在公司重大资产重组信息公开前，
利用内幕信息通过亲属账户买入公司股票，获利500万元。
证监会对其立案调查。
END
```

## 常见问题

**Q: API调用失败怎么办？**
A: 检查API_KEY是否正确，确认网络连接，查看DeepSeek账户余额。

**Q: 没有匹配到社区？**
A: 尝试使用更具体的描述，系统会自动启用关键词模糊匹配。

**Q: 如何查看详细日志？**
A: 系统运行时会在控制台输出详细的步骤信息。

## 需要帮助？

查看完整文档：`README.md`
