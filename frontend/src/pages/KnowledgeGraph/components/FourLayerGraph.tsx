import G6 from '@antv/g6';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  GraphLayer,
  GraphFilterMode,
  GraphLayoutMode,
  KGEdge,
  KGNode,
} from '@/types/knowledgeGraph';
import { truncateLabel } from '@/utils/knowledgeGraph';
import { computeAdaptiveLayout } from '../utils/layouts';
import {
  LAYER_COLORS_WITH_UNKNOWN,
  NODE_SIZE_BY_LAYER,
  getEdgeVisualSpec,
  EDGE_STATE_COLORS,
  PERF_THRESHOLDS,
  HUB_NODE_STYLE,
  FREE_FORCE_CONFIG,
  NEO4J_FORCE_CONFIG,
} from '../config/visualTheme';

export interface FourLayerGraphHandle {
  exportPNG: () => void;
  fitView: () => void;
}

interface FourLayerGraphProps {
  nodes: KGNode[];
  edges: KGEdge[];
  layoutMode: GraphLayoutMode;
  centerNodeId?: string;
  pathNodeIds?: string[];
  omittedNodeCount?: number;
  highlightedNodeIds?: Set<string>;
  highlightedEdgeIds?: Set<string>;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  hasActiveFilter?: boolean;
  filterMode?: GraphFilterMode;
  loading?: boolean;
  hideLabels?: boolean;
  onNodeClick?: (node: KGNode) => void;
  onNodeDoubleClick?: (node: KGNode) => void;
  onEdgeClick?: (edge: KGEdge) => void;
  onRenderError?: (message: string | null) => void;
}

function isHighRiskEdge(edge: KGEdge): boolean {
  const value = edge.properties?.risk_level
    ?? edge.properties?.riskLevel
    ?? edge.properties?.importance;
  return ['high', 'critical', '-3', '-2', 3, 4, 5].includes(value);
}

function isHighRiskNode(node: KGNode): boolean {
  const value = node.properties?.risk_level
    ?? node.properties?.riskLevel
    ?? node.properties?.importance;
  return ['high', 'critical', '-3', '-2', 3, 4, 5].includes(value);
}

function getLayerSize(node: KGNode, baseSize: number): number {
  const spec = NODE_SIZE_BY_LAYER[node.layer];
  return Math.max(spec?.floor ?? 24, baseSize);
}

