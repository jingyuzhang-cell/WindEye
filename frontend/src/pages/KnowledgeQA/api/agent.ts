import axios from 'axios'
import type {
  ApiResponse,
  RecommendationItem,
  StreamReviewEvent,
  PipelineStage,
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

export const sendChatStream = (
  req: ChatRequest,
  callbacks: {
    onStage?: (stage: PipelineStage | string) => void
    onCards: (cards: RecommendationItem[]) => void
    onGraph: (graph: { nodes: any[]; edges: any[] }) => void
    onReview: (review: StreamReviewEvent) => void
    onDone: () => void
    onError: (msg: string) => void
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
}

export interface RiskStreamCallbacks {
  onStage?: (stage: string, content: string) => void
  onEntityStats?: (stats: import('../types/api').EntityStats) => void
  onCommunity?: (info: import('../types/api').CommunityInfo) => void
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
  const params = new URLSearchParams({
    query: req.query,
    sessionId: req.sessionId,
    roundId: String(req.roundId),
  })
  if (req.communityId !== undefined) {
    params.set('communityId', String(req.communityId))
  }
  if (req.maxHop !== undefined) {
    params.set('maxHop', String(req.maxHop))
  }

  let retryCount = 0
  const maxRetries = 3
  let aborted = false
  let doneFired = false
  let abortController: AbortController | null = null

  const connect = async () => {
    if (aborted) return
    abortController = new AbortController()

    try {
      const resp = await fetch(
        `/api/v1/chat/risk-stream?${params.toString()}`,
        { signal: abortController.signal }
      )

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
                callbacks.onEntityStats?.(JSON.parse(raw))
              } else if (ev === 'community') {
                callbacks.onCommunity?.(JSON.parse(raw))
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

export const healthCheck = async (): Promise<boolean> => {
  try {
    const resp = await axios.get('/health', { timeout: 5000 })
    return resp.status === 200
  } catch {
    return false
  }
}
