import { create } from 'zustand'
import type { ChatMessage } from '../types/api'
import type { ChatSession, WorkspaceState } from '../types/chat'

// ── Persistence limits ──────────────────────────────────────────────
const MAX_PERSISTED_SESSIONS = 10
const MAX_PERSISTED_MESSAGES_PER_SESSION = 30
const MAX_MESSAGE_TEXT_LENGTH = 2000
const MAX_RAW_SIZE = 2 * 1024 * 1024 // 2 MB — drop anything larger
const STORAGE_KEY = 'bidakg-chat-history'
const SESSION_INDEX_KEY = 'bidakg-chat-session-index'

// ── API-based session sync (Redis-backed) ────────────────────────────
let _syncTimer: ReturnType<typeof setTimeout> | null = null

function syncSessionToBackend(session: ChatSession): void {
  // Debounce: sync at most once per 2 seconds
  if (_syncTimer) clearTimeout(_syncTimer)
  _syncTimer = setTimeout(async () => {
    try {
      const light = {
        id: session.id,
        title: truncateText(session.title, 80),
        updatedAt: session.updatedAt,
        messages: (session.messages || []).slice(-30).map(stripLargeMessageFields),
      }
      await fetch(`/api/v1/chat/sessions/${session.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(light),
      })
    } catch {
      // Backend unavailable — localStorage fallback already saved
    }
  }, 2000)
}

// ── Lightweight serialization types ─────────────────────────────────
type PersistedMessage = {
  id: string
  role: string
  content: string
  timestamp: number
  type?: string
  entityName?: string
  traceId?: string
}

type PersistedSession = {
  id: string
  title: string
  updatedAt: number
  messages: PersistedMessage[]
}

// ── Helpers ─────────────────────────────────────────────────────────
function truncateText(text?: string, max = MAX_MESSAGE_TEXT_LENGTH): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** Strip large runtime-only fields from a message before persisting */
function stripLargeMessageFields(message: ChatMessage): PersistedMessage {
  return {
    id: message.id,
    role: message.role,
    content: truncateText(message.content),
    timestamp: message.timestamp,
    type: (message as any).type,
    entityName: (message as any).entityName,
    traceId: (message as any).traceId,
  }
  // Explicitly NOT persisted: graphData, subgraph, nodes, edges, triples,
  // rawResponse, workspaceState, attachments, evidence, fileContent
}

/** Build a lightweight array of sessions safe for localStorage */
function buildPersistableSessions(sessions: ChatSession[]): PersistedSession[] {
  return sessions.slice(0, MAX_PERSISTED_SESSIONS).map(s => ({
    id: s.id,
    title: truncateText(s.title, 80),
    updatedAt: s.updatedAt,
    messages: (s.messages || [])
      .slice(-MAX_PERSISTED_MESSAGES_PER_SESSION)
      .map(stripLargeMessageFields),
  }))
}

/** Safe localStorage.setItem — never throws */
function safeSetStorage(key: string, value: unknown): void {
  try {
    const text = JSON.stringify(value)
    localStorage.setItem(key, text)
  } catch (error) {
    console.warn(`[chatStore] localStorage write failed: ${key}`, error)
    if (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    ) {
      try { localStorage.removeItem(key) } catch {}
    }
  }
}

/** Load persisted sessions with size guard + cleanup */
function loadPersistedSessions(): PersistedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    if (raw.length > MAX_RAW_SIZE) {
      console.warn('[chatStore] old chat history too large (%d bytes), removed', raw.length)
      localStorage.removeItem(STORAGE_KEY)
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(STORAGE_KEY)
      return []
    }

    // Validate shape — if sessions contain persisted shape, accept
    return parsed.filter(
      (s: any) => s && typeof s.id === 'string' && Array.isArray(s.messages),
    )
  } catch (error) {
    console.warn('[chatStore] failed to parse chat history, removed', error)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
    return []
  }
}

// ── Hydration: restore persisted light sessions + merge runtime state
function restoreSessions(persisted: PersistedSession[]): ChatSession[] {
  return persisted.map((ps): ChatSession => ({
    id: ps.id,
    title: ps.title,
    updatedAt: ps.updatedAt,
    messages: ps.messages.map((pm): ChatMessage => ({
      id: pm.id,
      role: pm.role as 'user' | 'assistant' | 'system',
      content: pm.content,
      timestamp: pm.timestamp,
    })),
    workspaceState: createEmptyState(),
  }))
}

// ── Store interface ─────────────────────────────────────────────────
interface ChatStore {
  sessions: ChatSession[]
  activeSessionId: string | null
  _hydrated: boolean

  createNewSession: () => string
  switchSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  updateCurrentSession: (updates: {
    messages?: ChatMessage[]
    title?: string
    workspaceState?: Partial<WorkspaceState>
  }) => void
  getActiveSession: () => ChatSession | undefined
}

const createEmptyState = (): WorkspaceState => ({
  graphData: null,
  riskReport: null,
  riskStages: [],
  riskCommunity: null,
})

export const useChatStore = create<ChatStore>()((set, get) => {
  // ── Init: restore persisted light sessions ──────────────────────
  const persisted = loadPersistedSessions()
  const initialSessions = restoreSessions(persisted)

  return {
    sessions: initialSessions,
    activeSessionId: initialSessions.length > 0
      ? initialSessions[initialSessions.length - 1].id
      : null,
    _hydrated: true,

    createNewSession: () => {
      const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const newSession: ChatSession = {
        id,
        title: '新会话',
        updatedAt: Date.now(),
        messages: [],
        workspaceState: createEmptyState(),
      }
      set(state => {
        const nextSessions = [...state.sessions, newSession]
        // Persist light sessions (no workspaceState / graphData)
        safeSetStorage(STORAGE_KEY, buildPersistableSessions(nextSessions))
        return { sessions: nextSessions, activeSessionId: id }
      })
      return id
    },

    switchSession: (id: string) => {
      set({ activeSessionId: id })
    },

    deleteSession: (id: string) => {
      set(state => {
        const remaining = state.sessions.filter(s => s.id !== id)
        const nextActive =
          state.activeSessionId === id
            ? remaining.length > 0
              ? remaining[remaining.length - 1].id
              : null
            : state.activeSessionId
        safeSetStorage(STORAGE_KEY, buildPersistableSessions(remaining))
        return { sessions: remaining, activeSessionId: nextActive }
      })
    },

    renameSession: (id: string, title: string) => {
      set(state => {
        const nextSessions = state.sessions.map(s =>
          s.id === id ? { ...s, title, updatedAt: Date.now() } : s,
        )
        safeSetStorage(STORAGE_KEY, buildPersistableSessions(nextSessions))
        return { sessions: nextSessions }
      })
    },

    updateCurrentSession: (updates) => {
      const { activeSessionId } = get()
      if (!activeSessionId) return
      set(state => {
        const nextSessions = state.sessions.map(s => {
          if (s.id !== activeSessionId) return s
          return {
            ...s,
            ...(updates.messages !== undefined ? { messages: updates.messages } : {}),
            ...(updates.title !== undefined ? { title: updates.title } : {}),
            updatedAt: Date.now(),
            workspaceState: {
              ...s.workspaceState,
              ...updates.workspaceState,
            },
          }
        })
        // Persist LIGHT version locally
        safeSetStorage(STORAGE_KEY, buildPersistableSessions(nextSessions))
        // Also sync to Redis via API (debounced)
        const updated = nextSessions.find(s => s.id === activeSessionId)
        if (updated) syncSessionToBackend(updated)
        return { sessions: nextSessions }
      })
    },

    getActiveSession: () => {
      const { sessions, activeSessionId } = get()
      return sessions.find(s => s.id === activeSessionId)
    },
  }
})
