import type {
  CurrentSubgraphStats,
  GraphLayer,
  KGEdge,
  KGNode,
} from '@/types/knowledgeGraph';

export const LAYER_ORDER: Exclude<GraphLayer, 'Unknown'>[] = [
  'Subject',
  'Event',
  'Feature',
  'Regulation',
];

export const LAYER_LABELS: Record<Exclude<GraphLayer, 'Unknown'>, string[]> = {
  Subject: ['Subject', 'COMPANY', 'PERSON', 'PFCOMPANY', 'PFUND', 'SECURITY', 'Actor', 'Account'],
  Event: ['Event', 'EVENT', 'SubEvent', 'SUB_EVENT', 'TIME', 'REGULATOR', 'Means'],
  Feature: ['Feature', 'RiskFeature', 'RiskFactor', 'AdvantageHolder', 'Influence', 'DisadvantageHolder', 'Advantage'],
  Regulation: [
    'Regulation', 'Law', 'Action', 'PartyWithResponsibility', 'Chapter', 'Section',
    'Responsibility', 'RegulatoryAuthority', 'Restriction', 'PunishmentMeasure',
    'Punishment', 'Violation', 'Title',
  ],
};

const TYPE_PRIORITY: Record<GraphLayer, string[]> = {
  Subject: ['PFCOMPANY', 'PFUND', 'SECURITY', 'COMPANY', 'PERSON', 'Actor', 'Account'],
  Event: ['SUB_EVENT', 'SubEvent', 'EVENT', 'TIME', 'REGULATOR', 'Means'],
  Feature: ['RiskFeature', 'RiskFactor', 'AdvantageHolder', 'Influence', 'DisadvantageHolder', 'Advantage'],
  Regulation: [
    'Regulation', 'Law', 'Action', 'PartyWithResponsibility', 'Chapter', 'Section',
    'Responsibility', 'RegulatoryAuthority', 'Restriction', 'PunishmentMeasure',
    'Punishment', 'Violation', 'Title',
  ],
  Unknown: [],
};

const LAYER_MARKERS = new Set(['Subject', 'Event', 'Feature', 'Regulation', 'Entity', 'NODE']);

export function resolveLayer(labels: string[]): GraphLayer {
  const labelSet = new Set(labels || []);
  for (const layer of LAYER_ORDER) {
    if (labelSet.has(layer)) return layer;
  }
  for (const layer of LAYER_ORDER) {
    if (LAYER_LABELS[layer].some(label => labelSet.has(label))) return layer;
  }
  return 'Unknown';
}

export function resolveNodeType(labels: string[], layer = resolveLayer(labels)): string {
  const labelSet = new Set(labels || []);
  return TYPE_PRIORITY[layer].find(label => labelSet.has(label))
    || labels.find(label => !LAYER_MARKERS.has(label))
    || 'Unknown';
}

export const getPrimaryNodeType = resolveNodeType;

export function getNodeDisplayName(node: Pick<KGNode, 'id' | 'properties'>): string {
  const props = node.properties || {};
  return String(
    props.name
      || props.title
      || props.COMPANY_NM
      || props.PERSON_NM
      || props.event_name
      || props.feature_nm
      || props.factor_nm
      || props.regulation_name
      || props.e_text
      || props.definition
      || props.description
      || props.label
      || node.id,
  );
}

export function truncateLabel(text: string, max = 10): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function normalizeNode(raw: any): KGNode {
  const id = String(raw?.id ?? raw?.element_id ?? '');
  const labels = Array.isArray(raw?.labels) ? raw.labels.map(String) : [];
  const properties = raw?.properties && typeof raw.properties === 'object'
    ? raw.properties
    : {};
  const layer = resolveLayer(labels);
  const node: KGNode = {
    id,
    labels,
    properties,
    layer,
    type: resolveNodeType(labels, layer),
    name: '',
    isMatched: Boolean(raw?.isMatched),
    isCenter: Boolean(raw?.isCenter),
    isHub: Boolean(raw?.meta?.isHub),
    hubDegree: typeof raw?.meta?.degree === 'number' ? raw.meta.degree : undefined,
    collapsed: Boolean(raw?.meta?.collapsed),
  };
  node.name = getNodeDisplayName(node);
  return node;
}

