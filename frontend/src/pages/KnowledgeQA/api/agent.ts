import axios from 'axios'
import type {
  ApiResponse,
  RecommendationItem,
  StreamReviewEvent,
  StreamReasoningEvent,
  PipelineStage,
  EntityStats,
  CommunityResult,
  EntityCommunityMap,
  EntityCandidate,
} from '../types/api'

const client = axios.create({
  baseURL: '/api/v1',
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
})

export interface ChatRequest {
  query: string
  history: string[]
  sessionId: string
  roundId: number
}

export const sendChat = async (req: ChatRequest): Promise<ApiResponse> => {
  const resp = await client.post<ApiResponse>('/chat/recommend', req)
  return resp.data
}

export const searchEntityCandidates = async (
  query: string,
  type = 'COMPANY',
  limit = 10,
): Promise<EntityCandidate[]> => {
  const resp = await client.get('/entities/search', {
    params: { q: query, type, limit },
  })
  return resp.data?.data?.candidates || []
}

export const saveEntityAlias = async (
  alias: string,
  candidate: EntityCandidate,
): Promise<void> => {
  await client.post('/entities/aliases', {
    alias,
    canonicalName: candidate.canonical_name,
    kgNodeId: candidate.kg_node_id,
    entityType: candidate.entity_type,
    source: 'user_confirmed',
  })
}

