import type {
  ExpandNodePayload,
  ExpandNodeResponse,
  SearchAllPayload,
  SearchAllResponse,
  SubjectTraversePayload,
} from '@/types/knowledgeGraph';

export class KnowledgeGraphApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'KnowledgeGraphApiError';
    this.status = status;
    this.details = details;
  }
}

function extractApiErrorMessage(data: any, status: number): string {
  const detail = data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') {
    return detail.message || detail.msg || detail.error || detail.code || `知识图谱请求失败（HTTP ${status}）`;
  }
  return data?.message || data?.msg || data?.error || `知识图谱请求失败（HTTP ${status}）`;
}

async function postJson<T>(url: string, payload: Record<string, any>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new KnowledgeGraphApiError(
      error instanceof Error ? error.message : '知识图谱服务连接失败',
      0,
      error,
    );
  }

  let data: any;
  try {
    data = await response.json();
  } catch (error) {
    throw new KnowledgeGraphApiError(
      `知识图谱接口返回了无法解析的数据（HTTP ${response.status}）`,
      response.status,
      error,
    );
  }

  if (!response.ok || data?.success === false) {
    throw new KnowledgeGraphApiError(
      extractApiErrorMessage(data, response.status),
      response.status,
      data,
    );
  }
  return data as T;
}

export async function searchAllGraph(
  payload: SearchAllPayload,
): Promise<SearchAllResponse> {
  return postJson<SearchAllResponse>('/api/v1/graph/search-all', {
    layer: 'all',
    depth: 2,
    type: 'all',
    relationWhitelist: [],
    layerWhitelist: [],
    includeCrossLayer: true,
    includeProperties: true,
    outputFormat: 'both',
    deduplicate: true,
    responseMode: 'full',
    traversalMode: 'cascade',
    ...payload,
  });
}

export async function subjectTraverseGraph(
  payload: SubjectTraversePayload,
): Promise<SearchAllResponse> {
  return postJson<SearchAllResponse>('/api/v1/graph/subject-traverse', {
    depth: 3,
    centerLimit: 5,
    relationWhitelist: [],
    layerWhitelist: ['Subject', 'Event', 'Feature', 'Regulation'],
    includeProperties: true,
    ...payload,
  });
}

export async function expandGraphNode(
  nodeId: string,
  payload: ExpandNodePayload = {},
): Promise<ExpandNodeResponse> {
  return postJson<ExpandNodeResponse>(
    `/api/v1/graph/expand/${encodeURIComponent(nodeId)}`,
    {
      depth: 2,
      limit: 300,
      relationWhitelist: [],
      layerWhitelist: [],
      includeCrossLayer: true,
      includeProperties: true,
      responseMode: 'full',
      forceExpandHub: false,
      maxFanout: 100,
      ...payload,
    },
  );
}