export function normalizeEdge(raw: any): KGEdge {
  const source = String(raw?.source ?? raw?.sourceId ?? raw?.startNodeElementId ?? '');
  const target = String(raw?.target ?? raw?.targetId ?? raw?.endNodeElementId ?? '');
  const type = String(raw?.type ?? raw?.relation ?? raw?.label ?? 'UNKNOWN');
  return {
    id: String(raw?.id ?? raw?.element_id ?? `${source}-${target}-${type}`),
    source,
    target,
    type,
    label: raw?.label || type,
    relation: raw?.relation || type,
    rawType: raw?.rawType || type,
    properties: raw?.properties && typeof raw.properties === 'object'
      ? raw.properties
      : {},
  };
}

export function mergeGraph(
  oldNodes: KGNode[],
  oldEdges: KGEdge[],
  newNodes: KGNode[],
  newEdges: KGEdge[],
): { nodes: KGNode[]; edges: KGEdge[] } {
  const nodeMap = new Map<string, KGNode>();
  for (const node of [...oldNodes, ...newNodes]) {
    if (!node.id) continue;
    const previous = nodeMap.get(node.id);
    if (!previous) {
      nodeMap.set(node.id, node);
      continue;
    }
    const labels = Array.from(new Set([...previous.labels, ...node.labels]));
    const layer = resolveLayer(labels);
    const merged: KGNode = {
      ...previous,
      ...node,
      labels,
      properties: { ...previous.properties, ...node.properties },
      layer,
      type: resolveNodeType(labels, layer),
      isMatched: Boolean(previous.isMatched || node.isMatched),
      isCenter: Boolean(previous.isCenter || node.isCenter),
    };
    merged.name = getNodeDisplayName(merged);
    nodeMap.set(node.id, merged);
  }

  const edgeMap = new Map<string, KGEdge>();
  for (const edge of [...oldEdges, ...newEdges]) {
    if (!edge.id || !edge.source || !edge.target) continue;
    const previous = edgeMap.get(edge.id);
    edgeMap.set(edge.id, previous
      ? { ...previous, ...edge, properties: { ...previous.properties, ...edge.properties } }
      : edge);
  }

  const nodeIds = new Set(nodeMap.keys());
  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()).filter(
      edge => nodeIds.has(edge.source) && nodeIds.has(edge.target),
    ),
  };
}

export interface LayeredLayoutResult {
  nodes: KGNode[];
  width: number;
  height: number;
  lanes: Record<Exclude<GraphLayer, 'Unknown'>, { top: number; height: number }>;
  maxLayerNodeCount: number;
}

export function computeLayeredLayout(
  nodes: KGNode[],
  edges: KGEdge[],
  containerWidth: number,
  containerHeight = 760,
): LayeredLayoutResult {
  const degrees = new Map<string, number>();
  for (const edge of edges) {
    degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
  }

  const groups = new Map<GraphLayer, KGNode[]>();
  for (const layer of [...LAYER_ORDER, 'Unknown' as const]) groups.set(layer, []);
  for (const node of nodes) groups.get(node.layer)?.push(node);

  for (const group of groups.values()) {
    group.sort((a, b) => {
      const degreeDiff = (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0);
      return degreeDiff || a.name.localeCompare(b.name, 'zh-CN');
    });
  }

  const maxLayerNodeCount = Math.max(
    1,
    ...LAYER_ORDER.map(layer => groups.get(layer)?.length || 0),
  );
  const horizontalGap = 150;
  const leftPadding = 150;
  // Browsers impose a maximum canvas dimension. Keep up to 15 nodes per row
  // and wrap larger layers instead of creating a 50k+ pixel-wide canvas.
  const maxPerRow = Math.max(
    8,
    Math.min(15, Math.floor((Math.max(containerWidth, 1440) - leftPadding - 60) / horizontalGap)),
  );
  const columns = Math.min(maxLayerNodeCount, maxPerRow);
  const width = Math.max(containerWidth, leftPadding + columns * horizontalGap + 80);
  const lanes = {} as Record<Exclude<GraphLayer, 'Unknown'>, { top: number; height: number }>;
  let currentTop = 0;
  for (const layer of LAYER_ORDER) {
    const rowCount = Math.max(1, Math.ceil((groups.get(layer)?.length || 0) / maxPerRow));
    const laneHeight = Math.max(170, 70 + rowCount * 82);
    lanes[layer] = { top: currentTop, height: laneHeight };
    currentTop += laneHeight;
  }
  const height = Math.max(containerHeight, currentTop);
  const positioned: KGNode[] = [];

  LAYER_ORDER.forEach((layer) => {
    const group = groups.get(layer) || [];
    group.forEach((node, index) => {
      const row = Math.floor(index / maxPerRow);
      const column = index % maxPerRow;
      positioned.push({
        ...node,
        degree: degrees.get(node.id) || 0,
        x: leftPadding + column * horizontalGap,
        y: lanes[layer].top + 72 + row * 82,
      });
    });
  });

  const unknownNodes = groups.get('Unknown') || [];
  unknownNodes.forEach((node, index) => {
    positioned.push({
      ...node,
      degree: degrees.get(node.id) || 0,
      x: leftPadding + index * horizontalGap,
      y: height - 30,
    });
  });

  return { nodes: positioned, width, height, lanes, maxLayerNodeCount };
}

