#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Markdown格式清理效果演示
展示修改前后的对比
"""

import re

def remove_markdown_formatting(text: str) -> str:
    """去除文本中的markdown格式"""
    if not text:
        return text
    
    # 去除代码块标记
    text = re.sub(r'```[\w]*\n', '', text)
    text = re.sub(r'```', '', text)
    
    # 去除粗体标记 **text** 或 __text__
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'__(.+?)__', r'\1', text)
    
    # 去除斜体标记 *text* 或 _text_
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'_(.+?)_', r'\1', text)
    
    # 去除标题标记 # 
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    
    # 去除链接 [text](url)
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    
    # 去除图片 ![alt](url)
    text = re.sub(r'!\[([^\]]*)\]\([^\)]+\)', r'\1', text)
    
    # 去除行内代码 `code`
    text = re.sub(r'`([^`]+)`', r'\1', text)
    
    # 去除分割线 --- 或 ***
    text = re.sub(r'^[\*\-_]{3,}\s*$', '', text, flags=re.MULTILINE)
    
    # 去除列表标记
    text = re.sub(r'^[\*\-\+]\s+', '• ', text, flags=re.MULTILINE)
    text = re.sub(r'^\d+\.\s+', '', text, flags=re.MULTILINE)
    
    # 去除引用标记 >
    text = re.sub(r'^>\s+', '', text, flags=re.MULTILINE)
    
    # 去除多余的空行（保留最多一个空行）
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    return text.strip()


def demo():
    """演示格式清理效果"""
    
    # 示例：带有markdown格式的API响应
    markdown_text = """
# 监管违规事件分析报告

## 一、事件涉及的主要责任方及其法律地位

根据事件描述，主要责任方包括：

**1. 上市公司董事长王某**
- 法律地位：上市公司高级管理人员
- 违规行为：利用职务便利获取内幕信息

**2. 亲属账户持有人**
- 法律地位：内幕信息知情人的近亲属
- 违规行为：配合实施内幕交易

---

## 二、涉及的违规行为类型及法律依据

### 主要违规行为

1. **内幕交易**
   - 法律依据：`《证券法》第50条`、第51条
   - 违规要素：知悉内幕信息 + 交易行为 + 获利或避损

2. **信息披露违规**
   - 相关规定参见 [证监会网站](https://www.csrc.gov.cn)

### 处罚措施

- 罚款金额：**500万元**
- 禁入措施：*5年市场禁入*

```python
# 处罚计算示例
profit = 5000000  # 获利金额
fine = profit * 1.5  # 罚款倍数
```

> 注：以上仅为示例说明
"""

    print("=" * 80)
    print("Markdown格式清理效果演示")
    print("=" * 80)
    
    print("\n【原始文本（包含Markdown格式）】")
    print("-" * 80)
    print(markdown_text)
    
    print("\n\n【清理后文本（纯文本）】")
    print("-" * 80)
    cleaned_text = remove_markdown_formatting(markdown_text)
    print(cleaned_text)
    
    print("\n\n" + "=" * 80)
    print("对比说明：")
    print("=" * 80)
    print("✓ 已去除 # ## ### 等标题标记")
    print("✓ 已去除 **粗体** 和 __粗体__ 标记")
    print("✓ 已去除 *斜体* 和 _斜体_ 标记")
    print("✓ 已去除 `代码` 标记")
    print("✓ 已去除代码块 ``` 标记")
    print("✓ 已去除链接 [文本](URL)")
    print("✓ 已去除分割线 ---")
    print("✓ 已去除引用标记 >")
    print("✓ 列表标记转换为 •")
    print("=" * 80)


if __name__ == "__main__":
    demo()
