import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { PageContainer } from '@ant-design/pro-components'
import { Segmented, App } from 'antd'
import { WorkspaceContainer } from './components/WorkspaceContainer'
import { EnhancedGraphPanel, EnhancedGraphPanelHandle } from './components/EnhancedGraphPanel'
import RiskReportPanel from './components/RiskReportPanel'
import { ChatSidebar } from './components/ChatSidebar'
import { useAgentStore } from './store/agentStore'
import { useChatStore } from './store/chatStore'
import { DESIGN_TOKENS } from './styles/constants'

// Extract entity names from query text and match against graph nodes
function extractSubjectEntityIds(query: string, nodes: { id: string; title?: string; name?: string; zh_name?: string }[]): string[] {
  if (!query || nodes.length === 0) return []
  const matched: string[] = []

  for (const node of nodes) {
    const nodeId = String(node.id)
    const names = [node.title, node.name, node.zh_name, (node as any).zhTitle].filter(Boolean) as string[]
    for (const name of names) {
      if (name.length >= 2 && query.includes(name)) {
        matched.push(nodeId)
        break
      }
    }
  }

  // If no direct match, try extracting entities from query with common patterns
  if (matched.length === 0) {
    // Match《书名号》patterns
    const bookMatches = query.match(/《([^》]{2,30})》/g)
    if (bookMatches) {
      for (const m of bookMatches) {
        const name = m.replace(/[《》]/g, '')
        for (const node of nodes) {
          const nodeId = String(node.id)
          const nodeNames = [node.title, node.name, node.zh_name, (node as any).zhTitle].filter(Boolean) as string[]
          if (nodeNames.some((n) => n.includes(name) || name.includes(n))) {
            if (!matched.includes(nodeId)) matched.push(nodeId)
          }
        }
      }
    }

    // Match company name patterns (ending with 公司/集团/有限 etc)
    if (matched.length === 0) {
      const companyMatches = query.match(/([一-龥]{2,15}(?:有限|股份|集团|科技|实业|投资|控股)?(?:公司|企业|集团|中心|所))/g)
      if (companyMatches) {
        for (const name of companyMatches) {
          for (const node of nodes) {
            const nodeId = String(node.id)
            const nodeNames = [node.title, node.name, node.zh_name, (node as any).zhTitle].filter(Boolean) as string[]
            if (nodeNames.some((n) => n.includes(name) || name.includes(n.slice(0, 10)))) {
              if (!matched.includes(nodeId)) matched.push(nodeId)
            }
          }
        }
      }
    }
  }

  return matched
}

// Find 1-hop neighbor IDs for given node IDs
function findNeighborIds(nodeIds: string[], edges: { source: string; target: string }[]): string[] {
  if (nodeIds.length === 0 || edges.length === 0) return []
  const idSet = new Set(nodeIds.map(String))
  const neighbors = new Set<string>()
  for (const e of edges) {
    const src = String(e.source)
    const tgt = String(e.target)
    if (idSet.has(src) && !idSet.has(tgt)) neighbors.add(tgt)
    if (idSet.has(tgt) && !idSet.has(src)) neighbors.add(src)
  }
  return Array.from(neighbors)
}

