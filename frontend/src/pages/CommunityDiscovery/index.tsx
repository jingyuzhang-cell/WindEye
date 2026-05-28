import {
  ApartmentOutlined,
} from '@ant-design/icons';
import {
  App,
  Descriptions,
  Drawer,
  Empty,
  Tag,
  Typography,
} from 'antd';
import React, { useState, useCallback, useRef } from 'react';
import { GENERAL_CONFIG } from '../graphConfig';
import {
  discoverCommunities,
  compareAlgorithms,
  getCommunityGraph,
  type Community,
  type CompareResult,
  type DiscoverParams,
  type DiscoveryResult,
  type GraphData,
} from './service';
import { useCommunityGraph } from './hooks/useCommunityGraph';
import TopControlBar from './components/TopControlBar';
import RightPanel from './components/RightPanel';
import ComparisonView from './components/ComparisonView';

const { Title } = Typography;

const CommunityDiscoveryPage: React.FC = () => {
  const { message } = App.useApp();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [fullGraphData, setFullGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [graphLoading, setGraphLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [discoverParams, setDiscoverParams] = useState<DiscoverParams | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState('list');
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const graphContainerRef = useRef<HTMLDivElement>(null);

  // ── Load merged graph from top N communities (parallel) ──
  const loadFullGraph = useCallback(async (data: DiscoveryResult, layer: string) => {
    setGraphLoading(true);
    try {
      const topCommunities = data.communities.slice(0, 10);
      const results = await Promise.all(
        topCommunities.map((c) =>
          getCommunityGraph(c.community_id, layer, 500).catch(() => null)
        )
      );

      const allNodes: any[] = [];
      const allEdges: any[] = [];
      const nodeSeen = new Set<string>();

      results.forEach((g, idx) => {
        if (!g) return;
        const communityId = topCommunities[idx].community_id;
        for (const n of g.nodes || []) {
          const key = String(n.id);
          if (!nodeSeen.has(key)) {
            nodeSeen.add(key);
            (n as any)._communityId = communityId;
            allNodes.push(n);
          }
        }
        for (const e of g.edges || []) {
          allEdges.push(e);
        }
      });

      setFullGraphData({ nodes: allNodes, edges: allEdges });
    } catch {
      message.error('加载全图失败');
    } finally {
      setGraphLoading(false);
    }
  }, []);

  // ── Graph hook for the immersive main view ──
  const { downloadImage, centerOnCommunity } = useCommunityGraph(graphContainerRef, {
    graphData: fullGraphData,
    selectedCommunityId: selectedCommunity?.community_id ?? null,
    onNodeClick: (model) => {
      setSelectedNode(model);
      setDrawerVisible(true);
    },
    onCommunityClick: (communityId) => {
      const comm = result?.communities.find((c) => c.community_id === communityId);
      if (comm) handleSelectCommunity(comm);
    },
  });

  // ── Handlers ──

  const handleDiscover = useCallback(async (params: DiscoverParams) => {
    setDiscoverParams(params);
    setLoading(true);
    setSelectedCommunity(null);
    setGraphData({ nodes: [], edges: [] });
    setFullGraphData({ nodes: [], edges: [] });
    setCompareResult(null);
    try {
      const data = await discoverCommunities(params);
      if (data.success) {
        setResult(data);
        message.success(`发现 ${data.communities_count} 个群体`);
        await loadFullGraph(data, params.layer || 'all');
      } else {
        message.error((data as any).error || '群体发现失败');
      }
    } catch {
      message.error('服务连接失败');
    } finally {
      setLoading(false);
    }
  }, [loadFullGraph]);

  const handleCompare = useCallback(async (params: Omit<DiscoverParams, 'method'>) => {
    setDiscoverParams({ ...params, method: 'compare' });
    setCompareLoading(true);
    setResult(null);
    setSelectedCommunity(null);
    setGraphData({ nodes: [], edges: [] });
    setFullGraphData({ nodes: [], edges: [] });
    try {
      const data = await compareAlgorithms(params);
      if (data.results && data.results.length > 0) {
        setCompareResult(data);
        message.success(`对比完成: ${data.results.length} 种算法`);
      } else {
        message.warning('对比无结果');
      }
    } catch {
      message.error('对比请求失败');
    } finally {
      setCompareLoading(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    setResult(null);
    setSelectedCommunity(null);
    setGraphData({ nodes: [], edges: [] });
    setFullGraphData({ nodes: [], edges: [] });
    setDiscoverParams(null);
    setRightPanelTab('list');
    setCompareResult(null);
  }, []);

  const handleSelectCommunity = useCallback(
    async (community: Community) => {
      setSelectedCommunity(community);
      setRightPanelTab('detail');
      centerOnCommunity(community.community_id);
      setGraphLoading(true);
      try {
        const layer = discoverParams?.layer || 'all';
        const data = await getCommunityGraph(community.community_id, layer);
        setGraphData({
          nodes: data.nodes || [],
          edges: data.edges || [],
        });
      } catch {
        message.error('加载子图失败');
      } finally {
        setGraphLoading(false);
      }
    },
    [discoverParams, centerOnCommunity],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedCommunity(null);
    setGraphData({ nodes: [], edges: [] });
    setRightPanelTab('list');
  }, []);

  const handleExportCSV = useCallback(() => {
    if (!selectedCommunity || graphData.nodes.length === 0) {
      message.warning('请先选择一个群体');
      return;
    }
    const nodeRows = graphData.nodes.map((n: any) => {
      const name = n.properties?.name || n.properties?.title || n.properties?.COMPANY_NM || '';
      const type = (n.labels || [])[0] || 'Unknown';
      return `${n.id},${name},${type}`;
    });
    const edgeRows = graphData.edges.map(
      (e: any) => `${e.source},${e.target},${e.label || ''}`,
    );
    const csv =
      'id,name,type\n' +
      nodeRows.join('\n') +
      '\n\nsource,target,label\n' +
      edgeRows.join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `community-${selectedCommunity.community_id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    message.success('CSV 导出成功');
  }, [selectedCommunity, graphData]);

  const handleExportPNG = useCallback(() => {
    if (fullGraphData.nodes.length === 0) {
      message.warning('暂无图数据可导出');
      return;
    }
    downloadImage();
    message.success('PNG 导出已触发');
  }, [fullGraphData.nodes.length, downloadImage]);

  const handleViewFullGraph = useCallback(() => {
    if (fullGraphData.nodes.length > 0 && selectedCommunity) {
      centerOnCommunity(selectedCommunity.community_id);
      message.info('已定位到当前群体');
    }
  }, [fullGraphData.nodes.length, selectedCommunity, centerOnCommunity]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f6f8' }}>
      {/* ── Header bar: title + controls ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <Title level={5} style={{ margin: 0 }}>
          <ApartmentOutlined style={{ marginRight: 8 }} />
          群体发现
        </Title>
        <TopControlBar
          loading={loading || compareLoading}
          onDiscover={handleDiscover}
          onCompare={handleCompare}
          onReset={handleReset}
        />
      </div>

      {/* ── Main area: Graph (flex) + Right Panel (320px) ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── Left: Immersive Graph ── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            position: 'relative',
            background: '#f9fafb',
          }}
        >
          {compareResult ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                overflow: 'auto',
                padding: 16,
              }}
            >
              <ComparisonView results={compareResult.results} />
              <div style={{ marginTop: 16 }}>
                <Empty
                  description={
                    compareLoading
                      ? '正在对比分析...'
                      : '对比完成 — 请选择一个社区查看详情'
                  }
                />
              </div>
            </div>
          ) : fullGraphData.nodes.length > 0 ? (
            <div
              ref={graphContainerRef}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Empty
                description={
                  loading
                    ? '正在分析图谱结构...'
                    : '选择算法，点击 ▶ 开始群体发现'
                }
              />
            </div>
          )}

          {/* Graph loading overlay */}
          {graphLoading && fullGraphData.nodes.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(255,255,255,0.9)',
                padding: '4px 12px',
                borderRadius: 12,
                fontSize: 12,
                color: '#999',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              }}
            >
              加载子图数据...
            </div>
          )}
        </div>

        {/* ── Right: Floating Panel 320px ── */}
        <div
          style={{
            width: 340,
            flexShrink: 0,
            padding: '8px 12px 8px 0',
            background: '#f5f6f8',
          }}
        >
          <RightPanel
            result={result}
            selectedCommunity={selectedCommunity}
            graphData={graphData}
            graphLoading={graphLoading}
            activeTab={rightPanelTab}
            onTabChange={setRightPanelTab}
            onSelectCommunity={handleSelectCommunity}
            onClearSelection={handleClearSelection}
            onNodeClick={(node) => {
              setSelectedNode(node);
              setDrawerVisible(true);
            }}
            onExportCSV={handleExportCSV}
            onExportPNG={handleExportPNG}
            onViewFullGraph={handleViewFullGraph}
          />
        </div>
      </div>

      {/* ── Node detail drawer ── */}
      <Drawer
        title="节点详情"
        width={400}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
      >
        {selectedNode ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  backgroundColor: selectedNode.style?.fill || '#BFBFBF',
                  margin: '0 auto 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 22,
                  fontWeight: 'bold',
                }}
              >
                {selectedNode.fullLabel?.[0] || '?'}
              </div>
              <Title level={5} style={{ margin: 0 }}>
                {selectedNode.fullLabel || selectedNode.label}
              </Title>
              <Tag color={selectedNode.style?.fill}>{selectedNode.typeKey || 'Unknown'}</Tag>
            </div>
            <Descriptions column={1} bordered size="small">
              {Object.entries(selectedNode.properties || {}).map(([key, val]) => {
                if (val === null || val === undefined) return null;
                const label = GENERAL_CONFIG.propertyMap?.[key]?.label || key;
                return (
                  <Descriptions.Item label={label} key={key}>
                    {String(val).length > 100
                      ? String(val).substring(0, 100) + '...'
                      : String(val)}
                  </Descriptions.Item>
                );
              })}
            </Descriptions>
          </>
        ) : (
          <Empty />
        )}
      </Drawer>
    </div>
  );
};

export default CommunityDiscoveryPage;
