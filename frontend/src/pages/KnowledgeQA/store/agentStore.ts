import { create } from 'zustand'
import axios from 'axios'
import type {
  ChatMessage,
  QueryRewriteResult,
  Subgraph,
  AlignmentFeature,
  AgentOutput,
  RecommendationItem,
  RiskReport,
  RiskStage,
  CommunityResult,
  PipelineStage,
} from '../types/api'
import { sendChatStream, sendRiskStream } from '../api/agent'

const generateSessionId = () => `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

type RouteDecision = 'graph' | 'clarify' | 'risk'
type RightPanelMode = 'graph' | 'risk'

interface UploadedFileInfo {
  filename: string
  text: string
  char_count: number
  truncated: boolean
}

interface AgentStore {
  messages: ChatMessage[]
  currentSubgraph: Subgraph | null
  rewriteResult: QueryRewriteResult | null
  alignmentFeatures: AlignmentFeature[]
  isLoading: boolean
  sessionId: string
  roundId: number
  error: string | null
  pendingRecommendations: RecommendationItem[] | null
  clarifyMessage: string | null
  currentRoute: RouteDecision | null
  activeRightPanel: RightPanelMode

  // Risk Report state
  riskReport: RiskReport | null
  riskStages: RiskStage[]
  riskCommunity: CommunityResult | null

  // File upload state
  uploadedFile: UploadedFileInfo | null
  fileUploading: boolean

  lastRiskQuery: string
  sendMessage: (query: string, rewrittenQuery?: string) => Promise<void>
  sendRiskQuery: (query: string, communityId?: number) => Promise<void>
  retryRiskQuery: () => Promise<void>
  uploadFile: (file: File) => Promise<void>
  clearUploadedFile: () => void
  clearHistory: () => void
  setError: (error: string | null) => void
  clearRoute: () => void
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  messages: [],
  currentSubgraph: null,
  rewriteResult: null,
  alignmentFeatures: [],
  isLoading: false,
  sessionId: generateSessionId(),
  roundId: 0,
  error: null,
  pendingRecommendations: null,
  clarifyMessage: null,
  currentRoute: null,
  activeRightPanel: 'graph',

  riskReport: null,
  riskStages: [],
  riskCommunity: null,

  uploadedFile: null,
  fileUploading: false,

  lastRiskQuery: '',

  sendMessage: async (query: string, rewrittenQuery?: string) => {
    if (get().isLoading) return
    const { sessionId, roundId, messages, uploadedFile } = get()
    set({ roundId: roundId + 1 })
    let backendQuery = rewrittenQuery || query

    // Prepend uploaded file content to query
    if (uploadedFile) {
      backendQuery = `[上传文件: ${uploadedFile.filename}]\n文件内容:\n${uploadedFile.text}\n\n问题: ${backendQuery}`
    }

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: Date.now(),
    }

    const tempId = `asst_${Date.now()}`

    const assistantMsg: ChatMessage = {
      id: tempId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isLoading: true,
    }

    set((state) => ({
      messages: [...state.messages, userMsg, assistantMsg],
      isLoading: true,
      error: null,
      pendingRecommendations: null,
      clarifyMessage: null,
    }))

    // Step 1: IntentRouter
    let route: RouteDecision = 'graph'
    try {
      const routeResp = await axios.post<{ route: RouteDecision; clarify_message: string | null }>(
        '/api/v1/chat/route',
        { query: backendQuery }
      )
      route = routeResp.data.route

      if (route === 'clarify') {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  isLoading: false,
                  content:
                    routeResp.data.clarify_message ??
                    'Sorry, I didn\'t fully understand. Could you provide more specific criteria?',
                }
              : m
          ),
          clarifyMessage: routeResp.data.clarify_message ?? null,
          isLoading: false,
        }))
        return
      }
    } catch (err) {
      console.warn('[Store] /route failed, defaulting to graph:', err)
    }

    // Step 2: Risk Report pipeline
    if (route === 'risk') {
      set({
        currentRoute: 'risk',
        activeRightPanel: 'risk',
        riskReport: null,
        riskStages: [],
        riskCommunity: null,
        isLoading: true,
        currentSubgraph: null,
      })

      await get().sendRiskQuery(backendQuery)
      return
    }

    // Step 3: Graph / recommend pipeline
    set({ activeRightPanel: 'graph' })
    const history = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)

    const cleanup = sendChatStream(
      { query: backendQuery, history, sessionId, roundId: roundId + 1 },
      {
        onStage: (stage) => {
          set((state) => {
            const isStructured = typeof stage !== 'string'
            const stageObj = isStructured ? (stage as PipelineStage) : null
            const contentStr = isStructured
              ? `[${stageObj!.stage_name}] ${stageObj!.agent_action}`
              : (stage as string)

            return {
              messages: state.messages.map((m) =>
                m.id === tempId
                  ? {
                      ...m,
                      thinkingStatus: contentStr,
                      pipelineStages: isStructured
                        ? (() => {
                            const prev = m.pipelineStages || []
                            const idx = prev.findIndex(
                              (ps) => ps.stage_id === stageObj!.stage_id
                            )
                            if (idx >= 0) {
                              const updated = [...prev]
                              updated[idx] = {
                                ...stageObj!,
                                status: stageObj!.progress >= 1.0 ? 'done' : ('running' as const),
                              }
                              return updated
                            }
                            return [
                              ...prev,
                              {
                                ...stageObj!,
                                status: stageObj!.progress >= 1.0 ? 'done' : ('running' as const),
                              },
                            ]
                          })()
                        : m.pipelineStages,
                    }
                  : m
              ),
            }
          })
        },

        onCards: (cards) => {
          set(() => ({ pendingRecommendations: cards }))
        },

        onGraph: (graph) => {
          set(() => ({ currentSubgraph: graph as Subgraph }))
        },

        onReview: ({ overall, highlights, explanation }) => {
          const highlightMap = new Map(highlights.map((h) => [h.itemId, h.highlight]))

          set((state) => {
            const enrichedRecs = (state.pendingRecommendations ?? []).map((rec) => ({
              ...rec,
              highlight: highlightMap.get(rec.itemId) ?? rec.highlight ?? '',
            }))

            const finalOutput: AgentOutput = {
              overallReasoning: explanation || overall,
              recommendations: enrichedRecs,
              explanations: highlights.map((h) => ({
                itemId: h.itemId,
                highlight: h.highlight,
                pathIds: [],
              })),
            }

            return {
              messages: state.messages.map((m) =>
                m.id === tempId
                  ? {
                      ...m,
                      content: overall,
                      isLoading: false,
                      thinkingStatus: undefined,
                      data: { output: finalOutput },
                    }
                  : m
              ),
              pendingRecommendations: null,
              isLoading: false,
              currentRoute: 'graph',
            }
          })
        },

        onDone: () => {
          set((state) => ({
            pendingRecommendations: null,
            isLoading: false,
            currentRoute: 'graph',
            messages: state.messages.map((m) =>
              m.id === tempId ? { ...m, isLoading: false, thinkingStatus: undefined } : m
            ),
          }))
        },

        onError: (msg) => {
          set((state) => ({
            isLoading: false,
            pendingRecommendations: null,
            error: msg,
            currentRoute: 'graph',
            messages: state.messages.map((m) =>
              m.id === tempId ? { ...m, content: `Error: ${msg}` } : m
            ),
          }))
        },
      }
    )

    // cleanup is handled internally on done/error events
  },

  sendRiskQuery: async (query: string, communityId?: number) => {
    const { sessionId, roundId } = get()
    set({ lastRiskQuery: query })
    const tempId = `asst_${Date.now()}`

    const assistantMsg: ChatMessage = {
      id: tempId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isLoading: true,
    }

    set((state) => ({
      messages: [...state.messages, assistantMsg],
      isLoading: true,
      error: null,
    }))

    const cleanup = sendRiskStream(
      { query, sessionId, roundId, communityId, maxHop: 3 },
      {
        onStage: (stage, content) => {
          set((state) => ({
            riskStages: [
              ...state.riskStages.filter((s) => s.stage !== stage),
              { stage: stage as RiskStage['stage'], content },
            ],
            messages: state.messages.map((m) =>
              m.id === tempId
                ? {
                    ...m,
                    thinkingStatus: content,
                  }
                : m
            ),
          }))
        },

        onCommunity: (info) => {
          set({ riskCommunity: info as CommunityResult })
        },

        onSubgraph: (graph) => {
          set({
            currentSubgraph: graph as Subgraph,
          })
        },

        onReport: (report) => {
          set((state) => ({
            riskReport: report as RiskReport,
            messages: state.messages.map((m) =>
              m.id === tempId
                ? {
                    ...m,
                    content: report.executive_summary || report.markdown_report?.slice(0, 300) || '',
                    isLoading: false,
                    thinkingStatus: undefined,
                    data: { echartsConfig: report.echarts_config },
                  }
                : m
            ),
            isLoading: false,
            currentRoute: 'risk',
            activeRightPanel: 'risk',
          }))
        },

        onDone: () => {
          set((state) => ({
            isLoading: false,
            currentRoute: 'risk',
            messages: state.messages.map((m) =>
              m.id === tempId ? { ...m, isLoading: false, thinkingStatus: undefined } : m
            ),
          }))
        },

        onError: (msg) => {
          set((state) => ({
            isLoading: false,
            error: msg,
            currentRoute: 'risk',
            messages: state.messages.map((m) =>
              m.id === tempId ? { ...m, content: `Risk analysis failed: ${msg}` } : m
            ),
          }))
        },
      }
    )
  },

  retryRiskQuery: async () => {
    const { lastRiskQuery } = get()
    if (lastRiskQuery) {
      await get().sendRiskQuery(lastRiskQuery)
    }
  },

  clearHistory: () => {
    set({
      messages: [],
      currentSubgraph: null,
      rewriteResult: null,
      alignmentFeatures: [],
      roundId: 0,
      sessionId: generateSessionId(),
      error: null,
      pendingRecommendations: null,
      clarifyMessage: null,
      currentRoute: null,
      riskReport: null,
      riskStages: [],
      riskCommunity: null,
      activeRightPanel: 'graph',
      uploadedFile: null,
      fileUploading: false,
      lastRiskQuery: '',
    })
  },

  uploadFile: async (file: File) => {
    const MAX_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      set({ error: '文件过大（最大 10MB）', fileUploading: false })
      return
    }

    set({ fileUploading: true, error: null })

    try {
      const formData = new FormData()
      formData.append('file', file)

      const resp = await fetch('/api/v1/chat/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await resp.json()
      if (result.success) {
        set({ uploadedFile: result.data, fileUploading: false })
      } else {
        set({ error: result.message || '文件上传失败', fileUploading: false })
      }
    } catch (err: any) {
      set({ error: err.message || '文件上传失败', fileUploading: false })
    }
  },

  clearUploadedFile: () => set({ uploadedFile: null }),

  setError: (error: string | null) => set({ error }),

  clearRoute: () => set({ currentRoute: null, currentSubgraph: null }),
}))
