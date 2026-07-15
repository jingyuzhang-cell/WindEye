#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
步骤6：社区质量验证 + 因果增强的多层社区映射
================================================================
6-A  社区质量初步验证
      - 计算模块度 (modularity) / NMI
      - 用 DeepSeek 对每个社区摘要打因果分
        （"是否存在责任→违规→监管链"）

6-B  多层社区层级映射（与原版 multi_perspective_hierarchy_v3_fixed.py 逻辑一致）
      层级定义：
        L0（最上层）：责任方社区
        L1（中间层）：违规行为社区
        L2（最下层）：监管机构社区

      连接强度 =
        0.50 × Section/Law 重叠度 (Containment)
      + 0.50 × 语义相似度（DeepSeek，0-10分 → 0-1）

      阈值：
        责任方→违规行为    ≥ 0.30
        违规行为→监管机构  ≥ 0.30
        责任方→监管机构    ≥ 0.25（跳跃/两层结构补充）

输出：
  build_hierarchy_links_output/community_hierarchy_gnn.xlsx
  build_hierarchy_links_output/community_hierarchy_gnn.png
  build_hierarchy_links_output/community_quality_report.xlsx
================================================================
"""

import os
import re
import json
import time
import sys
import warnings
from collections import defaultdict, Counter
from pathlib import Path
from typing import Dict, List, Set, Tuple, Optional

import numpy as np
import pandas as pd
import requests
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

warnings.filterwarnings('ignore')
plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans', 'Arial Unicode MS', 'sans-serif']
plt.rcParams['axes.unicode_minus'] = False

CURRENT_DIR = Path(__file__).resolve().parent
PARENT_DIR = CURRENT_DIR.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(PARENT_DIR))

from report_settings import (
    CLUSTERING_OUTPUT_DIR as DEFAULT_CLUSTERING_OUTPUT_DIR,
    COMMUNITY_REPORTS_DIR as DEFAULT_COMMUNITY_REPORTS_DIR,
    DEEPSEEK_API_KEY as DEFAULT_DEEPSEEK_API_KEY,
    HIERARCHY_OUTPUT_DIR as DEFAULT_HIERARCHY_OUTPUT_DIR,
    ensure_output_dirs,
)

# ══════════════════════════════════════════════════════════════
# 配置
# ══════════════════════════════════════════════════════════════

DEEPSEEK_API_KEY = DEFAULT_DEEPSEEK_API_KEY
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

# 输入目录（step1 输出）
CLUSTERING_RESULT_DIR = str(DEFAULT_CLUSTERING_OUTPUT_DIR)
# 社区报告目录（step2 输出）
COMMUNITY_REPORTS_DIR = str(DEFAULT_COMMUNITY_REPORTS_DIR)
# 输出目录
OUTPUT_DIR = str(DEFAULT_HIERARCHY_OUTPUT_DIR)

PERSPECTIVES_CN = {
    'responsibility': '责任方',
    'violation':      '违规行为',
    'regulatory':     '监管机构',
}

# 层级定义
LEVEL_MAP = {
    'responsibility': 0,   # L0 最上层
    'violation':      1,   # L1 中间层
    'regulatory':     2,   # L2 最下层
}

# 连接评分权重
W_SECTION  = 0.50
W_SEMANTIC = 0.50

# 连接阈值
THRESHOLDS = {
    'responsibility_violation':  0.30,
    'violation_regulatory':      0.30,
    'responsibility_regulatory': 0.25,
}

# DeepSeek 调用配置
BATCH_SIZE    = 5
BATCH_SLEEP   = 1.0    # 每批次后暂停
MAX_RETRIES   = 3
RETRY_DELAY   = 5


# ══════════════════════════════════════════════════════════════
# 工具函数
# ══════════════════════════════════════════════════════════════

def call_deepseek(prompt: str, max_tokens: int = 300,
                  temperature: float = 0.3) -> Optional[str]:
    if not DEEPSEEK_API_KEY:
        return None
    headers = {
        'Authorization': f'Bearer {DEEPSEEK_API_KEY}',
        'Content-Type':  'application/json',
    }
    payload = {
        'model':       'deepseek-chat',
        'messages':    [{'role': 'user', 'content': prompt}],
        'temperature': temperature,
        'max_tokens':  max_tokens,
    }
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(DEEPSEEK_API_URL, headers=headers,
                                 json=payload, timeout=30)
            if resp.status_code == 200:
                return resp.json()['choices'][0]['message']['content']
            elif resp.status_code == 429:
                time.sleep(RETRY_DELAY * (attempt + 1))
            else:
                print(f"  ⚠ API错误 [{resp.status_code}]")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY)
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
    return None


def parse_json_from_text(text: str) -> Optional[dict]:
    if not text:
        return None
    match = re.search(r'\{.*?\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


# ══════════════════════════════════════════════════════════════
# 步骤6-A：社区质量验证
# ══════════════════════════════════════════════════════════════

def load_clustering_results(
    result_dir: str, perspective_key: str
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    px = perspective_key
    df_nodes   = pd.read_csv(os.path.join(result_dir, f"{px}_1_节点聚类结果.csv"),
                              encoding='utf-8-sig')
    df_rels    = pd.read_csv(os.path.join(result_dir, f"{px}_2_关系聚类结果.csv"),
                              encoding='utf-8-sig')
    df_summary = pd.read_csv(os.path.join(result_dir, f"{px}_3_社区统计摘要.csv"),
                              encoding='utf-8-sig')
    df_summary = df_summary[df_summary['社区ID'] != '全局统计'].copy()
    df_summary['社区ID'] = df_summary['社区ID'].astype(int)
    return df_nodes, df_rels, df_summary


def compute_intra_inter_modularity(
    df_nodes: pd.DataFrame,
    df_rels: pd.DataFrame,
) -> Tuple[float, float, float]:
    """
    计算简化版模块度指标：
      - intra_ratio: 社区内部边权重 / 总权重
      - inter_ratio: 跨社区边权重  / 总权重
      - Q_approx:    近似模块度
    """
    total_w = df_rels['计算权重'].sum()
    if total_w == 0:
        return 0.0, 0.0, 0.0

    intra = df_rels[df_rels['是否跨社区'] == '否']['计算权重'].sum()
    inter = df_rels[df_rels['是否跨社区'] == '是']['计算权重'].sum()

    intra_ratio = intra / total_w
    inter_ratio = inter / total_w
    # 近似 Q：内部权重比 - 随机期望（边数比例的平方）
    n_comms = df_nodes['所属社区'].nunique()
    q_approx = intra_ratio - (1.0 / max(n_comms, 1))

    return round(intra_ratio, 4), round(inter_ratio, 4), round(q_approx, 4)


def compute_nmi_between_perspectives(
    df_a: pd.DataFrame,
    df_b: pd.DataFrame,
) -> float:
    """
    计算两视角对同一节点集合的社区标签的 NMI。
    仅对两个视角都包含的节点计算。
    """
    try:
        from sklearn.metrics import normalized_mutual_info_score
        merged = df_a[['节点ID', '所属社区']].merge(
            df_b[['节点ID', '所属社区']],
            on='节点ID', suffixes=('_a', '_b')
        )
        if len(merged) == 0:
            return 0.0
        return round(float(normalized_mutual_info_score(
            merged['所属社区_a'], merged['所属社区_b']
        )), 4)
    except ImportError:
        return -1.0   # sklearn 未安装


def score_community_causal_chain(
    community_id: int,
    perspective_key: str,
    summary_text: str,
    key_words_text: str,
) -> Tuple[float, str]:
    """
    用 DeepSeek 对单个社区打"因果链"分，判断是否存在
    责任方 → 违规行为 → 监管机构 的完整链条。
    返回 (score 0-10, reasoning)
    """
    prompt = f"""你是法律合规领域专家。请评估以下{PERSPECTIVES_CN.get(perspective_key, '')}社区是否包含"责任方→违规行为→监管机构"的完整因果链条。