function getLayerEdgeDash(sourceLayer: GraphLayer, targetLayer: GraphLayer): number[] | undefined {
  return getEdgeVisualSpec(sourceLayer, targetLayer).dashPattern;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPropertyPreview(properties?: Record<string, any>): string {
  const entries = Object.entries(properties || {})
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .slice(0, 3);
  if (entries.length === 0) return '';
  return entries
    .map(([key, value]) => `<div><span style="color:#8c8c8c">${escapeHtml(key)}：</span>${escapeHtml(
      typeof value === 'object' ? JSON.stringify(value) : String(value),
    )}</div>`)
    .join('');
}

// ── 邻居索引（hover 高亮时使用，避免每次 hover 都遍历全图） ──
interface NeighborIndex {
  neighborMap: Map<string, Set<string>>;
  edgeMap: Map<string, Set<string>>;
}

function buildNeighborIndex(nodes: KGNode[], edges: KGEdge[]): NeighborIndex {
  const neighborMap = new Map<string, Set<string>>();
  const edgeMap = new Map<string, Set<string>>();

  for (const node of nodes) {
    neighborMap.set(node.id, new Set());
    edgeMap.set(node.id, new Set());
  }

  for (const edge of edges) {
    if (!neighborMap.has(edge.source)) neighborMap.set(edge.source, new Set());
    if (!neighborMap.has(edge.target)) neighborMap.set(edge.target, new Set());
    if (!edgeMap.has(edge.source)) edgeMap.set(edge.source, new Set());
    if (!edgeMap.has(edge.target)) edgeMap.set(edge.target, new Set());

    neighborMap.get(edge.source)?.add(edge.target);
    neighborMap.get(edge.target)?.add(edge.source);
    edgeMap.get(edge.source)?.add(edge.id);
    edgeMap.get(edge.target)?.add(edge.id);
  }

  return { neighborMap, edgeMap };
}

const FourLayerGraph = forwardRef<FourLayerGraphHandle, FourLayerGraphProps>(
  function FourLayerGraph(
    {
      nodes,
      edges,
      layoutMode,
      centerNodeId,
      pathNodeIds,
      omittedNodeCount = 0,
      highlightedNodeIds = new Set<string>(),
      highlightedEdgeIds = new Set<string>(),
      selectedNodeId,
      selectedEdgeId,
      hasActiveFilter = false,
      filterMode = 'highlight',
      hideLabels = false,
      onNodeClick,
      onNodeDoubleClick,
      onEdgeClick,
      onRenderError,
    },
    ref,
  ) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<any>(null);
    const [containerWidth, setContainerWidth] = useState(960);

    // ── hover 状态全部使用 ref，避免触发 React 重渲染 ──
    const hoveredNodeIdRef = useRef<string | null>(null);
    const lastDataViewportKeyRef = useRef<string>('');
    const lastHoverNodeIdsRef = useRef<Set<string>>(new Set());
    const lastHoverEdgeIdsRef = useRef<Set<string>>(new Set());
    const neighborIndexRef = useRef<NeighborIndex>({ neighborMap: new Map(), edgeMap: new Map() });
    const clickRef = useRef(onNodeClick);
    const doubleClickRef = useRef(onNodeDoubleClick);
    const edgeClickRef = useRef(onEdgeClick);

    clickRef.current = onNodeClick;
    doubleClickRef.current = onNodeDoubleClick;
    edgeClickRef.current = onEdgeClick;

    useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) return undefined;
      const updateWidth = () => setContainerWidth(Math.max(720, viewport.clientWidth));
      updateWidth();
      const observer = new ResizeObserver(updateWidth);
      observer.observe(viewport);
      return () => observer.disconnect();
    }, []);

    const canvasHeight = layoutMode === 'community'
      ? 820
      : layoutMode === 'semantic-force'
        ? Math.max(720, Math.min(1180, 520 + Math.ceil(nodes.length / 45) * 22))
        : 720;
    const layout = useMemo(() => computeAdaptiveLayout({
      mode: layoutMode,
      nodes,
      edges,
      width: containerWidth,
      height: canvasHeight,
      centerNodeId,
      pathNodeIds,
    }), [layoutMode, nodes, edges, containerWidth, canvasHeight, centerNodeId, pathNodeIds]);

    // ── 计算 G6 渲染数据（不依赖 highlightedLayer，hover 通过 stateStyles 实现） ──
    const graphData = useMemo(() => {
      const nodeMap = new Map(layout.nodes.map(node => [node.id, node]));
      const pathPairs = new Set<string>();
      for (let index = 0; index < layout.pathNodeIds.length - 1; index += 1) {
        const left = layout.pathNodeIds[index];
        const right = layout.pathNodeIds[index + 1];
        pathPairs.add(`${left}|${right}`);
        pathPairs.add(`${right}|${left}`);
      }
      const g6Nodes = layout.nodes.map((node) => {
        const theme = LAYER_COLORS_WITH_UNKNOWN[node.layer];
        const isCenter = node.isCenter || node.id === centerNodeId;
        const highRisk = isHighRiskNode(node);
        const baseSize = isCenter
          ? 36
          : node.isMatched
            ? 32
            : node.isAggregate
              ? Math.min(56, 28 + Math.sqrt(Math.max(1, node.count || 1)) * 2)
              : Math.min(32, 18 + Math.sqrt(Math.max(1, node.degree || 0)) * 2.5);
        const size = getLayerSize(node, baseSize);
        const nodeShape = 'circle';
        const filterHighlighted = highlightedNodeIds.has(node.id);
        const selected = selectedNodeId === node.id;
        const totalNodes = layout.nodes.length;
        const showLabel = !hideLabels && (
          node.isCenter
          || node.isMatched
          || node.isAggregate
          || (totalNodes <= PERF_THRESHOLDS.SHOW_MORE_LABELS && (filterHighlighted || (node.degree || 0) >= 3))
          || (totalNodes <= PERF_THRESHOLDS.MINIMAL_LABELS && (filterHighlighted || (node.degree || 0) >= 5))
        );
        const alwaysShowLabel = node.isCenter || node.isMatched || node.isAggregate;
        return {
          id: node.id,
          x: node.x,
          y: node.y,
          type: nodeShape,
          label: (showLabel || alwaysShowLabel)
            ? node.isAggregate
              ? `${node.type}\n${(node.count || 0).toLocaleString()} 个 · ${(node.relationCount || 0).toLocaleString()} 关系`
              : truncateLabel(node.name, node.isCenter ? 14 : 8)
            : '',
          fullName: node.name,
          layer: node.layer,
          nodeType: node.type,
          degree: node.degree || 0,
          isCenter,
          isHub: node.isHub,
          kgNode: node,
          size,
          style: {
            fill: theme.color,
            stroke: node.isHub
              ? HUB_NODE_STYLE.stroke
              : isCenter
                ? '#f5222d'
                : node.isMatched
                  ? '#1677ff'
                  : highRisk
                    ? '#f5222d'
                  : selected
                    ? '#eb2f96'
                  : filterHighlighted
                    ? '#fa8c16'
                    : '#ffffff',
            lineWidth: node.isHub
              ? HUB_NODE_STYLE.lineWidth
              : isCenter ? 5 : node.isMatched ? 4 : highRisk ? 4 : selected ? 4 : filterHighlighted ? 4 : 2,
            lineDash: node.isAggregate ? [6, 4] : undefined,
            opacity: 1,
          },
          labelCfg: {
            position: 'bottom',
            offset: 7,
            style: {
              fill: '#262626',
              fontSize: 11,
              fontWeight: node.isAggregate || isCenter ? 600 : 400,
              opacity: 0.9,
            },
          },
        };
      });
      const g6Edges = edges
        .filter(edge => nodeMap.has(edge.source) && nodeMap.has(edge.target))
        .flatMap((edge) => {
          const sourceNode = nodeMap.get(edge.source);
          const targetNode = nodeMap.get(edge.target);
          if (!sourceNode || !targetNode) return [];
          const crossLayer = sourceNode.layer !== targetNode.layer;
          const onPath = pathPairs.has(`${edge.source}|${edge.target}`);
          const filterHighlighted = highlightedEdgeIds.has(edge.id);
          const selected = selectedEdgeId === edge.id;
          const highRisk = isHighRiskEdge(edge);
          const dash = getLayerEdgeDash(sourceNode.layer, targetNode.layer);
          const spec = getEdgeVisualSpec(sourceNode.layer, targetNode.layer);

          // 边颜色根据层级对使用不同色调，增强可读性
          let strokeColor: string;
          if (selected) strokeColor = EDGE_STATE_COLORS.selected;
          else if (filterHighlighted) strokeColor = '#fa8c16';
          else if (onPath) strokeColor = EDGE_STATE_COLORS.onPath;
          else if (highRisk) strokeColor = EDGE_STATE_COLORS.risk;
          else strokeColor = spec.stroke;

          return [{
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: (layoutMode === 'cascade' || crossLayer) ? 'quadratic' : 'line',
            relationType: edge.type,
            sourceLayer: sourceNode.layer,
            targetLayer: targetNode.layer,
            kgEdge: edge,
            properties: edge.properties,
            onPath,
            label: selected
              ? edge.type
              : edge.isAggregate && (edge.count || 0) > 1
              ? `${edge.type} × ${edge.count}`
              : '',
            labelCfg: {
              autoRotate: true,
              style: {
                fill: '#595959',
                fontSize: 10,
                background: {
                  fill: 'rgba(255,255,255,0.88)',
                  padding: [2, 4, 2, 4],
                  radius: 2,
                },
              },
            },
            style: {
              stroke: strokeColor,
              lineWidth: spec.lineWidth,
              lineDash: dash,
              opacity: crossLayer ? 0.58 : 0.35,
              endArrow: layoutMode === 'cascade' && crossLayer
                ? { path: G6.Arrow.triangle(4, 6, 1), fill: strokeColor }
                : false,
            },
          }];
        });

      // 构建邻居索引（用于 hover 高亮）
      neighborIndexRef.current = buildNeighborIndex(layout.nodes, edges);

      return { nodes: g6Nodes, edges: g6Edges };
    }, [
      layout,
      edges,
      layoutMode,
      highlightedNodeIds,
      highlightedEdgeIds,
      selectedNodeId,
      selectedEdgeId,
      hasActiveFilter,
      filterMode,
      hideLabels,
    ]);

    // ── 清理上一次 hover 的节点/边状态（仅操作受影响项，不遍历全图） ──
    const clearPrevHoverStates = useCallback((graph: any) => {
      graph.setAutoPaint(false);
      for (const nodeId of lastHoverNodeIdsRef.current) {
        const item = graph.findById(nodeId);
        if (item && !item.destroyed) {
          graph.clearItemStates(item, ['hover', 'neighbor', 'inactive']);
        }
      }
      for (const edgeId of lastHoverEdgeIdsRef.current) {
        const item = graph.findById(edgeId);
        if (item && !item.destroyed) {
          graph.clearItemStates(item, ['hover', 'inactive']);
        }
      }
      lastHoverNodeIdsRef.current.clear();
      lastHoverEdgeIdsRef.current.clear();
      graph.paint();
      graph.setAutoPaint(true);
    }, []);

    // ── 高亮节点及其邻居 ──
    const highlightNodeAndNeighbors = useCallback((graph: any, nodeId: string) => {
      if (hoveredNodeIdRef.current === nodeId) return;
      hoveredNodeIdRef.current = nodeId;

      clearPrevHoverStates(graph);

      const { neighborMap, edgeMap } = neighborIndexRef.current;
      const neighbors = neighborMap.get(nodeId) || new Set();
      const relatedEdges = edgeMap.get(nodeId) || new Set();

      graph.setAutoPaint(false);

      // 收集本节点 + 邻居节点 ID
      const involvedNodeIds = new Set<string>([nodeId]);
      for (const nb of neighbors) involvedNodeIds.add(nb);

      lastHoverNodeIdsRef.current = involvedNodeIds;
      lastHoverEdgeIdsRef.current = relatedEdges;

      // 设置 hover 节点状态
      const nodeItem = graph.findById(nodeId);
      if (nodeItem && !nodeItem.destroyed) {
        graph.setItemState(nodeItem, 'hover', true);
      }

      // 设置邻居节点状态
      for (const neighborId of neighbors) {
        const item = graph.findById(neighborId);
        if (item && !item.destroyed) {
          graph.setItemState(item, 'neighbor', true);
        }
      }

      // 设置相关边状态
      for (const edgeId of relatedEdges) {
        const item = graph.findById(edgeId);
        if (item && !item.destroyed) {
          graph.setItemState(item, 'hover', true);
        }
      }

      graph.paint();
      graph.setAutoPaint(true);
    }, [clearPrevHoverStates]);

    // ── 清除所有 hover 状态 ──
    const clearHover = useCallback((graph: any) => {
      hoveredNodeIdRef.current = null;
      clearPrevHoverStates(graph);
    }, [clearPrevHoverStates]);

    // ── 应用层级聚焦和选中聚焦。点击节点后保留一跳上下文，弱化无关元素。 ──
    const effectiveGraphData = useMemo(() => {
      const focusNodeIds = new Set<string>();
      const focusEdgeIds = new Set<string>();

      if (selectedNodeId) {
        focusNodeIds.add(selectedNodeId);
        graphData.edges.forEach((edge: any) => {
          if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
            focusEdgeIds.add(edge.id);
            focusNodeIds.add(edge.source);
            focusNodeIds.add(edge.target);
          }
        });
      }

      if (selectedEdgeId) {
        const selectedEdge = graphData.edges.find((edge: any) => edge.id === selectedEdgeId);
        if (selectedEdge) {
          focusEdgeIds.add(selectedEdge.id);
          focusNodeIds.add(selectedEdge.source);
          focusNodeIds.add(selectedEdge.target);
        }
      }

      const hasSelectionFocus = focusNodeIds.size > 0 || focusEdgeIds.size > 0;

      return {
        nodes: graphData.nodes.map((node: any) => {
          const selectionDimmed = hasSelectionFocus && !focusNodeIds.has(node.id);
          const selected = node.id === selectedNodeId;
          if (!selectionDimmed && !selected) return node;
          return {
            ...node,
            label: selected ? truncateLabel(node.fullName, 18) : node.label,
            style: {
              ...node.style,
              opacity: selectionDimmed ? 0.12 : 1,
              stroke: selected ? '#eb2f96' : node.style?.stroke,
              lineWidth: selected ? Math.max(4, node.style?.lineWidth || 2) : node.style?.lineWidth,
            },
            labelCfg: {
              ...node.labelCfg,
              style: {
                ...node.labelCfg?.style,
                opacity: selectionDimmed ? 0.12 : 0.95,
                fontWeight: selected ? 700 : node.labelCfg?.style?.fontWeight,
              },
            },
          };
        }),
        edges: graphData.edges.map((edge: any) => {
          const selectionRelated = !hasSelectionFocus || focusEdgeIds.has(edge.id);
          const selected = edge.id === selectedEdgeId;
          const dimmed = !selectionRelated;
          return {
            ...edge,
            label: selected ? edge.relationType : edge.label,
            style: {
              ...edge.style,
              opacity: selected ? 1 : dimmed ? 0.035 : hasSelectionFocus ? 0.82 : edge.style.opacity,
              lineWidth: selected
                ? Math.max(3.5, edge.style.lineWidth || 1)
                : hasSelectionFocus && focusEdgeIds.has(edge.id)
                  ? Math.max(2.4, edge.style.lineWidth || 1)
                  : edge.style.lineWidth,
              stroke: selected ? EDGE_STATE_COLORS.selected : edge.style.stroke,
            },
          };
        }),
      };
    }, [graphData, selectedNodeId, selectedEdgeId]);

    // ── G6 初始化（仅一次） ──
    useEffect(() => {
      if (!containerRef.current || graphRef.current || nodes.length === 0) return undefined;
      const isForceLayout = layoutMode === 'free-force' || layoutMode === 'neo4j-force';

      const tooltip = new G6.Tooltip({
        itemTypes: ['node', 'edge'],
        offsetX: 12,
        offsetY: 12,
        // 使用 className 以便注入 pointer-events: none
        className: 'kg-graph-tooltip',
        getContent: (event: any) => {
          const model: any = event?.item?.getModel();
          if (event?.item?.getType?.() === 'edge') {
            const props = buildPropertyPreview(model?.properties);
            return `<div style="padding:8px 10px;max-width:360px">
              <b>${escapeHtml(model?.relationType || '关联')}</b>
              <div style="color:#8c8c8c;margin-top:3px">点击查看关系详情</div>
              ${props ? `<div style="margin-top:6px;line-height:1.65">${props}</div>` : ''}
            </div>`;
          }
          const degree = Number(model?.degree || 0);
          return `<div style="padding:9px 11px;max-width:380px;white-space:normal">
            <b>${escapeHtml(model?.fullName || '')}</b>
            <div style="color:#8c8c8c;margin-top:4px">
              ${escapeHtml(model?.layer || '')} / ${escapeHtml(model?.nodeType || 'Unknown')} · ${degree.toLocaleString()} 个关联
            </div>
            <div style="color:#595959;margin-top:6px">单击固定一跳关系，双击展开邻居</div>
            ${buildPropertyPreview(model?.kgNode?.properties) ? `<div style="margin-top:6px;line-height:1.65">${buildPropertyPreview(model?.kgNode?.properties)}</div>` : ''}
          </div>`;
        },
      });

      try {
        const graphOptions: any = {
          container: containerRef.current,
          width: layout.width,
          height: layout.height,
          animate: layoutMode === 'cascade',
          animateCfg: { duration: 720, easing: 'easeCubic' },
          renderer: 'canvas',
          modes: { default: ['drag-canvas', 'zoom-canvas', 'drag-node'] },
          defaultNode: { type: 'circle' },
          defaultEdge: { type: 'line' },
          // ── G6 状态样式定义（hover 不再通过 updateItem 修改 inline style） ──
          nodeStateStyles: {
            hover: { lineWidth: 3, stroke: '#1677ff' },
            neighbor: { lineWidth: 2.5, stroke: '#60a5fa' },
            selected: { lineWidth: 3.5, stroke: '#722ed1' },
            inactive: { opacity: 0.18 },
          },
          edgeStateStyles: {
            hover: { stroke: '#1677ff', lineWidth: 3, opacity: 0.95 },
            selected: { stroke: '#722ed1', lineWidth: 3.5, opacity: 1 },
            highlight: { stroke: '#ff4d4f', lineWidth: 4, opacity: 1 },
            inactive: { opacity: 0.08, lineWidth: 0.8 },
          },
          plugins: [tooltip],
        };
        if (isForceLayout) {
          graphOptions.layout = layoutMode === 'neo4j-force'
            ? NEO4J_FORCE_CONFIG
            : FREE_FORCE_CONFIG;
        }
        const graph = new G6.Graph(graphOptions);

        // ── 事件绑定 ──
        graph.on('node:click', (event: any) => {
          const node = event?.item?.getModel()?.kgNode as KGNode | undefined;
          if (event?.item) {
            try {
              graph.focusItem(event.item, true, { duration: 360, easing: 'easeCubic' });
            } catch {
              // focusItem is best-effort across G6 minor versions.
            }
          }
          if (node) clickRef.current?.(node);
        });
        graph.on('node:dblclick', (event: any) => {
          const node = event?.item?.getModel()?.kgNode as KGNode | undefined;
          if (node) doubleClickRef.current?.(node);
        });
        graph.on('edge:click', (event: any) => {
          const edge = event?.item?.getModel()?.kgEdge as KGEdge | undefined;
          if (edge) edgeClickRef.current?.(edge);
        });

        // ── hover：只通过 setItemState 触发状态样式，不遍历全图 ──
        graph.on('node:mouseenter', (event: any) => {
          if (containerRef.current) containerRef.current.style.cursor = 'pointer';
          const item = event?.item;
          if (!item) return;
          const nodeId = String(item.getID());
          highlightNodeAndNeighbors(graph, nodeId);
        });
        graph.on('node:mouseleave', () => {
          if (containerRef.current) containerRef.current.style.cursor = 'grab';
          clearHover(graph);
        });
        graph.on('edge:mouseenter', (event: any) => {
          if (containerRef.current) containerRef.current.style.cursor = 'pointer';
          const item = event?.item;
          if (item && !item.destroyed) graph.setItemState(item, 'hover', true);
        });
        graph.on('edge:mouseleave', (event: any) => {
          if (containerRef.current) containerRef.current.style.cursor = 'grab';
          const item = event?.item;
          if (item && !item.destroyed) graph.clearItemStates(item, ['hover']);
        });
        graph.on('canvas:mouseenter', () => {
          if (containerRef.current) containerRef.current.style.cursor = 'grab';
        });

        graph.data(effectiveGraphData);
        graph.render();
        if (layoutMode !== 'cascade') graph.fitView(30);
        lastDataViewportKeyRef.current = `${layoutMode}:${layout.width}:${layout.height}:${nodes.length}:${edges.length}`;
        graphRef.current = graph;
        onRenderError?.(null);
      } catch (error) {
        onRenderError?.(error instanceof Error ? error.message : 'G6 初始化失败');
      }
      return undefined;
      // 只在首次有节点时初始化，后续通过 changeData 更新
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes.length]);

    // ── 数据更新（不重建 graph 实例） ──
    useEffect(() => {
      const graph = graphRef.current;
      if (!graph) return;
      try {
        // 更新前清理 hover 状态
        clearHover(graph);
        graph.changeSize(layout.width, layout.height);
        graph.changeData(effectiveGraphData);
        const nextViewportKey = `${layoutMode}:${layout.width}:${layout.height}:${nodes.length}:${edges.length}`;
        if (layoutMode !== 'cascade' && lastDataViewportKeyRef.current !== nextViewportKey) {
          graph.fitView(30);
          lastDataViewportKeyRef.current = nextViewportKey;
        }
        onRenderError?.(null);
      } catch (error) {
        onRenderError?.(error instanceof Error ? error.message : 'G6 数据更新失败');
      }
    }, [effectiveGraphData, layout.width, layout.height, layoutMode, nodes.length, edges.length, clearHover, onRenderError]);

    // ── 清理 ──
    useEffect(() => () => {
      if (graphRef.current && !graphRef.current.get('destroyed')) graphRef.current.destroy();
      graphRef.current = null;
    }, []);

    useImperativeHandle(ref, () => ({
      exportPNG: () => graphRef.current?.downloadFullImage(
        `knowledge-graph-${Date.now()}`,
        'image/png',
        { backgroundColor: '#fff', padding: 24 },
      ),
      fitView: () => graphRef.current?.fitView(30),
    }), []);

    // ── 注入 tooltip CSS（pointer-events: none 防止闪烁） ──
    useEffect(() => {
      const styleId = 'kg-graph-tooltip-fix';
      if (document.getElementById(styleId)) return;
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .kg-graph-tooltip,
        .g6-tooltip,
        .g6-component-tooltip {
          pointer-events: none !important;
          user-select: none !important;
        }
      `;
      document.head.appendChild(style);
      return () => {
        const el = document.getElementById(styleId);
        if (el) el.remove();
      };
    }, []);

    if (nodes.length === 0) return null;

    return (
      <div
        ref={viewportRef}
        style={{ width: '100%', height: canvasHeight, overflow: 'auto', position: 'relative' }}
      >
        {layoutMode === 'community' && omittedNodeCount > 0 && (
          <div style={{
            position: 'absolute',
            top: 58,
            left: 14,
            zIndex: 5,
            padding: '5px 9px',
            borderRadius: 14,
            color: '#595959',
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid #d9d9d9',
            fontSize: 12,
          }}>
            更多节点 +{omittedNodeCount.toLocaleString()}
          </div>
        )}
        {layoutMode === 'path-focus' && (
          <div style={{
            position: 'absolute',
            right: 14,
            top: 58,
            zIndex: 5,
            width: 250,
            maxHeight: 220,
            overflowY: 'auto',
            padding: 12,
            borderRadius: 8,
            background: 'rgba(255,255,255,0.94)',
            boxShadow: '0 3px 14px rgba(0,0,0,0.1)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>EvidenceChain / 法规依据</div>
            <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>
              主路径 {layout.pathNodeIds.length} 个节点
            </div>
            {layout.nodes.filter(node => node.layer === 'Regulation').length > 0
              ? layout.nodes
                .filter(node => node.layer === 'Regulation')
                .slice(0, 6)
                .map(node => (
                  <div key={node.id} style={{
                    padding: '5px 0',
                    borderTop: '1px solid #f0f0f0',
                    color: LAYER_COLORS_WITH_UNKNOWN.Regulation.color,
                    fontSize: 12,
                  }}>
                    {truncateLabel(node.name, 20)}
                  </div>
                ))
              : (
                <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                  当前接口未返回路径法规节点，展开或切换关系后可继续补充证据。
                </div>
              )}
          </div>
        )}
        <div
          ref={containerRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: layout.width,
            height: layout.height,
            background: 'transparent',
            cursor: 'grab',
          }}
        />
      </div>
    );
  },
);

export default FourLayerGraph;