export const sendChatStream = (
  req: ChatRequest,
  callbacks: {
    onStage?: (stage: PipelineStage | string) => void
    onCards: (cards: RecommendationItem[]) => void
    onGraph: (graph: { nodes: any[]; edges: any[] }) => void
    onReview: (review: StreamReviewEvent) => void
    onReasoning?: (reasoning: StreamReasoningEvent) => void
    onDone: () => void
    onError: (msg: string) => void
    onEntityStats?: (stats: EntityStats) => void
    onCommunity?: (info: CommunityResult) => void
    onEntityCommunityMap?: (map: EntityCommunityMap) => void
  }
): (() => void) => {
  const params = new URLSearchParams({
    query: req.query,
    history: JSON.stringify(req.history),
    sessionId: req.sessionId,
    roundId: String(req.roundId),
  })

  let retryCount = 0
  const maxRetries = 3
  let es: EventSource | null = null
  let doneFired = false
  let aborted = false

  const connect = () => {
    if (aborted) return
    es = new EventSource(`/api/v1/chat/recommend-stream?${params.toString()}`)

    es.addEventListener('stage', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        if (callbacks.onStage) {
          // New structured format with machine-readable stage_id
          if (data.stage_id) {
            callbacks.onStage({
              stage_id: data.stage_id,
              stage_name: data.stage_name || '',
              stage_index: data.stage_index ?? 0,
              total_stages: data.total_stages ?? 5,
              agent: data.agent || '',
              agent_action: data.agent_action || '',
              progress: data.progress ?? 0,
              timestamp: data.timestamp || Date.now(),
              status: data.progress !== undefined && data.progress >= 1.0 ? 'done' : 'running',
              trace: data.trace,
            } as PipelineStage)
          } else if (data.content) {
            // Backward-compat: old string-format stages
            callbacks.onStage(data.content)
          }
        }
      } catch (err) {
        console.error('[SSE] stage parse error:', err)
      }
    })

    es.addEventListener('cards', (e: MessageEvent) => {
      try {
        callbacks.onCards(JSON.parse(e.data) as RecommendationItem[])
      } catch (err) {
        console.error('[SSE] cards parse error:', err)
        callbacks.onError('Failed to parse cards event')
      }
    })

    es.addEventListener('graph', (e: MessageEvent) => {
      try {
        callbacks.onGraph(JSON.parse(e.data) as { nodes: any[]; edges: any[] })
      } catch (err) {
        console.error('[SSE] graph parse error:', err)
        callbacks.onError('Failed to parse graph event')
      }
    })

    es.addEventListener('review', (e: MessageEvent) => {
      try {
        callbacks.onReview(JSON.parse(e.data) as StreamReviewEvent)
      } catch (err) {
        console.error('[SSE] review parse error:', err)
        callbacks.onError('Failed to parse review event')
      }
    })

    es.addEventListener('entity_stats', (e: MessageEvent) => {
      try {
        const stats = JSON.parse(e.data) as EntityStats
        console.groupCollapsed(
          `%c[SSE-Graph] 实体统计 %c${stats.total_entities}个实体 %c${Object.keys(stats.entity_type_counts).length}种类型`,
          'color:#2855D1;font-weight:bold', 'color:#1890ff', 'color:#8c8c8c'
        )
        console.log('类型分布:', stats.entity_type_counts)
        console.table(stats.top_entities?.map((e: any) => ({ 名称: e.name, 类型: e.type, ID: e.id })))
        console.groupEnd()
        callbacks.onEntityStats?.(stats)
      } catch (err) {
        console.error('[SSE] entity_stats parse error:', err)
      }
    })

    es.addEventListener('community', (e: MessageEvent) => {
      try {
        const info = JSON.parse(e.data) as CommunityResult
        console.groupCollapsed(
          `%c[SSE-Graph] 群体发现 %c${info.communities?.length || 0}个群体 %c算法:${info.algorithm}`,
          'color:#722ed1;font-weight:bold', 'color:#a855f7', 'color:#8c8c8c'
        )
        if (info.communities?.length > 0) {
          console.table(info.communities.map((c: any) => ({
            '群体ID': c.community_id,
            '成员数': c.size,
            '成员(前5)': c.members?.slice(0, 5).map((m: any) => m.name).join(', ') ?? '',
          })))
        }
        console.groupEnd()
        callbacks.onCommunity?.(info)
      } catch (err) {
        console.error('[SSE] community parse error:', err)
      }
    })

    es.addEventListener('entity_community_map', (e: MessageEvent) => {
      try {
        const map = JSON.parse(e.data) as EntityCommunityMap
        console.groupCollapsed(
          `%c[SSE-Graph] 实体→群体映射 %c${map.entities?.length || 0}个实体 %c${map.unmapped_count || 0}个未归属`,
          'color:#eb2f96;font-weight:bold', 'color:#f759ab', 'color:#8c8c8c'
        )
        if (map.entities?.length > 0) {
          console.table(map.entities.map((e: any) => ({
            '实体名称': e.name,
            '类型': e.type,
            '所属群体数': e.communities?.length || 0,
            '群体(角色)': e.communities?.map((c: any) =>
              `#${c.community_id}(${c.role},${c.size}成员)`).join(' | ') || '无',
          })))
          const bridges = map.entities.filter((e: any) => e.communities?.length >= 2)
          if (bridges.length > 0) {
            console.log('%c桥接实体 (≥2个群体):', 'color:#fa8c16;font-weight:bold',
              bridges.map((e: any) => e.name))
          }
          const unmapped = map.entities.filter((e: any) => e.communities?.length === 0)
          if (unmapped.length > 0) {
            console.log('%c未归属实体:', 'color:#8c8c8c',
              unmapped.map((e: any) => e.name))
          }
        }
        console.groupEnd()
        callbacks.onEntityCommunityMap?.(map)
      } catch (err) {
        console.error('[SSE] entity_community_map parse error:', err)
      }
    })

    es.addEventListener('reasoning', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as StreamReasoningEvent
        callbacks.onReasoning?.(data)
      } catch (err) {
        console.error('[SSE] reasoning parse error:', err)
      }
    })

    es.addEventListener('done', () => {
      doneFired = true
      callbacks.onDone()
      es?.close()
    })

    es.addEventListener('error', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        callbacks.onError(data.error || 'Server analysis error')
      } catch {
        callbacks.onError('Server analysis error')
      }
      doneFired = true
      es?.close()
    })

    es.onerror = () => {
      if (doneFired || aborted) {
        es?.close()
        return
      }
      retryCount++
      es?.close()
      if (retryCount < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 8000)
        console.warn(`[SSE] Connection lost, retrying in ${delay}ms (${retryCount}/${maxRetries})...`)
        setTimeout(connect, delay)
      } else {
        console.error(`[SSE] Max retries (${maxRetries}) reached`)
        callbacks.onError('连接失败，请重试')
      }
    }
  }

  connect()

  return () => {
    aborted = true
    es?.close()
  }
}

