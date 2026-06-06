"""验证 GraphAnalytics 工具输入格式一致性：edge.source/edge.target 必须能匹配 node.id。"""

import pytest
from dra_ma.tools.graph_analytics_tools import GraphAnalyticsTool
from dra_ma.tools.community_discovery_tools import CommunityDiscoveryTool


def test_minimal_risk_subgraph():
    """最小风险子图：2 个公司节点 + 1 条投资边。"""
    nodes = [
        {"id": "a", "name": "鑫达投资管理有限公司", "type": "COMPANY"},
        {"id": "b", "name": "华创地产股份有限公司", "type": "COMPANY"},
    ]
    edges = [
        {"source": "a", "target": "b", "relation": "INVEST"},
    ]

    tool = GraphAnalyticsTool()

    entity_stats = tool.compute_entity_stats(nodes)
    assert entity_stats["total_entities"] == 2

    relation_stats = tool.compute_relation_stats(edges)
    assert relation_stats["total_relations"] == 1

    risk_paths = tool.enumerate_candidate_risk_paths(nodes, edges)
    assert len(risk_paths) >= 1

    metrics = tool.compute_graph_metrics(nodes, edges)
    assert metrics["node_count"] == 2
    assert metrics["edge_count"] == 1


def test_community_detection_minimal():
    """最小社区检测：2 个节点应归入同一 WCC 社区。"""
    nodes = [
        {"id": "a", "name": "鑫达投资管理有限公司", "type": "COMPANY"},
        {"id": "b", "name": "华创地产股份有限公司", "type": "COMPANY"},
    ]
    edges = [
        {"source": "a", "target": "b", "relation": "INVEST"},
    ]

    comm_tool = CommunityDiscoveryTool()
    community_result = comm_tool.detect_communities(nodes, edges, method="wcc")
    assert len(community_result["communities"]) >= 1


def test_node_edge_id_mismatch_graceful():
    """node.id 与 edge.source 不一致时不应崩溃，降级返回空路径。"""
    nodes = [
        {"id": "node-1", "name": "实体A", "type": "COMPANY"},
    ]
    edges = [
        {"source": "unknown-id", "target": "node-1", "relation": "INVEST"},
    ]

    tool = GraphAnalyticsTool()
    risk_paths = tool.enumerate_candidate_risk_paths(nodes, edges)
    # 应优雅降级（空列表或仅含匹配节点的路径），不抛异常
    assert isinstance(risk_paths, list)


def test_empty_input():
    """空 nodes/edges 不应崩溃。"""
    tool = GraphAnalyticsTool()

    entity_stats = tool.compute_entity_stats([])
    assert entity_stats["total_entities"] == 0

    metrics = tool.compute_graph_metrics([], [])
    assert metrics["node_count"] == 0

    risk_paths = tool.enumerate_candidate_risk_paths([], [])
    assert risk_paths == []
