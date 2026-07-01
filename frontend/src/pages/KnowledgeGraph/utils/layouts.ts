import type {
  GraphLayer,
  GraphLayoutMode,
  KGEdge,
  KGNode,
} from '@/types/knowledgeGraph';
import { getNodeDegreeMap, resolveCommunityId } from './graphTransform';

export interface PositionedKGNode extends KGNode {
  x: number;
  y: number;
  degree: number;
  communityId?: string | number;
  isPathNode?: boolean;
}

export interface AdaptiveLayoutResult {
  mode: GraphLayoutMode;
  nodes: PositionedKGNode[];
  width: number;
  height: number;
  pathNodeIds: string[];
  communityCenters: Array<{ id: string; x: number; y: number; radius: number }>;
}

const LAYERS: GraphLayer[] = ['Subject', 'Event', 'Feature', 'Regulation', 'Unknown'];
function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function getVector(map: Map<string, { x: number; y: number }>, id: string): { x: number; y: number } {
  const existing = map.get(id);
  if (existing) return existing;
  const fallback = { x: 0, y: 0 };
  map.set(id, fallback);
  return fallback;
}

export function chooseGraphLayoutMode(params: {
  nodes: KGNode[];
  edges: KGEdge[];
  centerNodeId?: string;
  selectedPathId?: string;
  hasCommunities?: boolean;
}): GraphLayoutMode {
  if (params.selectedPathId) return 'path-focus';
  if (params.nodes.length > 150) return 'aggregate';
  if (params.nodes.length <= 50 && params.centerNodeId) return 'radial';
  if (params.hasCommunities) return 'community';
  return 'semantic-force';
}

export function computeCascadeLayout(
  nodes: KGNode[],
  edges: KGEdge[],
  viewportWidth: number,
  viewportHeight: number,
): AdaptiveLayoutResult {
  const degrees = getNodeDegreeMap(nodes, edges);
  const cascadeLayers: GraphLayer[] = ['Subject', 'Event', 'Feature', 'Regulation'];
  const groups = new Map(cascadeLayers.map(layer => [
    layer,
    nodes
      .filter(node => node.layer === layer)
      .sort((left, right) =>
        Number(Boolean(right.isCenter)) - Number(Boolean(left.isCenter))
        || Number(Boolean(right.isMatched)) - Number(Boolean(left.isMatched))
        || (degrees.get(right.id) || 0) - (degrees.get(left.id) || 0)
        || left.id.localeCompare(right.id)),
  ]));
  const bandWidth = Math.max(180, viewportWidth / 4);
  const width = Math.max(viewportWidth, bandWidth * cascadeLayers.length);
  const columnsByLayer = new Map(cascadeLayers.map(layer => [
    layer,
    Math.max(2, Math.min(5, Math.floor((bandWidth - 36) / 48))),
  ]));
  const maxRows = Math.max(1, ...cascadeLayers.map(layer =>
    Math.ceil((groups.get(layer)?.length || 0) / (columnsByLayer.get(layer) || 2))));
  const height = Math.max(viewportHeight, 160 + maxRows * 58);
  const positioned: PositionedKGNode[] = [];

  cascadeLayers.forEach((layer, layerIndex) => {
    const layerNodes = groups.get(layer) || [];
    const columns = columnsByLayer.get(layer) || 2;
    const laneLeft = layerIndex * bandWidth;
    const lanePadding = 26;
    const usableWidth = bandWidth - lanePadding * 2;
    layerNodes.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const jitterX = (hashUnit(`${node.id}:x`) - 0.5) * 24;
      const jitterY = (hashUnit(`${node.id}:y`) - 0.5) * 26;
      positioned.push({
        ...node,
        x: laneLeft + lanePadding + ((column + 0.5) / columns) * usableWidth + jitterX,
        y: 112 + row * 58 + jitterY,
        degree: degrees.get(node.id) || 0,
      });
    });
  });

  nodes.filter(node => node.layer === 'Unknown').forEach((node, index) => {
    positioned.push({
      ...node,
      x: width / 2 + (index % 6 - 2.5) * 65,
      y: height - 45 - Math.floor(index / 6) * 55,
      degree: degrees.get(node.id) || 0,
    });
  });

  // Lightweight deterministic force relaxation. Nodes repel inside their
  // semantic pipe, connected nodes pull together, and cross-layer edges align
  // vertically without allowing nodes to escape into another pipe.
  const nodeById = new Map(positioned.map(node => [node.id, node]));
  const layerIndex = new Map(cascadeLayers.map((layer, index) => [layer, index]));
  for (let iteration = 0; iteration < 36; iteration += 1) {
    const displacement = new Map(positioned.map(node => [node.id, { x: 0, y: 0 }]));
    cascadeLayers.forEach((layer) => {
      const members = positioned.filter(node => node.layer === layer);
      for (let leftIndex = 0; leftIndex < members.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
          const left = members[leftIndex];
          const right = members[rightIndex];
          let dx = left.x - right.x;
          let dy = left.y - right.y;
          const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          if (distance >= 48) continue;
          const strength = (48 - distance) * 0.07;
          dx /= distance;
          dy /= distance;
          const leftDelta = getVector(displacement, left.id);
          const rightDelta = getVector(displacement, right.id);
          leftDelta.x += dx * strength;
          leftDelta.y += dy * strength;
          rightDelta.x -= dx * strength;
          rightDelta.y -= dy * strength;
        }
      }
    });
    edges.forEach((edge) => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) return;
      if (source.layer === target.layer) {
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const pull = Math.max(-3, Math.min(3, (distance - 92) * 0.012));
        const sourceDelta = getVector(displacement, source.id);
        const targetDelta = getVector(displacement, target.id);
        sourceDelta.x += (dx / distance) * pull;
        sourceDelta.y += (dy / distance) * pull;
        targetDelta.x -= (dx / distance) * pull;
        targetDelta.y -= (dy / distance) * pull;
      } else {
        const align = (target.y - source.y) * 0.006;
        getVector(displacement, source.id).y += align;
        getVector(displacement, target.id).y -= align;
      }
    });
    positioned.forEach((node) => {
      const index = layerIndex.get(node.layer);
      if (index === undefined) return;
      const laneLeft = index * bandWidth + 22;
      const laneRight = (index + 1) * bandWidth - 22;
      const delta = getVector(displacement, node.id);
      node.x = Math.max(laneLeft, Math.min(laneRight, node.x + delta.x));
      node.y = Math.max(100, Math.min(height - 36, node.y + delta.y));
    });
  }
  return {
    mode: 'cascade',
    nodes: positioned,
    width,
    height,
    pathNodeIds: [],
    communityCenters: [],
  };
}

