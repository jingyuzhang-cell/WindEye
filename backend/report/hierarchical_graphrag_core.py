#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
多视角社区层级融合GraphRAG系统 - 核心实现
================================================================
实现功能：
1. 多视角社区层级构建
2. 事件实体抽取与图谱匹配
3. 跨视角链路推理
4. RAG答案生成
================================================================
"""

import json
import re
import pandas as pd
import networkx as nx
from collections import defaultdict
from typing import Dict, List, Set, Tuple, Optional
from dataclasses import dataclass
import numpy as np


# ==================== 数据结构定义 ====================

@dataclass
class Community:
    """社区数据结构"""
    id: int
    perspective: str  # 'responsibility', 'regulatory', 'violation'
    entity_ids: Set[str]
    entity_types: Dict[str, int]
    internal_edges: int
    total_weight: float
    report_rating: float
    report_summary: str
    report_keywords: List[str]


@dataclass
class HierarchyNode:
    """层级节点"""
    community: Community
    parent: Optional['HierarchyNode']
    children: List['HierarchyNode']
    level: int
    relation_path: List[Tuple[str, str, str]]  # [(source, relation, target), ...]


# ==================== 核心算法1: 多视角社区层级构建 ====================

class HierarchicalCommunityBuilder:
    """多视角社区层级构建器"""
    
    def __init__(self):
        self.hierarchy_rules = self._init_hierarchy_rules()
    
    def _init_hierarchy_rules(self) -> Dict:
        """
        初始化层级关系规则
        
        定义哪些关系类型表明父子层级关系
        """
        return {
            # (relation_type, source_perspective, target_perspective): (score, direction)
            
            # 责任方 → 违规行为 (父→子)
            ('执行', 'responsibility', 'violation'): (1.0, 'parent_to_child'),
            ('做出', 'responsibility', 'violation'): (0.95, 'parent_to_child'),
            ('实施', 'responsibility', 'violation'): (0.9, 'parent_to_child'),
            ('产生', 'responsibility', 'violation'): (0.85, 'parent_to_child'),
            
            # 违规行为 → 监管机构 (子→父，监管机构处理违规)
            ('处理', 'regulatory', 'violation'): (1.0, 'child_to_parent'),
            ('处以', 'regulatory', 'violation'): (0.95, 'child_to_parent'),
            ('受到', 'violation', 'regulatory'): (0.9, 'child_to_parent'),
            
            # 责任方 → 监管机构 (直接监管关系)
            ('监管', 'regulatory', 'responsibility'): (1.0, 'direct_supervision'),
            ('依照', 'regulatory', 'responsibility'): (0.8, 'direct_supervision'),
        }
    
    def build_hierarchical_structure(
        self,
        responsibility_communities: List[Community],
        regulatory_communities: List[Community],
        violation_communities: List[Community],
        cross_community_edges: List[Dict]
    ) -> Dict[int, HierarchyNode]:
        """
        构建多视角层级社区结构
        
        Args:
            responsibility_communities: 责任方社区列表
            regulatory_communities: 监管机构社区列表
            violation_communities: 违规行为社区列表
            cross_community_edges: 跨社区边列表，格式:
                [
                    {
                        'source_comm_id': int,
                        'target_comm_id': int,
                        'relation_type': str,
                        'weight': float,
                        'source_perspective': str,
                        'target_perspective': str
                    },
                    ...
                ]
        
        Returns:
            hierarchical_structure: {community_id: HierarchyNode}
        """
        
        # 构建社区索引
        all_communities = {}
        for comm in responsibility_communities + regulatory_communities + violation_communities:
            all_communities[comm.id] = comm
        
        # 构建社区间连接图
        community_graph = self._build_community_graph(cross_community_edges)
        
        # 初始化层级结构
        hierarchical_structure = {}
        
        print("构建多视角层级社区...")
        
        # ==================== 规则1: 责任方 → 违规行为 ====================
        print("  [1/3] 构建 责任方 → 违规行为 层级...")
        for r_comm in responsibility_communities:
            children = []
            
            for v_comm in violation_communities:
                # 检查是否有强连接
                connections = self._get_connections(
                    r_comm.id, v_comm.id, community_graph
                )
                
                if not connections:
                    continue
                
                # 检查关系类型是否符合层级规则
                has_parent_child_relation = False
                relation_path = []
                
                for conn in connections:
                    rule_key = (
                        conn['relation_type'],
                        conn['source_perspective'],
                        conn['target_perspective']
                    )
                    
                    if rule_key in self.hierarchy_rules:
                        score, direction = self.hierarchy_rules[rule_key]
                        if direction == 'parent_to_child' and score > 0.8:
                            has_parent_child_relation = True
                            relation_path.append((
                                conn['source_comm_id'],
                                conn['relation_type'],
                                conn['target_comm_id']
                            ))
                
                if has_parent_child_relation:
                    # 创建子节点
                    child_node = HierarchyNode(
                        community=v_comm,
                        parent=None,  # 稍后设置
                        children=[],
                        level=1,
                        relation_path=relation_path
                    )
                    children.append(child_node)
                    hierarchical_structure[v_comm.id] = child_node
            
            # 创建父节点
            if children:
                parent_node = HierarchyNode(
                    community=r_comm,
                    parent=None,
                    children=children,
                    level=0,
                    relation_path=[]
                )
                hierarchical_structure[r_comm.id] = parent_node
                
                # 设置子节点的父引用
                for child in children:
                    child.parent = parent_node
        
        # ==================== 规则2: 违规行为 → 监管机构 ====================
        print("  [2/3] 构建 违规行为 → 监管机构 层级...")
        for v_comm_id, v_node in list(hierarchical_structure.items()):
            if v_node.community.perspective != 'violation':
                continue
            
            regulatory_children = []
            
            for g_comm in regulatory_communities:
                connections = self._get_connections(
                    v_comm_id, g_comm.id, community_graph
                )
                
                if not connections:
                    # 反向检查（监管机构 → 违规行为）
                    connections = self._get_connections(
                        g_comm.id, v_comm_id, community_graph
                    )
                
                if not connections:
                    continue
                
                # 检查是否有"处理"、"处以"类关系
                has_regulatory_relation = False
                relation_path = []
                
                for conn in connections:
                    if conn['relation_type'] in ['处理', '处以', '监管', '受到']:
                        has_regulatory_relation = True
                        relation_path.append((
                            conn['source_comm_id'],
                            conn['relation_type'],
                            conn['target_comm_id']
                        ))
                
                if has_regulatory_relation:
                    # 创建监管机构节点（作为第三层）
                    regulatory_node = HierarchyNode(
                        community=g_comm,
                        parent=v_node,
                        children=[],
                        level=2,
                        relation_path=relation_path
                    )
                    regulatory_children.append(regulatory_node)
                    hierarchical_structure[g_comm.id] = regulatory_node
            
            # 添加子节点
            v_node.children.extend(regulatory_children)
        
        # ==================== 规则3: 责任方 → 监管机构（直接路径）====================
        print("  [3/3] 构建 责任方 → 监管机构 直接路径...")
        for r_comm_id, r_node in list(hierarchical_structure.items()):
            if r_node.community.perspective != 'responsibility':
                continue
            
            direct_regulatory = []
            
            for g_comm in regulatory_communities:
                connections = self._get_connections(
                    r_comm_id, g_comm.id, community_graph
                )
                
                if not connections:
                    # 反向检查
                    connections = self._get_connections(
                        g_comm.id, r_comm_id, community_graph
                    )
                
                if not connections:
                    continue
                
                # 检查是否有直接监管关系
                has_direct_supervision = False
                relation_path = []
                
                for conn in connections:
                    rule_key = (
                        conn['relation_type'],
                        conn['source_perspective'],
                        conn['target_perspective']
                    )
                    
                    if rule_key in self.hierarchy_rules:
                        score, direction = self.hierarchy_rules[rule_key]
                        if direction == 'direct_supervision' and score > 0.7:
                            has_direct_supervision = True
                            relation_path.append((
                                conn['source_comm_id'],
                                conn['relation_type'],
                                conn['target_comm_id']
                            ))
                
                if has_direct_supervision:
                    # 创建监管机构节点（作为第二层）
                    regulatory_node = HierarchyNode(
                        community=g_comm,
                        parent=r_node,
                        children=[],
                        level=1,
                        relation_path=relation_path
                    )
                    direct_regulatory.append(regulatory_node)
                    
                    # 如果该监管机构还没被添加，则添加
                    if g_comm.id not in hierarchical_structure:
                        hierarchical_structure[g_comm.id] = regulatory_node
            
            # 将直接监管社区添加到children（与违规行为社区并列）
            r_node.children.extend(direct_regulatory)
        
        print(f"  ✓ 完成层级构建，共 {len(hierarchical_structure)} 个社区节点")
        
        return hierarchical_structure
    
    def _build_community_graph(self, cross_community_edges: List[Dict]) -> Dict:
        """构建社区间连接图"""
        graph = defaultdict(list)
        
        for edge in cross_community_edges:
            source = edge['source_comm_id']
            target = edge['target_comm_id']
            
            graph[source].append(edge)
            # 同时添加反向边（用于双向查找）
            graph[target].append({
                **edge,
                'source_comm_id': target,
                'target_comm_id': source,
                'reverse': True
            })
        
        return graph
    
    def _get_connections(
        self, 
        source_comm_id: int, 
        target_comm_id: int, 
        community_graph: Dict
    ) -> List[Dict]:
        """获取两个社区之间的连接"""
        connections = []
        
        for edge in community_graph.get(source_comm_id, []):
            if edge['target_comm_id'] == target_comm_id:
                connections.append(edge)
        
        return connections


# ==================== 核心算法2: 跨视角路径搜索 ====================

class CrossPerspectivePathFinder:
    """跨视角链路推理器"""
    
    def __init__(self, hierarchical_structure: Dict[int, HierarchyNode]):
        self.hierarchical_structure = hierarchical_structure
    
    def find_penetration_paths(
        self,
        source_communities: List[Community],
        query_type: str,  # 'compliance' or 'risk'
        max_hops: int = 3,
        beam_width: int = 5
    ) -> List[Dict]:
        """
        查找穿透链路路径
        
        使用Beam Search策略
        """
        
        # 定义路径模板
        if query_type == 'compliance':
            # 合规性查询: 责任方 → 监管机构
            path_template = ['responsibility', 'regulatory']
            target_perspective = 'regulatory'
        else:
            # 风险预警: 责任方 → 违规行为 → 监管机构
            path_template = ['responsibility', 'violation', 'regulatory']
            target_perspective = 'regulatory'
        
        # 初始化beam
        beam = []
        for source_comm in source_communities:
            if source_comm.id in self.hierarchical_structure:
                node = self.hierarchical_structure[source_comm.id]
                beam.append({
                    'path': [node],
                    'score': 1.0,
                    'perspectives': [source_comm.perspective]
                })
        
        if not beam:
            print("  ⚠ 未找到任何起始社区")
            return []
        
        final_paths = []
        
        # Beam Search
        for hop in range(max_hops):
            print(f"    Hop {hop + 1}: {len(beam)} 个候选路径")
            
            new_beam = []
            
            for candidate in beam:
                current_node = candidate['path'][-1]
                current_perspectives = candidate['perspectives']
                
                # 检查是否到达目标
                if current_node.community.perspective == target_perspective:
                    # 检查是否匹配路径模板
                    if self._matches_template(current_perspectives, path_template):
                        final_paths.append(candidate)
                    continue
                
                # 扩展候选（访问子节点）
                for child_node in current_node.children:
                    new_perspectives = current_perspectives + [child_node.community.perspective]
                    
                    # 检查是否符合路径模板
                    if self._is_valid_extension(new_perspectives, path_template):
                        new_score = self._calculate_path_score(
                            candidate['path'] + [child_node]
                        )
                        
                        new_beam.append({
                            'path': candidate['path'] + [child_node],
                            'score': new_score,
                            'perspectives': new_perspectives
                        })
            
            # 保留top beam_width个候选
            if new_beam:
                beam = sorted(new_beam, key=lambda x: x['score'], reverse=True)[:beam_width]
            else:
                # 没有可扩展的候选，终止搜索
                break
        
        # 合并最终路径
        all_paths = final_paths + [c for c in beam if c['perspectives'][-1] == target_perspective]
        
        # 排序并返回
        ranked_paths = sorted(all_paths, key=lambda x: x['score'], reverse=True)
        
        print(f"  ✓ 找到 {len(ranked_paths)} 条有效路径")
        
        return ranked_paths
    
    def _matches_template(self, perspectives: List[str], template: List[str]) -> bool:
        """检查路径是否匹配模板"""
        if len(perspectives) != len(template):
            return False
        
        for i, expected in enumerate(template):
            if perspectives[i] != expected:
                return False
        
        return True
    
    def _is_valid_extension(self, perspectives: List[str], template: List[str]) -> bool:
        """检查路径扩展是否有效"""
        # 长度不能超过模板
        if len(perspectives) > len(template):
            return False
        
        # 检查前缀是否匹配
        for i, p in enumerate(perspectives):
            if p != template[i]:
                return False
        
        return True
    
    def _calculate_path_score(self, path: List[HierarchyNode]) -> float:
        """
        计算路径分数
        
        考虑因素：
        1. 路径长度（越短越好）
        2. 社区质量（report_rating越高越好）
        3. 关系权重
        """
        
        score = 1.0
        
        # 长度惩罚
        length_penalty = 0.9 ** (len(path) - 1)
        score *= length_penalty
        
        # 社区质量加成
        avg_rating = np.mean([node.community.report_rating for node in path])
        rating_bonus = avg_rating / 10.0
        score *= (1 + rating_bonus)
        
        # 路径完整性加成（有明确的relation_path）
        has_complete_relations = all(
            len(node.relation_path) > 0 for node in path[1:]
        )
        if has_complete_relations:
            score *= 1.2
        
        return score


# ==================== 核心算法3: 事件实体抽取 ====================

class EventEntityExtractor:
    """事件实体抽取器"""
    
    def __init__(self):
        self.patterns = self._init_patterns()
    
    def _init_patterns(self) -> Dict:
        """初始化领域特定的实体抽取模式"""
        return {
            '责任方': [
                r'(上市公司|证券公司|基金公司|投资公司|期货公司)',
                r'(大股东|控股股东|实际控制人|一致行动人)',
                r'(董事|监事|高级管理人员|董事长|总经理)',
                r'(内幕信息知情人|信息披露义务人)',
                r'(发行人|上市公司|交易对手)',
            ],
            '违规行为': [
                r'(内幕交易|操纵市场|虚假陈述|欺诈发行)',
                r'(利益输送|关联交易|资金占用)',
                r'(未.*?披露|延迟披露|虚假披露|误导性陈述)',
                r'(滥用.*?优势|不正当竞争|商业贿赂)',
                r'(内幕消息|未公开信息|敏感信息)',
            ],
            '监管机构': [
                r'(证监会|证券监督管理委员会)',
                r'(交易所|上海证券交易所|深圳证券交易所)',
                r'(市场监督管理局|市场监管部门)',
                r'(人民政府|政府部门|监管部门)',
            ],
            '处罚措施': [
                r'(罚款|没收|责令.*?改正)',
                r'(警告|通报批评|公开谴责)',
                r'(市场禁入|限制.*?活动)',
                r'(行政处罚|刑事责任)',
            ]
        }
    
    def extract_entities(self, event_text: str) -> Dict[str, List[str]]:
        """
        从事件文本中抽取实体
        
        Returns:
            {
                'actors': [...],      # 责任方
                'actions': [...],     # 违规行为
                'regulators': [...],  # 监管机构
                'punishments': [...]  # 处罚措施
            }
        """
        
        entities = defaultdict(set)
        
        # 基于正则模式的提取
        for entity_type, patterns in self.patterns.items():
            for pattern in patterns:
                matches = re.findall(pattern, event_text)
                if matches:
                    for match in matches:
                        if isinstance(match, tuple):
                            entities[entity_type].update([m for m in match if m])
                        else:
                            entities[entity_type].add(match)
        
        # 转换为列表
        result = {
            'actors': list(entities.get('责任方', [])),
            'actions': list(entities.get('违规行为', [])),
            'regulators': list(entities.get('监管机构', [])),
            'punishments': list(entities.get('处罚措施', []))
        }
        
        return result


# ==================== 使用示例 ====================

def example_usage():
    """使用示例"""
    
    print("="*60)
    print("多视角社区层级融合GraphRAG系统 - 核心算法示例")
    print("="*60)
    
    # ==================== 示例数据 ====================
    
    # 创建示例社区
    responsibility_communities = [
        Community(
            id=1,
            perspective='responsibility',
            entity_ids={'E001', 'E002', 'E003'},
            entity_types={'AdvantageHolder': 2, 'Actor': 1},
            internal_edges=5,
            total_weight=4.5,
            report_rating=8.5,
            report_summary='大型企业滥用优势地位相关社区',
            report_keywords=['大型企业', '优势地位', '资金优势']
        ),
        Community(
            id=2,
            perspective='responsibility',
            entity_ids={'E010', 'E011'},
            entity_types={'PartyWithResponsibility': 2},
            internal_edges=3,
            total_weight=2.8,
            report_rating=7.2,
            report_summary='上市公司信息披露责任方社区',
            report_keywords=['上市公司', '信息披露', '责任方']
        ),
    ]
    
    violation_communities = [
        Community(
            id=3,
            perspective='violation',
            entity_ids={'E020', 'E021', 'E022'},
            entity_types={'Action': 2, 'Means': 1},
            internal_edges=8,
            total_weight=7.2,
            report_rating=9.1,
            report_summary='滥用市场优势地位违规行为社区',
            report_keywords=['滥用优势', '不正当竞争', '利益输送']
        ),
        Community(
            id=4,
            perspective='violation',
            entity_ids={'E030', 'E031'},
            entity_types={'Action': 2},
            internal_edges=4,
            total_weight=3.5,
            report_rating=8.0,
            report_summary='虚假陈述与信息披露违规社区',
            report_keywords=['虚假陈述', '信息披露', '误导性陈述']
        ),
    ]
    
    regulatory_communities = [
        Community(
            id=5,
            perspective='regulatory',
            entity_ids={'E040', 'E041'},
            entity_types={'RegulatoryAuthority': 2},
            internal_edges=6,
            total_weight=5.0,
            report_rating=8.8,
            report_summary='市场监督管理部门处罚社区',
            report_keywords=['市场监督', '行政处罚', '责令改正']
        ),
    ]
    
    # 创建跨社区边
    cross_community_edges = [
        {
            'source_comm_id': 1,
            'target_comm_id': 3,
            'relation_type': '执行',
            'weight': 0.95,
            'source_perspective': 'responsibility',
            'target_perspective': 'violation'
        },
        {
            'source_comm_id': 3,
            'target_comm_id': 5,
            'relation_type': '处理',
            'weight': 0.92,
            'source_perspective': 'regulatory',
            'target_perspective': 'violation'
        },
        {
            'source_comm_id': 1,
            'target_comm_id': 5,
            'relation_type': '监管',
            'weight': 0.88,
            'source_perspective': 'regulatory',
            'target_perspective': 'responsibility'
        },
    ]
    
    # ==================== 执行算法 ====================
    
    # 1. 构建层级结构
    print("\n[1/3] 构建多视角层级社区结构")
    builder = HierarchicalCommunityBuilder()
    hierarchical_structure = builder.build_hierarchical_structure(
        responsibility_communities,
        regulatory_communities,
        violation_communities,
        cross_community_edges
    )
    
    # 打印层级结构
    print("\n层级结构:")
    for comm_id, node in hierarchical_structure.items():
        print(f"  社区 {comm_id} ({node.community.perspective}):")
        print(f"    Level: {node.level}")
        print(f"    Parent: {node.parent.community.id if node.parent else None}")
        print(f"    Children: {[c.community.id for c in node.children]}")
        print()
    
    # 2. 实体抽取
    print("\n[2/3] 事件实体抽取")
    event_text = "某上市公司大股东利用关联交易向关联方输送利益，可能违反证监会相关规定"
    
    extractor = EventEntityExtractor()
    entities = extractor.extract_entities(event_text)
    
    print(f"事件: {event_text}")
    print(f"提取的实体:")
    for entity_type, entity_list in entities.items():
        if entity_list:
            print(f"  {entity_type}: {entity_list}")
    
    # 3. 路径搜索
    print("\n[3/3] 跨视角路径搜索")
    path_finder = CrossPerspectivePathFinder(hierarchical_structure)
    
    # 假设找到了起始社区
    source_communities = [responsibility_communities[0]]
    
    paths = path_finder.find_penetration_paths(
        source_communities,
        query_type='risk',
        max_hops=3,
        beam_width=5
    )
    
    print(f"\n找到的路径:")
    for i, path_obj in enumerate(paths[:3], 1):
        print(f"\n  路径 {i} (得分: {path_obj['score']:.3f}):")
        for node in path_obj['path']:
            print(f"    → 社区 {node.community.id} ({node.community.perspective})")
            print(f"      {node.community.report_summary[:40]}...")
    
    print("\n" + "="*60)
    print("示例完成!")
    print("="*60)


if __name__ == '__main__':
    example_usage()
