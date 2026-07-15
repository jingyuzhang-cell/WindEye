#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
监管违规穿透式查询系统 - 示例运行脚本
直接运行预设的示例事件
"""

from regulatory_query_system import RegulatoryQuerySystem

def run_example_1():
    """示例1: 内幕交易案例"""
    event = """某上市公司董事长王某在公司重大资产重组信息公开前，
利用职务便利获取的内幕信息，通过亲属账户买入公司股票，
获利500万元。证监会对其立案调查。"""
    
    print("运行示例1: 内幕交易案例")
    print("=" * 80)
    
    system = RegulatoryQuerySystem()
    results = system.query(event)
    
    return results

def run_example_2():
    """示例2: 信息披露违规"""
    event = """某科技公司在年度报告中虚增收入2亿元，
隐瞒重大对外担保事项，误导投资者。
财务总监和审计机构均涉嫌参与造假。
交易所对公司及相关责任人进行问询和处分。"""
    
    print("运行示例2: 信息披露违规")
    print("=" * 80)
    
    system = RegulatoryQuerySystem()
    results = system.query(event)
    
    return results

def run_example_3():
    """示例3: 操纵市场"""
    event = """某私募基金通过连续交易、对倒等方式，
操纵多只小盘股价格，影响市场秩序。
涉案金额达5000万元，证监会已对其采取监管措施。"""
    
    print("运行示例3: 操纵市场")
    print("=" * 80)
    
    system = RegulatoryQuerySystem()
    results = system.query(event)
    
    return results

def main():
    """主函数"""
    print("监管违规穿透式查询系统 - 示例运行")
    print("=" * 80)
    print("\n可用示例:")
    print("1. 内幕交易案例")
    print("2. 信息披露违规")
    print("3. 操纵市场")
    print("\n请选择要运行的示例 (1-3): ", end="")
    
    choice = input().strip()
    
    if choice == '1':
        run_example_1()
    elif choice == '2':
        run_example_2()
    elif choice == '3':
        run_example_3()
    else:
        print("无效选择，运行默认示例...")
        run_example_1()

if __name__ == "__main__":
    main()