export function computeAggregateLayout(
  nodes: KGNode[],
  edges: KGEdge[],
  width: number,
  height: number,
): AdaptiveLayoutResult {
  const degrees = getNodeDegreeMap(nodes, edges);
  const anchors: Record<GraphLayer, { x: number; y: number }> = {
    Subject: { x: width * 0.24, y: height * 0.36 },
    Event: { x: width * 0.56, y: height * 0.28 },
    Feature: { x: width * 0.45, y: height * 0.72 },
    Regulation: { x: width * 0.78, y: height * 0.64 },
    Unknown: { x: width * 0.5, y: height * 0.5 },
  };
  const positioned: PositionedKGNode[] = [];
  LAYERS.forEach((layer) => {
    const members = nodes
      .filter(node => node.layer === layer)
      .sort((left, right) =>
        Number(Boolean(right.isAggregate)) - Number(Boolean(left.isAggregate))
        || (right.count || 0) - (left.count || 0)
        || (degrees.get(right.id) || 0) - (degrees.get(left.id) || 0));
    const anchor = anchors[layer];
    members.forEach((node, index) => {
      const angle = index * 2.399963 + hashUnit(node.id) * 0.5;
      const radius = members.length <= 1 ? 0 : 34 + Math.sqrt(index) * 54;
      positioned.push({
        ...node,
        x: anchor.x + Math.cos(angle) * radius,
        y: anchor.y + Math.sin(angle) * radius * 0.72,
        degree: degrees.get(node.id) || 0,
      });
    });
  });
  return {
    mode: 'aggregate',
    nodes: positioned,
    width,
    height,
    pathNodeIds: [],
    communityCenters: [],
  };
}

function adjacency(nodes: KGNode[], edges: KGEdge[]): Map<string, string[]> {
  const map = new Map(nodes.map(node => [node.id, [] as string[]]));
  edges.forEach((edge) => {
    if (map.has(edge.source) && map.has(edge.target)) {
      map.get(edge.source)?.push(edge.target);
      map.get(edge.target)?.push(edge.source);
    }
  });
  return map;
}