export function computeCurrentSubgraphStats(
  nodes: KGNode[],
  edges: KGEdge[],
): CurrentSubgraphStats {
  const layerCounts: Record<GraphLayer, number> = {
    Subject: 0,
    Event: 0,
    Feature: 0,
    Regulation: 0,
    Unknown: 0,
  };
  const layerEdgeCounts: Record<string, number> = {};
  const nodeTypeCounts: Record<string, number> = {};
  const edgeTypeCounts: Record<string, number> = {};
  const nodeMap = new Map(nodes.map(node => [node.id, node]));

  for (const node of nodes) {
    layerCounts[node.layer] += 1;
    nodeTypeCounts[node.type] = (nodeTypeCounts[node.type] || 0) + 1;
  }
  for (const edge of edges) {
    edgeTypeCounts[edge.type] = (edgeTypeCounts[edge.type] || 0) + 1;
    const sourceLayer = nodeMap.get(edge.source)?.layer || 'Unknown';
    const targetLayer = nodeMap.get(edge.target)?.layer || 'Unknown';
    const key = sourceLayer === targetLayer
      ? sourceLayer
      : `${sourceLayer}_to_${targetLayer}`;
    layerEdgeCounts[key] = (layerEdgeCounts[key] || 0) + 1;
  }
  return {
    currentNodeCount: nodes.length,
    currentEdgeCount: edges.length,
    currentLayerNodeCounts: layerCounts,
    currentLayerEdgeCounts: layerEdgeCounts,
    currentNodeTypeCounts: nodeTypeCounts,
    currentEdgeTypeCounts: edgeTypeCounts,
  };
}

export function filterGraphByLayer(
  nodes: KGNode[],
  edges: KGEdge[],
  layer: 'all' | GraphLayer,
): { nodes: KGNode[]; edges: KGEdge[] } {
  if (layer === 'all') return { nodes, edges };
  const filteredNodes = nodes.filter(node => node.layer === layer);
  const ids = new Set(filteredNodes.map(node => node.id));
  return {
    nodes: filteredNodes,
    edges: edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)),
  };
}

export function filterGraphByNodeType(
  nodes: KGNode[],
  edges: KGEdge[],
  nodeType: string | null,
  includeNeighbors = true,
): { nodes: KGNode[]; edges: KGEdge[] } {
  if (!nodeType) return { nodes, edges };
  const matchedIds = new Set(
    nodes.filter(node => node.labels.includes(nodeType) || node.type === nodeType)
      .map(node => node.id),
  );
  if (includeNeighbors) {
    for (const edge of edges) {
      if (matchedIds.has(edge.source)) matchedIds.add(edge.target);
      if (matchedIds.has(edge.target)) matchedIds.add(edge.source);
    }
  }
  return {
    nodes: nodes.filter(node => matchedIds.has(node.id)),
    edges: edges.filter(edge => matchedIds.has(edge.source) && matchedIds.has(edge.target)),
  };
}

export function filterGraphByEdgeType(
  nodes: KGNode[],
  edges: KGEdge[],
  edgeType: string | null,
): { nodes: KGNode[]; edges: KGEdge[] } {
  if (!edgeType) return { nodes, edges };
  const filteredEdges = edges.filter(edge => edge.type === edgeType);
  const ids = new Set<string>();
  filteredEdges.forEach((edge) => {
    ids.add(edge.source);
    ids.add(edge.target);
  });
  return {
    nodes: nodes.filter(node => ids.has(node.id)),
    edges: filteredEdges,
  };
}
