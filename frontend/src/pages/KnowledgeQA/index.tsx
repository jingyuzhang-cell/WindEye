import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { PageContainer } from '@ant-design/pro-components'
import { Segmented, App, Drawer, Tag, Button, Tooltip } from 'antd'
import { BugOutlined } from '@ant-design/icons'
import { WorkspaceContainer } from './components/WorkspaceContainer'
import { EnhancedGraphPanel, EnhancedGraphPanelHandle } from './components/EnhancedGraphPanel'
import GlobalCommunityGraph from './components/GlobalCommunityGraph'
import RiskReportPanel from './components/RiskReportPanel'
import ComplianceAnalysisPanel from './components/ComplianceAnalysisPanel'
import AgentTracePanel from './components/AgentTracePanel'
import LegendPanel, { LegendStats } from './components/LegendPanel'
import { ChatSidebar } from './components/ChatSidebar'
import { useAgentStore, normalizeSubgraphNodes, normalizeSubgraphEdges } from './store/agentStore'
import { useChatStore } from './store/chatStore'
import { DESIGN_TOKENS } from './styles/constants'
import { NODE_TYPE_COLORS, NODE_TYPE_LABELS, RELATION_LABELS, RISK_LEVEL_VISUAL } from './components/graphStyles'
import type { SubgraphNode } from './types/api'

const RELATION_TEXT: Record<string, string> = {
  INVEST: '投资',
  GUARANTEE: '担保',
  WORK: '任职',
  CONTROLLER: '控制',
  MENTION: '涉及',
  TRIGGERS: '触发',
  REFLECTS: '反映',
  COMPLIES_WITH: '合规',
  CAUSE: '因果',
  BELONG: '归属',
  TRANSACTION: '交易',
  WARNING: '预警',
  RELATED: '关联',
}

type AttributeRow = {
  key: string
  label: string
  value: string
}

const ATTRIBUTE_LABELS: Record<string, string> = {
  entity_id: '实体ID',
  id: '实体ID',
  COMPANY_NM: '公司名称',
  COMPANY_NAME: '公司名称',
  PERSON_NM: '人员姓名',
  PERSON_NAME: '人员姓名',
  name: '名称',
  title: '标题',
  label: '标签',
  STATUS: '状态',
  LEGAL_PERSON: '法定代表人',
  LEGAL_REPRESENTATIVE: '法定代表人',
  REG_CAPITAL: '注册资本',
  ESTABLISH_DATE: '成立日期',
  INDUSTRY: '所属行业',
  ADDRESS: '注册地址',
  CREDIT_CODE: '统一社会信用代码',
  RISK_INFO: '风险信息',
  WARNING_NUM: '预警次数',
  EVENT_TYPE: '事件类型',
  EVENT_DATE: '事件日期',
  AMOUNT: '金额',
  POSITION: '职位',
  role: '角色',
  score: '匹配分数',
  risk_level: '风险等级',
  compliance_score: '合规总分',
  entity_type: '实体类型',
  type: '实体类型',
}

const HIDDEN_ATTRIBUTE_KEYS = new Set([
  'raw',
  'properties',
  'embedding',
  'vector',
  'graph_embedding',
  'semantic_embedding',
  'poster',
  'poster_url',
])

function formatAttributeValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (Array.isArray(value)) return value.map(formatAttributeValue).filter(Boolean).join('、')
  if (typeof value === 'object') {
    try {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .slice(0, 6)
      return entries.map(([k, v]) => `${ATTRIBUTE_LABELS[k] || k}: ${formatAttributeValue(v)}`).join('；')
    } catch {
      return ''
    }
  }
  return String(value)
}

