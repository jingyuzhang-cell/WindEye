export type GraphLayer = 'Subject' | 'Event' | 'Feature' | 'Regulation' | 'Unknown';
export type GraphFilterLayer = Exclude<GraphLayer, 'Unknown'>;
export type GraphLayoutMode = 'neo4j-force' | 'free-force' | 'aggregate' | 'cascade' | 'radial' | 'semantic-force' | 'community' | 'path-focus';
export type GraphLayoutSelection = 'auto' | GraphLayoutMode;
/**
 * 图谱视图模式。
 * UI 默认展示 core / semantic 两种；
 * aggregate / community / path-focus 用于高级场景（聚合、社区发现、风险路径高亮）。
 */
export type GraphViewMode = 'core' | 'semantic' | 'aggregate' | 'community' | 'path-focus';
export type GraphFilterMode = 'highlight' | 'filter';

export interface GraphFilterState {
  selectedLayers: GraphFilterLayer[];
  selectedNodeTypesByLayer: Record<GraphFilterLayer, string[]>;
  selectedEdgeTypesByLayer: Record<GraphFilterLayer, string[]>;
  selectedEdgeTypes: string[];
  filterMode: GraphFilterMode;
}

export interface KGNode {
  id: string;
  labels: string[];
  properties: Record<string, any>;
  layer: GraphLayer;
  type: string;
  name: string;
  isMatched?: boolean;
  isCenter?: boolean;
  degree?: number;
  communityId?: string | number;
  isHub?: boolean;
  hubDegree?: number;
  collapsed?: boolean;
  isAggregate?: boolean;
  aggregateKey?: string;
  count?: number;
  relationCount?: number;
  childrenIds?: string[];
  x?: number;
  y?: number;
}

export interface KGEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
  relation?: string;
  rawType?: string;
  count?: number;
  isAggregate?: boolean;
  properties?: Record<string, any>;
}

export interface KGTriple {
  headId?: string;
  head: string;
  headLabels?: string[];
  relation: string;
  tailId?: string;
  tail: string;
  tailLabels?: string[];
  properties?: Record<string, any>;
}

export interface KGSummary {
  matchedCount?: number;
  centerNodeId?: string;
  depth?: number;
  requestedDepth?: number;
  actualDepth?: number;
  centerCount?: number;
  nodeCount: number;
  edgeCount: number;
  tripleCount?: number;
  layers?: string[];
  relationTypes?: string[];
  nodeTypeCounts?: Record<string, number>;
  edgeTypeCounts?: Record<string, number>;
  frontierCountsByHop?: Record<string, number>;
  truncated?: boolean;
  truncatedBy?: string | null;
  traversalMode?: 'bfs' | 'cascade' | 'subject-traverse';
  cascadeStageCounts?: Partial<Record<Exclude<GraphLayer, 'Unknown'>, number>>;
  policy?: string;
  hubNodeCount?: number;
  blockedSubjectExpansionCount?: number;
  blockedSubjectExpansionByHub?: Array<{hubId:string;hubName:string;degree:number;blockedCount:number;blockedRelationTypes:string[]}>;
  evidenceCompletionApplied?: boolean;
  evidenceNodeCounts?: Record<string, number>;
  subjectExpansionBlocked?: boolean;
  forceExpandHub?: boolean;
  evidenceDiagnosis?: {
    evidenceNodeFound: boolean;
    possibleReasons?: string[];
    message?: string;
  };
}

export interface SearchAllPayload {
  query: string;
  layer?: 'all' | Exclude<GraphLayer, 'Unknown'>;
  depth?: number;
  limit?: number;
  nodeLimit?: number;
  edgeLimit?: number;
  type?: string;
  relationWhitelist?: string[];
  layerWhitelist?: Exclude<GraphLayer, 'Unknown'>[];
  includeCrossLayer?: boolean;
  includeProperties?: boolean;
  outputFormat?: 'subgraph' | 'triples' | 'both';
  deduplicate?: boolean;
  responseMode?: 'full' | 'summary';
  traversalMode?: 'bfs' | 'cascade';
}

export interface SubjectTraversePayload {
  subject?: string;
  query?: string;
  startNodeId?: string;
  depth?: number;
  centerLimit?: number;
  nodeLimit?: number;
  edgeLimit?: number;
  relationWhitelist?: string[];
  layerWhitelist?: Exclude<GraphLayer, 'Unknown'>[];
  includeProperties?: boolean;
}

export interface SearchAllResponse {
  success: boolean;
  traceId: string;
  matchedNodes: any[];
  nodes: any[];
  edges: any[];
  triples: KGTriple[];
  summary: KGSummary;
  warnings: string[];
  message?: string;
  error?: string;
}

export interface ExpandNodePayload {
  depth?: number;
  limit?: number;
  nodeLimit?: number;
  edgeLimit?: number;
  relationWhitelist?: string[];
  layerWhitelist?: Exclude<GraphLayer, 'Unknown'>[];
  includeCrossLayer?: boolean;
  includeProperties?: boolean;
  responseMode?: 'full' | 'summary';
  forceExpandHub?: boolean;
  maxFanout?: number;
}

export interface ExpandNodeResponse {
  success: boolean;
  traceId: string;
  centerNode?: any;
  nodes: any[];
  edges: any[];
  subgraph?: {
    nodeCount: number;
    edgeCount: number;
    nodes: any[];
    edges: any[];
    relationTypes?: string[];
    nodeTypeCounts?: Record<string, number>;
    edgeTypeCounts?: Record<string, number>;
  };
  summary: KGSummary;
  warnings: string[];
  message?: string;
  error?: string;
}

export interface CurrentSubgraphStats {
  currentNodeCount: number;
  currentEdgeCount: number;
  currentLayerNodeCounts: Record<GraphLayer, number>;
  currentLayerEdgeCounts: Record<string, number>;
  currentNodeTypeCounts: Record<string, number>;
  currentEdgeTypeCounts: Record<string, number>;
}
