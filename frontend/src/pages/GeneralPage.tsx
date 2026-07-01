import {
  AimOutlined,
  ClearOutlined,
  FileExcelOutlined,
  NodeIndexOutlined,
  PictureOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popover,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
} from 'antd';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GraphLayoutMode,
  GraphLayoutSelection,
  GraphFilterState,
  GraphViewMode,
  KGEdge,
  KGNode,
} from '@/types/knowledgeGraph';
import { LAYER_ORDER } from '@/utils/knowledgeGraph';
import FourLayerGraph, {
  type FourLayerGraphHandle,
} from './KnowledgeGraph/components/FourLayerGraph';
import GraphSkeleton from './KnowledgeGraph/components/GraphSkeleton';
import GraphDetailDrawer from './KnowledgeGraph/components/GraphDetailDrawer';
import ResultStatsBar from './KnowledgeGraph/components/ResultStatsBar';
import { useKnowledgeGraph } from './KnowledgeGraph/hooks/useKnowledgeGraph';
import { filterGraphByMultiLayerTypes } from './KnowledgeGraph/utils/graphFilter';
import {
  filterToCenterNeighbors,
  hideLowDegreeNodes,
} from './KnowledgeGraph/utils/graphTransform';
import {
  LAYER_COLORS,
  resolveLayoutForViewMode,
  PERF_THRESHOLDS,
} from './KnowledgeGraph/config/visualTheme';
import {
  computeCurrentResultStats,
  computeTypeCountsByLayer,
} from './KnowledgeGraph/utils/graphStats';
import {
  buildAggregateGraph,
  buildCoreGraph,
} from './KnowledgeGraph/utils/aggregateGraph';
type LayerCode = 'Subject' | 'Event' | 'Feature' | 'Regulation';

interface LayerStatistics {
  layer: string;
  layer_code: LayerCode;
  node_count: number;
  node_type_count: number;
  node_types: string[];
  node_type_counts: Record<string, number>;
  rel_count: number;
  rel_type_count: number;
  rel_types: string[];
  rel_type_counts: Record<string, number>;
  cross_layer_rels?: Record<string, number>;
}

interface GlobalStatistics {
  total_nodes: number;
  total_relationships: number;
  classified_nodes?: number;
  unclassified_nodes?: number;
  layers: LayerStatistics[];
}

/**
 * 四层元数据（颜色来自 visualTheme，背景色为页面卡片使用的高亮色）
 */
const LAYER_META: Record<LayerCode, { label: string; color: string; background: string }> = {
  Subject: { label: LAYER_COLORS.Subject.label, color: LAYER_COLORS.Subject.color, background: '#e6f4ff' },
  Event: { label: LAYER_COLORS.Event.label, color: LAYER_COLORS.Event.color, background: '#fff7e6' },
  Feature: { label: LAYER_COLORS.Feature.label, color: LAYER_COLORS.Feature.color, background: '#fff1f0' },
  Regulation: { label: LAYER_COLORS.Regulation.label, color: LAYER_COLORS.Regulation.color, background: '#f6ffed' },
};

const LAYOUT_OPTIONS: Array<{ value: GraphLayoutSelection; label: string }> = [
  { value: 'auto', label: '自动布局' },
  { value: 'neo4j-force', label: '弹性布局' },
  { value: 'free-force', label: '自由力导向' },
  { value: 'semantic-force', label: '语义分布' },
  { value: 'radial', label: '中心放射' },
  { value: 'cascade', label: '层级级联' },
  { value: 'aggregate', label: '类型聚合' },
  { value: 'community', label: '社区聚类' },
];

const VIEW_OPTIONS: Array<{ value: GraphViewMode; label: string }> = [
  { value: 'core', label: '核心视图' },
  { value: 'semantic', label: '全体视图' },
];

const EMPTY_TYPES_BY_LAYER: Record<LayerCode, string[]> = {
  Subject: [],
  Event: [],
  Feature: [],
  Regulation: [],
};

const DEFAULT_FILTER_STATE: GraphFilterState = {
  selectedLayers: [],
  selectedNodeTypesByLayer: { ...EMPTY_TYPES_BY_LAYER },
  selectedEdgeTypesByLayer: { ...EMPTY_TYPES_BY_LAYER },
  selectedEdgeTypes: [],
  filterMode: 'highlight',
};

const CountBlock: React.FC<{
  title: string;
  value: number;
  align?: 'left' | 'center';
  size?: number;
}> = ({ title, value, align = 'center', size = 23 }) => (
  <div style={{ textAlign: align, minWidth: 92 }}>
    <div style={{ color: 'rgba(0,0,0,0.58)', fontSize: 13, marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: size, lineHeight: '32px', fontWeight: 650 }}>
      {value.toLocaleString()}
    </div>
  </div>
);