function getNodeAttributes(node: SubgraphNode): AttributeRow[] {
  const props = (node.properties || {}) as Record<string, unknown>
  const fields: Record<string, unknown> = {
    entity_id: node.id,
    entity_type: node.entity_type || node.entityType || node.type,
    ...props,
    risk_level: node.risk_level,
    compliance_score: node.compliance_score,
    score: node.score,
  }

  const displayName = node.title || node.zh_name || node.name || node.label || node.id
  const seen = new Set<string>()
  return Object.entries(fields)
    .filter(([key, value]) => {
      if (HIDDEN_ATTRIBUTE_KEYS.has(key)) return false
      if (value === undefined || value === null || value === '') return false
      const text = formatAttributeValue(value)
      if (!text || (key !== 'entity_id' && text === String(displayName))) return false
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(([key, value]) => ({
      key,
      label: ATTRIBUTE_LABELS[key] || key.replace(/_/g, ' '),
      value: formatAttributeValue(value),
    }))
    .slice(0, 18)
}

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
    sendUnifiedMessage,
    clearHistory,
    pendingRecommendations,
    clarifyMessage,
    activeRightPanel,
    riskReport,
    riskStages,
    riskCommunity,
    riskEntityCommunityMap,
    resolvedEntities,
    riskScores,
    governancePlan,
    complianceScores,
    complianceIndicators,
    error,
    retryRiskQuery,
    agentTraces,
    expandedCommunityResult,
    expandedCommunityId,
    selectedRiskPathId,
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
  const [contextInjectedEntity, setContextInjectedEntity] = useState<{
    id: string
    name: string
    type: string
    nonce: number
  } | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [graphStats, setGraphStats] = useState<LegendStats | null>(null)
  const [drawerNode, setDrawerNode] = useState<SubgraphNode | null>(null)
  const [tracePanelVisible, setTracePanelVisible] = useState(false)
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
    new Set([...Object.keys(NODE_TYPE_LABELS), ...Object.keys(RELATION_LABELS)])
  )

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

    // Normalize stored graph data (handles old sessions with Neo4j-format nodes)
    const rawGraph = session.workspaceState.graphData as any
    const normalizedGraph = rawGraph ? {
      nodes: normalizeSubgraphNodes(rawGraph.nodes || []),
      edges: normalizeSubgraphEdges(rawGraph.edges || []),
      paths: rawGraph.paths || [],
    } : null

    useAgentStore.setState({
      messages: session.messages,
      currentSubgraph: normalizedGraph as typeof rawGraph,
      riskReport: session.workspaceState.riskReport || null,
      riskStages: session.workspaceState.riskStages || [],
      riskCommunity: (session.workspaceState as any).riskCommunity || null,
      activeRightPanel: (savedPanel === 'analysis' ? 'graph' : savedPanel) as 'graph' | 'risk' | 'compliance',
    })

    if (normalizedGraph && graphRef.current) {
      graphRef.current.refresh(normalizedGraph, [])
      setTimeout(() => graphRef.current?.fitView(), 300)
    }
  }, [activeSessionId])

  // Update graph when subgraph changes
  useEffect(() => {
    if (!currentSubgraph) return

    const doRefresh = () => {
      if (!graphRef.current) return false

      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
      const query = lastUserMsg?.content || ''

      const subjectIds = extractSubjectEntityIds(query, currentSubgraph.nodes)
      const neighborIds = findNeighborIds(subjectIds, currentSubgraph.edges)

      graphRef.current.refresh(currentSubgraph, alignmentFeatures, subjectIds, neighborIds)

      if (subjectIds.length > 0) {
        setTimeout(() => {
          graphRef.current?.focusNode(subjectIds[0])
          graphRef.current?.dimNonFocused(subjectIds, neighborIds)
        }, 600)
      } else {
        setTimeout(() => graphRef.current?.fitView(), 500)
      }
      return true
    }

    if (!doRefresh()) {
      // Graph not ready yet — retry once after a short delay
      console.log('[KnowledgeQA] graphRef not ready, retrying refresh in 100ms...')
      const retryTimer = setTimeout(() => {
        if (!doRefresh()) {
          console.warn('[KnowledgeQA] graphRef still not ready after retry — subgraph data may not be rendered')
        }
      }, 100)
      return () => clearTimeout(retryTimer)
    }
  }, [currentSubgraph, alignmentFeatures, riskEntityCommunityMap])

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

  const handleAddRiskSubjectToContext = useCallback(
    (entityId: string, entityName: string, entityType: string) => {
      setContextInjectedEntity({
        id: entityId || entityName,
        name: entityName || entityId,
        type: entityType || 'COMPANY',
        nonce: Date.now(),
      })
    },
    []
  )

  // ── Graph stats & node click handlers ──
  const handleNodeClick = useCallback((node: SubgraphNode) => {
    setDrawerNode(node)
  }, [])

  const handleCanvasClick = useCallback(() => {
    setDrawerNode(null)
    setVisibleCategories(new Set([...Object.keys(NODE_TYPE_LABELS), ...Object.keys(RELATION_LABELS)]))
  }, [])

  const handleDrawerClose = useCallback(() => {
    setDrawerNode(null)
    graphRef.current?.translateCanvas(0, 0)
  }, [])

  const handleDrawerJumpToNode = useCallback((nodeId: string, nodeName: string) => {
    const subgraph = useAgentStore.getState().currentSubgraph
    const targetNode = subgraph?.nodes.find((n) => String(n.id) === nodeId)
    if (targetNode) {
      setDrawerNode(targetNode)
      graphRef.current?.focusNode(nodeId)
    }
  }, [])

  const handleLegendToggle = useCallback((cat: string) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
    graphRef.current?.toggleCategory(cat)
  }, [])

  const handleLegendHighlight = useCallback((cat: string | null) => {
    graphRef.current?.applyHighlight(cat)
  }, [])

  const lastQueryText = useMemo(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    return lastUserMsg?.content || ''
  }, [messages])

  const handleBFFSend = useCallback(
    async (query: string) => {
      // XXX: /api/rewrite 暂未实现，直接调用统一链路
      // IntentAgent + Entity Resolution 在后端内部处理 query rewrite
      await sendUnifiedMessage(query)
    },
    [sendUnifiedMessage]
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
        title: '协同治理',
        subTitle: '协同治理引擎',
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
                contextInjectedEntity={contextInjectedEntity}
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
                  flexDirection: 'column',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.5)',
                  backdropFilter: 'blur(10px)',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Segmented
                    options={[
                      { label: '图谱视图', value: 'graph' },
                      { label: '治理报告', value: 'risk' },
                      { label: '合规分析', value: 'compliance' },
                      ...(expandedCommunityResult ? [{ label: '群体图谱', value: 'community_graph' as const }] : []),
                    ]}
                    value={activeRightPanel}
                    onChange={(val) =>
                      useAgentStore.setState({ activeRightPanel: val as 'graph' | 'risk' | 'compliance' })
                    }
                    size="middle"
                    style={{
                      background: '#f1f5f9',
                      padding: '2px',
                      borderRadius: '10px',
                    }}
                  />
                  <Tooltip title={`Agent 调试日志${agentTraces.length > 0 ? ` (${agentTraces.length})` : ''}`}>
                    <Button
                      size="small"
                      type="text"
                      icon={<BugOutlined />}
                      onClick={() => setTracePanelVisible(true)}
                      style={{
                        color: agentTraces.length > 0 ? '#fa8c16' : '#94a3b8',
                        borderRadius: 6,
                      }}
                    />
                  </Tooltip>
                </div>
                {activeRightPanel === 'graph' && graphStats && (
                  <LegendPanel
                    stats={graphStats}
                    visibleCategories={visibleCategories}
                    onToggle={handleLegendToggle}
                    onHighlight={handleLegendHighlight}
                  />
                )}
              </div>

              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {activeRightPanel === 'risk' ? (
                  <RiskReportPanel
                    report={riskReport}
                    stages={riskStages}
                    community={riskCommunity}
                    entityCommunityMap={riskEntityCommunityMap}
                    isLoading={isLoading}
                    error={error}
                    onJumpToGraph={handleJumpToGraph}
                    onAddToContext={handleAddRiskSubjectToContext}
                    onRetry={retryRiskQuery}
                    queryText={lastQueryText}
                    currentSubgraph={currentSubgraph}
                    resolvedEntities={resolvedEntities}
                    riskScores={riskScores}
                    governancePlan={governancePlan}
                    complianceScores={complianceScores}
                  />
                ) : activeRightPanel === 'compliance' ? (
                  <ComplianceAnalysisPanel
                    report={riskReport}
                    currentSubgraph={currentSubgraph}
                    isLoading={isLoading}
                    onJumpToGraph={handleJumpToGraph}
                    complianceIndicators={complianceIndicators}
                  />
                ) : activeRightPanel === 'community_graph' ? (
                  <GlobalCommunityGraph
                    result={expandedCommunityResult}
                    expandedCommunityId={expandedCommunityId}
                    onExpandCommunity={(commId) =>
                      useAgentStore.setState({ expandedCommunityId: commId })
                    }
                  />
                ) : (
                  <EnhancedGraphPanel
                    ref={graphRef}
                    subgraph={currentSubgraph}
                    alignmentFeatures={alignmentFeatures}
                    entityCommunityMap={riskEntityCommunityMap}
                    onNodeDoubleClick={handleNodeDoubleClick}
                    onNodeHover={(nodeId) => setHighlightedEntity(nodeId)}
                    highlightedEntity={highlightedEntity}
                    onNodeClick={handleNodeClick}
                    onCanvasClick={handleCanvasClick}
                    onStatsChange={setGraphStats}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Node Detail Drawer ── */}
      <Drawer
        title={null}
        placement="right"
        width={380}
        open={drawerNode !== null}
        onClose={handleDrawerClose}
        closable={true}
        styles={{ body: { padding: 0 } }}
        maskStyle={{ background: 'rgba(0,0,0,0.05)' }}
      >
        {drawerNode && (() => {
          const subgraph = useAgentStore.getState().currentSubgraph
          const nodeType = drawerNode.type || ''
          const typeColor = NODE_TYPE_COLORS[nodeType] || '#8c8c8c'
          const typeLabel = NODE_TYPE_LABELS[nodeType] || nodeType || '未知'
          const riskLevel = drawerNode.risk_level
          const rv = riskLevel ? RISK_LEVEL_VISUAL[riskLevel] : null

          // Find connected edges and neighbor nodes
          const connectedEdges = (subgraph?.edges || []).filter(
            (e) => String(e.source) === String(drawerNode.id) || String(e.target) === String(drawerNode.id)
          )
          const neighborIds = new Set<string>()
          connectedEdges.forEach((e) => {
            const src = String(e.source); const tgt = String(e.target)
            if (src !== String(drawerNode.id)) neighborIds.add(src)
            if (tgt !== String(drawerNode.id)) neighborIds.add(tgt)
          })
          const neighborNodes = (subgraph?.nodes || []).filter(
            (n) => neighborIds.has(String(n.id))
          )

          const displayName = drawerNode.title || drawerNode.zh_name || drawerNode.name || drawerNode.id
          const attributeRows = getNodeAttributes(drawerNode)

          return (
            <div>
              {/* Header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', lineHeight: 1.3, marginBottom: 10 }}>
                  {displayName}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    color: typeColor, background: `${typeColor}12`, border: `1px solid ${typeColor}30`
                  }}>
                    {typeLabel}
                  </span>
                  {rv && (
                    <span style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      color: rv.border, background: rv.bg, border: `1px solid ${rv.border}40`
                    }}>
                      {rv.label}
                    </span>
                  )}
                  {drawerNode.rating !== undefined && drawerNode.rating !== null && (
                    <span style={{ fontSize: 12, color: '#64748b', padding: '2px 6px' }}>
                      评分: {drawerNode.rating}
                    </span>
                  )}
                  {drawerNode.year && (
                    <span style={{ fontSize: 12, color: '#64748b', padding: '2px 6px' }}>
                      {drawerNode.year}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ padding: '16px 24px' }}>
                {/* Section: Overview / Evidence */}
                {drawerNode.overview && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      溯源文本
                    </div>
                    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.7, maxHeight: 200, overflowY: 'auto', background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
                      {drawerNode.overview.length > 500 ? drawerNode.overview.slice(0, 500) + '...' : drawerNode.overview}
                    </div>
                  </div>
                )}

                {/* Section: Entity Attributes */}
                {attributeRows.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      属性信息 ({attributeRows.length})
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {attributeRows.map((attr) => (
                        <div
                          key={attr.key}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '92px minmax(0, 1fr)',
                            gap: 10,
                            alignItems: 'start',
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: '#f8fafc',
                            border: '1px solid #eef2f7',
                          }}
                        >
                          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                            {attr.label}
                          </div>
                          <div style={{ fontSize: 12, color: '#1e293b', lineHeight: 1.6, wordBreak: 'break-word' }}>
                            {attr.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section: Connected Entities */}
                {neighborNodes.length > 0 && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      关联实体 ({neighborNodes.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {neighborNodes.map((neighbor) => {
                        const nId = String(neighbor.id)
                        const nType = neighbor.type || ''
                        const nColor = NODE_TYPE_COLORS[nType] || '#8c8c8c'
                        const nTypeLabel = NODE_TYPE_LABELS[nType] || nType
                        const nName = neighbor.title || neighbor.zh_name || neighbor.name || neighbor.id
                        // Find relation type
                        const relEdge = connectedEdges.find(
                          (e) => String(e.source) === nId || String(e.target) === nId
                        )
                        const relType = relEdge?.relation || '相关'
                        const relLabel = RELATION_TEXT[relType] || RELATION_LABELS[relType] || relType
                        return (
                          <div
                            key={nId}
                            onClick={() => handleDrawerJumpToNode(nId, String(nName))}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                              borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s',
                              border: '1px solid #f1f5f9',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                          >
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                              background: nColor,
                            }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {String(nName).length > 18 ? String(nName).slice(0, 16) + '...' : nName}
                              </div>
                              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                {nTypeLabel} · {relLabel}
                              </div>
                            </div>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {!drawerNode.overview && attributeRows.length === 0 && neighborNodes.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
                    暂无更多详情
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* Agent Trace Panel */}
      <AgentTracePanel
        traces={agentTraces}
        visible={tracePanelVisible}
        onClose={() => setTracePanelVisible(false)}
        onClear={() => useAgentStore.setState({ agentTraces: [] })}
      />

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
