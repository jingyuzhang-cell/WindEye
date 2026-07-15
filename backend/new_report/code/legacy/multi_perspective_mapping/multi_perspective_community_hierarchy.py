"""
多视角社区层级构建方案实现
以"责任方"作为最上层（L0），向下连接违规行为社区（L1），再向下连接监管机构社区（L2）
"""

import json
import pandas as pd
import numpy as np
from collections import defaultdict, Counter
from typing import Dict, List, Set, Tuple
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import warnings
warnings.filterwarnings('ignore')


class MultiPerspectiveHierarchy:
    """多视角社区层级构建器"""
    
    def __init__(self):
        self.perspectives = {
            'responsibility': {'level': 0, 'data': None, 'name': '责任方'},
            'violation': {'level': 1, 'data': None, 'name': '违规行为'},
            'regulatory': {'level': 2, 'data': None, 'name': '监管机构'}
        }
        self.community_info = {}
        self.connections = []
        
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
                
                # 提取Section节点（法规条款）
                sections = [n['name'] for n in comm_nodes if n['type'] == 'Section']
                
                # 提取核心节点类型
                core_node_types = set([n['type'] for n in core_nodes])
                
                self.community_info[key] = {
                    'perspective': perspective_name,
                    'community_id': comm_id,
                    'node_count': len(comm_nodes),
                    'core_node_count': len(core_nodes),
                    'main_node_types': main_types,
                    'sections': set(sections),
                    'core_node_types': core_node_types,
                    'all_nodes': set([n['id'] for n in comm_nodes]),
                    'core_nodes': set([n['id'] for n in core_nodes]),
                    'key_regulations': "、".join(sections[:5]) if sections else "无"
                }
        
        print(f"提取了 {len(self.community_info)} 个社区的元信息")
    
    def calculate_section_overlap(self, comm1_sections: Set, comm2_sections: Set) -> float:
        """计算Section重叠比例（containment）"""
        if not comm1_sections or not comm2_sections:
            return 0.0
        
        intersection = len(comm1_sections & comm2_sections)
        # 使用containment：交集 / 较小集合的大小
        smaller_size = min(len(comm1_sections), len(comm2_sections))
        
        if smaller_size == 0:
            return 0.0
        
        return intersection / smaller_size
    
    def calculate_jaccard(self, set1: Set, set2: Set) -> float:
        """计算Jaccard相似度"""
        if not set1 or not set2:
            return 0.0
        
        intersection = len(set1 & set2)
        union = len(set1 | set2)
        
        return intersection / union if union > 0 else 0.0
    
    def calculate_cross_edge_density(self, source_perspective: str, source_comm: int,
                                     target_perspective: str, target_comm: int) -> float:
        """计算跨社区高权重关系密度"""
        source_data = self.perspectives[source_perspective]['data']
        edges = source_data.get('edges', source_data.get('links', []))
        
        source_key = f"{source_perspective}_{source_comm}"
        target_key = f"{target_perspective}_{target_comm}"
        
        source_nodes = self.community_info[source_key]['all_nodes']
        target_nodes = self.community_info[target_key]['all_nodes']
        
        high_weight_edges = 0
        total_out_edges = 0
        
        for edge in edges:
            source_id = edge.get('source', edge.get('from'))
            target_id = edge.get('target', edge.get('to'))
            weight = edge.get('weight', 0)
            
            if source_id in source_nodes:
                total_out_edges += 1
                if target_id in target_nodes and weight >= 0.7:
                    high_weight_edges += 1
        
        return high_weight_edges / total_out_edges if total_out_edges > 0 else 0.0
    
    def calculate_connection_score(self, source_perspective: str, source_comm: int,
                                   target_perspective: str, target_comm: int,
                                   weights: Dict[str, float] = None) -> Tuple[float, str]:
        """计算连接强度分数"""
        if weights is None:
            weights = {
                'section': 0.50,
                'core_node': 0.20,
                'cross_edge': 0.15,
                'semantic': 0.15
            }
        
        source_key = f"{source_perspective}_{source_comm}"
        target_key = f"{target_perspective}_{target_comm}"
        
        if source_key not in self.community_info or target_key not in self.community_info:
            return 0.0, ""
        
        source_info = self.community_info[source_key]
        target_info = self.community_info[target_key]
        
        # 1. Section重叠
        section_score = self.calculate_section_overlap(
            source_info['sections'], 
            target_info['sections']
        )
        
        # 2. 核心节点重叠
        core_node_score = self.calculate_jaccard(
            source_info['core_nodes'],
            target_info['core_nodes']
        )
        
        # 3. 跨社区高权重关系密度
        cross_edge_score = self.calculate_cross_edge_density(
            source_perspective, source_comm,
            target_perspective, target_comm
        )
        
        # 4. 语义相似度（简化版本，使用节点类型重叠作为代理）
        semantic_score = self.calculate_jaccard(
            source_info['core_node_types'],
            target_info['core_node_types']
        )
        
        # 综合打分
        total_score = (
            weights['section'] * section_score +
            weights['core_node'] * core_node_score +
            weights['cross_edge'] * cross_edge_score +
            weights['semantic'] * semantic_score
        )
        
        # 生成证据说明
        evidence = f"Section重叠:{section_score:.2%} | 核心节点:{core_node_score:.2%} | 跨边:{cross_edge_score:.2%}"
        
        return total_score, evidence
    
    def build_hierarchy(self, thresholds: Dict[str, float] = None):
        """构建层级关系"""
        if thresholds is None:
            thresholds = {
                'responsibility_violation': 0.50,
                'violation_regulatory': 0.45,
                'responsibility_regulatory': 0.40
            }
        
        print("\n正在构建层级关系...")
        
        # 获取所有社区ID
        resp_communities = set([int(k.split('_')[1]) for k in self.community_info.keys() 
                               if k.startswith('responsibility')])
        viol_communities = set([int(k.split('_')[1]) for k in self.community_info.keys() 
                               if k.startswith('violation')])
        reg_communities = set([int(k.split('_')[1]) for k in self.community_info.keys() 
                              if k.startswith('regulatory')])
        
        # 1. 责任方 → 违规行为
        print(f"  计算责任方({len(resp_communities)}) → 违规行为({len(viol_communities)})连接...")
        for resp_comm in resp_communities:
            for viol_comm in viol_communities:
                score, evidence = self.calculate_connection_score(
                    'responsibility', resp_comm,
                    'violation', viol_comm
                )
                
                if score >= thresholds['responsibility_violation']:
                    self.connections.append({
                        'source_perspective': 'responsibility',
                        'source_community_id': resp_comm,
                        'target_perspective': 'violation',
                        'target_community_id': viol_comm,
                        'relation_type': 'leads_to',
                        'score': score,
                        'is_strong_link': True,
                        'evidence': evidence
                    })
        
        # 2. 违规行为 → 监管机构
        print(f"  计算违规行为({len(viol_communities)}) → 监管机构({len(reg_communities)})连接...")
        for viol_comm in viol_communities:
            for reg_comm in reg_communities:
                score, evidence = self.calculate_connection_score(
                    'violation', viol_comm,
                    'regulatory', reg_comm
                )
                
                if score >= thresholds['violation_regulatory']:
                    self.connections.append({
                        'source_perspective': 'violation',
                        'source_community_id': viol_comm,
                        'target_perspective': 'regulatory',
                        'target_community_id': reg_comm,
                        'relation_type': 'enforced_by',
                        'score': score,
                        'is_strong_link': True,
                        'evidence': evidence
                    })
        
        # 3. 责任方 → 监管机构（两层结构补充）
        print(f"  计算责任方({len(resp_communities)}) → 监管机构({len(reg_communities)})连接...")
        for resp_comm in resp_communities:
            for reg_comm in reg_communities:
                score, evidence = self.calculate_connection_score(
                    'responsibility', resp_comm,
                    'regulatory', reg_comm
                )
                
                if score >= thresholds['responsibility_regulatory']:
                    self.connections.append({
                        'source_perspective': 'responsibility',
                        'source_community_id': resp_comm,
                        'target_perspective': 'regulatory',
                        'target_community_id': reg_comm,
                        'relation_type': 'regulated_by',
                        'score': score,
                        'is_strong_link': False,  # 标记为弱连接
                        'evidence': evidence
                    })
        
        print(f"构建完成！共生成 {len(self.connections)} 个连接")
    
    def export_to_excel(self, output_file: str):
        """导出到Excel"""
        print(f"\n正在导出到 {output_file}...")
        
        # 表1：社区层级关系表
        connections_df = pd.DataFrame(self.connections)
        
        # 表2：社区元信息表
        meta_data = []
        for key, info in self.community_info.items():
            meta_data.append({
                'perspective': self.perspectives[info['perspective']]['name'],
                'perspective_en': info['perspective'],
                'community_id': info['community_id'],
                'node_count': info['node_count'],
                'core_node_count': info['core_node_count'],
                'main_node_types': info['main_node_types'],
                'key_regulations': info['key_regulations']
            })
        
        meta_df = pd.DataFrame(meta_data)
        
        # 写入Excel
        with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
            connections_df.to_excel(writer, sheet_name='社区层级关系表', index=False)
            meta_df.to_excel(writer, sheet_name='社区元信息表', index=False)
        
        print(f"导出成功！")
        return output_file
    
    def visualize_hierarchy(self, output_file: str = None):
        """使用Matplotlib可视化层级结构"""
        print("\n正在生成可视化...")
        
        # 统计每个层级的社区
        levels = defaultdict(list)
        for key, info in self.community_info.items():
            level = self.perspectives[info['perspective']]['level']
            levels[level].append((info['perspective'], info['community_id'], info['node_count']))
        
        # 创建图形
        fig, ax = plt.subplots(figsize=(16, 10))
        ax.set_xlim(-1, 15)
        ax.set_ylim(-0.5, 3.5)
        ax.axis('off')
        
        # 定义颜色
        colors = {
            0: '#FF6B6B',  # 责任方 - 红色
            1: '#4ECDC4',  # 违规行为 - 青色
            2: '#95E1D3'   # 监管机构 - 绿色
        }
        
        # 计算节点位置
        node_positions = {}
        y_positions = {0: 3, 1: 1.8, 2: 0.6}  # L0在顶部
        
        for level in [0, 1, 2]:
            communities = levels[level]
            n = len(communities)
            
            if n == 0:
                continue
            
            # 在x轴上均匀分布
            if n == 1:
                x_positions = [7]
            else:
                x_positions = np.linspace(1, 13, n)
            
            for i, (perspective, comm_id, node_count) in enumerate(sorted(communities, key=lambda x: x[1])):
                x = x_positions[i]
                y = y_positions[level]
                node_id = f"{perspective}_{comm_id}"
                node_positions[node_id] = (x, y)
                
                # 绘制节点
                box = FancyBboxPatch(
                    (x - 0.4, y - 0.15), 0.8, 0.3,
                    boxstyle="round,pad=0.05",
                    edgecolor='black',
                    facecolor=colors[level],
                    linewidth=2,
                    alpha=0.8
                )
                ax.add_patch(box)
                
                # 添加文本
                perspective_name = self.perspectives[perspective]['name']
                ax.text(x, y + 0.05, f"{perspective_name}\nC{comm_id}", 
                       ha='center', va='center', fontsize=9, weight='bold')
                ax.text(x, y - 0.1, f"({node_count})", 
                       ha='center', va='center', fontsize=7, style='italic')
        
        # 绘制连接
        for conn in self.connections:
            source_id = f"{conn['source_perspective']}_{conn['source_community_id']}"
            target_id = f"{conn['target_perspective']}_{conn['target_community_id']}"
            
            if source_id in node_positions and target_id in node_positions:
                x1, y1 = node_positions[source_id]
                x2, y2 = node_positions[target_id]
                
                # 调整起止点以避免覆盖节点框
                y1_adj = y1 - 0.15
                y2_adj = y2 + 0.15
                
                if conn['is_strong_link']:
                    arrow = FancyArrowPatch(
                        (x1, y1_adj), (x2, y2_adj),
                        arrowstyle='->,head_width=0.3,head_length=0.3',
                        color='#555',
                        linewidth=1.5,
                        alpha=0.6,
                        zorder=1
                    )
                else:
                    arrow = FancyArrowPatch(
                        (x1, y1_adj), (x2, y2_adj),
                        arrowstyle='->,head_width=0.2,head_length=0.2',
                        color='#aaa',
                        linewidth=1,
                        linestyle='--',
                        alpha=0.4,
                        zorder=1
                    )
                ax.add_patch(arrow)
        
        # 添加层级标签
        ax.text(-0.5, 3, 'L0', fontsize=14, weight='bold', color='#666')
        ax.text(-0.5, 1.8, 'L1', fontsize=14, weight='bold', color='#666')
        ax.text(-0.5, 0.6, 'L2', fontsize=14, weight='bold', color='#666')
        
        # 添加标题
        plt.title('多视角社区层级结构\nL0:责任方 → L1:违规行为 → L2:监管机构', 
                 fontsize=16, weight='bold', pad=20)
        
        # 添加图例
        legend_elements = [
            mpatches.Patch(color=colors[0], label='L0: 责任方', alpha=0.8),
            mpatches.Patch(color=colors[1], label='L1: 违规行为', alpha=0.8),
            mpatches.Patch(color=colors[2], label='L2: 监管机构', alpha=0.8),
            mpatches.Patch(facecolor='none', edgecolor='#555', 
                          label='强连接', linewidth=1.5),
            mpatches.Patch(facecolor='none', edgecolor='#aaa', 
                          label='弱连接', linewidth=1, linestyle='--')
        ]
        ax.legend(handles=legend_elements, loc='upper right', fontsize=10)
        
        plt.tight_layout()
        
        if output_file:
            plt.savefig(output_file, dpi=300, bbox_inches='tight')
            print(f"可视化已保存到: {output_file}")
        
        return fig
    
    def generate_summary_report(self) -> str:
        """生成摘要报告"""
        report = []
        report.append("=" * 60)
        report.append("多视角社区层级构建摘要报告")
        report.append("=" * 60)
        report.append("")
        
        # 统计各视角的社区数
        for perspective, data in self.perspectives.items():
            comm_count = len([k for k in self.community_info.keys() if k.startswith(perspective)])
            level = data['level']
            name = data['name']
            report.append(f"L{level} - {name}: {comm_count} 个社区")
        
        report.append("")
        report.append("-" * 60)
        report.append("连接统计:")
        report.append("-" * 60)
        
        # 统计连接类型
        connection_stats = defaultdict(lambda: {'count': 0, 'avg_score': 0, 'scores': []})
        
        for conn in self.connections:
            key = f"{conn['source_perspective']} → {conn['target_perspective']}"
            connection_stats[key]['count'] += 1
            connection_stats[key]['scores'].append(conn['score'])
        
        for key, stats in connection_stats.items():
            avg_score = np.mean(stats['scores'])
            report.append(f"{key}: {stats['count']} 个连接, 平均强度: {avg_score:.3f}")
        
        report.append("")
        report.append("-" * 60)
        report.append("孤立社区:")
        report.append("-" * 60)
        
        # 识别孤立社区
        connected_sources = set([f"{c['source_perspective']}_{c['source_community_id']}" 
                                for c in self.connections])
        connected_targets = set([f"{c['target_perspective']}_{c['target_community_id']}" 
                                for c in self.connections])
        connected = connected_sources | connected_targets
        
        isolated = []
        for key in self.community_info.keys():
            if key not in connected:
                info = self.community_info[key]
                isolated.append(f"  - {self.perspectives[info['perspective']]['name']} "
                              f"社区{info['community_id']} ({info['node_count']}节点)")
        
        if isolated:
            report.extend(isolated)
        else:
            report.append("  无孤立社区")
        
        report.append("")
        report.append("=" * 60)
        
        return "\n".join(report)


def main():
    """主函数"""
    # 创建层级构建器
    hierarchy = MultiPerspectiveHierarchy()
    
    # 加载数据
    hierarchy.load_data(
        responsibility_file='/mnt/user-data/uploads/responsibility_visualization_data.json',
        violation_file='/mnt/user-data/uploads/violation_visualization_data.json',
        regulatory_file='/mnt/user-data/uploads/regulatory_visualization_data.json'
    )
    
    # 提取社区信息
    hierarchy.extract_community_info()
    
    # 构建层级关系
    hierarchy.build_hierarchy()
    
    # 生成摘要报告
    print("\n" + hierarchy.generate_summary_report())
    
    # 导出Excel
    excel_file = hierarchy.export_to_excel('/home/claude/community_hierarchy.xlsx')
    
    # 生成可视化
    png_file = '/home/claude/community_hierarchy_visualization.png'
    hierarchy.visualize_hierarchy(output_file=png_file)
    
    return hierarchy, excel_file, png_file


if __name__ == '__main__':
    hierarchy, excel_file, png_file = main()
    print(f"\n✅ 处理完成！")
    print(f"📊 Excel文件: {excel_file}")
    print(f"🎨 可视化PNG: {png_file}")