const KnowledgeQA: React.FC = () => {
  const { message } = App.useApp()
  const {
    messages,
    currentSubgraph,
    alignmentFeatures,
    isLoading,
    sendMessage,
    clearHistory,
    pendingRecommendations,
    clarifyMessage,
    activeRightPanel,
    riskReport,
    riskStages,
    riskCommunity,
    error,
    retryRiskQuery,
  } = useAgentStore()

  const { activeSessionId, updateCurrentSession, getActiveSession, createNewSession } =
    useChatStore()

  const graphRef = useRef<EnhancedGraphPanelHandle>(null)
  const [highlightedEntity, setHighlightedEntity] = useState<string | null>(null)
  const [graphInjectedEntity, setGraphInjectedEntity] = useState<{
    id: string
    name: string
    type: string
  } | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Auto-save logic
  useEffect(() => {
    if (useAgentStore.getState().isLoading) return
    if (!activeSessionId) {
      if (useChatStore.getState().sessions.length === 0) {
        createNewSession()
      }
      return
    }

    const timer = setTimeout(() => {
      const activeSession = getActiveSession()
      if (!activeSession) return

      if (messages.length > 0 || currentSubgraph || riskReport) {
        let newTitle = activeSession.title
        if ((!newTitle || newTitle === '新会话') && messages.length > 0) {
          const firstUserMsg = messages.find((m) => m.role === 'user')
          if (firstUserMsg) {
            newTitle =
              firstUserMsg.content.slice(0, 20) +
              (firstUserMsg.content.length > 20 ? '...' : '')
          }
        }

        updateCurrentSession({
          messages,
          title: newTitle,
          workspaceState: {
            graphData: currentSubgraph,
            riskReport,
            riskStages,
            riskCommunity,
          },
        })
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [
    messages,
    currentSubgraph,
    riskReport,
    activeSessionId,
    updateCurrentSession,
    getActiveSession,
    createNewSession,
  ])

  // Session restoration
  useEffect(() => {
    if (useAgentStore.getState().isLoading) return
    const session = getActiveSession()
    if (!session) return

    // Migrate old 'analysis' panel setting to 'graph'
    const savedPanel: string = session.workspaceState.riskReport
      ? 'risk'
      : session.workspaceState.graphData
        ? 'graph'
        : 'graph'

    useAgentStore.setState({
      messages: session.messages,
      currentSubgraph: session.workspaceState.graphData,
      riskReport: session.workspaceState.riskReport || null,
      riskStages: session.workspaceState.riskStages || [],
      riskCommunity: session.workspaceState.riskCommunity || null,
      activeRightPanel: (savedPanel === 'analysis' ? 'graph' : savedPanel) as 'graph' | 'risk',
    })

    if (session.workspaceState.graphData && graphRef.current) {
      graphRef.current.refresh(session.workspaceState.graphData, [])
      setTimeout(() => graphRef.current?.fitView(), 300)
    }
  }, [activeSessionId])

  // Update graph when subgraph changes
  useEffect(() => {
    if (currentSubgraph && graphRef.current) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
      const query = lastUserMsg?.content || ''

      // Extract subject entity names from query and match against graph nodes
      const subjectIds = extractSubjectEntityIds(query, currentSubgraph.nodes)
      const neighborIds = findNeighborIds(subjectIds, currentSubgraph.edges)

      graphRef.current.refresh(currentSubgraph, alignmentFeatures, subjectIds, neighborIds)

      if (subjectIds.length > 0) {
        const t = setTimeout(() => {
          graphRef.current?.focusNode(subjectIds[0])
          graphRef.current?.dimNonFocused(subjectIds, neighborIds)
        }, 600)
        return () => clearTimeout(t)
      } else {
        const t = setTimeout(() => graphRef.current?.fitView(), 500)
        return () => clearTimeout(t)
      }
    }
  }, [currentSubgraph, alignmentFeatures])

  const handleEntityHover = useCallback((entityId: string | null) => {
    setHighlightedEntity(entityId)
    if (entityId && graphRef.current) {
      graphRef.current.focusNode(entityId)
    } else if (!entityId && graphRef.current) {
      graphRef.current.resetHighlight()
    }
  }, [])

  const handleNodeDoubleClick = useCallback(
    (nodeId: string, nodeName: string, nodeType: string) => {
      setGraphInjectedEntity({ id: nodeId, name: nodeName, type: nodeType })
    },
    []
  )

  const handleEntityClick = useCallback((entityId: string, entityType: string) => {
    useAgentStore.setState({ activeRightPanel: 'graph' })
    if (graphRef.current) {
      graphRef.current.searchAndExpand(entityId, entityType)
    }
  }, [])

  const handleJumpToGraph = useCallback(
    (entityId: string, entityName: string, entityType: string) => {
      useAgentStore.setState({ activeRightPanel: 'graph' })
      if (graphRef.current) {
        graphRef.current.searchAndExpand(entityId, entityType)
      }
    },
    []
  )

  const handleAddMonitor = useCallback(
    async (entityName: string, entityType: string) => {
      try {
        const resp = await fetch('/api/v1/risk/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportId: `watch-${entityName}`, assignedDept: '风控部', entityType }),
        })
        if (resp.ok) {
          const data = await resp.json()
          message.success(`Monitor created: ${data?.data?.ticket_id || 'OK'}`)
        } else {
          message.error('Failed to create monitor ticket')
        }
      } catch {
        message.error('Failed to create monitor ticket')
      }
    },
    [message]
  )

  const handleGenerateTicket = useCallback(
    async (recommendation: { action: string; department: string; urgency: string }) => {
      try {
        const reportId = useAgentStore.getState().riskReport?.report_id || 'risk-report'
        const resp = await fetch('/api/v1/risk/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportId, assignedDept: recommendation.department }),
        })
        if (resp.ok) {
          const data = await resp.json()
          message.success(`Ticket created: ${data?.data?.ticket_id || 'OK'}`)
        } else {
          message.error('Failed to create ticket')
        }
      } catch {
        message.error('Failed to create ticket')
      }
    },
    [message]
  )

  const lastQueryText = useMemo(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    return lastUserMsg?.content || ''
  }, [messages])

  const handleBFFSend = useCallback(
    async (query: string) => {
      const history = useAgentStore
        .getState()
        .messages.filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-4)
        .map((m) => `${m.role === 'user' ? 'User' : 'System'}: ${m.content.slice(0, 100)}`)

      try {
        const params = new URLSearchParams({
          query,
          history: JSON.stringify(history),
        })
        const res = await fetch(`/api/rewrite?${params.toString()}`)
        if (res.ok) {
          const { rewrittenQuery } = await res.json()
          await sendMessage(query, rewrittenQuery)
        } else {
          throw new Error('BFF unreachable')
        }
      } catch (e) {
        console.warn('BFF unavailable, sending original query directly.', e)
        await sendMessage(query)
      }
    },
    [sendMessage]
  )

  // Header component with API health indicator
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    import('./api/agent').then(({ healthCheck }) => {
      healthCheck().then(setApiHealthy).catch(() => setApiHealthy(false))
      intervalRef.current = setInterval(() => {
        healthCheck().then(setApiHealthy).catch(() => setApiHealthy(false))
      }, 15000)
    })
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return (
    <PageContainer
      header={{
        title: '知识图谱问答',
        subTitle: '知识图谱风险分析引擎',
      }}
    >
      <div
        style={{
          display: 'flex',
          height: 'calc(100vh - 120px)',
          overflow: 'hidden',
          background: DESIGN_TOKENS.BG_CANVAS,
          margin: '-24px',
          borderRadius: 0,
        }}
      >
        {/* Sidebar */}
        <ChatSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Workspace */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Header */}
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 24px',
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(20px)',
              borderBottom: `1px solid ${DESIGN_TOKENS.BORDER_DEFAULT}`,
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #2855D1 0%, #1A44B5 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(40, 85, 209, 0.3)',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="12" stroke="#ffffff" strokeWidth="2" opacity="0.3" />
                  <circle cx="16" cy="10" r="3" fill="#ffffff" />
                  <circle cx="10" cy="20" r="2.5" fill="#10B981" />
                  <circle cx="22" cy="20" r="2.5" fill="#F59E0B" />
                  <line x1="16" y1="13" x2="11" y2="18" stroke="#ffffff" strokeWidth="1.5" />
                  <line x1="16" y1="13" x2="21" y2="18" stroke="#ffffff" strokeWidth="1.5" />
                  <line x1="12" y1="20" x2="20" y2="20" stroke="#ffffff" strokeWidth="1.5" />
                </svg>
              </div>
              <div>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#0F172A',
                    letterSpacing: '-0.02em',
                  }}
                >
                  WindEye
                </h1>
                <p style={{ margin: 0, fontSize: 12, color: '#94A3B8' }}>
                  Knowledge Graph Recommendation Engine
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor:
                      apiHealthy === null ? '#94A3B8' : apiHealthy ? '#10B981' : '#EF4444',
                    boxShadow: apiHealthy ? '0 0 8px rgba(16, 185, 129, 0.5)' : 'none',
                    animation: apiHealthy ? 'pulse 2s infinite' : 'none',
                  }}
                />
                <span style={{ fontSize: 12, color: '#64748B' }}>
                  {apiHealthy === null ? '检测中' : apiHealthy ? 'API 在线' : 'API 离线'}
                </span>
              </div>
            </div>
          </header>

          {/* Main content: Left Chat + Right Panel */}
          <div
            style={{
              display: 'flex',
              flex: 1,
              overflow: 'hidden',
              padding: '16px',
              gap: '16px',
            }}
          >
            {/* Left: Chat Panel */}
            <div
              style={{
                width: 'clamp(320px, 32vw, 520px)',
                flexShrink: 0,
                borderRadius: 20,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                background: '#fff',
                boxShadow: DESIGN_TOKENS.SHADOW_MD,
                border: `1px solid ${DESIGN_TOKENS.BORDER_DEFAULT}`,
              }}
            >
              <WorkspaceContainer
                messages={messages}
                isLoading={isLoading}
                pendingRecommendations={pendingRecommendations}
                onSendMessage={handleBFFSend}
                onClearHistory={clearHistory}
                onEntityHover={handleEntityHover}
                onEntityClick={handleEntityClick}
                highlightedEntity={highlightedEntity}
                graphInjectedEntity={graphInjectedEntity}
                onClearGraphInject={() => setGraphInjectedEntity(null)}
              />

              {clarifyMessage && (
                <div
                  style={{
                    margin: '0 16px 16px',
                    padding: '10px 14px',
                    background: 'rgba(245,169,66,0.12)',
                    border: '1px solid rgba(245,169,66,0.3)',
                    borderRadius: 10,
                    fontSize: 13,
                    color: '#92400e',
                    lineHeight: 1.6,
                  }}
                >
                  <strong
                    style={{
                      fontSize: 12,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    Needs Clarification
                  </strong>
                  <div style={{ marginTop: 6 }}>{clarifyMessage}</div>
                </div>
              )}
            </div>

            {/* Right: Graph / Analysis Panel */}
            <div
              style={{
                flex: 1,
                borderRadius: 20,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                background: '#fff',
                boxShadow: DESIGN_TOKENS.SHADOW_MD,
                border: `1px solid ${DESIGN_TOKENS.BORDER_DEFAULT}`,
              }}
            >
              <div
                style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255, 255, 255, 0.5)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <Segmented
                  options={[
                    { label: '知识图谱', value: 'graph' },
                    { label: '风险报告', value: 'risk' },
                  ]}
                  value={activeRightPanel}
                  onChange={(val) =>
                    useAgentStore.setState({ activeRightPanel: val as 'graph' | 'risk' })
                  }
                  size="middle"
                  style={{
                    background: '#f1f5f9',
                    padding: '2px',
                    borderRadius: '10px',
                  }}
                />
              </div>

              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {activeRightPanel === 'risk' ? (
                  <RiskReportPanel
                    report={riskReport}
                    stages={riskStages}
                    community={riskCommunity}
                    isLoading={isLoading}
                    error={error}
                    onJumpToGraph={handleJumpToGraph}
                    onAddMonitor={handleAddMonitor}
                    onGenerateTicket={handleGenerateTicket}
                    onRetry={retryRiskQuery}
                    queryText={lastQueryText}
                  />
                ) : (
                  <EnhancedGraphPanel
                    ref={graphRef}
                    subgraph={currentSubgraph}
                    alignmentFeatures={alignmentFeatures}
                    onNodeDoubleClick={handleNodeDoubleClick}
                    onNodeHover={(nodeId) => setHighlightedEntity(nodeId)}
                    highlightedEntity={highlightedEntity}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </PageContainer>
  )
}

export default KnowledgeQA