const StatisticsScope: React.FC<{
  title: string;
  nodeCount: number;
  edgeCount: number;
  description: React.ReactNode;
  accent?: string;
  tag?: React.ReactNode;
}> = ({ title, nodeCount, edgeCount, description, accent = '#1677ff', tag }) => (
  <div style={{
    height: '100%',
    minHeight: 142,
    padding: '18px 20px',
    border: '1px solid #f0f0f0',
    borderTop: `3px solid ${accent}`,
    borderRadius: 8,
    background: '#fff',
  }}>
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 14,
    }}>
      <span style={{ fontWeight: 600, fontSize: 15 }}>{title}</span>
      {tag}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 32 }}>
      <CountBlock title="节点" value={nodeCount} align="left" size={24} />
      <CountBlock title="关系" value={edgeCount} align="left" size={24} />
    </div>
    <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 12, minHeight: 18 }}>
      {description}
    </div>
  </div>
);

const TypeList: React.FC<{
  counts: Record<string, number>;
  currentCounts: Record<string, number>;
  selected: string[];
  accent: string;
  unit: '节点' | '关系';
  onToggle: (type: string) => void;
  onClear: () => void;
}> = ({ counts, currentCounts, selected, accent, unit, onToggle, onClear }) => {
  const entries = Object.entries(counts).sort((left, right) => right[1] - left[1]);

  return (
    <div style={{
      width: 320,
      maxWidth: 'calc(100vw - 72px)',
      maxHeight: 280,
      overflowY: 'auto',
    }}>
      {entries.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无类型数据" />
      ) : (
        <>
          <Button
            type={selected.length === 0 ? 'primary' : 'default'}
            block
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
            style={{
              height: 32,
              marginBottom: 4,
              ...(selected.length === 0 ? { background: accent, borderColor: accent } : {}),
            }}
          >
            不限制{unit}类型
          </Button>
          {entries.map(([type, count]) => {
            const checked = selected.includes(type);
            const current = currentCounts[type] || 0;
            return (
              <div
                key={type}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(type);
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 44,
                  padding: '5px 8px',
                  marginBottom: 2,
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: checked ? `${accent}12` : 'transparent',
                  border: checked ? `1px solid ${accent}55` : '1px solid transparent',
                }}
              >
                <Checkbox checked={checked} />
                <span style={{ minWidth: 0 }}>
                  <span style={{
                    display: 'block',
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontWeight: checked ? 600 : 400,
                    color: checked ? accent : undefined,
                  }}>
                    {type}
                  </span>
                  <span style={{ display: 'block', color: '#8c8c8c', fontSize: 11 }}>
                    全库 {count.toLocaleString()}｜当前 {current.toLocaleString()}
                  </span>
                </span>
                <span style={{ color: current > 0 ? '#595959' : '#bfbfbf', fontSize: 12 }}>
                  {current}
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};

const GeneralPage: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const graphRef = useRef<FourLayerGraphHandle>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStatistics | null>(null);
  const [selectedNode, setSelectedNode] = useState<KGNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<KGEdge | null>(null);
  const [filterState, setFilterState] = useState<GraphFilterState>(DEFAULT_FILTER_STATE);
  const [openTypePopover, setOpenTypePopover] = useState<string | null>(null);
  const [layoutSelection, setLayoutSelection] = useState<GraphLayoutSelection>('auto');
  const [viewMode, setViewMode] = useState<GraphViewMode>('core');
  const [expandedAggregateGroups, setExpandedAggregateGroups] = useState<Set<string>>(new Set());
  const [centerOverrideId, setCenterOverrideId] = useState<string>();
  const [onlyCenterNeighbors, setOnlyCenterNeighbors] = useState(false);
  const [hideIsolated, setHideIsolated] = useState(false);

  const {
    nodes,
    edges,
    matchedNodes,
    triples,
    summary,
    warnings,
    traceId,
    graphError,
    loading,
    initialized,
    setGraphError,
    loadInitialGraph,
    search,
    subjectTraverse,
    expand,
    clear,
  } = useKnowledgeGraph();

  const loadGlobalStatistics = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/graph/summary-stats');
      const data = await response.json();
      if (!response.ok || data?.error) {
        throw new Error(data?.error || '全库统计加载失败');
      }
      setGlobalStats(data);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '全库统计加载失败');
    }
  }, [message]);

  useEffect(() => {
    void loadGlobalStatistics();
  }, [loadGlobalStatistics]);

  const currentTypeCounts = useMemo(
    () => computeTypeCountsByLayer(nodes, edges),
    [nodes, edges],
  );

  const multiLayerFilter = useMemo(
    () => filterGraphByMultiLayerTypes(
      nodes,
      edges,
      filterState.selectedNodeTypesByLayer,
      filterState.selectedEdgeTypes,
      filterState.filterMode,
      filterState.selectedLayers,
    ),
    [nodes, edges, filterState],
  );

  const visibleGraph = useMemo(() => ({
    nodes: multiLayerFilter.visibleNodes,
    edges: multiLayerFilter.visibleEdges,
  }), [multiLayerFilter]);

  const centerNodeId = useMemo(
    () => centerOverrideId
      || summary.centerNodeId
      || nodes.find(node => node.isCenter)?.id
      || nodes.find(node => node.isMatched)?.id,
    [centerOverrideId, summary.centerNodeId, nodes],
  );

  const displayGraph = useMemo(() => {
    let result = visibleGraph;
    // 核心视图：使用 buildCoreGraph 提取关键子图
    if (viewMode === 'core') {
      const coreGraph = buildCoreGraph(result.nodes, result.edges, centerNodeId, 150);
      return { nodes: coreGraph.nodes, edges: coreGraph.edges, limited: false, foldedNodeCount: 0 };
    }
    // 聚合视图：类型分组聚合（高级模式）
    if (viewMode === 'aggregate') {
      if (onlyCenterNeighbors) {
        result = filterToCenterNeighbors(result.nodes, result.edges, centerNodeId);
      }
      const aggregate = buildAggregateGraph(
        result.nodes,
        result.edges,
        expandedAggregateGroups,
        20,
      );
      return { ...aggregate, limited: aggregate.foldedNodeCount > 0 };
    }
    if (onlyCenterNeighbors) {
      result = filterToCenterNeighbors(result.nodes, result.edges, centerNodeId);
    }
    if (hideIsolated) {
      result = hideLowDegreeNodes(result.nodes, result.edges, 1);
    }
    return { ...result, limited: false, foldedNodeCount: 0 };
  }, [
    visibleGraph,
    onlyCenterNeighbors,
    hideIsolated,
    centerNodeId,
    viewMode,
    expandedAggregateGroups,
  ]);

  const currentResultStats = useMemo(
    () => computeCurrentResultStats(displayGraph.nodes, displayGraph.edges),
    [displayGraph.nodes, displayGraph.edges],
  );

  /** 性能保护：全体视图保留完整节点/关系，仅提示用户注意规模。 */
  useEffect(() => {
    if (viewMode === 'semantic' && visibleGraph.nodes.length > PERF_THRESHOLDS.WARN_LARGE_GRAPH) {
      message.warning(
        `当前全体视图展示 ${visibleGraph.nodes.length.toLocaleString()} 个节点，已采用紧凑布局；必要时可切换核心视图查看主干`,
      );
    }
  }, [visibleGraph.nodes.length, viewMode, message]);

  /** 节点数超过阈值时隐藏普通节点标签 */
  const autoHideLabels = displayGraph.nodes.length > PERF_THRESHOLDS.HIDE_LABELS;

  const resolvedLayoutMode: GraphLayoutMode = useMemo(
    () => {
      if (layoutSelection !== 'auto') return layoutSelection;
      return resolveLayoutForViewMode(viewMode);
    },
    [layoutSelection, viewMode],
  );

  /** 高亮节点到中心节点的关联路径 */
  const [, setPathHighlightNodeId] = useState<string | null>(null);

  const handleHighlightPath = useCallback((node: KGNode) => {
    if (!centerNodeId || node.id === centerNodeId) {
      message.warning('需要先有中心节点，且目标节点不能是中心节点');
      return;
    }
    // BFS 找最短路径
    const adj = new Map<string, string[]>();
    displayGraph.nodes.forEach((n) => {
      adj.set(n.id, []);
    });
    displayGraph.edges.forEach(e => {
      adj.get(e.source)?.push(e.target);
      adj.get(e.target)?.push(e.source);
    });
    const visited = new Set<string>([centerNodeId]);
    const parent = new Map<string, string>();
    const queue = [centerNodeId];
    while (queue.length) {
      const cur = queue.shift();
      if (!cur) break;
      if (cur === node.id) break;
      (adj.get(cur) || []).forEach(nb => {
        if (!visited.has(nb)) { visited.add(nb); parent.set(nb, cur); queue.push(nb); }
      });
    }
    if (!visited.has(node.id)) {
      message.info('当前子图中未找到从中心节点到该节点的路径');
      return;
    }
    setPathHighlightNodeId(node.id);
    message.success('路径已高亮');
  }, [centerNodeId, displayGraph.nodes, displayGraph.edges, message]);

  const handleSearch = useCallback(async (values: any) => {
    const keyword = String(values.keyword || '').trim();
    if (!keyword) {
      message.info('请输入关键词后搜索；刷新按钮可恢复默认子图');
      return;
    }
    const depth = values.depth || 2;
    const limit = values.limit || 5000;
    const layerWhitelist = values.layerWhitelist || [...LAYER_ORDER];
    try {
      // 统一搜索：优先主体穿透，无结果时 fallback 到全文检索
      let response: { nodes?: any[] };
      try {
        response = await subjectTraverse({
          subject: keyword,
          depth,
          nodeLimit: limit,
          edgeLimit: Math.min(limit * 4, 20000),
          layerWhitelist,
          relationWhitelist: [],
          includeProperties: true,
        });
        message.success(`搜索完成：${response.nodes?.length || 0} 个节点`);
      } catch {
        // subjectTraverse 失败或返回 NO_MATCHED_SUBJECT，fallback 到 searchAll
        response = await search({
          query: keyword,
          layer: 'all',
          depth,
          limit,
          layerWhitelist,
          relationWhitelist: [],
          includeProperties: true,
          outputFormat: 'subgraph',
          deduplicate: true,
          responseMode: 'full',
          traversalMode: 'cascade',
        });
        message.success(`全文检索完成：${response.nodes?.length || 0} 个节点`);
      }
      setFilterState(DEFAULT_FILTER_STATE);
      setViewMode('semantic');
      setExpandedAggregateGroups(new Set());
      setCenterOverrideId(undefined);
      setSelectedEdge(null);
      setOpenTypePopover(null);
    } catch {
      // Hook 已写入 graphError。
    }
  }, [message, subjectTraverse, search]);

  // Hub expand confirmation state
  const [pendingHubNode, setPendingHubNode] = useState<KGNode | null>(null);

  const handleExpand = useCallback(async (node: KGNode, forceExpandHub = false, maxFanout = 100) => {
    // Hub node: show confirmation first unless forceExpandHub
    if (node.isHub && !forceExpandHub) {
      setPendingHubNode(node);
      return;
    }
    const values = form.getFieldsValue();
    try {
      await expand(node.id, {
        depth: values.depth || 1,
        limit: 300,
        relationWhitelist: [],
        layerWhitelist: values.layerWhitelist || [...LAYER_ORDER],
        includeCrossLayer: true,
        includeProperties: true,
        forceExpandHub,
        maxFanout,
      });
      const msg = forceExpandHub
        ? `已强制展开”${node.name}”的前 ${maxFanout} 个邻居`
        : `已展开”${node.name}”的关联子图`;
      message.success(msg);
    } catch {
      // Hook 已写入 graphError。
    }
  }, [expand, form, message]);

  const handleRefresh = useCallback(async () => {
    setFilterState(DEFAULT_FILTER_STATE);
    setOpenTypePopover(null);
    setSelectedNode(null);
    setSelectedEdge(null);
    setCenterOverrideId(undefined);
    setExpandedAggregateGroups(new Set());
    setViewMode('semantic');
    await Promise.all([loadInitialGraph(), loadGlobalStatistics()]);
  }, [loadInitialGraph, loadGlobalStatistics]);

  const handleClear = useCallback(() => {
    form.resetFields();
    clear();
    setFilterState(DEFAULT_FILTER_STATE);
    setOpenTypePopover(null);
    setSelectedNode(null);
    setSelectedEdge(null);
    setCenterOverrideId(undefined);
    setExpandedAggregateGroups(new Set());
    setViewMode('semantic');
  }, [clear, form]);

  const toggleAggregateGroup = useCallback((node: KGNode) => {
    if (!node.isAggregate || !node.aggregateKey) return false;
    const aggregateKey = node.aggregateKey;
    setExpandedAggregateGroups((current) => {
      const next = new Set(current);
      if (next.has(aggregateKey)) next.delete(aggregateKey);
      else next.add(aggregateKey);
      return next;
    });
    return true;
  }, []);

  const handleGraphNodeClick = useCallback((node: KGNode) => {
    if (toggleAggregateGroup(node)) return;
    setSelectedEdge(null);
    setSelectedNode(node);
  }, [toggleAggregateGroup]);

  const handleGraphNodeDoubleClick = useCallback((node: KGNode) => {
    if (toggleAggregateGroup(node)) return;
    void handleExpand(node);
  }, [handleExpand, toggleAggregateGroup]);

  const handleGraphEdgeClick = useCallback((edge: KGEdge) => {
    setSelectedNode(null);
    setSelectedEdge(edge);
  }, []);

  const exportCSV = useCallback(() => {
    const rows = [
      ['口径', '指标', '数量'],
      ['全库', '节点', globalStats?.total_nodes || 0],
      ['全库', '关系', globalStats?.total_relationships || 0],
      ['当前子图', '节点', nodes.length],
      ['当前子图', '关系', edges.length],
    ];
    const csv = `\uFEFF${rows.map(row => row.join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `knowledge-graph-stats-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [globalStats, nodes.length, edges.length]);

  const toggleLayer = (layer: LayerCode) => {
    setOpenTypePopover(null);
    setFilterState(current => ({
      ...current,
      selectedLayers: current.selectedLayers.includes(layer)
        ? current.selectedLayers.filter(item => item !== layer)
        : [...current.selectedLayers, layer],
    }));
  };

  const toggleNodeType = (layer: LayerCode, type: string) => {
    const currentCount = currentTypeCounts[layer].nodeTypes[type] || 0;
    setFilterState(current => {
      const selected = current.selectedNodeTypesByLayer[layer];
      return {
        ...current,
        selectedNodeTypesByLayer: {
          ...current.selectedNodeTypesByLayer,
          [layer]: selected.includes(type)
            ? selected.filter(item => item !== type)
            : [...selected, type],
        },
      };
    });
    if (currentCount === 0) {
      message.info('当前子图中暂无该类型节点，可提高穿透深度或输入该类型关键词进行检索');
    }
  };

  const toggleEdgeType = (layer: LayerCode, type: string) => {
    setFilterState(current => {
      const selectedByLayer = current.selectedEdgeTypesByLayer[layer];
      const nextByLayer = {
        ...current.selectedEdgeTypesByLayer,
        [layer]: selectedByLayer.includes(type)
          ? selectedByLayer.filter(item => item !== type)
          : [...selectedByLayer, type],
      };
      return {
        ...current,
        selectedEdgeTypesByLayer: nextByLayer,
        selectedEdgeTypes: [...new Set(Object.values(nextByLayer).flat())],
      };
    });
  };

  const toggleGlobalEdgeType = (type: string) => {
    setFilterState(current => {
      const selected = current.selectedEdgeTypes.includes(type);
      const touchedLayers = (Object.keys(currentResultStats.edgeTypeCountsByLayer) as LayerCode[])
        .filter(layer => currentResultStats.edgeTypeCountsByLayer[layer]?.[type] > 0);
      const targetLayers = touchedLayers.length > 0 ? touchedLayers : [...LAYER_ORDER];
      const nextByLayer = { ...current.selectedEdgeTypesByLayer };

      targetLayers.forEach((layer) => {
        const layerTypes = nextByLayer[layer] || [];
        nextByLayer[layer] = selected
          ? layerTypes.filter(item => item !== type)
          : [...new Set([...layerTypes, type])];
      });

      return {
        ...current,
        selectedEdgeTypesByLayer: nextByLayer,
        selectedEdgeTypes: [...new Set(Object.values(nextByLayer).flat())],
      };
    });
  };

  const clearNodeTypeFilters = () => {
    setFilterState(current => ({
      ...current,
      selectedNodeTypesByLayer: { ...EMPTY_TYPES_BY_LAYER },
    }));
  };

  const clearEdgeTypeFilters = () => {
    setFilterState(current => ({
      ...current,
      selectedEdgeTypesByLayer: { ...EMPTY_TYPES_BY_LAYER },
      selectedEdgeTypes: [],
    }));
  };

  const clearTypeFilters = () => {
    setOpenTypePopover(null);
    setFilterState(DEFAULT_FILTER_STATE);
  };

  const hasTypeFilters = filterState.selectedLayers.length > 0
    || filterState.selectedEdgeTypes.length > 0
    || Object.values(filterState.selectedNodeTypesByLayer).some(types => types.length > 0);

  return (
    <PageContainer title="四层知识图谱检索">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card
          title="统计概览"
          styles={{ body: { padding: '20px 24px' } }}
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <StatisticsScope
                title="全库规模"
                nodeCount={globalStats?.total_nodes || 0}
                edgeCount={globalStats?.total_relationships || 0}
                accent="#595959"
                tag={<Tag>数据库</Tag>}
                description={(
                  <>
                    四层已归类 {(globalStats?.classified_nodes || 0).toLocaleString()} 个节点
                    {(globalStats?.unclassified_nodes || 0) > 0
                      ? `，未归类 ${(globalStats?.unclassified_nodes || 0).toLocaleString()} 个`
                      : ''}
                  </>
                )}
              />
            </Col>
            <Col xs={24} lg={12}>
              <StatisticsScope
                title="当前子图"
                nodeCount={displayGraph.nodes.length}
                edgeCount={displayGraph.edges.length}
                accent="#1677ff"
                tag={<Tag color="blue">搜索 / 展开结果</Tag>}
                description={displayGraph.limited
                  ? `聚合展示 ${displayGraph.nodes.length} 个类型组/展开节点`
                  : '与当前图谱展示数据保持一致'}
              />
            </Col>
          </Row>
        </Card>

        <Row gutter={[12, 12]}>
          {(globalStats?.layers || []).map((layer) => {
            const meta = LAYER_META[layer.layer_code];
            const selectedNodeTypes = filterState.selectedNodeTypesByLayer[layer.layer_code];
            const selectedEdgeTypes = filterState.selectedEdgeTypesByLayer[layer.layer_code];
            const layerSelected = filterState.selectedLayers.includes(layer.layer_code);
            const active = layerSelected || selectedNodeTypes.length > 0 || selectedEdgeTypes.length > 0;
            return (
              <Col xs={24} sm={12} xl={6} key={layer.layer_code}>
                <Card
                  hoverable
                  onClick={() => toggleLayer(layer.layer_code)}
                  style={{
                    height: '100%',
                    borderColor: active ? meta.color : undefined,
                    background: active ? meta.background : '#fff',
                  }}
                  title={(
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: meta.color }}>{meta.label}</span>
                      {active && (
                        <Tag color={meta.color}>
                          {selectedNodeTypes.length + selectedEdgeTypes.length > 0
                            ? `已选 ${selectedNodeTypes.length + selectedEdgeTypes.length}`
                            : '层级高亮'}
                        </Tag>
                      )}
                    </div>
                  )}
                >
                  <Row gutter={[8, 12]}>
                    <Col span={12}><CountBlock title="节点总数" value={layer.node_count} /></Col>
                    <Col span={12}><CountBlock title="层内关系" value={layer.rel_count} /></Col>
                    <Col span={12}>
                      <Popover
                        trigger="click"
                        placement="bottomLeft"
                        overlayStyle={{ width: 360, maxWidth: 'calc(100vw - 32px)' }}
                        open={openTypePopover === `${layer.layer_code}:node`}
                        onOpenChange={open => setOpenTypePopover(
                          open ? `${layer.layer_code}:node` : null,
                        )}
                        title={`${meta.label}节点类型`}
                        content={(
                          <TypeList
                            counts={layer.node_type_counts || {}}
                            currentCounts={currentTypeCounts[layer.layer_code].nodeTypes}
                            selected={selectedNodeTypes}
                            accent={meta.color}
                            unit="节点"
                            onToggle={type => toggleNodeType(layer.layer_code, type)}
                            onClear={() => setFilterState(current => ({
                              ...current,
                              selectedNodeTypesByLayer: {
                                ...current.selectedNodeTypesByLayer,
                                [layer.layer_code]: [],
                              },
                            }))}
                          />
                        )}
                      >
                        <Tooltip title="查看该层数据组成，并可筛选或高亮对应类型节点。支持四层多选，用于观察跨层关联路径。">
                          <Button
                            block
                            type={selectedNodeTypes.length > 0 ? 'primary' : 'default'}
                            onClick={event => event.stopPropagation()}
                            style={selectedNodeTypes.length > 0
                              ? { background: meta.color, borderColor: meta.color }
                              : undefined}
                          >
                            节点类型 {layer.node_type_count}
                            {selectedNodeTypes.length > 0 ? ` · 已选${selectedNodeTypes.length}` : ''}
                          </Button>
                        </Tooltip>
                      </Popover>
                    </Col>
                    <Col span={12}>
                      <Popover
                        trigger="click"
                        placement="bottomLeft"
                        overlayStyle={{ width: 360, maxWidth: 'calc(100vw - 32px)' }}
                        open={openTypePopover === `${layer.layer_code}:edge`}
                        onOpenChange={open => setOpenTypePopover(
                          open ? `${layer.layer_code}:edge` : null,
                        )}
                        title={`${meta.label}关系类型`}
                        content={(
                          <TypeList
                            counts={layer.rel_type_counts || {}}
                            currentCounts={currentTypeCounts[layer.layer_code].edgeTypes}
                            selected={selectedEdgeTypes}
                            accent={meta.color}
                            unit="关系"
                            onToggle={type => toggleEdgeType(layer.layer_code, type)}
                            onClear={() => setFilterState(current => {
                              const nextByLayer = {
                                ...current.selectedEdgeTypesByLayer,
                                [layer.layer_code]: [],
                              };
                              return {
                                ...current,
                                selectedEdgeTypesByLayer: nextByLayer,
                                selectedEdgeTypes: [...new Set(Object.values(nextByLayer).flat())],
                              };
                            })}
                          />
                        )}
                      >
                        <Tooltip title="筛选或高亮指定关系，例如 INVEST、MENTION、COMPLIES_WITH，支持多选。">
                          <Button
                            block
                            type={selectedEdgeTypes.length > 0 ? 'primary' : 'default'}
                            onClick={event => event.stopPropagation()}
                            style={selectedEdgeTypes.length > 0
                              ? { background: meta.color, borderColor: meta.color }
                              : undefined}
                          >
                            关系类型 {layer.rel_type_count}
                            {selectedEdgeTypes.length > 0 ? ` · 已选${selectedEdgeTypes.length}` : ''}
                          </Button>
                        </Tooltip>
                      </Popover>
                    </Col>
                    {(selectedNodeTypes.length > 0 || selectedEdgeTypes.length > 0) && (
                      <Col span={24}>
                        <div style={{
                          display: 'flex',
                          gap: 6,
                          flexWrap: 'wrap',
                          padding: '10px 12px',
                          borderRadius: 6,
                          background: 'rgba(255,255,255,0.72)',
                          border: `1px solid ${meta.color}33`,
                        }}>
                          {selectedNodeTypes.map(type => (
                            <Tag key={`node-${type}`} color={meta.color}>节点 {type}</Tag>
                          ))}
                          {selectedEdgeTypes.map(type => (
                            <Tag key={`edge-${type}`} color="default">关系 {type}</Tag>
                          ))}
                        </div>
                      </Col>
                    )}
                  </Row>
                </Card>
              </Col>
            );
          })}
        </Row>

        <Card
          size="small"
          title="当前筛选条件"
          extra={(
            <Space>
              <span style={{ color: '#8c8c8c', fontSize: 12 }}>模式</span>
              <Select
                value={filterState.filterMode}
                style={{ width: 108 }}
                options={[
                  { value: 'highlight', label: '高亮模式' },
                  { value: 'filter', label: '过滤模式' },
                ]}
                onChange={filterMode => setFilterState(current => ({ ...current, filterMode }))}
              />
              <Button size="small" disabled={!hasTypeFilters} onClick={clearTypeFilters}>
                清空类型筛选
              </Button>
            </Space>
          )}
        >
          {!hasTypeFilters ? (
            <span style={{ color: '#8c8c8c' }}>
              暂未限制类型，默认保留完整四层结构。可通过层级卡片或图层按钮筛选节点类型。
            </span>
          ) : (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {(Object.keys(LAYER_META) as LayerCode[]).map((layer) => {
                const nodeTypes = filterState.selectedNodeTypesByLayer[layer];
                const edgeTypes = filterState.selectedEdgeTypesByLayer[layer];
                const selected = filterState.selectedLayers.includes(layer);
                if (!selected && nodeTypes.length === 0 && edgeTypes.length === 0) return null;
                return (
                  <div key={layer} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ width: 54, color: LAYER_META[layer].color, fontWeight: 600 }}>
                      {LAYER_META[layer].label}
                    </span>
                    {selected && (
                      <Tag
                        closable
                        color={LAYER_META[layer].color}
                        onClose={() => toggleLayer(layer)}
                      >
                        整层
                      </Tag>
                    )}
                    {nodeTypes.map(type => (
                      <Tag
                        key={`filter-node-${layer}-${type}`}
                        closable
                        color={LAYER_META[layer].color}
                        onClose={() => toggleNodeType(layer, type)}
                      >
                        {type}
                      </Tag>
                    ))}
                    {edgeTypes.map(type => (
                      <Tag
                        key={`filter-edge-${layer}-${type}`}
                        closable
                        onClose={() => toggleEdgeType(layer, type)}
                      >
                        关系 {type}
                      </Tag>
                    ))}
                  </div>
                );
              })}
            </Space>
          )}
        </Card>

        <Card>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSearch}
            initialValues={{
              depth: 2,
              limit: 5000,
              layerWhitelist: [...LAYER_ORDER],
            }}
          >
            <Row gutter={12} align="bottom">
              <Col xs={24} md={8} lg={6}>
                <Form.Item name="keyword" label="检索关键词" style={{ marginBottom: 0 }}>
                  <Input placeholder="输入企业、个人、基金等名称" allowClear />
                </Form.Item>
              </Col>
              <Col xs={12} md={4} lg={2}>
                <Form.Item name="depth" label="穿透深度" style={{ marginBottom: 0 }}>
                  <Select options={[1, 2, 3, 4, 5].map(value => ({ value, label: `${value}跳` }))} />
                </Form.Item>
              </Col>
              <Col xs={12} md={4} lg={2}>
                <Form.Item name="limit" label="返回上限" style={{ marginBottom: 0 }}>
                  <Select
                    options={[500, 1000, 2000, 5000].map(value => ({ value, label: value.toLocaleString() }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8} lg={6}>
                <Form.Item name="layerWhitelist" label="检索层级" style={{ marginBottom: 0 }}>
                  <Checkbox.Group
                    options={LAYER_ORDER.map(value => ({
                      value,
                      label: LAYER_META[value].label,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Space wrap style={{ marginTop: 2 }}>
                  <Tooltip title="搜索（统一使用增强版 POST 接口）">
                    <Button
                      data-testid="kg-search-button"
                      type="primary"
                      htmlType="submit"
                      icon={<SearchOutlined />}
                    >
                      搜索
                    </Button>
                  </Tooltip>
                  <Tooltip title="刷新默认子图"><Button icon={<ReloadOutlined />} onClick={() => void handleRefresh()} /></Tooltip>
                  <Tooltip title="清空"><Button icon={<ClearOutlined />} onClick={handleClear} /></Tooltip>
                  <Tooltip title="适应画布"><Button icon={<AimOutlined />} onClick={() => graphRef.current?.fitView()} /></Tooltip>
                  <Tooltip title="导出 PNG"><Button icon={<PictureOutlined />} onClick={() => graphRef.current?.exportPNG()} /></Tooltip>
                  <Tooltip title="导出 CSV"><Button icon={<FileExcelOutlined />} onClick={exportCSV} /></Tooltip>
                </Space>
              </Col>
            </Row>
          </Form>
        </Card>

        {warnings.length > 0 && (
          <Alert
            type={summary.truncated ? 'warning' : 'info'}
            showIcon
            message={
              summary.evidenceDiagnosis && !summary.evidenceDiagnosis.evidenceNodeFound
                ? '当前主体查询未命中事件层、特征层和法规层证据。系统已限制主体层扩散，但图谱数据中可能缺少主体到证据层的连接，请检查数据建模或标签映射。'
                : summary.subjectExpansionBlocked
                  ? '系统已阻止超级节点继续扩散到大量无关主体节点，并优先保留事件层、特征层和法规层证据。'
                  : summary.truncated
                    ? '当前结果达到返回上限，图谱可能不是完整子图。系统已优先保留中心主体和关键关联节点。'
                    : '查询提示'
            }
            description={warnings.join('；')}
          />
        )}
        {displayGraph.limited && (
          <Alert
            type="info"
            showIcon
            message="当前使用聚合视图"
            description={`接口返回 ${visibleGraph.nodes.length.toLocaleString()} 个节点，当前折叠 ${displayGraph.foldedNodeCount.toLocaleString()} 个节点；点击聚合节点可展开 Top 20。`}
          />
        )}
        {graphError && (
          <Alert
            type="error"
            showIcon
            message="图谱加载或渲染失败"
            description={graphError}
          />
        )}
        {traceId && (
          <div style={{ color: '#8c8c8c', fontSize: 12, textAlign: 'right' }}>
            Trace ID: {traceId} · 匹配节点 {matchedNodes.length} · 三元组 {triples.length}
          </div>
        )}

        <Card
          title={(
            <Space direction="vertical" size={6}>
              <Space>
              <NodeIndexOutlined />
              <span>主体驱动交互图谱</span>
              </Space>
              <ResultStatsBar
                stats={currentResultStats}
                selectedNodeTypesByLayer={filterState.selectedNodeTypesByLayer}
                selectedEdgeTypes={filterState.selectedEdgeTypes}
                onSelectNodeType={toggleNodeType}
                onSelectEdgeType={toggleGlobalEdgeType}
                onClearNodeTypes={clearNodeTypeFilters}
                onClearEdgeTypes={clearEdgeTypeFilters}
              />
            </Space>
          )}
          extra={(
            <Space wrap size={12}>
              <Select
                value={viewMode}
                options={VIEW_OPTIONS}
                onChange={(value) => {
                  setViewMode(value);
                  setExpandedAggregateGroups(new Set());
                }}
                style={{ width: 112 }}
              />
              <Select
                value={layoutSelection}
                options={LAYOUT_OPTIONS}
                onChange={value => setLayoutSelection(value)}
                style={{ width: 132 }}
              />
              <Tooltip title={centerNodeId ? '仅展示中心节点及其一跳邻居' : '当前没有中心节点'}>
                <Space size={5}>
                  <span style={{ fontSize: 12 }}>中心一跳</span>
                  <Switch
                    size="small"
                    checked={onlyCenterNeighbors}
                    disabled={!centerNodeId}
                    onChange={setOnlyCenterNeighbors}
                  />
                </Space>
              </Tooltip>
              <Space size={5}>
                <span style={{ fontSize: 12 }}>隐藏孤立点</span>
                <Switch size="small" checked={hideIsolated} onChange={setHideIsolated} />
              </Space>
              {layoutSelection !== 'auto' && (
                <Button size="small" onClick={() => setLayoutSelection('auto')}>
                  恢复自动布局
                </Button>
              )}
            </Space>
          )}
          styles={{ body: { padding: 0, minHeight: 620, position: 'relative' } }}
        >
          <GraphSkeleton visible={loading && !initialized} />
          {loading && initialized && (
            <div style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.72)',
            }}>
              <Spin size="large" />
            </div>
          )}
          {!loading && initialized && displayGraph.nodes.length === 0 ? (
            <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty
                description={
                  nodes.length > 0
                    ? '当前筛选条件下无节点，请取消层级、节点类型或关系类型筛选'
                    : '当前没有可展示的图谱数据，请输入关键词搜索或刷新默认子图'
                }
              />
            </div>
          ) : (
            <FourLayerGraph
              ref={graphRef}
              nodes={displayGraph.nodes}
              edges={displayGraph.edges}
              layoutMode={resolvedLayoutMode}
              centerNodeId={centerNodeId}
              omittedNodeCount={displayGraph.foldedNodeCount}
              highlightedNodeIds={multiLayerFilter.highlightedNodeIds}
              highlightedEdgeIds={multiLayerFilter.highlightedEdgeIds}
              selectedNodeId={selectedNode?.id}
              selectedEdgeId={selectedEdge?.id}
              hasActiveFilter={hasTypeFilters}
              filterMode={filterState.filterMode}
              loading={loading}
              onNodeClick={handleGraphNodeClick}
              hideLabels={autoHideLabels}
              onNodeDoubleClick={handleGraphNodeDoubleClick}
              onEdgeClick={handleGraphEdgeClick}
              onRenderError={setGraphError}
            />
          )}
        </Card>

        <div style={{ color: '#8c8c8c', fontSize: 12 }}>
          当前使用{LAYOUT_OPTIONS.find(option => option.value === resolvedLayoutMode)?.label || '自动'}图谱视图：节点根据真实关系在画布中自然分布，颜色表示四层语义，跨层连接节点优先使用圆形。
          {displayGraph.nodes.length} 节点 · {displayGraph.edges.length} 关系 · 视图
          {VIEW_OPTIONS.find(option => option.value === viewMode)?.label}
        </div>
      </Space>

      <GraphDetailDrawer
        selectedNode={selectedNode}
        selectedEdge={selectedEdge}
        displayNodeCount={displayGraph.nodes.length}
        displayEdgeCount={displayGraph.edges.length}
        viewMode={viewMode}
        layoutMode={resolvedLayoutMode}
        traceId={traceId}
        summary={summary}
        warnings={warnings}
        loading={loading}
        onClose={() => {
          setSelectedNode(null);
          setSelectedEdge(null);
        }}
        onExpand={handleExpand}
        onSetCenter={(node) => {
          setCenterOverrideId(node.id);
          setOnlyCenterNeighbors(false);
          setViewMode('semantic');
          setSelectedNode(null);
          message.success(`已将”${node.name}”设为当前中心`);
        }}
        onHighlightPath={handleHighlightPath}
      />

      <Modal
        title="超级节点展开确认"
        open={Boolean(pendingHubNode)}
        onCancel={() => setPendingHubNode(null)}
        footer={null}
        width={420}
      >
        {pendingHubNode && (
          <div>
            <p>
              节点 <strong>{pendingHubNode.name}</strong> 已连接
              <strong>{(pendingHubNode.hubDegree || 0).toLocaleString()}</strong> 个主体节点，
              系统已默认折叠其同层主体扩散，但保留事件、特征、法规证据。
            </p>
            <p style={{ color: '#8c8c8c', fontSize: 13 }}>
              是否强制加载部分主体邻居？
            </p>
            <Space style={{ marginTop: 12 }}>
              <Button
                type="primary"
                onClick={() => {
                  setPendingHubNode(null);
                  handleExpand(pendingHubNode, true, 100);
                }}
              >
                加载前 100 个
              </Button>
              <Button
                onClick={() => {
                  setPendingHubNode(null);
                  handleExpand(pendingHubNode, true, 300);
                }}
              >
                加载前 300 个
              </Button>
              <Button onClick={() => setPendingHubNode(null)}>取消</Button>
            </Space>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
};

export default GeneralPage;
