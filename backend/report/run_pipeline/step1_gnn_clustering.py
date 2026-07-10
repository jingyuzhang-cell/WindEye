#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
基于GNN多视角表示学习的社区发现
================================================================
步骤1：异构KG构建与三视角子图提取
步骤2：多视角GNN嵌入训练（带自监督对比学习）
步骤3：嵌入融合与特征增强
步骤4：Leiden聚类（嵌入增强版）

输出文件（与原版一致，每视角5个文件，共15个）：
  x_1_节点聚类结果.csv
  x_2_关系聚类结果.csv
  x_3_社区统计摘要.csv
  x_4_跨社区关系分析.csv
  x_visualization_data.json
（x = responsibility / regulatory / violation）
================================================================
依赖安装：
  pip install torch torch-geometric sentence-transformers
      igraph leidenalg networkx pandas numpy scikit-learn
      matplotlib tqdm
================================================================
"""

import os
import json
import warnings
import random
from collections import defaultdict, Counter
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Set, Tuple, Optional

import numpy as np
import pandas as pd
import networkx as nx
import igraph as ig
import leidenalg
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans', 'Arial Unicode MS']
plt.rcParams['axes.unicode_minus'] = False
warnings.filterwarnings('ignore')

# ──────────────────────────────────────────────────────────────
# 可选依赖：若未安装则自动降级
# ──────────────────────────────────────────────────────────────
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch_geometric.data import Data
    from torch_geometric.nn import SAGEConv
    from torch_geometric.utils import negative_sampling
    TORCH_AVAILABLE = True
    print("✓ PyTorch + PyG 已加载")
except ImportError:
    TORCH_AVAILABLE = False
    print("⚠ PyTorch/PyG 未安装 → 降级模式（TF-IDF + 传统Leiden）")

try:
    from sentence_transformers import SentenceTransformer
    SBERT_AVAILABLE = True
    print("✓ SentenceTransformer 已加载")
except ImportError:
    SBERT_AVAILABLE = False
    print("⚠ sentence-transformers 未安装 → 使用TF-IDF特征")

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.preprocessing import normalize
    from sklearn.decomposition import PCA
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

# ══════════════════════════════════════════════════════════════
# 全局配置
# ══════════════════════════════════════════════════════════════

INPUT_FILE  = "data/merged_regulatory_unified.txt"
OUTPUT_DIR  = "gnn_leiden_results"

GNN_HIDDEN        = 128
GNN_LAYERS        = 3
GNN_EPOCHS        = 80
GNN_LR            = 0.001
GNN_LAMBDA        = 0.3       # InfoNCE 损失权重
GNN_SEED          = 42

LEIDEN_RESOLUTION = 0.8
LEIDEN_SEED       = 42
LEIDEN_RUNS       = 5         # 多次运行取最稳定分区

FUSION_WEIGHTS    = [0.4, 0.35, 0.25]   # 责任方 : 违规行为 : 监管机构
SIM_ALPHA         = 0.6                  # 原始边权 vs 余弦相似度混合比
SIM_TOPK          = 10                   # 嵌入相似度新边 Top-K
SIM_THRESHOLD     = 0.60                 # 新边余弦相似度阈值

# ══════════════════════════════════════════════════════════════
# 枚举 & 权重配置（与原版 weighted_leiden_clustering.py 一致）
# ══════════════════════════════════════════════════════════════

class CommunityPerspective(Enum):
    RESPONSIBILITY = "responsibility"
    REGULATORY     = "regulatory"
    VIOLATION      = "violation"


@dataclass
class WeightConfig:
    name: str
    core_types: Set[str]
    high_weight_relations:   Dict[str, float]
    medium_weight_relations: Dict[str, float]
    low_weight_relations:    Dict[str, float]
    default_weight: float = 0.1


def get_weight_configs() -> Dict[CommunityPerspective, WeightConfig]:
    responsibility_config = WeightConfig(
        name="责任方社区",
        core_types={'PartyWithResponsibility', 'AdvantageHolder', 'Actor'},
        high_weight_relations={
            '监管': 1.0, '执行': 0.9, '做出': 0.9, '履行': 0.9,
            '包含责任方': 0.85, '包含主体': 0.85, '包含违规主体': 0.85,
        },
        medium_weight_relations={
            '针对': 0.7, '产生': 0.7, '侵害': 0.6, '受到处罚': 0.6,
            '控制': 0.5, '具有': 0.5, '实施': 0.6,
        },
        low_weight_relations={'包含': 0.2, '依据': 0.3, '规定': 0.3},
        default_weight=0.15,
    )
    regulatory_config = WeightConfig(
        name="监管机构社区",
        core_types={'RegulatoryAuthority'},
        high_weight_relations={
            '监管': 1.0, '处理': 0.95, '处以': 0.95,
            '依照': 0.9, '包含监管机构': 0.9,
        },
        medium_weight_relations={
            '依据': 0.6, '规定': 0.6, '受到': 0.5, '包含责任方': 0.5,
        },
        low_weight_relations={'包含': 0.25, '执行': 0.3, '做出': 0.3},
        default_weight=0.2,
    )
    violation_config = WeightConfig(
        name="违规行为社区",
        core_types={'Action', 'Means'},
        high_weight_relations={
            '执行': 1.0, '做出': 1.0, '实施': 0.95, '规定行为': 0.9,
            '处理': 0.9, '旨在导致': 0.85, '需借助': 0.85,
        },
        medium_weight_relations={
            '受到': 0.7, '受限于': 0.65, '应当': 0.6, '规定': 0.6,
        },
        low_weight_relations={'包含': 0.2, '监管': 0.3, '履行': 0.25},
        default_weight=0.15,
    )
    return {
        CommunityPerspective.RESPONSIBILITY: responsibility_config,
        CommunityPerspective.REGULATORY:     regulatory_config,
        CommunityPerspective.VIOLATION:      violation_config,
    }


# ══════════════════════════════════════════════════════════════
# 步骤0：数据加载
# ══════════════════════════════════════════════════════════════

def load_graph_data(filepath: str) -> Tuple[List[dict], List[dict]]:
    nodes, relationships = [], []
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


# ══════════════════════════════════════════════════════════════
# 步骤1-A：节点文本特征（SBERT / TF-IDF / one-hot）
# ══════════════════════════════════════════════════════════════

def build_node_texts(nodes: List[dict]) -> Tuple[List[str], List[str]]:
    """返回 (node_ids, text_list)"""
    node_ids, texts = [], []
    for node in nodes:
        nid   = node['id']
        props = node.get('properties', {})
        name  = props.get('name', '')
        label = node['labels'][0] if node['labels'] else ''
        parts = [label, name] + [
            v for k, v in props.items()
            if k != 'name' and isinstance(v, str) and v
        ]
        node_ids.append(nid)
        texts.append(' '.join(filter(None, parts)))
    return node_ids, texts


def compute_node_features(nodes: List[dict]) -> Tuple[np.ndarray, List[str]]:
    """返回 (feature_matrix [N,D], node_ids [N])"""
    node_ids, text_list = build_node_texts(nodes)

    if SBERT_AVAILABLE:
        print("  → SBERT 编码 (paraphrase-multilingual-MiniLM-L12-v2)...")
        model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
        feats = model.encode(text_list, batch_size=64,
                             show_progress_bar=True,
                             normalize_embeddings=True).astype(np.float32)
        print(f"  ✓ SBERT shape={feats.shape}")

    elif SKLEARN_AVAILABLE:
        print("  → TF-IDF 编码 (512维, char_wb 2-4gram)...")
        vec   = TfidfVectorizer(max_features=512, analyzer='char_wb',
                                ngram_range=(2, 4))
        feats = normalize(vec.fit_transform(text_list).toarray()).astype(np.float32)
        print(f"  ✓ TF-IDF shape={feats.shape}")

    else:
        print("  → 节点类型 one-hot 编码...")
        all_types = sorted(set(
            n['labels'][0] if n['labels'] else 'Unknown' for n in nodes
        ))
        type2idx = {t: i for i, t in enumerate(all_types)}
        feats = np.zeros((len(nodes), len(all_types)), dtype=np.float32)
        for i, node in enumerate(nodes):
            t = node['labels'][0] if node['labels'] else 'Unknown'
            feats[i, type2idx[t]] = 1.0
        print(f"  ✓ one-hot shape={feats.shape}")

    return feats, node_ids


# ══════════════════════════════════════════════════════════════
# 步骤1-B：异构KG & 三视角子图提取
# ══════════════════════════════════════════════════════════════

def calculate_edge_weight(rel: dict, config: WeightConfig) -> float:
    """按视角权重配置计算边权重（与原版一致）"""
    rt = rel['label']
    st = rel['start']['labels'][0] if rel['start']['labels'] else ''
    et = rel['end']['labels'][0]   if rel['end']['labels']   else ''

    if   rt in config.high_weight_relations:   base = config.high_weight_relations[rt]
    elif rt in config.medium_weight_relations: base = config.medium_weight_relations[rt]
    elif rt in config.low_weight_relations:    base = config.low_weight_relations[rt]
    else:                                       base = config.default_weight

    bonus = 0.0
    if st in config.core_types: bonus += 0.1
    if et in config.core_types: bonus += 0.1
    return max(min(base + bonus, 1.0), 0.05)


def build_node_info(nodes: List[dict]) -> Dict[str, dict]:
    info = {}
    for node in nodes:
        nid = node['id']
        info[nid] = {
            'id':        nid,
            'labels':    node['labels'],
            'node_type': node['labels'][0] if node['labels'] else 'Unknown',
            'name':      node['properties'].get('name', ''),
            'properties': node['properties'],
        }
    return info


def extract_perspective_subgraph(
    relationships: List[dict],
    config: WeightConfig,
    node_info: Dict[str, dict],
) -> Tuple[nx.Graph, nx.DiGraph, List[dict]]:
    """
    对全部节点保留，按视角权重重新计算边权重。
    返回：(G_undirected, G_directed, valid_rels_with_weight)
    """
    node_set = set(node_info.keys())

    G_undir = nx.Graph()
    G_dir   = nx.DiGraph()
    for nid, info in node_info.items():
        attrs = {**info, 'is_core': info['node_type'] in config.core_types}
        G_undir.add_node(nid, **attrs)
        G_dir.add_node(nid, **attrs)

    edge_acc = defaultdict(lambda: {'weight': 0.0, 'rel_types': set()})
    dir_acc  = defaultdict(lambda: {'weight': 0.0, 'rel_types': []})
    valid_rels = []

    for rel in relationships:
        s = rel['start']['id']
        e = rel['end']['id']
        if s not in node_set or e not in node_set:
            continue
        w = calculate_edge_weight(rel, config)
        # 无向
        key_u = tuple(sorted([s, e]))
        edge_acc[key_u]['weight']    += w
        edge_acc[key_u]['rel_types'].add(rel['label'])
        # 有向
        dir_acc[(s, e)]['weight']    += w
        dir_acc[(s, e)]['rel_types'].append(rel['label'])
        valid_rels.append({**rel, 'calculated_weight': w})

    for (u, v), d in edge_acc.items():
        G_undir.add_edge(u, v, weight=d['weight'],
                         rel_types=list(d['rel_types']))

    for (s, e), d in dir_acc.items():
        G_dir.add_edge(s, e, weight=d['weight'],
                       rel_types=d['rel_types'])

    print(f"    子图: {G_undir.number_of_nodes()} 节点, "
          f"{G_undir.number_of_edges()} 边  "
          f"(核心类型: {config.core_types})")
    return G_undir, G_dir, valid_rels


# ══════════════════════════════════════════════════════════════
# 步骤2：GraphSAGE + InfoNCE 自监督训练
# ══════════════════════════════════════════════════════════════

if TORCH_AVAILABLE:

    class GraphSAGEEncoder(nn.Module):
        def __init__(self, in_channels: int, hidden_dim: int = 128, num_layers: int = 3):
            super().__init__()
            self.convs = nn.ModuleList()
            self.bns   = nn.ModuleList()
            dims = [in_channels] + [hidden_dim] * num_layers
            for i in range(num_layers):
                self.convs.append(SAGEConv(dims[i], dims[i + 1], aggr='mean'))
                self.bns.append(nn.BatchNorm1d(dims[i + 1]))

        def forward(self, x, edge_index):
            for conv, bn in zip(self.convs, self.bns):
                x = conv(x, edge_index)
                x = bn(x)
                x = F.relu(x)
                x = F.dropout(x, p=0.2, training=self.training)
            return x


    def _build_pyg_data(G: nx.Graph, feat_map: Dict[str, np.ndarray],
                        node_ids: List[str]) -> 'Data':
        id2idx = {nid: i for i, nid in enumerate(node_ids)}
        x = torch.tensor(
            np.stack([feat_map[nid] for nid in node_ids]), dtype=torch.float32
        )
        edge_rows, ew = [], []
        for u, v, d in G.edges(data=True):
            if u in id2idx and v in id2idx:
                i, j = id2idx[u], id2idx[v]
                edge_rows += [[i, j], [j, i]]
                w = d.get('weight', 1.0)
                ew += [w, w]
        if edge_rows:
            edge_index  = torch.tensor(edge_rows, dtype=torch.long).t().contiguous()
            edge_weight = torch.tensor(ew, dtype=torch.float32)
        else:
            edge_index  = torch.zeros((2, 0), dtype=torch.long)
            edge_weight = torch.zeros(0,      dtype=torch.float32)
        data = Data(x=x, edge_index=edge_index, edge_weight=edge_weight)
        data.num_nodes = len(node_ids)
        return data


    def _info_nce_loss(anchor, pos, neg, temperature=0.5):
        anchor = F.normalize(anchor, dim=-1)
        pos    = F.normalize(pos,    dim=-1)
        neg    = F.normalize(neg,    dim=-1)
        pos_s  = (anchor * pos).sum(-1, keepdim=True) / temperature
        neg_s  = (anchor @ neg.T)                      / temperature
        logits = torch.cat([pos_s, neg_s], dim=1)
        labels = torch.zeros(len(anchor), dtype=torch.long, device=anchor.device)
        return F.cross_entropy(logits, labels)


    def _link_pred_loss(z, edge_index, num_nodes):
        if edge_index.shape[1] == 0:
            return torch.tensor(0.0, requires_grad=True)
        neg_ei  = negative_sampling(edge_index, num_nodes=num_nodes,
                                    num_neg_samples=edge_index.shape[1])
        pos_s   = (z[edge_index[0]] * z[edge_index[1]]).sum(-1)
        neg_s   = (z[neg_ei[0]]     * z[neg_ei[1]]).sum(-1)
        scores  = torch.cat([pos_s, neg_s])
        labels  = torch.cat([torch.ones(len(pos_s)), torch.zeros(len(neg_s))])
        return F.binary_cross_entropy_with_logits(scores, labels.to(scores.device))


    def train_gnn_embedding(
        G: nx.Graph,
        feat_map: Dict[str, np.ndarray],
        node_ids: List[str],
        hidden_dim: int = GNN_HIDDEN,
        num_layers: int = GNN_LAYERS,
        epochs:     int = GNN_EPOCHS,
        lr:       float = GNN_LR,
        lmbda:    float = GNN_LAMBDA,
        seed:       int = GNN_SEED,
    ) -> np.ndarray:
        """训练 GraphSAGE，返回嵌入矩阵 [N, hidden_dim]"""
        torch.manual_seed(seed); random.seed(seed); np.random.seed(seed)

        data   = _build_pyg_data(G, feat_map, node_ids)
        in_dim = data.x.shape[1]
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        model  = GraphSAGEEncoder(in_dim, hidden_dim, num_layers).to(device)
        optim  = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)
        sched  = torch.optim.lr_scheduler.CosineAnnealingLR(optim, T_max=epochs)

        x          = data.x.to(device)
        edge_index = data.edge_index.to(device)
        N          = data.num_nodes

        print(f"    GraphSAGE: N={N}, in={in_dim}, hidden={hidden_dim}, "
              f"epochs={epochs}, device={device}")

        best_loss, best_z = float('inf'), None

        for epoch in range(1, epochs + 1):
            model.train(); optim.zero_grad()
            z      = model(x, edge_index)
            lp     = _link_pred_loss(z, edge_index, N)
            if edge_index.shape[1] > 0:
                perm   = torch.randperm(edge_index.shape[1], device=device)
                idx    = perm[:min(256, edge_index.shape[1])]
                nce    = _info_nce_loss(
                    z[edge_index[0][idx]], z[edge_index[1][idx]],
                    z[torch.randint(0, N, (len(idx),), device=device)]
                )
            else:
                nce = torch.tensor(0.0, device=device)

            loss = (1 - lmbda) * lp + lmbda * nce
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optim.step(); sched.step()

            if loss.item() < best_loss:
                best_loss = loss.item()
                best_z    = z.detach().cpu().numpy()

            if epoch % 20 == 0 or epoch == epochs:
                print(f"      Epoch {epoch:3d}/{epochs}  "
                      f"loss={loss.item():.4f}  "
                      f"lp={lp.item():.4f}  nce={nce.item():.4f}")

        print(f"    ✓ 训练完成  best_loss={best_loss:.4f}  shape={best_z.shape}")
        return best_z


# ══════════════════════════════════════════════════════════════
# 步骤3：嵌入融合 & 相似度图增强
# ══════════════════════════════════════════════════════════════

def fuse_embeddings(
    emb_resp: np.ndarray,
    emb_viol: np.ndarray,
    emb_reg:  np.ndarray,
    weights: List[float] = FUSION_WEIGHTS,
) -> np.ndarray:
    """加权 concat 后 L2 归一化  →  [N, 3×hidden_dim]"""
    w = np.array(weights, dtype=np.float32); w /= w.sum()
    fused = np.concatenate([
        emb_resp * w[0], emb_viol * w[1], emb_reg * w[2]
    ], axis=1).astype(np.float32)
    norms = np.linalg.norm(fused, axis=1, keepdims=True)
    fused /= np.where(norms == 0, 1.0, norms)
    print(f"  ✓ 融合嵌入 shape={fused.shape}")
    return fused


def build_similarity_enhanced_graph(
    fused_emb: np.ndarray,
    G_base: nx.Graph,
    node_ids: List[str],
    alpha: float = SIM_ALPHA,
    topk:  int   = SIM_TOPK,
    threshold: float = SIM_THRESHOLD,
) -> nx.Graph:
    """
    用融合嵌入增强基础图：
      1. 调整已有边权重：new_w = alpha × orig_w + (1-alpha) × cos_sim
      2. 补充高余弦相似度的 Top-K 新边
    """
    id2idx   = {nid: i for i, nid in enumerate(node_ids)}
    norm_emb = fused_emb / (np.linalg.norm(fused_emb, axis=1, keepdims=True) + 1e-9)
    sim_mat  = norm_emb @ norm_emb.T   # [N, N]

    G_enh = G_base.copy()

    # 1. 增强已有边
    for u, v, d in G_enh.edges(data=True):
        if u in id2idx and v in id2idx:
            cos = float(sim_mat[id2idx[u], id2idx[v]])
            ow  = d.get('weight', 0.5)
            G_enh[u][v]['weight'] = alpha * ow + (1 - alpha) * max(cos, 0.0)

    # 2. 补充高相似度新边
    N, new_cnt = len(node_ids), 0
    for i in range(N):
        nid_i = node_ids[i]
        row   = sim_mat[i].copy(); row[i] = -1
        topk_j = np.argsort(row)[-topk:][::-1]
        for j in topk_j:
            if row[j] < threshold:
                break
            nid_j = node_ids[j]
            if not G_enh.has_edge(nid_i, nid_j):
                G_enh.add_edge(nid_i, nid_j,
                               weight=float(row[j]) * (1 - alpha),
                               rel_types=['emb_similarity'])
                new_cnt += 1

    print(f"  ✓ 增强图: 新增 {new_cnt} 条相似度边  "
          f"总边数={G_enh.number_of_edges()}")
    return G_enh


# ══════════════════════════════════════════════════════════════
# 步骤4：Leiden 聚类
# ══════════════════════════════════════════════════════════════

def run_leiden_clustering(
    G: nx.Graph,
    node_ids: List[str],
    resolution: float = LEIDEN_RESOLUTION,
    seed:       int   = LEIDEN_SEED,
    n_runs:     int   = LEIDEN_RUNS,
) -> Tuple[List[Set[str]], Dict[str, int], float]:
    """多次运行 Leiden，取模块度最高分区"""
    id_list = list(G.nodes())
    id2idx  = {nid: i for i, nid in enumerate(id_list)}

    G_ig = ig.Graph(n=len(id_list), directed=False)
    G_ig.vs['name'] = id_list

    edges, wts = [], []
    for u, v, d in G.edges(data=True):
        if u in id2idx and v in id2idx:
            edges.append((id2idx[u], id2idx[v]))
            wts.append(max(d.get('weight', 0.5), 0.01))
    G_ig.add_edges(edges)
    G_ig.es['weight'] = wts

    print(f"    Leiden: {len(id_list)} 节点, {len(edges)} 边, "
          f"resolution={resolution}, runs={n_runs}")

    best_part, best_q = None, -1.0
    for run in range(n_runs):
        part = leidenalg.find_partition(
            G_ig, leidenalg.RBConfigurationVertexPartition,
            weights=G_ig.es['weight'],
            resolution_parameter=resolution,
            seed=seed + run,
        )
        if part.modularity > best_q:
            best_q, best_part = part.modularity, part

    communities, node_to_comm = [], {}
    for cid, members in enumerate(best_part):
        comm = {id_list[idx] for idx in members}
        communities.append(comm)
        for idx in members:
            node_to_comm[id_list[idx]] = cid

    nx_mod = nx.community.modularity(G, communities, weight='weight')
    print(f"    ✓ Leiden完成: {len(communities)} 社区  "
          f"modularity(Leiden)={best_q:.4f}  modularity(NX)={nx_mod:.4f}")
    return communities, node_to_comm, nx_mod


# ══════════════════════════════════════════════════════════════
# 降级路径（无 PyTorch）
# ══════════════════════════════════════════════════════════════

def fallback_embedding(
    node_feats: np.ndarray,
    node_ids:   List[str],
    hidden_dim: int = GNN_HIDDEN,
) -> np.ndarray:
    """PCA 压缩初始特征到 hidden_dim 维"""
    dim_out = min(hidden_dim, node_feats.shape[1], len(node_ids) - 1)
    if SKLEARN_AVAILABLE:
        print(f"    [降级] PCA {node_feats.shape[1]}→{dim_out}...")
        emb = PCA(n_components=dim_out).fit_transform(node_feats).astype(np.float32)
        # 补零到 hidden_dim
        if emb.shape[1] < hidden_dim:
            emb = np.pad(emb, ((0, 0), (0, hidden_dim - emb.shape[1])))
    else:
        emb = node_feats[:, :hidden_dim].astype(np.float32)
        if emb.shape[1] < hidden_dim:
            emb = np.pad(emb, ((0, 0), (0, hidden_dim - emb.shape[1])))
    return emb


# ══════════════════════════════════════════════════════════════
# 结果整理（与原版字段完全一致）
# ══════════════════════════════════════════════════════════════

def create_node_dataframe(
    G_dir:    nx.DiGraph,
    G_undir:  nx.Graph,
    node_info: Dict[str, dict],
    node_to_comm: Dict[str, int],
    config:   WeightConfig,
) -> pd.DataFrame:
    records = []
    for nid, info in node_info.items():
        deg     = G_undir.degree(nid)
        wdeg    = G_undir.degree(nid, weight='weight')
        indeg   = G_dir.in_degree(nid)
        outdeg  = G_dir.out_degree(nid)
        inw     = G_dir.in_degree(nid, weight='weight')
        outw    = G_dir.out_degree(nid, weight='weight')
        clust   = nx.clustering(G_undir, nid, weight='weight')
        nbrs    = list(G_undir.neighbors(nid))
        cdist   = Counter(node_to_comm.get(n, -1) for n in nbrs)
        records.append({
            '节点ID':         nid,
            '节点名称':       info['name'],
            '节点类型':       info['node_type'],
            '是否核心类型':   '是' if info['node_type'] in config.core_types else '否',
            '所有标签':       '|'.join(info['labels']),
            '所属社区':       node_to_comm.get(nid, -1),
            '度数':           deg,
            '加权度数':       round(float(wdeg),  4),
            '入度':           indeg,
            '出度':           outdeg,
            '加权入度':       round(float(inw),   4),
            '加权出度':       round(float(outw),  4),
            '聚类系数':       round(float(clust), 4),
            '邻居节点数':     len(nbrs),
            '邻居社区分布':   '; '.join(f"社区{k}:{v}" for k, v in sorted(cdist.items())),
        })
    return pd.DataFrame(records)


def create_relationship_dataframe(
    valid_rels:   List[dict],
    node_to_comm: Dict[str, int],
    node_info:    Dict[str, dict],
) -> pd.DataFrame:
    records = []
    for rel in valid_rels:
        s  = rel['start']['id']
        e  = rel['end']['id']
        sc = node_to_comm.get(s, -1)
        ec = node_to_comm.get(e, -1)
        records.append({
            '关系ID':       rel['id'],
            '关系类型':     rel['label'],
            '计算权重':     round(rel.get('calculated_weight', 0), 4),
            '起始节点ID':   s,
            '起始节点名称': node_info.get(s, {}).get('name', ''),
            '起始节点类型': rel['start']['labels'][0] if rel['start']['labels'] else '',
            '起始节点社区': sc,
            '终止节点ID':   e,
            '终止节点名称': node_info.get(e, {}).get('name', ''),
            '终止节点类型': rel['end']['labels'][0]   if rel['end']['labels']   else '',
            '终止节点社区': ec,
            '是否跨社区':   '是' if sc != ec else '否',
        })
    return pd.DataFrame(records)


def create_community_summary(
    df_nodes: pd.DataFrame,
    df_rels:  pd.DataFrame,
    communities: List[Set[str]],
    G_undir:  nx.Graph,
    modularity: float,
    config:   WeightConfig,
) -> pd.DataFrame:
    records = []
    for idx, comm in enumerate(communities):
        cn   = df_nodes[df_nodes['节点ID'].isin(comm)]
        ir   = df_rels[(df_rels['起始节点ID'].isin(comm)) &
                        (df_rels['终止节点ID'].isin(comm))]
        core = cn[cn['是否核心类型'] == '是']
        sub  = G_undir.subgraph(comm)
        dens = nx.density(sub) if len(comm) > 1 else 0.0
        tdist = cn['节点类型'].value_counts()
        top5  = ' | '.join(f"{t}:{c}" for t, c in tdist.head(5).items())
        tw    = float(ir['计算权重'].sum())  if len(ir) > 0 else 0.0
        aw    = float(ir['计算权重'].mean()) if len(ir) > 0 else 0.0
        records.append({
            '社区ID':       idx,
            '节点数量':     len(comm),
            '核心节点数':   len(core),
            '内部关系数':   len(ir),
            '总权重':       round(tw, 2),
            '平均权重':     round(aw, 4),
            '子图密度':     round(float(dens), 4),
            '平均度数':     round(float(cn['度数'].mean()),     2),
            '平均加权度数': round(float(cn['加权度数'].mean()), 4),
            '节点类型分布': top5,
        })
    df = pd.DataFrame(records).sort_values('节点数量', ascending=False).reset_index(drop=True)
    global_row = {
        '社区ID':       '全局统计',
        '节点数量':     len(df_nodes),
        '核心节点数':   int((df_nodes['是否核心类型'] == '是').sum()),
        '内部关系数':   len(df_rels),
        '总权重':       round(float(df_rels['计算权重'].sum()),  2),
        '平均权重':     round(float(df_rels['计算权重'].mean()), 4),
        '子图密度':     round(float(nx.density(G_undir)), 4),
        '平均度数':     round(float(df_nodes['度数'].mean()),     2),
        '平均加权度数': round(float(df_nodes['加权度数'].mean()), 4),
        '节点类型分布': f"模块度: {modularity:.4f}",
    }
    return pd.concat([df, pd.DataFrame([global_row])], ignore_index=True)


def create_cross_community_analysis(df_rels: pd.DataFrame) -> pd.DataFrame:
    cross = df_rels[df_rels['是否跨社区'] == '是'].copy()
    if len(cross) == 0:
        return pd.DataFrame()
    cross['社区对'] = cross.apply(
        lambda r: (f"{min(r['起始节点社区'], r['终止节点社区'])}"
                   f"<->{max(r['起始节点社区'], r['终止节点社区'])}"),
        axis=1,
    )
    agg = (cross.groupby('社区对')
           .agg(连接数量=('关系ID', 'count'),
                总权重=('计算权重', 'sum'),
                平均权重=('计算权重', 'mean'),
                关系类型=('关系类型', lambda x: ' | '.join(sorted(set(x)))))
           .reset_index()
           .sort_values('连接数量', ascending=False)
           .reset_index(drop=True))
    return agg


def generate_visualization_data(
    df_nodes: pd.DataFrame,
    df_rels:  pd.DataFrame,
    df_summary: pd.DataFrame,
    communities: List[Set[str]],
    G_undir:  nx.Graph,
    config:   WeightConfig,
    modularity: float,
) -> dict:
    nc     = len(communities)
    colors = plt.cm.tab20(np.linspace(0, 1, max(20, nc)))
    cmap   = {i: f"rgb({int(r*255)},{int(g*255)},{int(b*255)})"
              for i, (r, g, b, _) in enumerate(colors[:nc])}

    vis_nodes = []
    for _, row in df_nodes.iterrows():
        cid = row['所属社区']
        vis_nodes.append({
            'id':             row['节点ID'],
            'name':           str(row['节点名称'])[:30],
            'type':           row['节点类型'],
            'isCore':         row['是否核心类型'] == '是',
            'community':      int(cid),
            'degree':         int(row['度数']),
            'weightedDegree': float(row['加权度数']),
            'inDegree':       int(row['入度']),
            'outDegree':      int(row['出度']),
            'clustering':     float(row['聚类系数']),
            'color':          cmap.get(cid, 'rgb(128,128,128)'),
        })

    seen, vis_edges = set(), []
    for _, row in df_rels.iterrows():
        key = tuple(sorted([row['起始节点ID'], row['终止节点ID']]))
        if key not in seen:
            seen.add(key)
            vis_edges.append({
                'source':         row['起始节点ID'],
                'target':         row['终止节点ID'],
                'type':           row['关系类型'],
                'weight':         float(row['计算权重']),
                'crossCommunity': row['是否跨社区'] == '是',
            })

    vis_comms = []
    for _, row in df_summary.iterrows():
        if row['社区ID'] == '全局统计':
            continue
        vis_comms.append({
            'id':              int(row['社区ID']),
            'nodeCount':       int(row['节点数量']),
            'coreNodeCount':   int(row['核心节点数']),
            'edgeCount':       int(row['内部关系数']),
            'totalWeight':     float(row['总权重']),
            'avgWeight':       float(row['平均权重']),
            'density':         float(row['子图密度']),
            'avgDegree':       float(row['平均度数']),
            'avgWeightedDegree': float(row['平均加权度数']),
            'nodeTypes':       row['节点类型分布'],
            'color':           cmap.get(int(row['社区ID']), 'rgb(128,128,128)'),
        })

    return {
        'nodes':       vis_nodes,
        'edges':       vis_edges,
        'communities': vis_comms,
        'stats': {
            'totalNodes':       len(vis_nodes),
            'totalEdges':       len(vis_edges),
            'totalCommunities': nc,
            'modularity':       round(modularity, 4),
            'perspective':      config.name,
            'coreTypes':        list(config.core_types),
        },
        'weightConfig': {
            'name':                  config.name,
            'coreTypes':             list(config.core_types),
            'highWeightRelations':   config.high_weight_relations,
            'mediumWeightRelations': config.medium_weight_relations,
            'defaultWeight':         config.default_weight,
        },
    }


def export_results(
    df_nodes:   pd.DataFrame,
    df_rels:    pd.DataFrame,
    df_summary: pd.DataFrame,
    df_cross:   pd.DataFrame,
    vis_data:   dict,
    output_dir: str,
    perspective: CommunityPerspective,
) -> List[str]:
    os.makedirs(output_dir, exist_ok=True)
    px    = perspective.value
    files = []

    def _csv(df, suffix):
        p = os.path.join(output_dir, f"{px}_{suffix}")
        df.to_csv(p, index=False, encoding='utf-8-sig')
        files.append(p)

    _csv(df_nodes,   "1_节点聚类结果.csv")
    _csv(df_rels,    "2_关系聚类结果.csv")
    _csv(df_summary, "3_社区统计摘要.csv")
    if len(df_cross) > 0:
        _csv(df_cross, "4_跨社区关系分析.csv")

    vis_path = os.path.join(output_dir, f"{px}_visualization_data.json")
    with open(vis_path, 'w', encoding='utf-8') as f:
        json.dump(vis_data, f, ensure_ascii=False, indent=2)
    files.append(vis_path)

    print(f"  ✓ [{px}] 结果已保存至 {output_dir}")
    for fp in files:
        print(f"      {os.path.basename(fp)}")
    return files


# ══════════════════════════════════════════════════════════════
# 主流程
# ══════════════════════════════════════════════════════════════

def run_full_pipeline(
    input_file:  str   = INPUT_FILE,
    output_dir:  str   = OUTPUT_DIR,
    resolution:  float = LEIDEN_RESOLUTION,
    seed:        int   = LEIDEN_SEED,
) -> dict:
    """
    步骤1 → 步骤2 → 步骤3 → 步骤4，输出与原版一致的 15 个文件
    """
    print("=" * 70)
    print("  GNN 多视角表示学习 + Leiden 社区发现 (步骤 1-4)")
    print("=" * 70)

    # ── 加载数据 ────────────────────────────────────────────────
    print("\n[步骤0] 加载知识图谱数据...")
    nodes, relationships = load_graph_data(input_file)
    node_info = build_node_info(nodes)
    node_ids  = list(node_info.keys())
    weight_configs = get_weight_configs()

    # ── 步骤1：节点特征 ─────────────────────────────────────────
    print("\n[步骤1] 计算节点特征...")
    node_feats, feat_node_ids = compute_node_features(nodes)
    # 保持节点顺序与 node_ids 一致
    feat_map = {nid: node_feats[i] for i, nid in enumerate(feat_node_ids)}

    # ── 步骤2：三视角子图 + GNN 嵌入 ────────────────────────────
    print("\n[步骤2] 提取三视角子图 & 训练 GNN 嵌入...")
    persp_order = [
        CommunityPerspective.RESPONSIBILITY,
        CommunityPerspective.VIOLATION,
        CommunityPerspective.REGULATORY,
    ]
    subgraph_data = {}   # persp -> (G_undir, G_dir, valid_rels)
    embeddings    = {}   # persp -> np.ndarray [N, hidden_dim]

    for persp in persp_order:
        cfg = weight_configs[persp]
        print(f"\n  ── {cfg.name} ──────────────────────────")
        G_undir, G_dir, valid_rels = extract_perspective_subgraph(
            relationships, cfg, node_info
        )
        subgraph_data[persp] = (G_undir, G_dir, valid_rels)

        if TORCH_AVAILABLE:
            emb = train_gnn_embedding(
                G_undir, feat_map, node_ids,
                hidden_dim=GNN_HIDDEN, num_layers=GNN_LAYERS,
                epochs=GNN_EPOCHS, lr=GNN_LR, lmbda=GNN_LAMBDA, seed=seed,
            )
        else:
            emb = fallback_embedding(node_feats, node_ids, GNN_HIDDEN)

        embeddings[persp] = emb

    # ── 步骤3：嵌入融合 ─────────────────────────────────────────
    print("\n[步骤3] 融合三视角嵌入...")
    fused_emb = fuse_embeddings(
        embeddings[CommunityPerspective.RESPONSIBILITY],
        embeddings[CommunityPerspective.VIOLATION],
        embeddings[CommunityPerspective.REGULATORY],
        weights=FUSION_WEIGHTS,
    )

    # ── 步骤4：各视角 Leiden 聚类 ────────────────────────────────
    print("\n[步骤4] 嵌入增强 Leiden 聚类（三视角）...")
    all_results = {}

    for persp in persp_order:
        cfg = weight_configs[persp]
        print(f"\n{'=' * 65}")
        print(f"  视角: {cfg.name}  核心类型: {cfg.core_types}")
        print(f"{'=' * 65}")

        G_undir, G_dir, valid_rels = subgraph_data[persp]

        if TORCH_AVAILABLE:
            G_enh = build_similarity_enhanced_graph(
                fused_emb, G_undir, node_ids,
                alpha=SIM_ALPHA, topk=SIM_TOPK, threshold=SIM_THRESHOLD,
            )
            communities, node_to_comm, modularity = run_leiden_clustering(
                G_enh, node_ids, resolution, seed, LEIDEN_RUNS
            )
        else:
            # 降级：直接用融合嵌入增强边权
            id2idx   = {nid: i for i, nid in enumerate(node_ids)}
            norm_emb = fused_emb / (np.linalg.norm(fused_emb, axis=1, keepdims=True) + 1e-9)
            G_aug    = G_undir.copy()
            for u, v, d in G_aug.edges(data=True):
                if u in id2idx and v in id2idx:
                    cos = float(norm_emb[id2idx[u]] @ norm_emb[id2idx[v]])
                    G_aug[u][v]['weight'] = SIM_ALPHA * d.get('weight', 0.5) + \
                                            (1 - SIM_ALPHA) * max(cos, 0.0)
            communities, node_to_comm, modularity = run_leiden_clustering(
                G_aug, node_ids, resolution, seed, LEIDEN_RUNS
            )

        # 构建结果表
        df_nodes_out   = create_node_dataframe(G_dir, G_undir, node_info, node_to_comm, cfg)
        df_rels_out    = create_relationship_dataframe(valid_rels, node_to_comm, node_info)
        df_summary_out = create_community_summary(df_nodes_out, df_rels_out,
                                                   communities, G_undir, modularity, cfg)
        df_cross_out   = create_cross_community_analysis(df_rels_out)
        vis_data       = generate_visualization_data(
            df_nodes_out, df_rels_out, df_summary_out,
            communities, G_undir, cfg, modularity
        )
        files = export_results(
            df_nodes_out, df_rels_out, df_summary_out, df_cross_out,
            vis_data, output_dir, persp
        )
        all_results[persp.value] = {
            'files':       files,
            'vis_data':    vis_data,
            'communities': len(communities),
            'modularity':  modularity,
        }

    # ── 总结 ────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("  步骤1-4 完成！")
    print(f"  输出目录: {output_dir}")
    for k, v in all_results.items():
        print(f"    {k:>16s}: {v['communities']} 社区  "
              f"modularity={v['modularity']:.4f}")
    print("=" * 70)
    return all_results


if __name__ == '__main__':
    run_full_pipeline(
        input_file=INPUT_FILE,
        output_dir=OUTPUT_DIR,
        resolution=LEIDEN_RESOLUTION,
        seed=LEIDEN_SEED,
    )