export interface RiskStreamRequest {
  query: string
  sessionId: string
  roundId: number
  communityId?: number
  maxHop?: number
  focusEntities?: string[]
  fileContent?: string
}

export interface RiskStreamCallbacks {
  onStage?: (stage: string, content: string) => void
  onEntityStats?: (stats: import('../types/api').EntityStats) => void
  onCommunity?: (info: import('../types/api').CommunityInfo) => void
  onEntityCommunityMap?: (map: import('../types/api').EntityCommunityMap) => void
  onRiskPaths?: (paths: import('../types/api').RiskPath[]) => void
  onSubgraph?: (graph: { nodes: any[]; edges: any[] }) => void
  onReport?: (report: any) => void
  onDone?: () => void
  onError?: (msg: string) => void
}

export const sendRiskStream = (
  req: RiskStreamRequest,
  callbacks: RiskStreamCallbacks
): (() => void) => {
  const body = JSON.stringify({
    query: req.query,
    sessionId: req.sessionId,
    roundId: req.roundId,
    communityId: req.communityId ?? null,
    maxHop: req.maxHop ?? 3,
    focusEntities: req.focusEntities ?? [],
    fileContent: req.fileContent ?? null,
  })

  let retryCount = 0
  const maxRetries = 3
  let aborted = false
  let doneFired = false
  let abortController: AbortController | null = null

  const connect = async () => {
    if (aborted) return
    abortController = new AbortController()

    try {
      const resp = await fetch('/api/v1/chat/risk-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: abortController.signal,
      })

      if (!resp.ok) {
        throw new Error(`Risk stream failed: ${resp.status}`)
      }

      const reader = resp.body?.getReader()
      if (!reader) throw new Error('No reader available')

      const decoder = new TextDecoder()
      let buffer = ''
      let pendingEvent: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          if (trimmed.startsWith('event:')) {
            pendingEvent = trimmed.slice(6).trim()
          } else if (trimmed.startsWith('data:')) {
            const raw = trimmed.slice(5).trim()
            const ev = pendingEvent
            pendingEvent = null
            if (!ev || !raw) continue

            try {
              if (ev === 'stage') {
                const { stage, content } = JSON.parse(raw)
                callbacks.onStage?.(stage, content)
              } else if (ev === 'entity_stats') {
                const stats = JSON.parse(raw)
                console.groupCollapsed(
                  `%c[RiskSSE] 实体统计 %c${stats.total_entities}个实体 %c${Object.keys(stats.entity_type_counts).length}种类型`,
                  'color:#2855D1;font-weight:bold', 'color:#1890ff', 'color:#8c8c8c'
                )
                console.log('类型分布:', stats.entity_type_counts)
                console.table(stats.top_entities?.map((e: any) => ({ 名称: e.name, 类型: e.type, ID: e.id })))
                console.groupEnd()
                callbacks.onEntityStats?.(stats)
              } else if (ev === 'community') {
                const info = JSON.parse(raw)
                console.groupCollapsed(
                  `%c[RiskSSE] 群体发现 %c${info.communities?.length || 0}个群体 %c算法:${info.algorithm}`,
                  'color:#722ed1;font-weight:bold', 'color:#a855f7', 'color:#8c8c8c'
                )
                if (info.communities?.length > 0) {
                  console.table(info.communities.map((c: any) => ({
                    '群体ID': c.community_id,
                    '成员数': c.size,
                    '模块度': c.modularity?.toFixed(4) ?? '-',
                    '成员(前5)': c.members?.slice(0, 5).map((m: any) => m.name).join(', ') ?? '',
                  })))
                  // 展开第一个群体的详细成员
                  if (info.communities[0]?.members?.length > 0) {
                    console.log(`群体#0 全部成员 (${info.communities[0].members.length}):`,
                      info.communities[0].members.map((m: any) => `${m.name}(${m.type})`))
                  }
                }
                console.groupEnd()
                callbacks.onCommunity?.(info)
              } else if (ev === 'entity_community_map') {
                const map = JSON.parse(raw)
                console.groupCollapsed(
                  `%c[RiskSSE] 实体→群体映射 %c${map.entities?.length || 0}个实体 %c${map.unmapped_count || 0}个未归属`,
                  'color:#eb2f96;font-weight:bold', 'color:#f759ab', 'color:#8c8c8c'
                )
                if (map.entities?.length > 0) {
                  const rows = map.entities.map((e: any) => ({
                    '实体名称': e.name,
                    '类型': e.type,
                    '所属群体数': e.communities?.length || 0,
                    '群体(角色)': e.communities?.map((c: any) =>
                      `#${c.community_id}(${c.role},${c.size}成员)`).join(' | ') || '无',
                  }))
                  console.table(rows)
                  // 单独打印有多个群体归属的桥接实体
                  const bridges = map.entities.filter((e: any) => e.communities?.length >= 2)
                  if (bridges.length > 0) {
                    console.log('%c桥接实体 (≥2个群体):', 'color:#fa8c16;font-weight:bold',
                      bridges.map((e: any) => e.name))
                  }
                  // 单独打印未归属的实体
                  const unmapped = map.entities.filter((e: any) => e.communities?.length === 0)
                  if (unmapped.length > 0) {
                    console.log('%c未归属实体:', 'color:#8c8c8c',
                      unmapped.map((e: any) => e.name))
                  }
                }
                console.groupEnd()
                callbacks.onEntityCommunityMap?.(map)
              } else if (ev === 'risk_paths') {
                callbacks.onRiskPaths?.(JSON.parse(raw))
              } else if (ev === 'subgraph') {
                callbacks.onSubgraph?.(JSON.parse(raw))
              } else if (ev === 'report') {
                doneFired = true
                callbacks.onReport?.(JSON.parse(raw))
              } else if (ev === 'done') {
                if (!doneFired) callbacks.onDone?.()
              } else if (ev === 'error') {
                const { error } = JSON.parse(raw)
                callbacks.onError?.(error || 'Risk analysis error')
              }
            } catch (parseErr) {
              console.error('[RiskSSE] parse error:', parseErr, raw)
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return
      retryCount++
      if (retryCount < maxRetries && !aborted) {
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 8000)
        console.warn(`[RiskSSE] Retrying in ${delay}ms (${retryCount}/${maxRetries})...`)
        await new Promise((r) => setTimeout(r, delay))
        connect()
      } else {
        callbacks.onError?.(err.message || 'Risk analysis connection failed')
      }
    }
  }

  connect()

  return () => {
    aborted = true
    abortController?.abort()
  }
}

