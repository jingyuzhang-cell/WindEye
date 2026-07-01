import type {
  GraphFilterLayer,
  GraphLayer,
  KGEdge,
  KGNode,
} from '@/types/knowledgeGraph';
import { getNodeLayer, getNodeType } from '../config/visualTheme';

export interface LayerCurrentTypeCounts {
  nodeTypes: Record<string, number>;
  edgeTypes: Record<string, number>;
}

const FILTER_LAYERS: GraphFilterLayer[] = ['Subject', 'Event', 'Feature', 'Regulation'];
const ALL_LAYERS: GraphLayer[] = ['Subject', 'Event', 'Feature', 'Regulation', 'Unknown'];

export interface CurrentResultStats {
  totalNodeCount: number;
  totalEdgeCount: number;
  layerNodeCounts: Record<GraphLayer, number>;
  nodeTypeCounts: Record<string, number>;
  nodeTypeCountsByLayer: Record<GraphLayer, Record<string, number>>;
  edgeTypeCounts: Record<string, number>;
  edgeTypeCountsByLayer: Record<GraphFilterLayer, Record<string, number>>;
  layerEdgeCounts: Record<string, number>;
  crossLayerEdgeCounts: Record<string, number>;
  nodeTypeCount: number;
  edgeTypeCount: number;
}

export function computeTypeCountsByLayer(
  nodes: KGNode[],
  edges: KGEdge[],
): Record<GraphFilterLayer, LayerCurrentTypeCounts> {
  const result = Object.fromEntries(FILTER_LAYERS.map(layer => [
    layer,
    { nodeTypes: {}, edgeTypes: {} },
  ])) as Record<GraphFilterLayer, LayerCurrentTypeCounts>;
  const nodeMap = new Map(nodes.map(node => [node.id, node]));

  nodes.forEach((node) => {
    if (node.layer === 'Unknown') return;
    result[node.layer].nodeTypes[node.type] = (result[node.layer].nodeTypes[node.type] || 0) + 1;
  });
  edges.forEach((edge) => {
    const sourceLayer = nodeMap.get(edge.source)?.layer;
    const targetLayer = nodeMap.get(edge.target)?.layer;
    const layers = new Set([sourceLayer, targetLayer]);
    FILTER_LAYERS.forEach((layer) => {
      if (layers.has(layer)) {
        result[layer].edgeTypes[edge.type] = (result[layer].edgeTypes[edge.type] || 0) + 1;
      }
    });
  });
  return result;
}

function resolveNodeLayer(node: KGNode): GraphLayer {
  return node.layer || getNodeLayer(node.labels || []);
}

function resolveNodeType(node: KGNode): string {
  return node.type || getNodeType(node.labels || [], resolveNodeLayer(node)) || 'Unknown';
}

function resolveEdgeType(edge: KGEdge): string {
  return edge.type || edge.relation || edge.label || edge.rawType || 'UNKNOWN';
}

export function computeCurrentResultStats(
  nodes: KGNode[],
  edges: KGEdge[],
): CurrentResultStats {
  const layerNodeCounts = Object.fromEntries(
    ALL_LAYERS.map(layer => [layer, 0]),
  ) as Record<GraphLayer, number>;
  const nodeTypeCounts: Record<string, number> = {};
  const nodeTypeCountsByLayer = Object.fromEntries(
    ALL_LAYERS.map(layer => [layer, {}]),
  ) as Record<GraphLayer, Record<string, number>>;
  const edgeTypeCounts: Record<string, number> = {};
  const edgeTypeCountsByLayer = Object.fromEntries(
    FILTER_LAYERS.map(layer => [layer, {}]),
  ) as Record<GraphFilterLayer, Record<string, number>>;
  const layerEdgeCounts: Record<string, number> = {};
  const crossLayerEdgeCounts: Record<string, number> = {};
  const nodeMap = new Map(nodes.map(node => [node.id, node]));

  nodes.forEach((node) => {
    const layer = resolveNodeLayer(node);
    const type = resolveNodeType(node);
    layerNodeCounts[layer] = (layerNodeCounts[layer] || 0) + 1;
    nodeTypeCounts[type] = (nodeTypeCounts[type] || 0) + 1;
    nodeTypeCountsByLayer[layer][type] = (nodeTypeCountsByLayer[layer][type] || 0) + 1;
  });

  edges.forEach((edge) => {
    const edgeType = resolveEdgeType(edge);
    edgeTypeCounts[edgeType] = (edgeTypeCounts[edgeType] || 0) + 1;

    const sourceLayer = nodeMap.get(edge.source)
      ? resolveNodeLayer(nodeMap.get(edge.source) as KGNode)
      : 'Unknown';
    const targetLayer = nodeMap.get(edge.target)
      ? resolveNodeLayer(nodeMap.get(edge.target) as KGNode)
      : 'Unknown';
    const touchedLayers = new Set([sourceLayer, targetLayer]);

    FILTER_LAYERS.forEach((layer) => {
      if (touchedLayers.has(layer)) {
        edgeTypeCountsByLayer[layer][edgeType] = (edgeTypeCountsByLayer[layer][edgeType] || 0) + 1;
      }
    });

    if (sourceLayer === targetLayer) {
      layerEdgeCounts[sourceLayer] = (layerEdgeCounts[sourceLayer] || 0) + 1;
    } else {
      const key = [sourceLayer, targetLayer].sort().join('-');
      crossLayerEdgeCounts[key] = (crossLayerEdgeCounts[key] || 0) + 1;
    }
  });

  return {
    totalNodeCount: nodes.length,
    totalEdgeCount: edges.length,
    layerNodeCounts,
    nodeTypeCounts,
    nodeTypeCountsByLayer,
    edgeTypeCounts,
    edgeTypeCountsByLayer,
    layerEdgeCounts,
    crossLayerEdgeCounts,
    nodeTypeCount: Object.keys(nodeTypeCounts).length,
    edgeTypeCount: Object.keys(edgeTypeCounts).length,
  };
}
