#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据验证和系统测试脚本
用于检查所有数据文件是否正确加载
"""

import json
import pandas as pd
import os
from pathlib import Path

def check_file_exists(filepath):
    """检查文件是否存在"""
    if os.path.exists(filepath):
        print(f"✓ {os.path.basename(filepath)} 存在")
        return True
    else:
        print(f"✗ {os.path.basename(filepath)} 不存在")
        return False

def validate_json_file(filepath, expected_keys):
    """验证JSON文件结构"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        missing_keys = [key for key in expected_keys if key not in data]
        if missing_keys:
            print(f"  ⚠ 缺少键: {missing_keys}")
            return False
        
        print(f"  ✓ JSON结构正确")
        print(f"    - 节点数: {len(data.get('nodes', []))}")
        print(f"    - 边数: {len(data.get('edges', []))}")
        return True
    except Exception as e:
        print(f"  ✗ 读取失败: {e}")
        return False

def validate_excel_file(filepath, expected_columns):
    """验证Excel文件结构"""
    try:
        df = pd.read_excel(filepath)
        print(f"  ✓ Excel读取成功")
        print(f"    - 行数: {len(df)}")
        print(f"    - 列数: {len(df.columns)}")
        
        missing_cols = [col for col in expected_columns if col not in df.columns]
        if missing_cols:
            print(f"  ⚠ 缺少列: {missing_cols}")
            return False
        
        print(f"    - 必需列完整")
        return True
    except Exception as e:
        print(f"  ✗ 读取失败: {e}")
        return False

def validate_txt_file(filepath):
    """验证TXT文件（JSONL格式）"""
    try:
        node_count = 0
        edge_count = 0
        
        with open(filepath, 'r', encoding='utf-8') as f:
            for i, line in enumerate(f):
                if i >= 10:  # 只检查前10行
                    break
                data = json.loads(line.strip())
                if data['type'] == 'node':
                    node_count += 1
                elif data['type'] == 'relationship':
                    edge_count += 1
        
        print(f"  ✓ JSONL格式正确")
        print(f"    - 前10行: {node_count}节点, {edge_count}关系")
        return True
    except Exception as e:
        print(f"  ✗ 读取失败: {e}")
        return False

def main():
    """主测试函数"""
    print("=" * 80)
    print("监管违规穿透式查询系统 - 数据验证")
    print("=" * 80)
    
    data_dir = "data"
    
    all_passed = True
    
    # 检查JSON文件
    print("\n【1】检查社区可视化数据文件")
    print("-" * 80)
    
    json_files = [
        'regulatory_visualization_data.json',
        'responsibility_visualization_data.json',
        'violation_visualization_data.json'
    ]
    
    for filename in json_files:
        filepath = f"{data_dir}/{filename}"
        if check_file_exists(filepath):
            if not validate_json_file(filepath, ['nodes', 'edges']):
                all_passed = False
        else:
            all_passed = False
        print()
    
    # 检查Excel报告文件
    print("\n【2】检查社区报告文件")
    print("-" * 80)
    
    excel_reports = [
        '监管机构社区报告.xlsx',
        '责任方社区报告.xlsx',
        '违规行为社区报告.xlsx'
    ]
    
    required_columns = ['id', 'community', 'title', 'summary', 'key_words']
    
    for filename in excel_reports:
        filepath = f"{data_dir}/{filename}"
        if check_file_exists(filepath):
            if not validate_excel_file(filepath, required_columns):
                all_passed = False
        else:
            all_passed = False
        print()
    
    # 检查社区层级关系
    print("\n【3】检查社区层级关系文件")
    print("-" * 80)
    
    hierarchy_file = f"{data_dir}/community_hierarchy_v2.xlsx"
    if check_file_exists(hierarchy_file):
        hierarchy_columns = ['source_perspective', 'source_community_id', 
                            'target_perspective', 'target_community_id']
        if not validate_excel_file(hierarchy_file, hierarchy_columns):
            all_passed = False
    else:
        all_passed = False
    print()
    
    # 检查知识图谱文件
    print("\n【4】检查知识图谱文件")
    print("-" * 80)
    
    kg_file = f"{data_dir}/merged_regulatory_unified.txt"
    if check_file_exists(kg_file):
        if not validate_txt_file(kg_file):
            all_passed = False
    else:
        all_passed = False
    print()
    
    # 测试系统加载
    print("\n【5】测试系统数据加载")
    print("-" * 80)
    
    try:
        from regulatory_query_system import RegulatoryQuerySystem
        print("正在初始化系统...")
        system = RegulatoryQuerySystem(data_dir)
        print("✓ 系统初始化成功")
        
        # 检查索引构建
        print("\n索引统计:")
        print(f"  - 责任方节点索引: {len(system.node_to_community['responsibility'])} 个")
        print(f"  - 违规行为节点索引: {len(system.node_to_community['violation'])} 个")
        print(f"  - 监管机构节点索引: {len(system.node_to_community['regulatory'])} 个")
        
    except Exception as e:
        print(f"✗ 系统初始化失败: {e}")
        all_passed = False
    
    # 最终结果
    print("\n" + "=" * 80)
    if all_passed:
        print("✓ 所有检查通过！系统可以正常运行。")
    else:
        print("✗ 存在错误！请检查上述失败项。")
    print("=" * 80)
    
    return all_passed

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