function resolveCenter(nodes: KGNode[], edges: KGEdge[], centerNodeId?: string): string {
  if (centerNodeId && nodes.some(node => node.id === centerNodeId)) return centerNodeId;
  const explicit = nodes.find(node => node.isCenter) || nodes.find(node => node.isMatched);
  if (explicit) return explicit.id;
  const degrees = getNodeDegreeMap(nodes, edges);
  return [...nodes].sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0))[0]?.id || '';
}

export function computeRadialLayout(
  nodes: KGNode[],
  edges: KGEdge[],
  width: number,
  height: number,
  centerNodeId?: string,
): AdaptiveLayoutResult {
  const centerId = resolveCenter(nodes, edges, centerNodeId);
  const graph = adjacency(nodes, edges);
  const hop = new Map<string, number>([[centerId, 0]]);
  const queue = [centerId];
  while (queue.length) {
    const current = queue.shift();
    if (current === undefined) break;
    const nextHop = (hop.get(current) || 0) + 1;
    (graph.get(current) || []).forEach((neighbor) => {
      if (!hop.has(neighbor)) {
        hop.set(neighbor, nextHop);
        queue.push(neighbor);
      }
    });
  }
  const degrees = getNodeDegreeMap(nodes, edges);
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.max(150, Math.min(width, height) * 0.42);
  const maxHop = Math.max(1, ...hop.values());
  const groups = new Map<number, KGNode[]>();
  nodes.forEach(node => {
    const ring = Math.min(hop.get(node.id) ?? maxHop + 1, 3);
    if (!groups.has(ring)) groups.set(ring, []);
    groups.get(ring)?.push(node);
  });
  const positioned: PositionedKGNode[] = [];
  groups.forEach((ringNodes, ring) => {
    if (ring === 0) {
      const node = ringNodes[0];
      positioned.push({ ...node, x: cx, y: cy, degree: degrees.get(node.id) || 0 });
      return;
    }
    const radius = (maxRadius / Math.max(3, maxHop + 1)) * ring;
    const ordered = [...ringNodes].sort((a, b) =>
      LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer)
      || (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0));
    ordered.forEach((node, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(ordered.length, 1);
      positioned.push({
        ...node,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        degree: degrees.get(node.id) || 0,
      });
    });
  });
  return { mode: 'radial', nodes: positioned, width, height, pathNodeIds: [], communityCenters: [] };
}