// ── Unified Stream (new main entry) ──────────────────────────────────────────

export interface UnifiedStreamRequest {
  query: string
  fileContent?: string | null
  sessionId: string
  roundId: number
  maxHop?: number
  intentHint?: string | null
  confirmedEntities?: EntityCandidate[]
  workflow?: string | null
}

export interface UnifiedStreamCallbacks {
  onStage?: (stage: string, data: any) => void
  onEntities?: (data: { resolved: any[]; unresolved: any[] }) => void
  onSubgraph?: (graph: { nodes: any[]; edges: any[] }) => void
  onEntityStats?: (stats: import('../types/api').EntityStats) => void
  onCommunity?: (info: import('../types/api').CommunityResult) => void
  onEntityCommunityMap?: (map: import('../types/api').EntityCommunityMap) => void
  onCandidateRiskPaths?: (paths: any[]) => void
  onRiskPaths?: (paths: any[]) => void
  onAnomalyFindings?: (anomalies: any[]) => void
  onCompliance?: (matches: any[]) => void
  onComplianceScores?: (scores: Record<string, number>) => void
  onComplianceIndicators?: (data: { indicators: import('../types/api').ComplianceIndicator[] }) => void
  onScoring?: (scores: any) => void
  onGovernance?: (plan: any) => void
  onExpandedCommunity?: (result: import('../types/api').ExpandedCommunityResult) => void
  onReport?: (report: any) => void
  onDone?: (data: any) => void
  onError?: (msg: string) => void
  onAgentTrace?: (trace: { agent: string; step: string; summary: string; metrics: Record<string, unknown>; timestamp: number }) => void
}

