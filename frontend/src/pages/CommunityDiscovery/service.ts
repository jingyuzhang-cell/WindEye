export interface Community {
  community_id: number;
  size: number;
  density: number;
  internal_edges: number;
  label_distribution: Record<string, number>;
  top_entities: Array<{ id: string; name: string; label: string }>;
}

export interface DiscoveryResult {
  success: boolean;
  method: string;
  modularity?: number;
  communities_count: number;
  communities: Community[];
  runtime_ms?: number;
}

export interface GraphNode {
  id: number;
  labels: string[];
  properties: Record<string, any>;
}

export interface GraphEdge {
  source: number;
  target: number;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface DiscoverParams {
  layer: string;
  method: string;
  minSize: number;
  maxNodes: number;
}

export interface AlgorithmInfo {
  name: string;
  label: string;
  description: string;
  complexity: string;
  params?: Record<string, any>;
}

export interface CompareResultItem {
  method: string;
  label: string;
  communities_count: number;
  modularity: number;
  runtime_ms: number;
  coverage: number;
  size_distribution?: number[];
  error?: string;
}

export interface CompareResult {
  results: CompareResultItem[];
}

export interface QualityMetrics {
  community_id: number;
  nodes: number;
  internal_edges: number;
  modularity: number;
  conductance: number;
  coverage: number;
  triangle_count: number;
  avg_clustering: number;
}

export async function getAlgorithms(): Promise<AlgorithmInfo[]> {
  const response = await fetch('/api/v1/graph/communities/algorithms');
  const data = await response.json();
  return data.algorithms || [];
}

export async function discoverCommunities(params: DiscoverParams): Promise<DiscoveryResult> {
  const searchParams = new URLSearchParams();
  if (params.layer && params.layer !== 'all') searchParams.append('layer', params.layer);
  if (params.method) searchParams.append('method', params.method);
  if (params.minSize) searchParams.append('min_community_size', String(params.minSize));
  searchParams.append('max_nodes', String(params.maxNodes));

  const response = await fetch(`/api/v1/graph/communities?${searchParams.toString()}`);
  return response.json();
}

export async function compareAlgorithms(params: Omit<DiscoverParams, 'method'>): Promise<CompareResult> {
  const searchParams = new URLSearchParams();
  if (params.layer && params.layer !== 'all') searchParams.append('layer', params.layer);
  if (params.minSize) searchParams.append('min_community_size', String(params.minSize));
  searchParams.append('max_nodes', String(params.maxNodes));

  const response = await fetch(`/api/v1/graph/communities/compare?${searchParams.toString()}`);
  return response.json();
}

export async function getCommunityGraph(
  communityId: number,
  layer: string,
  limit: number = 200,
): Promise<GraphData> {
  const searchParams = new URLSearchParams();
  if (layer && layer !== 'all') searchParams.append('layer', layer);
  searchParams.append('limit', String(limit));

  const response = await fetch(
    `/api/v1/graph/communities/${communityId}?${searchParams.toString()}`,
  );
  return response.json();
}

export async function getCommunityQuality(
  communityId: number,
  layer: string = 'all',
): Promise<QualityMetrics> {
  const searchParams = new URLSearchParams();
  if (layer && layer !== 'all') searchParams.append('layer', layer);

  const response = await fetch(
    `/api/v1/graph/communities/${communityId}/quality?${searchParams.toString()}`,
  );
  return response.json();
}