export function computeSemanticForceInitialPositions(
  nodes: KGNode[],
  edges: KGEdge[],
  width: number,
  height: number,
): AdaptiveLayoutResult {
  const degrees = getNodeDegreeMap(nodes, edges);
  const connectedNodes = nodes.filter(node =>
    (degrees.get(node.id) || 0) > 0 || node.isCenter || node.isMatched);
  const isolatedNodes = nodes.filter(node =>
    !connectedNodes.some(connected => connected.id === node.id));
  const relationHeight = isolatedNodes.length > 0 ? Math.max(300, height * 0.48) : height;
  const gridTop = isolatedNodes.length > 0 ? relationHeight + 34 : height + 40;
  const anchors: Record<GraphLayer, { x: number; y: number }> = {
    Subject: { x: width * 0.36, y: relationHeight * 0.48 },
    Event: { x: width * 0.52, y: relationHeight * 0.34 },
    Feature: { x: width * 0.58, y: relationHeight * 0.58 },
    Regulation: { x: width * 0.70, y: relationHeight * 0.62 },
    Unknown: { x: width * 0.50, y: relationHeight * 0.50 },
  };
  const positioned: PositionedKGNode[] = connectedNodes.map(node => ({
    ...node,
    x: anchors[node.layer].x + (hashUnit(`${node.id}:semantic-x`) - 0.5) * 180,
    y: anchors[node.layer].y + (hashUnit(`${node.id}:semantic-y`) - 0.5) * 120,
    degree: degrees.get(node.id) || 0,
  }));
  const nodeMap = new Map(positioned.map(node => [node.id, node]));
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const delta = new Map(positioned.map(node => [node.id, { x: 0, y: 0 }]));
    for (let leftIndex = 0; leftIndex < positioned.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < positioned.length; rightIndex += 1) {
        const left = positioned[leftIndex];
        const right = positioned[rightIndex];
        let dx = left.x - right.x;
        let dy = left.y - right.y;
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        if (distance > 58) continue;
        const repel = (58 - distance) * 0.035;
        dx /= distance;
        dy /= distance;
        const leftDelta = getVector(delta, left.id);
        const rightDelta = getVector(delta, right.id);
        leftDelta.x += dx * repel;
        leftDelta.y += dy * repel;
        rightDelta.x -= dx * repel;
        rightDelta.y -= dy * repel;
      }
    }
    edges.forEach((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const desired = source.layer === target.layer ? 76 : 116;
      const pull = Math.max(-2.2, Math.min(2.2, (distance - desired) * 0.012));
      const sourceDelta = getVector(delta, source.id);
      const targetDelta = getVector(delta, target.id);
      sourceDelta.x += (dx / distance) * pull;
      sourceDelta.y += (dy / distance) * pull;
      targetDelta.x -= (dx / distance) * pull;
      targetDelta.y -= (dy / distance) * pull;
    });
    positioned.forEach((node) => {
      const anchor = anchors[node.layer];
      const movement = getVector(delta, node.id);
      node.x = Math.max(34, Math.min(width - 34, node.x + movement.x + (anchor.x - node.x) * 0.018));
      node.y = Math.max(58, Math.min(relationHeight - 28, node.y + movement.y + (anchor.y - node.y) * 0.018));
    });
  }

  const isolatedGroups = new Map<GraphLayer, KGNode[]>();
  LAYERS.forEach((layer) => {
    isolatedGroups.set(layer, []);
  });
  isolatedNodes.forEach((node) => {
    isolatedGroups.get(node.layer)?.push(node);
  });
  const gridGapX = nodes.length > 800 ? 23 : 28;
  const gridGapY = nodes.length > 800 ? 22 : 26;
  const gridColumns = Math.max(12, Math.floor((width - 56) / gridGapX));
  let rowOffset = 0;
  LAYERS.forEach((layer) => {
    const members = (isolatedGroups.get(layer) || [])
      .sort((left, right) =>
        Number(Boolean(right.isCenter)) - Number(Boolean(left.isCenter))
        || Number(Boolean(right.isMatched)) - Number(Boolean(left.isMatched))
        || left.name.localeCompare(right.name, 'zh-CN'));
    if (members.length === 0) return;
    members.forEach((node, index) => {
      const column = index % gridColumns;
      const row = Math.floor(index / gridColumns) + rowOffset;
      positioned.push({
        ...node,
        x: 28 + column * gridGapX + (hashUnit(`${node.id}:iso-x`) - 0.5) * 3,
        y: gridTop + row * gridGapY + (hashUnit(`${node.id}:iso-y`) - 0.5) * 3,
        degree: 0,
      });
    });
    rowOffset += Math.ceil(members.length / gridColumns) + 1;
  });

  return {
    mode: 'semantic-force',
    nodes: positioned,
    width,
    height,
    pathNodeIds: [],
    communityCenters: [],
  };
}

function connectedCommunities(nodes: KGNode[], edges: KGEdge[]): Map<string, KGNode[]> {
  const explicit = new Map<string, KGNode[]>();
  nodes.forEach((node) => {
    const id = resolveCommunityId(node);
    if (id) {
      if (!explicit.has(id)) explicit.set(id, []);
      explicit.get(id)?.push(node);
    }
  });
  if (explicit.size > 0) {
    nodes.filter(node => !resolveCommunityId(node)).forEach((node) => {
      const id = `layer-${node.layer}`;
      if (!explicit.has(id)) explicit.set(id, []);
      explicit.get(id)?.push(node);
    });
    return explicit;
  }
  const graph = adjacency(nodes, edges);
  const visited = new Set<string>();
  const communities = new Map<string, KGNode[]>();
  nodes.forEach((start) => {
    if (visited.has(start.id)) return;
    const queue = [start.id];
    const members: KGNode[] = [];
    visited.add(start.id);
    while (queue.length) {
      const id = queue.shift();
      if (id === undefined) break;
      const node = nodes.find(candidate => candidate.id === id);
      if (node) members.push(node);
      (graph.get(id) || []).forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      });
    }
    const key = members.length > 1 ? `component-${communities.size}` : `layer-${start.layer}`;
    const existing = communities.get(key) || [];
    communities.set(key, [...existing, ...members]);
  });
  return communities;
}