【社区摘要】
{summary_text[:500]}

【关键词】
{key_words_text[:200]}

请根据以下标准评分（0-10分）：
- 9-10分：明确包含完整三阶段因果链（责任主体、违规行为、监管处理）
- 7-8分：包含两个阶段，逻辑清晰
- 5-6分：仅有一个阶段，但与链条有关联
- 3-4分：弱相关，因果关系模糊
- 0-2分：无明显因果链

返回JSON格式：
{{"score": <0-10整数>, "reasoning": "<评分理由，50字以内>"}}"""

    response = call_deepseek(prompt, max_tokens=150, temperature=0.2)
    parsed   = parse_json_from_text(response)
    if parsed:
        score     = min(max(int(parsed.get('score', 5)), 0), 10)
        reasoning = parsed.get('reasoning', '无')
        return float(score), reasoning
    return 5.0, "API解析失败，使用默认值"


def run_quality_validation(
    result_dir:    str,
    reports_dir:   str,
    use_deepseek:  bool = True,
) -> pd.DataFrame:
    """
    对三个视角的聚类结果进行质量验证，
    输出质量报告 DataFrame。
    """
    print("\n" + "=" * 60)
    print("  步骤6-A：社区质量验证")
    print("=" * 60)

    # 加载各视角社区报告（用于因果链打分）
    reports_data = {}
    for pk in ['responsibility', 'violation', 'regulatory']:
        pname = PERSPECTIVES_CN[pk]
        rpath = os.path.join(reports_dir, f"{pname}社区报告.xlsx")
        if os.path.exists(rpath):
            reports_data[pk] = pd.read_excel(rpath)
            print(f"  ✓ 加载报告: {pname}社区报告.xlsx")
        else:
            reports_data[pk] = None

    all_quality_rows = []

    for pk in ['responsibility', 'violation', 'regulatory']:
        pname = PERSPECTIVES_CN[pk]
        check = os.path.join(result_dir, f"{pk}_1_节点聚类结果.csv")
        if not os.path.exists(check):
            print(f"  ⚠ 跳过 {pname}：聚类文件不存在")
            continue

        df_nodes, df_rels, df_summary = load_clustering_results(result_dir, pk)
        intra_r, inter_r, q_approx   = compute_intra_inter_modularity(df_nodes, df_rels)

        # 读取全局模块度（来自 summary 中的 节点类型分布 字段的全局行）
        raw_summary = pd.read_csv(os.path.join(result_dir, f"{pk}_3_社区统计摘要.csv"),
                                   encoding='utf-8-sig')
        global_row  = raw_summary[raw_summary['社区ID'] == '全局统计']
        modularity_str = global_row['节点类型分布'].values[0] if len(global_row) > 0 else ''
        modularity_val = 0.0
        mod_match = re.search(r'模块度:\s*([\d.]+)', str(modularity_str))
        if mod_match:
            modularity_val = float(mod_match.group(1))

        print(f"\n  [{pname}]  社区数={len(df_summary)}  "
              f"模块度={modularity_val:.4f}  "
              f"内部边比={intra_r:.4f}  Q近似={q_approx:.4f}")

        # 对每个社区打因果链分（可选 DeepSeek）
        rdf = reports_data.get(pk)
        for _, srow in df_summary.iterrows():
            cid      = int(srow['社区ID'])
            n_nodes  = int(srow['节点数量'])
            n_core   = int(srow['核心节点数'])
            density  = float(srow['子图密度'])

            causal_score = 5.0
            causal_reason = "未评估"

            if use_deepseek and DEEPSEEK_API_KEY and rdf is not None:
                rrow = rdf[rdf['community'] == cid]
                if len(rrow) > 0:
                    summary_text   = str(rrow.iloc[0].get('summary',   ''))
                    key_words_text = str(rrow.iloc[0].get('key_words', ''))
                    causal_score, causal_reason = score_community_causal_chain(
                        cid, pk, summary_text, key_words_text
                    )
                    time.sleep(0.5)

            all_quality_rows.append({
                'perspective':     pk,
                'perspective_cn':  pname,
                'community_id':    cid,
                'node_count':      n_nodes,
                'core_node_count': n_core,
                'density':         density,
                'modularity':      modularity_val,
                'intra_edge_ratio': intra_r,
                'q_approx':        q_approx,
                'causal_chain_score':   causal_score,
                'causal_chain_reasoning': causal_reason,
                'node_type_dist':  srow.get('节点类型分布', ''),
            })

    # NMI（视角间）
    print("\n  计算视角间 NMI...")
    persp_nodes = {}
    for pk in ['responsibility', 'violation', 'regulatory']:
        check = os.path.join(result_dir, f"{pk}_1_节点聚类结果.csv")
        if os.path.exists(check):
            persp_nodes[pk] = pd.read_csv(check, encoding='utf-8-sig')

    nmi_pairs = {}
    persp_keys = list(persp_nodes.keys())
    for i in range(len(persp_keys)):
        for j in range(i + 1, len(persp_keys)):
            ka, kb = persp_keys[i], persp_keys[j]
            nmi    = compute_nmi_between_perspectives(persp_nodes[ka], persp_nodes[kb])
            pairk  = f"{PERSPECTIVES_CN[ka]} vs {PERSPECTIVES_CN[kb]}"
            nmi_pairs[pairk] = nmi
            print(f"    NMI({pairk}) = {nmi:.4f}")

    df_quality = pd.DataFrame(all_quality_rows)
    return df_quality, nmi_pairs


# ══════════════════════════════════════════════════════════════
# 步骤6-B：多层社区映射
# ══════════════════════════════════════════════════════════════

class CommunityHierarchyBuilder:
    """
    多层社区层级构建器（与原版逻辑一致，支持 GNN 聚类结果）
    """

    def __init__(self):
        self.community_info: Dict[str, dict] = {}
        self.connections:    List[dict]       = []
        self.perspectives = {
            'responsibility': {'level': 0, 'name': '责任方'},
            'violation':      {'level': 1, 'name': '违规行为'},
            'regulatory':     {'level': 2, 'name': '监管机构'},
        }

    # ── 数据加载 ───────────────────────────────────────────────

    def load_all_data(self, result_dir: str):
        print("\n正在加载社区数据...")
        for pk in ['responsibility', 'violation', 'regulatory']:
            vis_path = os.path.join(result_dir, f"{pk}_visualization_data.json")
            if not os.path.exists(vis_path):
                print(f"  ⚠ 跳过 {pk}：visualization_data.json 不存在")
                continue
            with open(vis_path, 'r', encoding='utf-8') as f:
                vis_data = json.load(f)
            self._extract_from_vis_data(pk, vis_data)
            print(f"  ✓ {PERSPECTIVES_CN[pk]}: "
                  f"{len([k for k in self.community_info if k.startswith(pk)])} 社区")
        print(f"  总计: {len(self.community_info)} 个社区")

    def _extract_from_vis_data(self, perspective_key: str, vis_data: dict):
        """从可视化 JSON 中提取社区元信息"""
        nodes = vis_data.get('nodes', [])
        edges = vis_data.get('edges', [])

        # 按社区分组
        communities: Dict[int, List] = defaultdict(list)
        for node in nodes:
            cid = node.get('community', -1)
            communities[cid].append(node)

        for cid, comm_nodes in communities.items():
            key = f"{perspective_key}_{cid}"
            type_counter = Counter(n['type'] for n in comm_nodes)
            core_nodes   = [n for n in comm_nodes if n.get('isCore', False)]
            sections     = set(n['name'] for n in comm_nodes
                               if n['type'] in ('Section', 'Law', 'Chapter', 'Title')
                               and n.get('name'))
            comm_ids     = {n['id'] for n in comm_nodes}
            internal_e   = [e for e in edges
                            if e.get('source') in comm_ids
                            and e.get('target') in comm_ids]

            desc = self._build_description(perspective_key, comm_nodes,
                                           core_nodes, sections, type_counter)
            self.community_info[key] = {
                'perspective':       perspective_key,
                'community_id':      cid,
                'node_count':        len(comm_nodes),
                'core_node_count':   len(core_nodes),
                'main_node_types':   ' | '.join(f"{t}:{c}" for t, c in type_counter.most_common(3)),
                'sections':          sections,
                'all_nodes':         comm_ids,
                'core_nodes':        {n['id'] for n in core_nodes},
                'key_regulations':   '、'.join(list(sections)[:5]) if sections else '无',
                'internal_edge_count': len(internal_e),
                'representative_nodes': [n['name'] for n in comm_nodes[:10]],
                'description':       desc,
            }

    def _build_description(self, perspective: str, nodes: List,
                            core_nodes: List, sections: Set,
                            type_counter: Counter) -> str:
        parts = [f"视角：{PERSPECTIVES_CN.get(perspective, perspective)}"]
        top_types = type_counter.most_common(3)
        parts.append("主要类型：" + "、".join(f"{t}({c}个)" for t, c in top_types))
        if core_nodes:
            parts.append("核心节点：" + "、".join(n['name'] for n in core_nodes[:5]))
        if sections:
            parts.append("相关法规：" + "、".join(list(sections)[:5]))
        return " | ".join(parts)

    # ── 加载社区报告增强描述 ───────────────────────────────────

    def enrich_with_reports(self, reports_dir: str):
        """用 step2 生成的社区报告增强社区描述"""
        for pk, pname in PERSPECTIVES_CN.items():
            rpath = os.path.join(reports_dir, f"{pname}社区报告.xlsx")
            if not os.path.exists(rpath):
                continue
            rdf = pd.read_excel(rpath)
            for _, row in rdf.iterrows():
                cid = int(row['community'])
                key = f"{pk}_{cid}"
                if key in self.community_info:
                    summary   = str(row.get('summary',   ''))
                    key_words = str(row.get('key_words', ''))
                    findings  = str(row.get('findings',  ''))
                    self.community_info[key]['report_summary']  = summary
                    self.community_info[key]['report_keywords'] = key_words
                    # 增强 description：融入报告摘要
                    self.community_info[key]['description'] += (
                        f" | 报告摘要：{summary[:100]}"
                    )
            print(f"  ✓ 增强描述: {pname}（{len(rdf)} 社区）")

    # ── 连接强度计算 ───────────────────────────────────────────

    def _section_containment(self, s1: Set, s2: Set) -> float:
        """Containment 相似度：较小集合的包含度"""
        if not s1 or not s2:
            return 0.0
        inter = len(s1 & s2)
        denom = min(len(s1), len(s2))
        return inter / denom if denom > 0 else 0.0

    def _semantic_similarity_deepseek(
        self, desc1: str, desc2: str,
        src_perspective: str, tgt_perspective: str,
    ) -> Tuple[float, str]:
        """调用 DeepSeek 计算语义相似度（0-1），与原版 prompt 一致"""
        if not DEEPSEEK_API_KEY:
            return 0.5, "未配置API Key"

        relation_hints = {
            ('responsibility', 'violation'):  '评估责任方社区是否可能导致违规行为社区（因果关系）',
            ('violation',      'regulatory'): '评估违规行为社区是否受到监管机构社区的监管（监管关系）',
            ('responsibility', 'regulatory'): '评估责任方社区是否直接受到监管机构社区的监管（监管关系）',
        }
        hint = relation_hints.get(
            (src_perspective, tgt_perspective), '评估两个社区之间的语义相关性'
        )

        prompt = f"""你是专业法律合规知识图谱分析专家。请评估以下两个社区之间的语义相似度。

