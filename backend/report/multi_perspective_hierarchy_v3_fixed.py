"""
多视角社区层级构建方案 - 修正版 v3
修正社区映射计算方案：
1. Section/Law实体重叠度（权重0.5）
2. 社区报告语义相似度（权重0.5，使用DeepSeek API）
"""

import json
import pandas as pd
import numpy as np
from collections import defaultdict, Counter
from typing import Dict, List, Set, Tuple, Optional
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import warnings
import requests
import os
warnings.filterwarnings('ignore')

# 设置中文字体
plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans', 'Arial Unicode MS', 'sans-serif']
plt.rcParams['axes.unicode_minus'] = False  # 解决负号显示问题


class MultiPerspectiveHierarchy:
    """多视角社区层级构建器 - 修正版"""
    
    def __init__(self, deepseek_api_key: Optional[str] = None):
        self.perspectives = {
            'responsibility': {'level': 0, 'data': None, 'name': '责任方'},
            'violation': {'level': 1, 'data': None, 'name': '违规行为'},
            'regulatory': {'level': 2, 'data': None, 'name': '监管机构'}
        }
        self.community_info = {}
        self.connections = []
        
        # DeepSeek API配置
        self.deepseek_api_key = "sk-0a57f72b50854ace9d134a5eb697c4dc"
        self.deepseek_api_url = "https://api.deepseek.com/v1/chat/completions"
        
    def load_data(self, responsibility_file: str, violation_file: str, regulatory_file: str):
        """加载三个视角的数据"""
        print("正在加载数据...")
        
        with open(responsibility_file, 'r', encoding='utf-8') as f:
            self.perspectives['responsibility']['data'] = json.load(f)
            
        with open(violation_file, 'r', encoding='utf-8') as f:
            self.perspectives['violation']['data'] = json.load(f)
            
        with open(regulatory_file, 'r', encoding='utf-8') as f:
            self.perspectives['regulatory']['data'] = json.load(f)
            
        print("数据加载完成！")
        
    def extract_community_info(self):
        """提取每个社区的元信息"""
        print("\n正在提取社区元信息...")
        
        for perspective_name, perspective_data in self.perspectives.items():
            data = perspective_data['data']
            nodes = data['nodes']
            edges = data.get('edges', data.get('links', []))
            
            # 按社区分组
            communities = defaultdict(list)
            for node in nodes:
                comm_id = node.get('community', -1)
                communities[comm_id].append(node)
            
            # 为每个社区生成元信息
            for comm_id, comm_nodes in communities.items():
                key = f"{perspective_name}_{comm_id}"
                
                # 统计节点类型
                type_counter = Counter([n['type'] for n in comm_nodes])
                main_types = " | ".join([f"{t}:{c}" for t, c in type_counter.most_common(3)])
                
                # 提取核心节点
                core_nodes = [n for n in comm_nodes if n.get('isCore', False)]
                
                # 提取Section/Law节点（法规条款）
                sections = [n['name'] for n in comm_nodes if n['type'] in ['Section', 'Law']]
                
                # 提取核心节点类型
                core_node_types = set([n['type'] for n in core_nodes])
                
                # 计算社区内边的数量
                comm_node_ids = set([n['id'] for n in comm_nodes])
                internal_edges = [e for e in edges 
                                 if e.get('source', e.get('from')) in comm_node_ids 
                                 and e.get('target', e.get('to')) in comm_node_ids]
                
                # 提取代表性节点名称（用于生成社区描述）
                representative_nodes = [n['name'] for n in comm_nodes[:10]]
                
                # 生成社区描述（用于语义相似度计算）
                community_description = self._generate_community_description(
                    perspective_name, comm_nodes, core_nodes, sections, type_counter
                )
                
                self.community_info[key] = {
                    'perspective': perspective_name,
                    'community_id': comm_id,
                    'node_count': len(comm_nodes),
                    'core_node_count': len(core_nodes),
                    'main_node_types': main_types,
                    'sections': set(sections),  # Section/Law实体集合
                    'core_node_types': core_node_types,
                    'all_nodes': set([n['id'] for n in comm_nodes]),
                    'core_nodes': set([n['id'] for n in core_nodes]),
                    'key_regulations': "、".join(sections[:5]) if sections else "无",
                    'internal_edge_count': len(internal_edges),
                    'representative_nodes': representative_nodes,
                    'description': community_description  # 社区描述
                }
        
        print(f"提取了 {len(self.community_info)} 个社区的元信息")
    
    def _generate_community_description(self, perspective: str, nodes: List, 
                                       core_nodes: List, sections: List, 
                                       type_counter: Counter) -> str:
        """生成社区的文本描述（用于语义相似度计算）"""
        desc_parts = []
        
        # 视角类型
        perspective_names = {
            'responsibility': '责任方',
            'violation': '违规行为',
            'regulatory': '监管机构'
        }
        desc_parts.append(f"视角：{perspective_names[perspective]}")
        
        # 主要节点类型
        top_types = type_counter.most_common(3)
        type_desc = "、".join([f"{t}({c}个)" for t, c in top_types])
        desc_parts.append(f"主要类型：{type_desc}")
        
        # 核心节点
        if core_nodes:
            core_names = "、".join([n['name'] for n in core_nodes[:5]])
            desc_parts.append(f"核心节点：{core_names}")
        
        # 相关法规
        if sections:
            section_desc = "、".join(sections[:5])
            desc_parts.append(f"相关法规：{section_desc}")
        
        return " | ".join(desc_parts)
    
    def calculate_section_overlap(self, comm1_sections: Set, comm2_sections: Set) -> float:
        """
        计算Section/Law实体重叠度（使用Containment相似度）
        
        说明：使用较小集合的包含度，更适合不对称关系
        """
        if not comm1_sections or not comm2_sections:
            return 0.0
        
        intersection = len(comm1_sections & comm2_sections)
        smaller_size = min(len(comm1_sections), len(comm2_sections))
        
        if smaller_size == 0:
            return 0.0
        
        # Containment similarity
        overlap_score = intersection / smaller_size
        
        return overlap_score
    
    def calculate_semantic_similarity_deepseek(self, desc1: str, desc2: str, 
                                               source_perspective: str,
                                               target_perspective: str) -> Tuple[float, str]:
        """
        使用DeepSeek API计算两个社区描述的语义相似度
        
        返回：(相似度分数 0-1, 评分理由)
        """
        if not self.deepseek_api_key:
            print("  ⚠️  未配置DeepSeek API Key，使用默认语义相似度0.5")
            return 0.5, "未配置API Key，使用默认值"
        
        # 构建关系提示
        relation_hints = {
            ('responsibility', 'violation'): '评估责任方社区是否可能导致违规行为社区（因果关系）',
            ('violation', 'regulatory'): '评估违规行为社区是否受到监管机构社区的监管（监管关系）',
            ('responsibility', 'regulatory'): '评估责任方社区是否直接受到监管机构社区的监管（监管关系）'
        }
        
        relation_hint = relation_hints.get((source_perspective, target_perspective), 
                                          '评估两个社区之间的语义相关性')
        
        prompt = f"""你是一个专业的法律合规知识图谱分析专家。请评估以下两个社区之间的语义相似度。

【源社区】（{source_perspective}）
{desc1}

【目标社区】（{target_perspective}）
{desc2}

【评估任务】
{relation_hint}

【评分标准】（0-10分）
- 9-10分：语义高度相关，明确的因果/监管关系，法规重叠度高
- 7-8分：语义较相关，可能存在因果/监管关系，法规有一定重叠
- 5-6分：语义中等相关，关系较弱或间接
- 3-4分：语义弱相关，关系不明确
- 0-2分：语义无关或矛盾

请返回JSON格式：
{{
    "score": <0-10的整数>,
    "reasoning": "<简短的评分理由，50字以内>"
}}
"""
        
        try:
            headers = {
                "Authorization": f"Bearer {self.deepseek_api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": "deepseek-chat",
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 200
            }
            
            response = requests.post(
                self.deepseek_api_url,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                content = result['choices'][0]['message']['content']
                
                # 解析JSON响应
                import re
                json_match = re.search(r'\{.*\}', content, re.DOTALL)
                if json_match:
                    parsed = json.loads(json_match.group())
                    score_10 = parsed.get('score', 5)
                    reasoning = parsed.get('reasoning', '无理由')
                    
                    # 转换为0-1范围
                    score_01 = score_10 / 10.0
                    
                    return score_01, reasoning
                else:
                    print(f"  ⚠️  DeepSeek响应格式错误，使用默认值")
                    return 0.5, "API响应解析失败"
            else:
                print(f"  ⚠️  DeepSeek API错误 {response.status_code}，使用默认值")
                return 0.5, f"API错误{response.status_code}"
                
        except Exception as e:
            print(f"  ⚠️  DeepSeek API调用异常：{str(e)}，使用默认值")
            return 0.5, f"API调用异常：{str(e)[:50]}"
    
    def calculate_connection_score(self, source_perspective: str, source_comm: int,
                                   target_perspective: str, target_comm: int,
                                   weights: Dict[str, float] = None,
                                   use_deepseek: bool = True) -> Tuple[float, str, Dict]:
        """
        计算连接强度分数（修正版）
        
        新方案：
        1. Section/Law实体重叠度（权重0.5）
        2. 社区报告语义相似度（权重0.5，使用DeepSeek API）
        
        返回：(总分, 证据字符串, 详细信息字典)
        """
        if weights is None:
            weights = {
                'section': 0.50,      # Section/Law实体重叠
                'semantic': 0.50      # 语义相似度
            }
        
        source_key = f"{source_perspective}_{source_comm}"
        target_key = f"{target_perspective}_{target_comm}"
        
        if source_key not in self.community_info or target_key not in self.community_info:
            return 0.0, "", {}
        
        source_info = self.community_info[source_key]
        target_info = self.community_info[target_key]
        
        # ===== 指标1: Section/Law实体重叠度 =====
        section_score = self.calculate_section_overlap(
            source_info['sections'], 
            target_info['sections']
        )
        
        # ===== 指标2: 社区报告语义相似度 =====
        if use_deepseek and self.deepseek_api_key:
            semantic_score, semantic_reasoning = self.calculate_semantic_similarity_deepseek(
                source_info['description'],
                target_info['description'],
                source_perspective,
                target_perspective
            )
        else:
            # 不使用DeepSeek时，使用简单的关键词重叠作为替代
            semantic_score = 0.5
            semantic_reasoning = "未使用DeepSeek，使用默认值"
        
        # ===== 综合打分 =====
        total_score = (
            weights['section'] * section_score +
            weights['semantic'] * semantic_score
        )
        
        # ===== 生成证据说明 =====
        evidence = f"Section重叠:{section_score:.1%} | 语义相似度:{semantic_score:.1%}"
        
        # ===== 详细信息 =====
        shared_sections = list(source_info['sections'] & target_info['sections'])
        details = {
            'section_overlap_score': round(section_score, 4),
            'semantic_similarity_score': round(semantic_score, 4),
            'semantic_reasoning': semantic_reasoning,
            'shared_sections': shared_sections[:10],  # 最多显示10个共享法规
            'shared_section_count': len(shared_sections),
            'source_section_count': len(source_info['sections']),
            'target_section_count': len(target_info['sections']),
        }
        
        return total_score, evidence, details
    
    def build_hierarchy(self, thresholds: Dict[str, float] = None, 
                       use_deepseek: bool = True,
                       batch_size: int = 5):
        """
        构建层级关系
        
        参数:
            thresholds: 连接阈值字典
            use_deepseek: 是否使用DeepSeek API计算语义相似度
            batch_size: DeepSeek API调用批次大小（避免请求过快）
        """
        if thresholds is None:
            thresholds = {
                'responsibility_violation': 0.30,   # 降低阈值，因为只有2个指标
                'violation_regulatory': 0.30,
                'responsibility_regulatory': 0.25
            }
        
        print("\n正在构建层级关系...")
        if use_deepseek and self.deepseek_api_key:
            print("  ✓ 将使用DeepSeek API计算语义相似度")
        else:
            print("  ⚠️  未配置DeepSeek API，将使用默认语义相似度")
        
        # 获取所有社区ID
        resp_communities = sorted([int(k.split('_')[1]) for k in self.community_info.keys() 
                               if k.startswith('responsibility')])
        viol_communities = sorted([int(k.split('_')[1]) for k in self.community_info.keys() 
                               if k.startswith('violation')])
        reg_communities = sorted([int(k.split('_')[1]) for k in self.community_info.keys() 
                              if k.startswith('regulatory')])
        
        import time
        
        # ===== 1. 责任方 → 违规行为 =====
        print(f"\n  [1/3] 计算责任方({len(resp_communities)}) → 违规行为({len(viol_communities)})连接...")
        count = 0
        for resp_comm in resp_communities:
            for viol_comm in viol_communities:
                score, evidence, details = self.calculate_connection_score(
                    'responsibility', resp_comm,
                    'violation', viol_comm,
                    use_deepseek=use_deepseek
                )
                
                if score >= thresholds['responsibility_violation']:
                    self.connections.append({
                        'source_perspective': 'responsibility',
                        'source_community_id': resp_comm,
                        'target_perspective': 'violation',
                        'target_community_id': viol_comm,
                        'relation_type': 'leads_to',
                        'score': round(score, 4),
                        'is_strong_link': score >= 0.5,
                        'evidence': evidence,
                        'details': details
                    })
                    count += 1
                
                # API调用延迟（避免请求过快）
                if use_deepseek and self.deepseek_api_key and (count % batch_size == 0):
                    time.sleep(1)
        
        print(f"    → 生成 {count} 个连接")
        
        # ===== 2. 违规行为 → 监管机构 =====
        print(f"\n  [2/3] 计算违规行为({len(viol_communities)}) → 监管机构({len(reg_communities)})连接...")
        count = 0
        for viol_comm in viol_communities:
            for reg_comm in reg_communities:
                score, evidence, details = self.calculate_connection_score(
                    'violation', viol_comm,
                    'regulatory', reg_comm,
                    use_deepseek=use_deepseek
                )
                
                if score >= thresholds['violation_regulatory']:
                    self.connections.append({
                        'source_perspective': 'violation',
                        'source_community_id': viol_comm,
                        'target_perspective': 'regulatory',
                        'target_community_id': reg_comm,
                        'relation_type': 'enforced_by',
                        'score': round(score, 4),
                        'is_strong_link': score >= 0.5,
                        'evidence': evidence,
                        'details': details
                    })
                    count += 1
                
                if use_deepseek and self.deepseek_api_key and (count % batch_size == 0):
                    time.sleep(1)
        
        print(f"    → 生成 {count} 个连接")
        
        # ===== 3. 责任方 → 监管机构 =====
        print(f"\n  [3/3] 计算责任方({len(resp_communities)}) → 监管机构({len(reg_communities)})连接...")
        count = 0
        for resp_comm in resp_communities:
            for reg_comm in reg_communities:
                score, evidence, details = self.calculate_connection_score(
                    'responsibility', resp_comm,
                    'regulatory', reg_comm,
                    use_deepseek=use_deepseek
                )
                
                if score >= thresholds['responsibility_regulatory']:
                    self.connections.append({
                        'source_perspective': 'responsibility',
                        'source_community_id': resp_comm,
                        'target_perspective': 'regulatory',
                        'target_community_id': reg_comm,
                        'relation_type': 'regulated_by',
                        'score': round(score, 4),
                        'is_strong_link': False,  # 跨层连接默认为弱连接
                        'evidence': evidence,
                        'details': details
                    })
                    count += 1
                
                if use_deepseek and self.deepseek_api_key and (count % batch_size == 0):
                    time.sleep(1)
        
        print(f"    → 生成 {count} 个连接")
        print(f"\n✓ 构建完成！共生成 {len(self.connections)} 个连接")
    
    def export_to_excel(self, output_file: str):
        """导出到Excel（包含详细的映射信息）"""
        print(f"\n正在导出到 {output_file}...")
        
        # ===== 表1：社区层级关系表 =====
        connections_data = []
        for conn in self.connections:
            details = conn.get('details', {})
            
            connections_data.append({
                'source_perspective': conn['source_perspective'],
                'source_community_id': conn['source_community_id'],
                'target_perspective': conn['target_perspective'],
                'target_community_id': conn['target_community_id'],
                'relation_type': conn['relation_type'],
                'score': conn['score'],
                'is_strong_link': conn['is_strong_link'],
                'evidence': conn['evidence'],
                # 详细指标
                'section_overlap_score': details.get('section_overlap_score', 0),
                'semantic_similarity_score': details.get('semantic_similarity_score', 0),
                'semantic_reasoning': details.get('semantic_reasoning', ''),
                'shared_section_count': details.get('shared_section_count', 0),
                'shared_sections': '、'.join(details.get('shared_sections', []))
            })
        
        connections_df = pd.DataFrame(connections_data)
        
        # ===== 表2：社区元信息表 =====
        meta_data = []
        for key, info in self.community_info.items():
            meta_data.append({
                'perspective': self.perspectives[info['perspective']]['name'],
                'perspective_en': info['perspective'],
                'community_id': info['community_id'],
                'node_count': info['node_count'],
                'core_node_count': info['core_node_count'],
                'section_count': len(info['sections']),
                'internal_edge_count': info['internal_edge_count'],
                'main_node_types': info['main_node_types'],
                'key_regulations': info['key_regulations'],
                'community_description': info['description']
            })
        
        meta_df = pd.DataFrame(meta_data)
        
        # ===== 写入Excel =====
        with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
            connections_df.to_excel(writer, sheet_name='社区层级关系表', index=False)
            meta_df.to_excel(writer, sheet_name='社区元信息表', index=False)
        
        print(f"✓ 导出成功！")
        print(f"  - Sheet 1: 社区层级关系表 ({len(connections_df)} 条连接)")
        print(f"  - Sheet 2: 社区元信息表 ({len(meta_df)} 个社区)")
        
        return output_file
    
    def visualize_hierarchy_png(self, output_file: str = None):
        """生成PNG可视化（支持中文，显示映射强度）"""
        print("\n正在生成PNG可视化...")
        
        # 统计每个层级的社区
        levels = defaultdict(list)
        for key, info in self.community_info.items():
            level = self.perspectives[info['perspective']]['level']
            levels[level].append((info['perspective'], info['community_id'], info['node_count']))
        
        # 创建图形
        fig, ax = plt.subplots(figsize=(20, 12))
        ax.set_xlim(-1, 16)
        ax.set_ylim(-0.5, 3.8)
        ax.axis('off')
        
        # 定义颜色
        colors = {
            0: '#FF6B6B',  # 责任方 - 红色
            1: '#4ECDC4',  # 违规行为 - 青色
            2: '#95E1D3'   # 监管机构 - 绿色
        }
        
        # 计算节点位置
        node_positions = {}
        y_positions = {0: 3.2, 1: 1.8, 2: 0.4}
        
        for level in [0, 1, 2]:
            communities = levels[level]
            n = len(communities)
            
            if n == 0:
                continue
            
            if n == 1:
                x_positions = [7.5]
            else:
                x_positions = np.linspace(1, 14, n)
            
            for i, (perspective, comm_id, node_count) in enumerate(sorted(communities, key=lambda x: x[1])):
                x = x_positions[i]
                y = y_positions[level]
                node_id = f"{perspective}_{comm_id}"
                node_positions[node_id] = (x, y)
                
                # 绘制节点框
                box = FancyBboxPatch(
                    (x - 0.35, y - 0.18), 0.7, 0.36,
                    boxstyle="round,pad=0.05",
                    edgecolor='black',
                    facecolor=colors[level],
                    linewidth=2.5,
                    alpha=0.85
                )
                ax.add_patch(box)
                
                # 添加文本
                perspective_name = self.perspectives[perspective]['name']
                ax.text(x, y + 0.08, f"{perspective_name}", 
                       ha='center', va='center', fontsize=11, weight='bold')
                ax.text(x, y - 0.02, f"C{comm_id}", 
                       ha='center', va='center', fontsize=10)
                ax.text(x, y - 0.12, f"({node_count}节点)", 
                       ha='center', va='center', fontsize=8, style='italic')
        
        # 绘制连接（按分数着色）
        for conn in self.connections:
            source_id = f"{conn['source_perspective']}_{conn['source_community_id']}"
            target_id = f"{conn['target_perspective']}_{conn['target_community_id']}"
            
            if source_id in node_positions and target_id in node_positions:
                x1, y1 = node_positions[source_id]
                x2, y2 = node_positions[target_id]
                
                y1_adj = y1 - 0.18
                y2_adj = y2 + 0.18
                
                score = conn['score']
                
                # 根据分数确定箭头样式和颜色
                if score >= 0.7:
                    # 强连接：深色、粗线
                    color = '#2C3E50'
                    linewidth = 2.5
                    alpha = 0.8
                    linestyle = '-'
                    head_width = 0.3
                elif score >= 0.5:
                    # 中等连接：中等
                    color = '#555'
                    linewidth = 1.8
                    alpha = 0.6
                    linestyle = '-'
                    head_width = 0.25
                elif score >= 0.3:
                    # 弱连接：浅色、细线
                    color = '#888'
                    linewidth = 1.2
                    alpha = 0.5
                    linestyle = '--'
                    head_width = 0.2
                else:
                    # 很弱的连接：虚线
                    color = '#AAA'
                    linewidth = 0.8
                    alpha = 0.3
                    linestyle = ':'
                    head_width = 0.15
                
                arrow = FancyArrowPatch(
                    (x1, y1_adj), (x2, y2_adj),
                    arrowstyle=f'->,head_width={head_width},head_length={head_width}',
                    color=color,
                    linewidth=linewidth,
                    linestyle=linestyle,
                    alpha=alpha,
                    zorder=1
                )
                ax.add_patch(arrow)
                
                # # 在箭头中点添加分数标签（仅强连接和中等连接）
                # if score >= 0.5:
                #     mid_x = (x1 + x2) / 2
                #     mid_y = (y1_adj + y2_adj) / 2
                #     ax.text(mid_x, mid_y, f'{score:.2f}', 
                #            ha='center', va='center',
                #            fontsize=8, 
                #            bbox=dict(boxstyle='round,pad=0.3', 
                #                    facecolor='white', 
                #                    edgecolor='gray',
                #                    alpha=0.8))
        
        # 添加层级标签
        ax.text(-0.5, 3.2, 'L0', fontsize=18, weight='bold', color='#444')
        ax.text(-0.5, 1.8, 'L1', fontsize=18, weight='bold', color='#444')
        ax.text(-0.5, 0.4, 'L2', fontsize=18, weight='bold', color='#444')
        
        # 添加标题
        plt.title('多视角社区层级结构（基于Section重叠+语义相似度）\nL0:责任方 → L1:违规行为 → L2:监管机构', 
                 fontsize=18, weight='bold', pad=20)
        
        # 添加图例
        legend_elements = [
            mpatches.Patch(color=colors[0], label='L0: 责任方', alpha=0.85),
            mpatches.Patch(color=colors[1], label='L1: 违规行为', alpha=0.85),
            mpatches.Patch(color=colors[2], label='L2: 监管机构', alpha=0.85),
            mpatches.Patch(facecolor='none', edgecolor='#2C3E50', 
                          label='强连接 (≥0.7)', linewidth=2.5),
            mpatches.Patch(facecolor='none', edgecolor='#555', 
                          label='中等连接 (0.5-0.7)', linewidth=1.8),
            mpatches.Patch(facecolor='none', edgecolor='#888', 
                          label='弱连接 (0.3-0.5)', linewidth=1.2, linestyle='--')
        ]
        ax.legend(handles=legend_elements, loc='upper right', fontsize=11,
                 framealpha=0.9, edgecolor='black')
        
        plt.tight_layout()
        
        if output_file:
            plt.savefig(output_file, dpi=300, bbox_inches='tight', 
                       facecolor='white', edgecolor='none')
            print(f"✓ PNG可视化已保存到: {output_file}")
        
        plt.close()
        return output_file
    
    def generate_summary_report(self) -> str:
        """生成摘要报告"""
        report = []
        report.append("=" * 80)
        report.append("多视角社区层级构建摘要报告（修正版 v3）")
        report.append("=" * 80)
        report.append("")
        report.append("【映射计算方案】")
        report.append("  1. Section/Law实体重叠度（权重0.5）")
        report.append("  2. 社区报告语义相似度（权重0.5，DeepSeek API）")
        report.append("")
        report.append("-" * 80)
        report.append("【社区统计】")
        report.append("-" * 80)
        
        for perspective, data in self.perspectives.items():
            comm_count = len([k for k in self.community_info.keys() if k.startswith(perspective)])
            level = data['level']
            name = data['name']
            report.append(f"  L{level} - {name}: {comm_count} 个社区")
        
        report.append("")
        report.append("-" * 80)
        report.append("【连接统计】")
        report.append("-" * 80)
        
        connection_stats = defaultdict(lambda: {'count': 0, 'scores': [], 'strong': 0})
        
        for conn in self.connections:
            source_name = self.perspectives[conn['source_perspective']]['name']
            target_name = self.perspectives[conn['target_perspective']]['name']
            key = f"{source_name} → {target_name}"
            connection_stats[key]['count'] += 1
            connection_stats[key]['scores'].append(conn['score'])
            if conn['is_strong_link']:
                connection_stats[key]['strong'] += 1
        
        for key, stats in sorted(connection_stats.items()):
            avg_score = np.mean(stats['scores'])
            max_score = np.max(stats['scores'])
            report.append(f"  {key}:")
            report.append(f"    - 总连接数: {stats['count']}")
            report.append(f"    - 强连接数: {stats['strong']}")
            report.append(f"    - 平均强度: {avg_score:.3f}")
            report.append(f"    - 最大强度: {max_score:.3f}")
        
        report.append("")
        report.append("=" * 80)
        
        return "\n".join(report)


def main():
    """主函数"""
    # 创建层级构建器（可选：配置DeepSeek API Key）
    # 方式1：从环境变量读取
    # export DEEPSEEK_API_KEY="your_api_key_here"
    
    # 方式2：直接传入（不推荐，避免泄露）
    # hierarchy = MultiPerspectiveHierarchy(deepseek_api_key="your_api_key_here")
    
    hierarchy = MultiPerspectiveHierarchy()
    
    # 加载数据
    hierarchy.load_data(
        responsibility_file='weighted_leiden_results/responsibility_visualization_data.json',
        violation_file='weighted_leiden_results/violation_visualization_data.json',
        regulatory_file='weighted_leiden_results/regulatory_visualization_data.json'
    )
    
    # 提取社区信息
    hierarchy.extract_community_info()
    
    # 构建层级关系
    # use_deepseek=True: 使用DeepSeek API计算语义相似度
    # use_deepseek=False: 使用默认值0.5
    hierarchy.build_hierarchy(use_deepseek=True, batch_size=5)
    
    # 生成报告
    print("\n" + hierarchy.generate_summary_report())
    
    # 导出结果
    excel_file = hierarchy.export_to_excel('build_hierarchy_links_output/community_hierarchy_v3_fixed.xlsx')
    png_file = hierarchy.visualize_hierarchy_png('build_hierarchy_links_output/community_hierarchy_v3_fixed.png')
    
    return hierarchy, excel_file, png_file


if __name__ == '__main__':
    hierarchy, excel_file, png_file = main()
    print(f"\n{'='*80}")
    print(f"✅ 处理完成！")
    print(f"{'='*80}")
    print(f"📊 Excel报告: {excel_file}")
    print(f"🎨 PNG可视化: {png_file}")
    print(f"{'='*80}")
    print(f"\n💡 提示：")
    print(f"  - 如需使用DeepSeek API，请配置环境变量 DEEPSEEK_API_KEY")
    print(f"  - 或在代码中直接传入 deepseek_api_key 参数")
    print(f"  - 未配置时将使用默认语义相似度0.5")