export function computeCommunityLayout(
  nodes: KGNode[],
  edges: KGEdge[],
  width: number,
  height: number,
): AdaptiveLayoutResult {
  const communities = [...connectedCommunities(nodes, edges).entries()]
    .sort((a, b) => b[1].length - a[1].length);
  const degrees = getNodeDegreeMap(nodes, edges);
  const columns = Math.max(1, Math.ceil(Math.sqrt(communities.length)));
  const rows = Math.max(1, Math.ceil(communities.length / columns));
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const positioned: PositionedKGNode[] = [];
  const centers: AdaptiveLayoutResult['communityCenters'] = [];
  communities.forEach(([id, members], communityIndex) => {
    const column = communityIndex % columns;
    const row = Math.floor(communityIndex / columns);
    const cx = cellWidth * (column + 0.5);
    const cy = cellHeight * (row + 0.5);
    const radius = Math.min(cellWidth, cellHeight) * 0.36;
    centers.push({ id, x: cx, y: cy, radius: Math.max(70, radius) });
    [...members]
      .sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0))
      .forEach((node, index) => {
        const ring = Math.floor(Math.sqrt(index));
        const angle = index * 2.399963;
        const localRadius = Math.min(radius, 24 + ring * 25);
        positioned.push({
          ...node,
          communityId: id,
          x: cx + Math.cos(angle) * localRadius,
          y: cy + Math.sin(angle) * localRadius,
          degree: degrees.get(node.id) || 0,
        });
      });
  });
  return {
    mode: 'community',
    nodes: positioned,
    width,
    height,
    pathNodeIds: [],
    communityCenters: centers,
  };
}

function derivePath(nodes: KGNode[], edges: KGEdge[], centerNodeId?: string): string[] {
  if (nodes.length === 0) return [];
  const center = resolveCenter(nodes, edges, centerNodeId);
  const graph = adjacency(nodes, edges);
  const parent = new Map<string, string | null>([[center, null]]);
  const queue = [center];
  let farthest = center;
  while (queue.length) {
    const current = queue.shift();
    if (current === undefined) break;
    farthest = current;
    (graph.get(current) || []).forEach((neighbor) => {
      if (!parent.has(neighbor)) {
        parent.set(neighbor, current);
        queue.push(neighbor);
      }
    });
  }
  const path: string[] = [];
  let cursor: string | null | undefined = farthest;
  while (cursor) {
    path.unshift(cursor);
    cursor = parent.get(cursor);
  }
  return path;
}

export function computePathFocusLayout(
  nodes: KGNode[],
  edges: KGEdge[],
  width: number,
  height: number,
  centerNodeId?: string,
  providedPathNodeIds?: string[],
): AdaptiveLayoutResult {
  const pathNodeIds = providedPathNodeIds?.filter(id => nodes.some(node => node.id === id))
    || derivePath(nodes, edges, centerNodeId);
  const pathIndex = new Map(pathNodeIds.map((id, index) => [id, index]));
  const degrees = getNodeDegreeMap(nodes, edges);
  const graph = adjacency(nodes, edges);
  const spacing = Math.max(90, (width - 120) / Math.max(1, pathNodeIds.length - 1));
  const branchCounts = new Map<string, number>();
  const positioned = nodes.map((node) => {
    const index = pathIndex.get(node.id);
    if (index !== undefined) {
      return {
        ...node,
        x: 60 + spacing * index,
        y: height / 2,
        degree: degrees.get(node.id) || 0,
        isPathNode: true,
      };
    }
    const parentId = pathNodeIds.find(id => (graph.get(id) || []).includes(node.id));
    const parentIndex = parentId ? pathIndex.get(parentId) || 0 : Math.floor(hashUnit(node.id) * pathNodeIds.length);
    const count = branchCounts.get(String(parentIndex)) || 0;
    branchCounts.set(String(parentIndex), count + 1);
    const direction = count % 2 === 0 ? -1 : 1;
    const level = Math.floor(count / 2) + 1;
    return {
      ...node,
      x: Math.max(50, Math.min(width - 50, 60 + spacing * parentIndex + (hashUnit(node.id) - 0.5) * 60)),
      y: height / 2 + direction * (90 + level * 42),
      degree: degrees.get(node.id) || 0,
      isPathNode: false,
    };
  });
  return {
    mode: 'path-focus',
    nodes: positioned,
    width,
    height,
    pathNodeIds,
    communityCenters: [],
  };
}

/**
 * 自由力导向布局初始位置。
 * 仅使用微弱的层种偏移作为初始 seed，不约束节点到固定泳道。
 * 实际物理仿真由 G6 force layout 完成。
 */