【源社区】（{PERSPECTIVES_CN.get(src_perspective, src_perspective)}）
{desc1[:300]}

【目标社区】（{PERSPECTIVES_CN.get(tgt_perspective, tgt_perspective)}）
{desc2[:300]}

【评估任务】{hint}

【评分标准】（0-10分）
- 9-10分：语义高度相关，明确的因果/监管关系，法规重叠度高
- 7-8分：语义较相关，可能存在因果/监管关系
- 5-6分：语义中等相关，关系较弱或间接
- 3-4分：语义弱相关
- 0-2分：语义无关

返回JSON格式：
{{"score": <0-10整数>, "reasoning": "<评分理由，50字以内>"}}"""

        response = call_deepseek(prompt, max_tokens=200, temperature=0.3)
        parsed   = parse_json_from_text(response)
        if parsed:
            score_10  = min(max(int(parsed.get('score', 5)), 0), 10)
            reasoning = parsed.get('reasoning', '无理由')
            return score_10 / 10.0, reasoning
        return 0.5, "API解析失败"

    def calculate_connection_score(
        self,
        src_perspective: str, src_cid: int,
        tgt_perspective: str, tgt_cid: int,
        use_deepseek: bool = True,
    ) -> Tuple[float, str, Dict]:
        """
        计算连接强度：
          total = W_SECTION × section_overlap + W_SEMANTIC × semantic_sim
        """
        src_key = f"{src_perspective}_{src_cid}"
        tgt_key = f"{tgt_perspective}_{tgt_cid}"
        if src_key not in self.community_info or tgt_key not in self.community_info:
            return 0.0, "", {}

        src_info = self.community_info[src_key]
        tgt_info = self.community_info[tgt_key]

        # Section/Law 重叠度
        section_score = self._section_containment(
            src_info['sections'], tgt_info['sections']
        )

        # 语义相似度
        if use_deepseek and DEEPSEEK_API_KEY:
            sem_score, sem_reason = self._semantic_similarity_deepseek(
                src_info['description'], tgt_info['description'],
                src_perspective, tgt_perspective,
            )
        else:
            sem_score, sem_reason = 0.5, "未使用DeepSeek"

        total = W_SECTION * section_score + W_SEMANTIC * sem_score

        shared_secs = list(src_info['sections'] & tgt_info['sections'])
        evidence    = (f"Section重叠:{section_score:.1%} | "
                       f"语义相似度:{sem_score:.1%}")
        details = {
            'section_overlap_score':     round(section_score, 4),
            'semantic_similarity_score': round(sem_score,     4),
            'semantic_reasoning':        sem_reason,
            'shared_sections':           shared_secs[:10],
            'shared_section_count':      len(shared_secs),
            'source_section_count':      len(src_info['sections']),
            'target_section_count':      len(tgt_info['sections']),
        }
        return round(total, 4), evidence, details

    # ── 构建层级关系 ───────────────────────────────────────────

    def build_hierarchy(
        self,
        thresholds:   Dict[str, float] = None,
        use_deepseek: bool = True,
        batch_size:   int  = BATCH_SIZE,
    ):
        if thresholds is None:
            thresholds = THRESHOLDS

        print("\n构建层级关系...")
        if use_deepseek and DEEPSEEK_API_KEY:
            print("  ✓ 使用 DeepSeek 计算语义相似度")
        else:
            print("  ⚠ 不使用 DeepSeek，语义相似度默认 0.5")

        resp_comms = sorted(set(
            int(k.split('_')[1]) for k in self.community_info if k.startswith('responsibility')
        ))
        viol_comms = sorted(set(
            int(k.split('_')[1]) for k in self.community_info if k.startswith('violation')
        ))
        reg_comms  = sorted(set(
            int(k.split('_')[1]) for k in self.community_info if k.startswith('regulatory')
        ))

        call_count = 0

        def _add_connections(src_p, tgt_p, src_list, tgt_list,
                              threshold, rel_type, is_jump=False):
            nonlocal call_count
            cnt = 0
            for sc in src_list:
                for tc in tgt_list:
                    score, evidence, details = self.calculate_connection_score(
                        src_p, sc, tgt_p, tc, use_deepseek
                    )
                    if score >= threshold:
                        self.connections.append({
                            'source_perspective':  src_p,
                            'source_community_id': sc,
                            'target_perspective':  tgt_p,
                            'target_community_id': tc,
                            'relation_type':       rel_type,
                            'score':               score,
                            'is_strong_link':      score >= 0.5 and not is_jump,
                            'evidence':            evidence,
                            'details':             details,
                        })
                        cnt += 1
                    call_count += 1
                    if use_deepseek and DEEPSEEK_API_KEY and call_count % batch_size == 0:
                        time.sleep(BATCH_SLEEP)
            return cnt

        print(f"\n  [1/3] 责任方({len(resp_comms)}) → 违规行为({len(viol_comms)})...")
        n1 = _add_connections(
            'responsibility', 'violation',
            resp_comms, viol_comms,
            thresholds['responsibility_violation'], 'leads_to'
        )
        print(f"    → {n1} 条连接")

        print(f"\n  [2/3] 违规行为({len(viol_comms)}) → 监管机构({len(reg_comms)})...")
        n2 = _add_connections(
            'violation', 'regulatory',
            viol_comms, reg_comms,
            thresholds['violation_regulatory'], 'enforced_by'
        )
        print(f"    → {n2} 条连接")

        print(f"\n  [3/3] 责任方({len(resp_comms)}) → 监管机构({len(reg_comms)})（跳跃）...")
        n3 = _add_connections(
            'responsibility', 'regulatory',
            resp_comms, reg_comms,
            thresholds['responsibility_regulatory'], 'regulated_by',
            is_jump=True
        )
        print(f"    → {n3} 条连接")

        print(f"\n✓ 层级构建完成！总计 {len(self.connections)} 条连接")

    # ── 孤立社区识别 ───────────────────────────────────────────

    def identify_isolated_communities(self) -> List[str]:
        """返回没有任何连接的社区键列表"""
        connected = set()
        for conn in self.connections:
            connected.add(f"{conn['source_perspective']}_{conn['source_community_id']}")
            connected.add(f"{conn['target_perspective']}_{conn['target_community_id']}")
        isolated = [k for k in self.community_info if k not in connected]
        return isolated

    # ── 摘要报告 ───────────────────────────────────────────────

    def generate_summary_report(self) -> str:
        lines = ["=" * 80,
                 "多视角社区层级构建摘要报告（GNN增强版）",
                 "=" * 80, "",
                 "【映射方案】",
                 "  1. Section/Law实体重叠度（权重0.5，Containment相似度）",
                 "  2. DeepSeek语义相似度（权重0.5，0-10分→0-1）",
                 "", "-" * 80, "【社区统计】", "-" * 80]

        for pk, pd_info in self.perspectives.items():
            cnt = sum(1 for k in self.community_info if k.startswith(pk))
            lines.append(f"  L{pd_info['level']} - {pd_info['name']}: {cnt} 个社区")

        isolated = self.identify_isolated_communities()
        lines += ["", "-" * 80, "【连接统计】", "-" * 80]

        stats = defaultdict(lambda: {'count': 0, 'scores': [], 'strong': 0})
        for conn in self.connections:
            sn  = self.perspectives[conn['source_perspective']]['name']
            tn  = self.perspectives[conn['target_perspective']]['name']
            key = f"{sn} → {tn}"
            stats[key]['count'] += 1
            stats[key]['scores'].append(conn['score'])
            if conn['is_strong_link']:
                stats[key]['strong'] += 1

        for key, st in sorted(stats.items()):
            avg = float(np.mean(st['scores']))
            mx  = float(np.max(st['scores']))
            lines += [f"  {key}:",
                      f"    总连接: {st['count']}  强连接: {st['strong']}  "
                      f"均值: {avg:.3f}  最大: {mx:.3f}"]

        lines += ["", f"  孤立社区数: {len(isolated)}",
                  "", "=" * 80]
        return "\n".join(lines)

    # ── Excel 导出 ─────────────────────────────────────────────

    def export_to_excel(self, output_file: str) -> str:
        os.makedirs(os.path.dirname(output_file), exist_ok=True)

        # Sheet 1：层级关系表
        conn_rows = []
        for conn in self.connections:
            det = conn.get('details', {})
            conn_rows.append({
                'source_perspective':          conn['source_perspective'],
                'source_community_id':         conn['source_community_id'],
                'source_perspective_cn':       PERSPECTIVES_CN.get(conn['source_perspective'], ''),
                'target_perspective':          conn['target_perspective'],
                'target_community_id':         conn['target_community_id'],
                'target_perspective_cn':       PERSPECTIVES_CN.get(conn['target_perspective'], ''),
                'relation_type':               conn['relation_type'],
                'score':                       conn['score'],
                'is_strong_link':              conn['is_strong_link'],
                'evidence':                    conn['evidence'],
                'section_overlap_score':       det.get('section_overlap_score', 0),
                'semantic_similarity_score':   det.get('semantic_similarity_score', 0),
                'semantic_reasoning':          det.get('semantic_reasoning', ''),
                'shared_section_count':        det.get('shared_section_count', 0),
                'shared_sections':             '、'.join(det.get('shared_sections', [])),
            })
        df_conn = pd.DataFrame(conn_rows)

        # Sheet 2：社区元信息表
        meta_rows = []
        isolated  = set(self.identify_isolated_communities())
        for key, info in self.community_info.items():
            meta_rows.append({
                'key':                 key,
                'perspective':         PERSPECTIVES_CN.get(info['perspective'], ''),
                'perspective_en':      info['perspective'],
                'community_id':        info['community_id'],
                'level':               LEVEL_MAP.get(info['perspective'], -1),
                'node_count':          info['node_count'],
                'core_node_count':     info['core_node_count'],
                'section_count':       len(info['sections']),
                'internal_edge_count': info['internal_edge_count'],
                'main_node_types':     info['main_node_types'],
                'key_regulations':     info['key_regulations'],
                'description':         info['description'],
                'is_isolated':         key in isolated,
            })
        df_meta = pd.DataFrame(meta_rows)

        # Sheet 3：孤立社区表
        iso_rows = [meta_rows[i] for i, k in enumerate(
            [r['key'] for r in meta_rows]
        ) if k in isolated]
        df_iso = pd.DataFrame(iso_rows) if iso_rows else pd.DataFrame()

        with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
            df_conn.to_excel(writer, sheet_name='社区层级关系表',  index=False)
            df_meta.to_excel(writer, sheet_name='社区元信息表',    index=False)
            if len(df_iso) > 0:
                df_iso.to_excel(writer, sheet_name='孤立社区表',   index=False)

        print(f"✓ 层级映射 Excel 已保存: {output_file}")
        print(f"  Sheet1: {len(df_conn)} 连接  Sheet2: {len(df_meta)} 社区  "
              f"Sheet3: {len(df_iso)} 孤立")
        return output_file

    # ── PNG 可视化 ─────────────────────────────────────────────

    def visualize_hierarchy_png(self, output_file: str) -> str:
        os.makedirs(os.path.dirname(output_file), exist_ok=True)

        # 按层级收集社区
        levels: Dict[int, List] = defaultdict(list)
        for key, info in self.community_info.items():
            lv = LEVEL_MAP.get(info['perspective'], -1)
            levels[lv].append((info['perspective'], info['community_id'],
                                info['node_count']))

        fig, ax = plt.subplots(figsize=(22, 13))
        ax.set_xlim(-1, 16); ax.set_ylim(-0.5, 3.8); ax.axis('off')

        colors    = {0: '#FF6B6B', 1: '#4ECDC4', 2: '#95E1D3'}
        y_pos     = {0: 3.2,       1: 1.8,       2: 0.4}
        node_pos  = {}

        for lv in [0, 1, 2]:
            comms = sorted(levels[lv], key=lambda x: x[1])
            n = len(comms)
            if n == 0:
                continue
            xs = np.linspace(1, 14, n) if n > 1 else [7.5]
            for i, (persp, cid, nc) in enumerate(comms):
                x, y = xs[i], y_pos[lv]
                key  = f"{persp}_{cid}"
                node_pos[key] = (x, y)

                box = FancyBboxPatch(
                    (x - 0.35, y - 0.18), 0.7, 0.36,
                    boxstyle="round,pad=0.05",
                    edgecolor='black', facecolor=colors[lv],
                    linewidth=2.5, alpha=0.85, zorder=2
                )
                ax.add_patch(box)

                pname = PERSPECTIVES_CN.get(persp, persp)
                ax.text(x, y + 0.08, pname,  ha='center', va='center',
                        fontsize=10, fontweight='bold', zorder=3)
                ax.text(x, y - 0.02, f"C{cid}", ha='center', va='center',
                        fontsize=9, zorder=3)
                ax.text(x, y - 0.13, f"({nc}节点)", ha='center', va='center',
                        fontsize=7, style='italic', zorder=3)

        # 绘制连接箭头
        for conn in self.connections:
            sk = f"{conn['source_perspective']}_{conn['source_community_id']}"
            tk = f"{conn['target_perspective']}_{conn['target_community_id']}"
            if sk not in node_pos or tk not in node_pos:
                continue
            x1, y1 = node_pos[sk]
            x2, y2 = node_pos[tk]
            score  = conn['score']

            if   score >= 0.7: color, lw, alpha, ls, hw = '#2C3E50', 2.5, 0.8, '-',  0.30
            elif score >= 0.5: color, lw, alpha, ls, hw = '#555555', 1.8, 0.6, '-',  0.25
            elif score >= 0.3: color, lw, alpha, ls, hw = '#888888', 1.2, 0.5, '--', 0.20
            else:              color, lw, alpha, ls, hw = '#AAAAAA', 0.8, 0.3, ':',  0.15

            ax.add_patch(FancyArrowPatch(
                (x1, y1 - 0.18), (x2, y2 + 0.18),
                arrowstyle=f'->,head_width={hw},head_length={hw}',
                color=color, linewidth=lw, linestyle=ls, alpha=alpha, zorder=1
            ))

        # 层级标签
        for lv, lbl in [(0, 'L0'), (1, 'L1'), (2, 'L2')]:
            ax.text(-0.5, y_pos[lv], lbl, fontsize=18,
                    fontweight='bold', color='#444', va='center')

        plt.title(
            '多视角社区层级结构（GNN嵌入增强 + Section重叠 + 语义相似度）\n'
            'L0:责任方 → L1:违规行为 → L2:监管机构',
            fontsize=16, fontweight='bold', pad=20
        )

        legend_elements = [
            mpatches.Patch(color=colors[0], label='L0: 责任方',   alpha=0.85),
            mpatches.Patch(color=colors[1], label='L1: 违规行为', alpha=0.85),
            mpatches.Patch(color=colors[2], label='L2: 监管机构', alpha=0.85),
            mpatches.Patch(facecolor='none', edgecolor='#2C3E50',
                           label='强连接 (≥0.7)', linewidth=2.5),
            mpatches.Patch(facecolor='none', edgecolor='#555',
                           label='中等连接 (0.5-0.7)', linewidth=1.8),
            mpatches.Patch(facecolor='none', edgecolor='#888',
                           label='弱连接 (0.3-0.5)', linewidth=1.2, linestyle='--'),
        ]
        ax.legend(handles=legend_elements, loc='upper right',
                  fontsize=10, framealpha=0.9, edgecolor='black')

        plt.tight_layout()
        plt.savefig(output_file, dpi=300, bbox_inches='tight',
                    facecolor='white', edgecolor='none')
        plt.close()
        print(f"✓ 层级可视化 PNG 已保存: {output_file}")
        return output_file


# ══════════════════════════════════════════════════════════════
# 质量报告 Excel 导出
# ══════════════════════════════════════════════════════════════

def save_quality_report(
    df_quality: pd.DataFrame,
    nmi_pairs: Dict[str, float],
    output_path: str,
):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    nmi_rows = [{'视角对': k, 'NMI': v} for k, v in nmi_pairs.items()]
    df_nmi   = pd.DataFrame(nmi_rows)

    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        df_quality.to_excel(writer, sheet_name='社区质量明细', index=False)
        df_nmi.to_excel(writer,     sheet_name='视角间NMI',   index=False)

    print(f"✓ 质量报告已保存: {output_path}")


# ══════════════════════════════════════════════════════════════
# 主函数
# ══════════════════════════════════════════════════════════════

def main(use_deepseek: bool = True):
    ensure_output_dirs()
    print("=" * 70)
    print("  步骤6：社区质量验证 + 因果增强的多层社区映射")
    print("=" * 70)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # ── 6-A：质量验证 ─────────────────────────────────────────
    print("\n[6-A] 社区质量验证...")
    df_quality, nmi_pairs = run_quality_validation(
        result_dir   = CLUSTERING_RESULT_DIR,
        reports_dir  = COMMUNITY_REPORTS_DIR,
        use_deepseek = use_deepseek,
    )

    quality_report_path = os.path.join(OUTPUT_DIR, 'community_quality_report.xlsx')
    save_quality_report(df_quality, nmi_pairs, quality_report_path)

    # 打印因果链均分
    if len(df_quality) > 0:
        print("\n  因果链评分汇总：")
        for pk in ['responsibility', 'violation', 'regulatory']:
            sub = df_quality[df_quality['perspective'] == pk]
            if len(sub) > 0:
                avg_score = sub['causal_chain_score'].mean()
                pname     = PERSPECTIVES_CN[pk]
                print(f"    {pname}: 均分={avg_score:.2f}")

    # ── 6-B：层级映射 ──────────────────────────────────────────
    print("\n[6-B] 构建多层社区映射...")
    builder = CommunityHierarchyBuilder()

    builder.load_all_data(CLUSTERING_RESULT_DIR)
    builder.enrich_with_reports(COMMUNITY_REPORTS_DIR)
    builder.build_hierarchy(use_deepseek=use_deepseek, batch_size=BATCH_SIZE)

    # 输出摘要
    print("\n" + builder.generate_summary_report())

    # 导出 Excel & PNG
    excel_path = os.path.join(OUTPUT_DIR, 'community_hierarchy_gnn.xlsx')
    png_path   = os.path.join(OUTPUT_DIR, 'community_hierarchy_gnn.png')
    builder.export_to_excel(excel_path)
    builder.visualize_hierarchy_png(png_path)

    # 最终汇总
    print(f"\n{'=' * 70}")
    print("  步骤6 完成！")
    print(f"  输出目录: {OUTPUT_DIR}")
    print(f"    📊 质量报告: community_quality_report.xlsx")
    print(f"    📊 层级映射: community_hierarchy_gnn.xlsx")
    print(f"    🎨 层级图示: community_hierarchy_gnn.png")
    isolated = builder.identify_isolated_communities()
    print(f"    ℹ 孤立社区: {len(isolated)} 个")
    print(f"{'=' * 70}")

    return builder, df_quality


if __name__ == '__main__':
    builder, df_quality = main(use_deepseek=True)