export const sendUnifiedStream = (
  req: UnifiedStreamRequest,
  callbacks: UnifiedStreamCallbacks,
): (() => void) => {
  const body = JSON.stringify({
    query: req.query,
    fileContent: req.fileContent ?? null,
    sessionId: req.sessionId,
    roundId: req.roundId,
    maxHop: req.maxHop ?? 3,
    intentHint: req.intentHint ?? null,
    confirmedEntities: req.confirmedEntities ?? [],
    workflow: req.workflow ?? null,
  })

  let retryCount = 0
  const maxRetries = 3
  let aborted = false
  let doneFired = false
  let abortController: AbortController | null = null

  const connect = async () => {
    if (aborted) return
    abortController = new AbortController()

    try {
      const resp = await fetch('/api/v1/chat/unified-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: abortController.signal,
      })

      if (!resp.ok) {
        throw new Error(`Unified stream failed: ${resp.status}`)
      }

      const reader = resp.body?.getReader()
      if (!reader) throw new Error('No reader available')

      const decoder = new TextDecoder()
      let buffer = ''
      let pendingEvent: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          if (trimmed.startsWith('event:')) {
            pendingEvent = trimmed.slice(6).trim()
          } else if (trimmed.startsWith('data:')) {
            const raw = trimmed.slice(5).trim()
            const ev = pendingEvent
            pendingEvent = null
            if (!ev || !raw) continue

            try {
              const data = JSON.parse(raw)

              switch (ev) {
                case 'stage':
                  callbacks.onStage?.(data.stage || data.stage_name || '', data)
                  break
                case 'entities':
                  callbacks.onEntities?.(data.data || data)
                  break
                case 'subgraph':
                  callbacks.onSubgraph?.(data.data || data)
                  break
                case 'entity_stats':
                  callbacks.onEntityStats?.(data.data || data)
                  break
                case 'community':
                  callbacks.onCommunity?.(data.data || data)
                  break
                case 'entity_community_map':
                  callbacks.onEntityCommunityMap?.(data.data || data)
                  break
                case 'candidate_risk_paths':
                  callbacks.onCandidateRiskPaths?.(data.data || data)
                  break
                case 'risk_paths':
                  callbacks.onRiskPaths?.(data.data || data)
                  break
                case 'anomaly_findings':
                  callbacks.onAnomalyFindings?.(data.data || data)
                  break
                case 'compliance':
                  callbacks.onCompliance?.(data.data || data)
                  break
                case 'compliance_scores':
                  callbacks.onComplianceScores?.(data.data || data)
                  break
                case 'compliance_indicators':
                  callbacks.onComplianceIndicators?.(data.data || data)
                  break
                case 'scoring':
                  callbacks.onScoring?.(data.data || data)
                  break
                case 'governance':
                  callbacks.onGovernance?.(data.data || data)
                  break
                case 'expanded_community':
                  callbacks.onExpandedCommunity?.(data.data || data)
                  break
                case 'agent_trace':
                  callbacks.onAgentTrace?.(data.data || data)
                  break
                case 'report':
                  doneFired = true
                  callbacks.onReport?.(data.data || data)
                  break
                case 'done':
                  if (!doneFired) callbacks.onDone?.(data.data || data)
                  break
                case 'error':
                  callbacks.onError?.(data.error || data.data?.error || 'Unified stream error')
                  break
              }
            } catch (parseErr) {
              console.error('[UnifiedSSE] parse error:', parseErr, raw)
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return
      retryCount++
      if (retryCount < maxRetries && !aborted) {
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 8000)
        console.warn(`[UnifiedSSE] Retrying in ${delay}ms (${retryCount}/${maxRetries})...`)
        await new Promise((r) => setTimeout(r, delay))
        connect()
      } else {
        callbacks.onError?.(err.message || 'Unified stream connection failed')
      }
    }
  }

  connect()

  return () => {
    aborted = true
    abortController?.abort()
  }
}

// ── Legacy wrappers (internally delegate to sendUnifiedStream) ──────────────

export const healthCheck = async (): Promise<boolean> => {
  try {
    const resp = await axios.get('/health', { timeout: 5000 })
    return resp.status === 200
  } catch {
    return false
  }
}
