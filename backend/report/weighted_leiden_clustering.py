#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
资本市场政策法规知识图谱 - 带权有向图Leiden社区聚类分析
================================================================
功能：
1. 支持三种不同视角的社区划分：责任方社区、监管机构社区、违规行为社区
2. 基于关系类型和节点类型的权重设计
3. 保留有向图信息同时进行社区检测
4. 输出可视化数据
"""

import json
import pandas as pd
import networkx as nx
import igraph as ig
import leidenalg
from collections import defaultdict, Counter
import warnings
import os
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')
plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans', 'Arial Unicode MS']
plt.rcParams['axes.unicode_minus'] = False
import numpy as np
from enum import Enum
from dataclasses import dataclass
from typing import Dict, List, Set, Tuple, Optional

warnings.filterwarnings('ignore')


class CommunityPerspective(Enum):
    """社区划分视角"""
    RESPONSIBILITY = "responsibility"  # 责任方社区
    REGULATORY = "regulatory"          # 监管机构社区
    VIOLATION = "violation"            # 违规行为社区


@dataclass
class WeightConfig:
    """权重配置"""
    name: str
    core_types: Set[str]          # 核心节点类型
    high_weight_relations: Dict[str, float]   # 高权重关系
    medium_weight_relations: Dict[str, float] # 中等权重关系
    low_weight_relations: Dict[str, float]    # 低权重关系
    default_weight: float = 0.1   # 默认权重


def get_weight_configs() -> Dict[CommunityPerspective, WeightConfig]:
    """
    获取三种社区视角的权重配置
    
    权重设计原则：
    - 高权重 (0.8-1.0)：与核心实体直接强相关的关系
    - 中权重 (0.4-0.7)：与核心实体间接相关的关系
    - 低权重 (0.1-0.3)：结构性关系或弱相关关系
    """
    
    # 责任方社区配置
    responsibility_config = WeightConfig(
        name="责任方社区",
        core_types={'PartyWithResponsibility', 'AdvantageHolder', 'Actor'},
        high_weight_relations={
            '监管': 1.0,           # 监管机构监管责任方
            '执行': 0.9,           # 责任方执行行为
            '做出': 0.9,           # 主体做出行为/手段
            '履行': 0.9,           # 责任方履行责任
            '包含责任方': 0.85,    # 条款包含责任方
            '包含主体': 0.85,      # 条款包含主体
            '包含违规主体': 0.85,  # 条款包含违规主体
        },
        medium_weight_relations={
            '针对': 0.7,           # 责任方针对事件
            '产生': 0.7,           # 责任方产生违规
            '侵害': 0.6,           # 优势方侵害劣势方
            '受到处罚': 0.6,       # 主体受到处罚
            '控制': 0.5,           # 主体控制账户
            '具有': 0.5,           # 主体具有优势
            '实施': 0.6,           # 主体实施行为
        },
        low_weight_relations={
            '包含': 0.2,           # 结构性包含关系
            '依据': 0.3,           # 依据法律
            '规定': 0.3,           # 法律规定
        },
        default_weight=0.15
    )
    
    # 监管机构社区配置
    regulatory_config = WeightConfig(
        name="监管机构社区",
        core_types={'RegulatoryAuthority'},
        high_weight_relations={
            '监管': 1.0,           # 监管机构监管主体
            '处理': 0.95,          # 监管机构处理行为
            '处以': 0.95,          # 监管机构处以处罚
            '依照': 0.9,           # 监管机构依照法律
            '包含监管机构': 0.9,   # 条款包含监管机构
        },
        medium_weight_relations={
            '依据': 0.6,           # 依据法律
            '规定': 0.6,           # 法律规定
            '受到': 0.5,           # 行为受到处罚
            '包含责任方': 0.5,     # 条款包含责任方
        },
        low_weight_relations={
            '包含': 0.25,          # 结构性包含
            '执行': 0.3,           # 责任方执行行为
            '做出': 0.3,           # 主体做出行为
        },
        default_weight=0.2
    )
    
    # 违规行为社区配置
    violation_config = WeightConfig(
        name="违规行为社区",
        core_types={'Action', 'Means'},
        high_weight_relations={
            '执行': 1.0,           # 责任方执行行为
            '做出': 1.0,           # 主体做出行为/手段
            '实施': 0.95,          # 主体实施行为
            '规定行为': 0.9,       # 条款规定行为
            '处理': 0.9,           # 监管机构处理行为
            '旨在导致': 0.85,      # 手段导致影响
            '需借助': 0.85,        # 手段需借助优势
        },
        medium_weight_relations={
            '受到': 0.7,           # 行为受到处罚
            '受限于': 0.65,        # 行为受限于限制
            '应当': 0.6,           # 事件应当行为
            '规定': 0.6,           # 法律规定行为
        },
        low_weight_relations={
            '包含': 0.2,           # 结构性包含
            '监管': 0.3,           # 监管关系
            '履行': 0.25,          # 履行责任
        },
        default_weight=0.15
    )
    
    return {
        CommunityPerspective.RESPONSIBILITY: responsibility_config,
        CommunityPerspective.REGULATORY: regulatory_config,
        CommunityPerspective.VIOLATION: violation_config
    }


def load_graph_data(filepath: str) -> Tuple[List[dict], List[dict]]:
    """加载知识图谱数据"""
    nodes = []
    relationships = []
    
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                if data.get('type') == 'node':
                    nodes.append(data)
                elif data.get('type') == 'relationship':
                    relationships.append(data)
            except json.JSONDecodeError:
                continue
    
    print(f"✓ 加载完成: {len(nodes)} 个节点, {len(relationships)} 条关系")
    return nodes, relationships


def calculate_edge_weight(rel: dict, config: WeightConfig, node_data: dict) -> float:
    """
    根据配置计算边的权重
    
    考虑因素：
    1. 关系类型的基础权重
    2. 起始/终止节点是否为核心类型（额外加成）
    """
    rel_type = rel['label']
    start_type = rel['start']['labels'][0] if rel['start']['labels'] else ''
    end_type = rel['end']['labels'][0] if rel['end']['labels'] else ''
    
    # 获取基础权重
    if rel_type in config.high_weight_relations:
        base_weight = config.high_weight_relations[rel_type]
    elif rel_type in config.medium_weight_relations:
        base_weight = config.medium_weight_relations[rel_type]
    elif rel_type in config.low_weight_relations:
        base_weight = config.low_weight_relations[rel_type]
    else:
        base_weight = config.default_weight
    
    # 核心类型加成
    core_bonus = 0.0
    if start_type in config.core_types:
        core_bonus += 0.1
    if end_type in config.core_types:
        core_bonus += 0.1
    
    # 确保权重在合理范围内
    final_weight = min(base_weight + core_bonus, 1.0)
    return max(final_weight, 0.05)


def build_weighted_graphs(
    nodes: List[dict], 
    relationships: List[dict],
    weight_config: WeightConfig
) -> Tuple[nx.DiGraph, nx.Graph, ig.Graph, dict, List[dict], dict, dict]:
    """
    构建带权有向图和无向图
    
    Returns:
        G_directed: 有向图 (NetworkX DiGraph)
        G_undirected: 无向图 (NetworkX Graph)
        G_ig: igraph无向图（用于Leiden算法）
        node_data: 节点数据字典
        valid_relationships: 有效关系列表
        id_to_idx: 节点ID到索引映射
        idx_to_id: 索引到节点ID映射
    """
    G_directed = nx.DiGraph()
    G_undirected = nx.Graph()
    
    # 构建节点数据
    node_data = {}
    node_ids = set()
    id_list = []
    
    for node in nodes:
        node_id = node['id']
        node_ids.add(node_id)
        id_list.append(node_id)
        node_data[node_id] = {
            'id': node_id,
            'labels': node['labels'],
            'node_type': node['labels'][0] if node['labels'] else '',
            'name': node['properties'].get('name', ''),
            'properties': node['properties'],
            'is_core': node['labels'][0] in weight_config.core_types if node['labels'] else False
        }
        G_directed.add_node(node_id, **node_data[node_id])
        G_undirected.add_node(node_id, **node_data[node_id])
    
    # 创建ID映射
    id_to_idx = {node_id: idx for idx, node_id in enumerate(id_list)}
    idx_to_id = {idx: node_id for node_id, idx in id_to_idx.items()}
    
    # 添加带权边
    valid_relationships = []
    edge_weights_directed = {}  # (start, end) -> (weight, rel_type)
    edge_weights_undirected = defaultdict(lambda: {'weight': 0, 'rel_types': set()})
    
    for rel in relationships:
        start_id = rel['start']['id']
        end_id = rel['end']['id']
        
        if start_id in node_ids and end_id in node_ids:
            weight = calculate_edge_weight(rel, weight_config, node_data)
            
            # 有向图边
            edge_key_directed = (start_id, end_id)
            if edge_key_directed not in edge_weights_directed:
                edge_weights_directed[edge_key_directed] = {'weight': weight, 'rel_types': [rel['label']]}
            else:
                # 多条同向边，累加权重
                edge_weights_directed[edge_key_directed]['weight'] += weight
                edge_weights_directed[edge_key_directed]['rel_types'].append(rel['label'])
            
            # 无向图边 (合并双向边)
            edge_key_undirected = tuple(sorted([start_id, end_id]))
            edge_weights_undirected[edge_key_undirected]['weight'] += weight
            edge_weights_undirected[edge_key_undirected]['rel_types'].add(rel['label'])
            
            valid_relationships.append({**rel, 'calculated_weight': weight})
    
    # 添加边到有向图
    for (start_id, end_id), data in edge_weights_directed.items():
        G_directed.add_edge(
            start_id, end_id, 
            weight=data['weight'],
            rel_types=data['rel_types']
        )
    
    # 添加边到无向图
    for (node1, node2), data in edge_weights_undirected.items():
        G_undirected.add_edge(
            node1, node2,
            weight=data['weight'],
            rel_types=list(data['rel_types'])
        )
    
    # 构建igraph图（用于Leiden算法）
    G_ig = ig.Graph(n=len(id_list), directed=False)
    G_ig.vs['name'] = id_list
    G_ig.vs['node_type'] = [node_data[nid]['node_type'] for nid in id_list]
    G_ig.vs['label'] = [node_data[nid]['name'][:20] for nid in id_list]
    G_ig.vs['is_core'] = [node_data[nid]['is_core'] for nid in id_list]
    
    # 添加边和权重到igraph
    edges = []
    weights = []
    for (node1, node2), data in edge_weights_undirected.items():
        edges.append((id_to_idx[node1], id_to_idx[node2]))
        weights.append(data['weight'])
    
    G_ig.add_edges(edges)
    G_ig.es['weight'] = weights
    
    print(f"✓ 带权图构建完成:")
    print(f"  - 有向图: {G_directed.number_of_nodes()} 节点, {G_directed.number_of_edges()} 边")
    print(f"  - 无向图: {G_undirected.number_of_nodes()} 节点, {G_undirected.number_of_edges()} 边")
    print(f"  - 核心节点数: {sum(1 for n in node_data.values() if n['is_core'])}")
    
    return G_directed, G_undirected, G_ig, node_data, valid_relationships, id_to_idx, idx_to_id


def run_weighted_leiden(
    G_ig: ig.Graph,
    G_undirected: nx.Graph,
    idx_to_id: dict,
    resolution: float = 1.0,
    seed: int = 42
) -> Tuple[List[Set[str]], Dict[str, int], float]:
    """执行带权Leiden社区聚类"""
    print(f"\n正在执行带权Leiden社区聚类 (resolution={resolution})...")
    
    partition = leidenalg.find_partition(
        G_ig,
        leidenalg.RBConfigurationVertexPartition,
        weights=G_ig.es['weight'],
        resolution_parameter=resolution,
        seed=seed
    )
    
    communities = []
    node_to_community = {}
    
    for community_id, community_indices in enumerate(partition):
        community_nodes = set()
        for idx in community_indices:
            node_id = idx_to_id[idx]
            community_nodes.add(node_id)
            node_to_community[node_id] = community_id
        communities.append(community_nodes)
    
    modularity = nx.community.modularity(G_undirected, communities, weight='weight')
    leiden_modularity = partition.modularity
    
    print(f"✓ Leiden聚类完成!")
    print(f"  - 社区数量: {len(communities)}")
    print(f"  - 模块度 (NetworkX, 带权): {modularity:.4f}")
    print(f"  - 模块度 (Leiden内置): {leiden_modularity:.4f}")
    
    return communities, node_to_community, modularity


def create_node_dataframe(
    G_directed: nx.DiGraph,
    G_undirected: nx.Graph,
    node_data: dict,
    node_to_community: dict,
    weight_config: WeightConfig
) -> pd.DataFrame:
    """创建节点数据DataFrame（包含有向图指标）"""
    node_records = []
    
    for node_id, data in node_data.items():
        # 无向图指标
        degree = G_undirected.degree(node_id)
        weighted_degree = G_undirected.degree(node_id, weight='weight')
        clustering_coef = nx.clustering(G_undirected, node_id, weight='weight')
        
        # 有向图指标
        in_degree = G_directed.in_degree(node_id)
        out_degree = G_directed.out_degree(node_id)
        in_weight = G_directed.in_degree(node_id, weight='weight')
        out_weight = G_directed.out_degree(node_id, weight='weight')
        
        # 邻居信息
        neighbors = list(G_undirected.neighbors(node_id))
        neighbor_communities = [node_to_community.get(n, -1) for n in neighbors]
        community_dist = Counter(neighbor_communities)
        
        node_info = {
            '节点ID': node_id,
            '节点名称': data['name'],
            '节点类型': data['node_type'],
            '是否核心类型': '是' if data['is_core'] else '否',
            '所有标签': '|'.join(data['labels']) if data['labels'] else '',
            '所属社区': node_to_community.get(node_id, -1),
            '度数': degree,
            '加权度数': round(weighted_degree, 4),
            '入度': in_degree,
            '出度': out_degree,
            '加权入度': round(in_weight, 4),
            '加权出度': round(out_weight, 4),
            '聚类系数': round(clustering_coef, 4),
            '邻居节点数': len(neighbors),
            '邻居社区分布': '; '.join([f"社区{k}:{v}" for k, v in sorted(community_dist.items())])
        }
        node_records.append(node_info)
    
    return pd.DataFrame(node_records)


def create_relationship_dataframe(
    relationships: List[dict],
    node_to_community: dict,
    node_data: dict
) -> pd.DataFrame:
    """创建关系数据DataFrame（包含权重）"""
    rel_records = []
    
    for rel in relationships:
        start_id = rel['start']['id']
        end_id = rel['end']['id']
        
        start_community = node_to_community.get(start_id, -1)
        end_community = node_to_community.get(end_id, -1)
        is_cross_community = start_community != end_community
        
        rel_info = {
            '关系ID': rel['id'],
            '关系类型': rel['label'],
            '计算权重': round(rel.get('calculated_weight', 0), 4),
            '起始节点ID': start_id,
            '起始节点名称': node_data.get(start_id, {}).get('name', ''),
            '起始节点类型': rel['start']['labels'][0] if rel['start']['labels'] else '',
            '起始节点社区': start_community,
            '终止节点ID': end_id,
            '终止节点名称': node_data.get(end_id, {}).get('name', ''),
            '终止节点类型': rel['end']['labels'][0] if rel['end']['labels'] else '',
            '终止节点社区': end_community,
            '是否跨社区': '是' if is_cross_community else '否'
        }
        rel_records.append(rel_info)
    
    return pd.DataFrame(rel_records)


def create_community_summary(
    df_nodes: pd.DataFrame,
    df_relationships: pd.DataFrame,
    communities: List[Set[str]],
    G_undirected: nx.Graph,
    modularity: float,
    weight_config: WeightConfig
) -> pd.DataFrame:
    """创建社区统计摘要"""
    summary_records = []
    
    for idx, community in enumerate(communities):
        community_nodes = df_nodes[df_nodes['节点ID'].isin(community)]
        
        # 计算内部关系
        internal_rels = df_relationships[
            (df_relationships['起始节点ID'].isin(community)) &
            (df_relationships['终止节点ID'].isin(community))
        ]
        
        # 核心节点统计
        core_nodes = community_nodes[community_nodes['是否核心类型'] == '是']
        
        # 子图密度
        subgraph = G_undirected.subgraph(community)
        density = nx.density(subgraph) if len(community) > 1 else 0
        
        # 类型分布
        type_dist = community_nodes['节点类型'].value_counts()
        top_types = ' | '.join([f"{t}:{c}" for t, c in type_dist.head(5).items()])
        
        # 总权重
        total_weight = internal_rels['计算权重'].sum() if len(internal_rels) > 0 else 0
        
        summary = {
            '社区ID': idx,
            '节点数量': len(community),
            '核心节点数': len(core_nodes),
            '内部关系数': len(internal_rels),
            '总权重': round(total_weight, 2),
            '平均权重': round(internal_rels['计算权重'].mean(), 4) if len(internal_rels) > 0 else 0,
            '子图密度': round(density, 4),
            '平均度数': round(community_nodes['度数'].mean(), 2),
            '平均加权度数': round(community_nodes['加权度数'].mean(), 4),
            '节点类型分布': top_types
        }
        summary_records.append(summary)
    
    df_summary = pd.DataFrame(summary_records)
    df_summary = df_summary.sort_values('节点数量', ascending=False).reset_index(drop=True)
    
    # 添加全局统计
    global_stats = {
        '社区ID': '全局统计',
        '节点数量': len(df_nodes),
        '核心节点数': len(df_nodes[df_nodes['是否核心类型'] == '是']),
        '内部关系数': len(df_relationships),
        '总权重': round(df_relationships['计算权重'].sum(), 2),
        '平均权重': round(df_relationships['计算权重'].mean(), 4),
        '子图密度': round(nx.density(G_undirected), 4),
        '平均度数': round(df_nodes['度数'].mean(), 2),
        '平均加权度数': round(df_nodes['加权度数'].mean(), 4),
        '节点类型分布': f"模块度: {modularity:.4f}"
    }
    
    df_summary = pd.concat([df_summary, pd.DataFrame([global_stats])], ignore_index=True)
    return df_summary


def create_cross_community_analysis(df_relationships: pd.DataFrame) -> pd.DataFrame:
    """创建跨社区关系分析"""
    cross_rels = df_relationships[df_relationships['是否跨社区'] == '是'].copy()
    
    if len(cross_rels) == 0:
        return pd.DataFrame()
    
    def get_community_pair(row):
        c1, c2 = row['起始节点社区'], row['终止节点社区']
        return f"{min(c1, c2)}<->{max(c1, c2)}"
    
    cross_rels['社区对'] = cross_rels.apply(get_community_pair, axis=1)
    
    cross_summary = cross_rels.groupby('社区对').agg({
        '关系ID': 'count',
        '计算权重': ['sum', 'mean'],
        '关系类型': lambda x: ' | '.join(sorted(set(x))),
    }).reset_index()
    
    cross_summary.columns = ['社区对', '连接数量', '总权重', '平均权重', '关系类型']
    cross_summary = cross_summary.sort_values('连接数量', ascending=False).reset_index(drop=True)
    
    return cross_summary


def generate_visualization_data(
    df_nodes: pd.DataFrame,
    df_relationships: pd.DataFrame,
    df_summary: pd.DataFrame,
    communities: List[Set[str]],
    G_undirected: nx.Graph,
    weight_config: WeightConfig,
    modularity: float
) -> dict:
    """生成用于可视化的JSON数据"""
    # 为每个社区分配颜色
    num_communities = len(communities)
    colors = plt.cm.tab20(np.linspace(0, 1, max(20, num_communities)))
    community_colors = {}
    for i in range(num_communities):
        r, g, b, _ = colors[i % len(colors)]
        community_colors[i] = f"rgb({int(r*255)},{int(g*255)},{int(b*255)})"
    
    # 准备节点数据
    vis_nodes = []
    for _, row in df_nodes.iterrows():
        community_id = row['所属社区']
        vis_nodes.append({
            'id': row['节点ID'],
            'name': row['节点名称'][:30] if row['节点名称'] else row['节点ID'][:30],
            'type': row['节点类型'],
            'isCore': row['是否核心类型'] == '是',
            'community': int(community_id),
            'degree': int(row['度数']),
            'weightedDegree': float(row['加权度数']),
            'inDegree': int(row['入度']),
            'outDegree': int(row['出度']),
            'clustering': float(row['聚类系数']),
            'color': community_colors.get(community_id, 'rgb(128,128,128)')
        })
    
    # 准备边数据
    vis_edges = []
    seen_edges = set()
    
    for _, row in df_relationships.iterrows():
        edge_key = tuple(sorted([row['起始节点ID'], row['终止节点ID']]))
        if edge_key not in seen_edges:
            seen_edges.add(edge_key)
            vis_edges.append({
                'source': row['起始节点ID'],
                'target': row['终止节点ID'],
                'type': row['关系类型'],
                'weight': float(row['计算权重']),
                'crossCommunity': row['是否跨社区'] == '是'
            })
    
    # 准备社区统计数据
    vis_communities = []
    for _, row in df_summary.iterrows():
        if row['社区ID'] == '全局统计':
            continue
        vis_communities.append({
            'id': int(row['社区ID']),
            'nodeCount': int(row['节点数量']),
            'coreNodeCount': int(row['核心节点数']),
            'edgeCount': int(row['内部关系数']),
            'totalWeight': float(row['总权重']),
            'avgWeight': float(row['平均权重']),
            'density': float(row['子图密度']),
            'avgDegree': float(row['平均度数']),
            'avgWeightedDegree': float(row['平均加权度数']),
            'nodeTypes': row['节点类型分布'],
            'color': community_colors.get(int(row['社区ID']), 'rgb(128,128,128)')
        })
    
    return {
        'nodes': vis_nodes,
        'edges': vis_edges,
        'communities': vis_communities,
        'stats': {
            'totalNodes': len(vis_nodes),
            'totalEdges': len(vis_edges),
            'totalCommunities': len(communities),
            'modularity': round(modularity, 4),
            'perspective': weight_config.name,
            'coreTypes': list(weight_config.core_types)
        },
        'weightConfig': {
            'name': weight_config.name,
            'coreTypes': list(weight_config.core_types),
            'highWeightRelations': weight_config.high_weight_relations,
            'mediumWeightRelations': weight_config.medium_weight_relations,
            'defaultWeight': weight_config.default_weight
        }
    }


def export_results(
    df_nodes: pd.DataFrame,
    df_relationships: pd.DataFrame,
    df_summary: pd.DataFrame,
    df_cross: pd.DataFrame,
    vis_data: dict,
    output_dir: str,
    perspective: CommunityPerspective
) -> List[str]:
    """导出所有结果"""
    os.makedirs(output_dir, exist_ok=True)
    
    files_created = []
    prefix = perspective.value
    
    # CSV文件
    nodes_path = os.path.join(output_dir, f'{prefix}_1_节点聚类结果.csv')
    df_nodes.to_csv(nodes_path, index=False, encoding='utf-8-sig')
    files_created.append(nodes_path)
    
    rels_path = os.path.join(output_dir, f'{prefix}_2_关系聚类结果.csv')
    df_relationships.to_csv(rels_path, index=False, encoding='utf-8-sig')
    files_created.append(rels_path)
    
    summary_path = os.path.join(output_dir, f'{prefix}_3_社区统计摘要.csv')
    df_summary.to_csv(summary_path, index=False, encoding='utf-8-sig')
    files_created.append(summary_path)
    
    if len(df_cross) > 0:
        cross_path = os.path.join(output_dir, f'{prefix}_4_跨社区关系分析.csv')
        df_cross.to_csv(cross_path, index=False, encoding='utf-8-sig')
        files_created.append(cross_path)
    
    # 可视化数据JSON
    vis_path = os.path.join(output_dir, f'{prefix}_visualization_data.json')
    with open(vis_path, 'w', encoding='utf-8') as f:
        json.dump(vis_data, f, ensure_ascii=False, indent=2)
    files_created.append(vis_path)
    
    print(f"✓ 结果已保存至: {output_dir}")
    for f in files_created:
        print(f"  - {os.path.basename(f)}")
    
    return files_created


def run_clustering_for_perspective(
    nodes: List[dict],
    relationships: List[dict],
    perspective: CommunityPerspective,
    output_dir: str,
    resolution: float = 1.0,
    seed: int = 42
) -> Tuple[List[str], dict]:
    """为特定视角运行聚类分析"""
    
    weight_configs = get_weight_configs()
    config = weight_configs[perspective]
    
    print(f"\n{'='*70}")
    print(f"  视角: {config.name}")
    print(f"  核心类型: {', '.join(config.core_types)}")
    print(f"{'='*70}")
    
    # 构建带权图
    G_directed, G_undirected, G_ig, node_data, valid_rels, id_to_idx, idx_to_id = \
        build_weighted_graphs(nodes, relationships, config)
    
    # 执行Leiden聚类
    communities, node_to_community, modularity = run_weighted_leiden(
        G_ig, G_undirected, idx_to_id, resolution, seed
    )
    
    # 创建数据框
    df_nodes = create_node_dataframe(G_directed, G_undirected, node_data, node_to_community, config)
    df_relationships = create_relationship_dataframe(valid_rels, node_to_community, node_data)
    df_summary = create_community_summary(df_nodes, df_relationships, communities, G_undirected, modularity, config)
    df_cross = create_cross_community_analysis(df_relationships)
    
    # 生成可视化数据
    vis_data = generate_visualization_data(
        df_nodes, df_relationships, df_summary, communities, G_undirected, config, modularity
    )
    
    # 导出结果
    files = export_results(df_nodes, df_relationships, df_summary, df_cross, vis_data, output_dir, perspective)
    
    return files, vis_data


def main():
    """主函数"""
    print("="*70)
    print("     带权有向图Leiden社区聚类分析")
    print("     支持三种视角：责任方、监管机构、违规行为")
    print("="*70)
    
    # 配置
    input_file = 'data/merged_regulatory_unified.txt'
    output_dir = 'weighted_leiden_results'
    resolution = 0.8
    seed = 42
    
    # 加载数据
    print("\n[1/2] 加载知识图谱数据...")
    nodes, relationships = load_graph_data(input_file)
    
    # 为三种视角分别执行聚类
    print("\n[2/2] 执行三种视角的社区聚类...")
    
    all_results = {}
    for perspective in CommunityPerspective:
        files, vis_data = run_clustering_for_perspective(
            nodes, relationships, perspective, output_dir, resolution, seed
        )
        all_results[perspective.value] = {
            'files': files,
            'vis_data': vis_data
        }
    
    print("\n" + "="*70)
    print("                    聚类分析完成!")
    print(f"结果文件已保存至: {output_dir}")
    print("="*70)
    
    return all_results


if __name__ == '__main__':
    results = main()