export function computeFreeForceInitialPositions(
  nodes: KGNode[],
  edges: KGEdge[],
  width: number,
  height: number,
): AdaptiveLayoutResult {
  const degrees = getNodeDegreeMap(nodes, edges);
  const cx = width / 2;
  const cy = height / 2;
  const layerSeeds: Record<string, { dx: number; dy: number }> = {
    Subject: { dx: -120, dy: 0 },
    Event: { dx: 0, dy: -80 },
    Feature: { dx: 0, dy: 80 },
    Regulation: { dx: 120, dy: 0 },
  };
  const positioned: PositionedKGNode[] = nodes.map(node => {
    const seed = layerSeeds[node.layer] || { dx: 0, dy: 0 };
    const jitterX = (hashUnit(`${node.id}:fx`) - 0.5) * 160;
    const jitterY = (hashUnit(`${node.id}:fy`) - 0.5) * 160;
    return {
      ...node,
      x: cx + seed.dx + jitterX,
      y: cy + seed.dy + jitterY,
      degree: degrees.get(node.id) || 0,
    };
  });
  return {
    mode: 'free-force',
    nodes: positioned,
    width,
    height,
    pathNodeIds: [],
    communityCenters: [],
  };
}

/**
 * Neo4j Browser 风格弹性力导向初始位置。
 * 这里只提供稳定 seed，不固定节点，让 G6 force 自己产生弹簧拉开效果。
 */
export function computeNeo4jForceLayout(
  nodes: KGNode[],
  edges: KGEdge[],
  options: {
    width: number;
    height: number;
    centerNodeId?: string;
  },
): AdaptiveLayoutResult {
  const { width, height, centerNodeId } = options;
  const degrees = getNodeDegreeMap(nodes, edges);
  const centerId = resolveCenter(nodes, edges, centerNodeId);
  const centerX = width / 2;
  const centerY = height / 2;
  const layerSeed: Record<GraphLayer, { x: number; y: number; jitterX: number; jitterY: number }> = {
    Subject: { x: centerX - 240, y: centerY, jitterX: 320, jitterY: 260 },
    Event: { x: centerX, y: centerY - 180, jitterX: 260, jitterY: 220 },
    Feature: { x: centerX + 140, y: centerY + 130, jitterX: 260, jitterY: 220 },
    Regulation: { x: centerX + 330, y: centerY, jitterX: 300, jitterY: 240 },
    Unknown: { x: centerX, y: centerY, jitterX: 260, jitterY: 220 },
  };
  const positioned: PositionedKGNode[] = nodes.map((node) => {
    if (node.id === centerId || node.isCenter) {
      return {
        ...node,
        x: centerX,
        y: centerY,
        degree: degrees.get(node.id) || 0,
      };
    }
    const seed = layerSeed[node.layer] || layerSeed.Unknown;
    const degreeBoost = Math.min(90, Math.sqrt(Math.max(0, degrees.get(node.id) || 0)) * 10);
    const jitterX = (hashUnit(`${node.id}:neo4j-x`) - 0.5) * (seed.jitterX + degreeBoost);
    const jitterY = (hashUnit(`${node.id}:neo4j-y`) - 0.5) * (seed.jitterY + degreeBoost);
    return {
      ...node,
      x: seed.x + jitterX,
      y: seed.y + jitterY,
      degree: degrees.get(node.id) || 0,
    };
  });

  return {
    mode: 'neo4j-force',
    nodes: positioned,
    width,
    height,
    pathNodeIds: [],
    communityCenters: [],
  };
}

export function computeAdaptiveLayout(params: {
  mode: GraphLayoutMode;
  nodes: KGNode[];
  edges: KGEdge[];
  width: number;
  height: number;
  centerNodeId?: string;
  pathNodeIds?: string[];
}): AdaptiveLayoutResult {
  const { mode, nodes, edges, width, height, centerNodeId, pathNodeIds } = params;
  if (mode === 'neo4j-force') {
    return computeNeo4jForceLayout(nodes, edges, { width, height, centerNodeId });
  }
  if (mode === 'free-force') return computeFreeForceInitialPositions(nodes, edges, width, height);
  if (mode === 'aggregate') return computeAggregateLayout(nodes, edges, width, height);
  if (mode === 'cascade') return computeCascadeLayout(nodes, edges, width, height);
  if (mode === 'radial') return computeRadialLayout(nodes, edges, width, height, centerNodeId);
  if (mode === 'semantic-force') return computeSemanticForceInitialPositions(nodes, edges, width, height);
  if (mode === 'path-focus') {
    return computePathFocusLayout(nodes, edges, width, height, centerNodeId, pathNodeIds);
  }
  return computeCommunityLayout(nodes, edges, width, height);
}
