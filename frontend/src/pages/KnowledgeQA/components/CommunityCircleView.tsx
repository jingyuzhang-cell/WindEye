import React, { useEffect, useMemo, useRef, useState } from 'react'
import G6 from '@antv/g6'
import { Empty, Progress, Tag, Typography } from 'antd'
import {
  ClusterOutlined, AimOutlined, NodeIndexOutlined,
  WarningOutlined, BankOutlined, UserOutlined,
  AlertOutlined, FileTextOutlined, ToolOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import type {
  Subgraph, CommunityItem, EntityCommunityMap, RiskPath, ResolvedEntity,
  SubgraphNode, SubgraphEdge,
} from '../types/api'
import { COMMUNITY_COLORS, RISK_LEVEL_VISUAL } from './graphStyles'

const { Text } = Typography

// ── Types ────────────────────────────────────────────────────────────────────

interface CircleNode {
  nodeId: string
  label: string
  entityType: string
  hopLevel: number
  primaryCommunityId: number | null
  riskLevel: 'high' | 'medium' | 'low' | null
  matchedPathIds: string[]
  role: 'core' | 'bridge' | 'member'
  complianceScore: number | null
}

interface CommunityCircleViewProps {
  currentSubgraph: Subgraph | null
  communities: CommunityItem[]
  entityCommunityMap: EntityCommunityMap | null
  riskPaths: RiskPath[]
  resolvedEntities: ResolvedEntity[]
  complianceScores?: Record<string, number>
  queryText?: string
  onJumpToGraph?: (entityId: string, entityName: string, entityType: string) => void
}

// ── Layout constants ─────────────────────────────────────────────────────────

const RING_RADII = [0, 130, 260, 400]
const RING_LABELS = ['查询主体', '直接关联', '扩展群体', '风险治理']
const RING_NODE_SIZES = [32, 26, 22, 18]
const CENTER_RING_RADIUS = 30

// ── Helpers ──────────────────────────────────────────────────────────────────

function getNodeLabel(node: SubgraphNode): string {
  return (node.name || node.title || node.zh_name || node.id || '').slice(0, 15)
}

function getNodeType(node: SubgraphNode): string {
  return node.type || 'Unknown'
}

function bfsHopLevels(
  nodes: SubgraphNode[],
  edges: SubgraphEdge[],
  seedIds: Set<string>,
): Map<string, number> {
  const levels = new Map<string, number>()
  const adj = new Map<string, Set<string>>()

  for (const n of nodes) {
    adj.set(n.id, new Set())
  }
  for (const e of edges) {
    adj.get(e.source)?.add(e.target)
    adj.get(e.target)?.add(e.source)
  }

  // BFS from seed nodes
  const queue: string[] = []
  for (const sid of seedIds) {
    if (adj.has(sid)) {
      levels.set(sid, 0)
      queue.push(sid)
    }
  }
  if (queue.length === 0 && nodes.length > 0) {
    // Fallback: pick highest-degree node
    let best = nodes[0].id
    let bestDeg = 0
    for (const n of nodes) {
      const deg = adj.get(n.id)?.size ?? 0
      if (deg > bestDeg) { bestDeg = deg; best = n.id }
    }
    levels.set(best, 0)
    queue.push(best)
  }

  while (queue.length > 0) {
    const cur = queue.shift()!
    const curLevel = levels.get(cur)!
    const nextLevel = Math.min(curLevel + 1, 3)
    for (const nb of adj.get(cur) ?? []) {
      if (!levels.has(nb)) {
        levels.set(nb, nextLevel)
        if (nextLevel < 3) queue.push(nb)
      }
    }
  }

  // Unreachable nodes → level 3
  for (const n of nodes) {
    if (!levels.has(n.id)) levels.set(n.id, 3)
  }

  return levels
}

// ── Data enrichment ──────────────────────────────────────────────────────────

function enrichCircleData(
  subgraph: Subgraph | null,
  communities: CommunityItem[],
  entityCommMap: EntityCommunityMap | null,
  riskPaths: RiskPath[],
  resolvedEntities: ResolvedEntity[],
  queryText?: string,
  complianceScores?: Record<string, number>,
): CircleNode[] {
  if (!subgraph || subgraph.nodes.length === 0) return []

  const { nodes, edges } = subgraph

  // 1. Identify seed (subject) nodes
  const seedIds = new Set<string>()
  for (const re of resolvedEntities) {
    if (re.match_type !== 'unresolved' && re.kg_node_id) {
      seedIds.add(re.kg_node_id)
    }
  }
  if (seedIds.size === 0 && queryText) {
    const lower = queryText.toLowerCase()
    for (const n of nodes) {
      const name = getNodeLabel(n).toLowerCase()
      if (lower.includes(name) || name.includes(lower)) {
        seedIds.add(n.id)
      }
    }
  }

  // 2. BFS hop levels
  const hopLevels = bfsHopLevels(nodes, edges, seedIds)

  // 3. Build community + role map (nodeId → communities)
  const nodeCommunities = new Map<string, number[]>()
  const nodeRole = new Map<string, 'core' | 'bridge' | 'member'>()
  const ROLE_PRIORITY: Record<string, number> = { core: 3, bridge: 2, member: 1 }

  if (entityCommMap) {
    for (const entry of entityCommMap.entities) {
      const comms = entry.communities.map((c: { community_id: number }) => c.community_id)
      nodeCommunities.set(entry.id, comms)
      // Extract highest-priority role from all matched communities
      for (const c of entry.communities) {
        const role = (c as any).role as string | undefined
        if (role && ROLE_PRIORITY[role]) {
          const existing = nodeRole.get(entry.id)
          if (!existing || ROLE_PRIORITY[role] > ROLE_PRIORITY[existing]) {
            nodeRole.set(entry.id, role as 'core' | 'bridge' | 'member')
          }
        }
      }
    }
  }
  // Fallback from community members (no role data → default 'member')
  for (const comm of communities) {
    for (const member of comm.members) {
      if (!nodeCommunities.has(member.id)) {
        nodeCommunities.set(member.id, [comm.community_id])
      }
      if (!nodeRole.has(member.id)) {
        nodeRole.set(member.id, 'member')
      }
    }
  }

  // 4. Build risk level map (entityName → { riskLevel, pathIds })
  const entityRisk = new Map<string, { level: 'high' | 'medium' | 'low'; pathIds: string[] }>()
  const riskRank: Record<string, number> = { high: 3, medium: 2, low: 1 }
  for (const path of riskPaths) {
    for (const name of path.affected_entities) {
      const existing = entityRisk.get(name)
      if (!existing || riskRank[path.risk_level] > riskRank[existing.level]) {
        entityRisk.set(name, { level: path.risk_level, pathIds: [path.path_id] })
      } else if (existing && riskRank[path.risk_level] === riskRank[existing.level]) {
        existing.pathIds.push(path.path_id)
      }
    }
  }

  // 5. Assemble CircleNode[]
  const result = nodes.map((n: SubgraphNode) => {
    const label = getNodeLabel(n)
    const commIds = nodeCommunities.get(n.id) ?? []
    const risk = entityRisk.get(label) || entityRisk.get(n.name ?? '') || entityRisk.get(n.id)
    const score = complianceScores?.[n.id] ?? null
    return {
      nodeId: n.id,
      label,
      entityType: getNodeType(n),
      hopLevel: hopLevels.get(n.id) ?? 3,
      primaryCommunityId: commIds.length > 0 ? commIds[0] : null,
      riskLevel: risk?.level ?? null,
      matchedPathIds: risk?.pathIds ?? [],
      role: nodeRole.get(n.id) ?? 'member',
      complianceScore: score != null ? Math.round(score) : null,
    }
  })

  const roleCounts = { core: 0, bridge: 0, member: 0 }
  for (const cn of result) roleCounts[cn.role]++
  const scoredCount = result.filter((cn) => cn.complianceScore != null).length
  console.log(
    '[CommunityCircleView] enrichCircleData result=%d nodes, role counts: core=%d bridge=%d member=%d, complianceScores coverage=%d/%d',
    result.length, roleCounts.core, roleCounts.bridge, roleCounts.member, scoredCount, result.length,
  )

  return result
}

// ── Layout computation ───────────────────────────────────────────────────────

interface LayoutPosition {
  x: number; y: number
}

function computeCircleLayout(
  nodes: CircleNode[],
  cx: number,
  cy: number,
): Map<string, LayoutPosition> {
  const positions = new Map<string, LayoutPosition>()

  // Role → radius multiplier (core inner, bridge mid, member outer)
  const ROLE_RADIUS: Record<string, number> = { core: 0.70, bridge: 0.85, member: 1.00 }

  for (let ring = 0; ring <= 3; ring++) {
    const ringNodes = nodes.filter(n =>
      ring === 0 ? n.hopLevel === 0 : n.hopLevel === ring,
    )
    if (ringNodes.length === 0) continue

    // Group by community, then by role within each community
    const groups = new Map<number | null, CircleNode[]>()
    for (const n of ringNodes) {
      const gid = n.primaryCommunityId
      if (!groups.has(gid)) groups.set(gid, [])
      groups.get(gid)!.push(n)
    }

    const baseRadius = ring === 0 ? CENTER_RING_RADIUS : RING_RADII[ring]
    let sectorStart = 0

    for (const [, members] of groups) {
      const sectorAngle = (members.length / ringNodes.length) * 2 * Math.PI

      // Within this community sector, position by role (inner→outer)
      // Sort: core first (so inner), member last (so outer)
      const byRole = { core: [] as CircleNode[], bridge: [] as CircleNode[], member: [] as CircleNode[] }
      for (const n of members) byRole[n.role].push(n)

      const roleOrder: Array<'core' | 'bridge' | 'member'> = ['core', 'bridge', 'member']
      for (const role of roleOrder) {
        const roleNodes = byRole[role]
        if (roleNodes.length === 0) continue
        const radius = baseRadius * ROLE_RADIUS[role]
        roleNodes.forEach((n, j) => {
          const angle = sectorStart + (roleNodes.length === 1 ? 0.5 : j / (roleNodes.length - 1)) * sectorAngle
          positions.set(n.nodeId, {
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
          })
        })
      }

      sectorStart += sectorAngle
    }
  }

  console.log('[CommunityCircleView] computeCircleLayout sectors=%d', [...new Set(nodes.map(n => n.primaryCommunityId))].filter(Boolean).length)
  return positions
}

// ── G6 custom layout ─────────────────────────────────────────────────────────

// Register once at module level
let _circleLayoutRegistered = false
function ensureCircleLayout() {
  if (_circleLayoutRegistered) return
  G6.registerLayout('circlePreset', {
    // @ts-ignore
    getDefaultCfg() { return {} },
    // @ts-ignore
    execute() { /* no-op: positions come from node model x/y */ },
  })
  _circleLayoutRegistered = true
}

// ── Entity type icon helper ──────────────────────────────────────────────────

function getEntityIcon(entityType: string): React.ReactNode {
  const t = entityType.toUpperCase()
  if (t === 'COMPANY') return <BankOutlined />
  if (t === 'PERSON') return <UserOutlined />
  if (t === 'EVENT' || t === 'SUB_EVENT') return <AlertOutlined />
  if (t === 'REGULATION' || t === 'LAW') return <FileTextOutlined />
  if (t === 'ACTION') return <ToolOutlined />
  return <AimOutlined />
}

// ── Component ────────────────────────────────────────────────────────────────

const CommunityCircleView: React.FC<CommunityCircleViewProps> = ({
  currentSubgraph,
  communities,
  entityCommunityMap,
  riskPaths,
  resolvedEntities,
  complianceScores,
  queryText,
  onJumpToGraph,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const [dimensions, setDimensions] = useState({ width: 700, height: 480 })
  const [selectedCommunityId, setSelectedCommunityId] = useState<number | null>(null)
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [selectedNodeDetail, setSelectedNodeDetail] = useState<string | null>(null)

  // Enrich data
  const circleNodes = useMemo(
    () => enrichCircleData(currentSubgraph, communities, entityCommunityMap, riskPaths, resolvedEntities, queryText, complianceScores),
    [currentSubgraph, communities, entityCommunityMap, riskPaths, resolvedEntities, queryText, complianceScores],
  )

  // Filter edges to only those where both endpoints are in circleNodes
  const nodeIdSet = useMemo(() => new Set(circleNodes.map(n => n.nodeId)), [circleNodes])
  const circleEdges = useMemo(() => {
    if (!currentSubgraph) return []
    return currentSubgraph.edges.filter((e: SubgraphEdge) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
  }, [currentSubgraph, nodeIdSet])

  // Compute layout positions
  const cx = dimensions.width / 2
  const cy = dimensions.height / 2
  const positions = useMemo(
    () => computeCircleLayout(circleNodes, cx, cy),
    [circleNodes, cx, cy],
  )

  // Build nodeId → G6 model map for quick lookup
  const circleNodeMap = useMemo(() => {
    const m = new Map<string, CircleNode>()
    for (const cn of circleNodes) m.set(cn.nodeId, cn)
    return m
  }, [circleNodes])

  // Community summary for sidebar
  const communitySummary = useMemo(() => {
    const counts = new Map<number, { size: number; members: CircleNode[] }>()
    for (const cn of circleNodes) {
      if (cn.primaryCommunityId != null) {
        if (!counts.has(cn.primaryCommunityId)) {
          counts.set(cn.primaryCommunityId, { size: 0, members: [] })
        }
        const entry = counts.get(cn.primaryCommunityId)!
        entry.size++
        entry.members.push(cn)
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1].size - a[1].size)
  }, [circleNodes])

  // Initialize G6 graph
  useEffect(() => {
    ensureCircleLayout()
    if (!containerRef.current) return

    const { width, height } = dimensions

    const graph = new G6.Graph({
      container: containerRef.current,
      width,
      height,
      layout: { type: 'circlePreset' } as any,
      fitView: false,
      animate: false,
      modes: { default: ['drag-canvas', 'zoom-canvas'] },
      defaultNode: {
        type: 'circle',
        size: 20,
        style: { fill: '#d9d9d9', stroke: '#bfbfbf', lineWidth: 1 },
      },
      defaultEdge: {
        type: 'line',
        style: { stroke: '#cbd5e1', lineWidth: 0.6, opacity: 0.4 },
      },
      nodeStateStyles: {
        dimmed: { opacity: 0.12 },
        highlighted: {
          stroke: '#2855D1',
          lineWidth: 3,
          shadowColor: 'rgba(40,85,209,0.5)',
          shadowBlur: 12,
        },
      },
      edgeStateStyles: {
        dimmed: { opacity: 0.05 },
        'path-highlight': { stroke: '#f5222d', lineWidth: 2.5, opacity: 1 },
      },
    })

    graphRef.current = graph

    // Hover tooltip (inline)
    graph.on('node:mouseenter', (e: any) => {
      const model = e.item.getModel()
      setHoveredNodeId(model.id)
    })
    graph.on('node:mouseleave', () => setHoveredNodeId(null))

    // Cleanup
    return () => {
      graph.destroy()
      graphRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update graph data when circleNodes / positions change
  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return

    const g6Nodes = circleNodes.map(cn => {
      const pos = positions.get(cn.nodeId)
      const communityColor = cn.primaryCommunityId != null
        ? COMMUNITY_COLORS[cn.primaryCommunityId % COMMUNITY_COLORS.length]
        : '#d9d9d9'

      // Role visual style
      let lineWidth = 1
      let lineDash: number[] | undefined
      if (cn.role === 'core') {
        lineWidth = 3
        lineDash = undefined
      } else if (cn.role === 'bridge') {
        lineWidth = 2
        lineDash = [5, 3]
      } else {
        lineWidth = 1
        lineDash = undefined
      }

      // Compliance fill opacity
      let fillOpacity = 1.0
      if (cn.complianceScore != null) {
        if (cn.complianceScore >= 80) fillOpacity = 1.0
        else if (cn.complianceScore >= 60) fillOpacity = 0.7
        else if (cn.complianceScore >= 40) fillOpacity = 0.5
        else fillOpacity = 0.35
      }

      // Stroke: risk level takes priority; compliance low-score adds warning
      const riskVisual = cn.riskLevel ? RISK_LEVEL_VISUAL[cn.riskLevel] : null
      let strokeColor = communityColor + '99'
      if (riskVisual) {
        strokeColor = riskVisual.border
        lineWidth = cn.riskLevel === 'high' ? 3 : cn.riskLevel === 'medium' ? 2 : 1.5
      } else if (cn.complianceScore != null && cn.complianceScore < 40) {
        strokeColor = '#f5222d'
        lineWidth = 2.5
      }

      const size = RING_NODE_SIZES[Math.min(cn.hopLevel, 3)] ?? 18

      return {
        id: cn.nodeId,
        label: cn.label,
        x: pos?.x ?? 0,
        y: pos?.y ?? 0,
        size,
        style: { fill: communityColor, stroke: strokeColor, lineWidth, lineDash, fillOpacity },
        _communityId: cn.primaryCommunityId,
        _riskLevel: cn.riskLevel,
        _matchedPathIds: cn.matchedPathIds,
        _entityType: cn.entityType,
        _hopLevel: cn.hopLevel,
        _role: cn.role,
        _complianceScore: cn.complianceScore,
      }
    })

    const g6Edges = circleEdges.map((e: SubgraphEdge, i: number) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
    }))

    graph.data({ nodes: g6Nodes as any, edges: g6Edges as any })
    graph.render()
    graph.fitView(60)
    console.log('[CommunityCircleView] render nodes=%d edges=%d', g6Nodes.length, g6Edges.length)
  }, [circleNodes, circleEdges, positions])

  // Apply community / path highlighting
  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return

    const affectedNodeIds = new Set<string>()

    if (selectedPathId) {
      const path = riskPaths.find(p => p.path_id === selectedPathId)
      if (path) {
        for (const cn of circleNodes) {
          if (cn.matchedPathIds.includes(selectedPathId)) {
            affectedNodeIds.add(cn.nodeId)
          }
        }
      }
    }

    if (selectedCommunityId != null) {
      for (const cn of circleNodes) {
        if (cn.primaryCommunityId === selectedCommunityId) {
          affectedNodeIds.add(cn.nodeId)
        }
      }
    }

    const hasSelection = selectedCommunityId != null || selectedPathId != null

    graph.getNodes().forEach((node: any) => {
      const model = node.getModel()
      if (!hasSelection) {
        graph.setItemState(node, 'dimmed', false)
        graph.setItemState(node, 'highlighted', false)
      } else if (affectedNodeIds.has(model.id)) {
        graph.setItemState(node, 'dimmed', false)
        graph.setItemState(node, 'highlighted', true)
      } else {
        graph.setItemState(node, 'highlighted', false)
        graph.setItemState(node, 'dimmed', true)
      }
    })

    graph.getEdges().forEach((edge: any) => {
      const model = edge.getModel()
      if (selectedPathId && affectedNodeIds.has(model.source) && affectedNodeIds.has(model.target)) {
        graph.setItemState(edge, 'dimmed', false)
        graph.setItemState(edge, 'path-highlight', true)
      } else {
        graph.setItemState(edge, 'path-highlight', false)
        graph.setItemState(edge, 'dimmed', hasSelection)
      }
    })

    graph.paint()
  }, [selectedCommunityId, selectedPathId, circleNodes, riskPaths])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setDimensions({ width, height })
          const g = graphRef.current
          if (g) {
            g.changeSize(width, height)
            g.fitView(60)
          }
        }
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Click handler: bind once via ref pattern
  const clickHandlerRef = useRef<((e: any) => void) | null>(null)
  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return

    if (clickHandlerRef.current) {
      graph.off('node:click', clickHandlerRef.current)
    }

    const handler = (e: any) => {
      const model = e.item.getModel()
      const cn = circleNodeMap.get(model.id)
      if (!cn) return
      // Toggle detail panel for this node (or switch to another node)
      setSelectedNodeDetail(prev => prev === cn.nodeId ? null : cn.nodeId)
      // Also apply community + path highlight
      setSelectedCommunityId(cn.primaryCommunityId)
      if (cn.matchedPathIds.length > 0) {
        setSelectedPathId(cn.matchedPathIds[0])
      } else {
        setSelectedPathId(null)
      }
    }
    clickHandlerRef.current = handler
    graph.on('node:click', handler)

    // Click blank area → clear selection
    graph.on('canvas:click', () => {
      setSelectedNodeDetail(null)
      setSelectedCommunityId(null)
      setSelectedPathId(null)
    })

    return () => {
      graph.off('node:click', handler)
      graph.off('canvas:click')
    }
  }, [circleNodeMap])

  // Double-click → jump to graph
  const dblClickRef = useRef<((e: any) => void) | null>(null)
  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return

    if (dblClickRef.current) {
      graph.off('node:dblclick', dblClickRef.current)
    }

    const handler = (e: any) => {
      const model = e.item.getModel()
      onJumpToGraph?.(model.id, model.label, model._entityType || 'Unknown')
    }
    dblClickRef.current = handler
    graph.on('node:dblclick', handler)

    return () => {
      graph.off('node:dblclick', handler)
    }
  }, [onJumpToGraph])

  // ── Empty state ──
  if (!currentSubgraph || currentSubgraph.nodes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 24 }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text type="secondary" style={{ fontSize: 12 }}>暂无子图数据，无法绘制圈层视图</Text>}
        />
      </div>
    )
  }

  if (circleNodes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 24 }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text type="secondary" style={{ fontSize: 12 }}>当前子图规模较小，未检测到明显群体结构</Text>}
        />
      </div>
    )
  }

  // ── Render ──
  return (
    <div style={{ display: 'flex', height: 480, gap: 8 }}>
      {/* Left sidebar: community legend */}
      <div style={{
        width: 130,
        overflowY: 'auto',
        borderRight: '1px solid #f0f0f0',
        paddingRight: 4,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: '#595959' }}>
          <ClusterOutlined style={{ marginRight: 4 }} />
          社区
        </div>
        <div
          onClick={() => setSelectedCommunityId(null)}
          style={{
            padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
            marginBottom: 2, fontSize: 11,
            background: selectedCommunityId === null ? '#e6f7ff' : 'transparent',
            color: selectedCommunityId === null ? '#1890ff' : '#595959',
          }}
        >
          全部显示 ({circleNodes.length})
        </div>
        {communitySummary.map(([cid, info]) => {
          const color = COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length]
          const active = selectedCommunityId === cid
          return (
            <div
              key={cid}
              onClick={() => setSelectedCommunityId(active ? null : cid)}
              style={{
                padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
                marginBottom: 2, fontSize: 11,
                background: active ? '#e6f7ff' : 'transparent',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                backgroundColor: color, display: 'inline-block', flexShrink: 0,
              }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                群体 #{cid}
              </span>
              <span style={{ color: '#8c8c8c', fontSize: 10 }}>{info.size}</span>
            </div>
          )
        })}
      </div>

      {/* Center: G6 canvas + SVG overlay */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        {/* SVG decorative rings */}
        <svg
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none',
          }}
        >
          {RING_RADII.filter(r => r > 0).map((r, i) => (
            <React.Fragment key={i}>
              <circle
                cx={cx} cy={cy} r={r}
                fill="none" stroke="#e2e8f0" strokeWidth={1}
                strokeDasharray="6,4" opacity={0.5}
              />
              <text
                x={cx + r + 4} y={cy - 2}
                fill="#94a3b8" fontSize={10}
                style={{ userSelect: 'none' }}
              >
                {RING_LABELS[i + 1]}
              </text>
            </React.Fragment>
          ))}
          {/* Center label */}
          <circle cx={cx} cy={cy} r={CENTER_RING_RADIUS + 4} fill="none" stroke="#e2e8f0" strokeWidth={1} opacity={0.3} />
          <text x={cx - 20} y={cy + 4} fill="#94a3b8" fontSize={10} style={{ userSelect: 'none' }}>
            {RING_LABELS[0]}
          </text>
        </svg>

        {/* Hover tooltip */}
        {hoveredNodeId && circleNodeMap.has(hoveredNodeId) && (() => {
          const cn = circleNodeMap.get(hoveredNodeId)!
          const riskColors: Record<string, string> = { high: '#f5222d', medium: '#faad14', low: '#52c41a' }
          const roleLabels: Record<string, string> = { core: '核心', bridge: '桥梁', member: '成员' }
          const scoreColor = cn.complianceScore != null
            ? cn.complianceScore >= 80 ? '#52c41a' : cn.complianceScore >= 60 ? '#faad14' : cn.complianceScore >= 40 ? '#fa8c16' : '#f5222d'
            : undefined
          return (
            <div style={{
              position: 'absolute', top: 8, right: 8,
              background: '#fff', borderRadius: 6, padding: '6px 10px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)', fontSize: 11,
              maxWidth: 220, zIndex: 10, pointerEvents: 'none',
              border: '1px solid #e8e8e8',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                {getEntityIcon(cn.entityType)}
                {cn.label}
              </div>
              <div style={{ color: '#8c8c8c', fontSize: 10 }}>
                类型: {cn.entityType || '未知'} | 层级: {RING_LABELS[cn.hopLevel]}
              </div>
              <div style={{ color: '#8c8c8c', fontSize: 10 }}>
                角色: {roleLabels[cn.role] || cn.role}
                {cn.complianceScore != null && (
                  <span style={{ color: scoreColor, fontWeight: 600, marginLeft: 8 }}>
                    合规: {cn.complianceScore}/100
                  </span>
                )}
              </div>
              {cn.primaryCommunityId != null && (
                <Tag style={{ marginTop: 2, fontSize: 10, lineHeight: '16px' }} color="purple">
                  群体 #{cn.primaryCommunityId}
                </Tag>
              )}
              {cn.riskLevel && (
                <Tag style={{ marginTop: 2, fontSize: 10, lineHeight: '16px' }} color={riskColors[cn.riskLevel]}>
                  {cn.riskLevel === 'high' ? '高风险' : cn.riskLevel === 'medium' ? '中风险' : '低风险'}
                </Tag>
              )}
              {cn.matchedPathIds.length > 0 && (
                <div style={{ color: '#595959', fontSize: 9, marginTop: 2 }}>
                  风险路径: {cn.matchedPathIds.join(', ')}
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Right sidebar: node detail panel (when selected) or risk paths */}
      <div style={{
        width: 160,
        overflowY: 'auto',
        borderLeft: '1px solid #f0f0f0',
        paddingLeft: 4,
      }}>
        {selectedNodeDetail && circleNodeMap.has(selectedNodeDetail) ? (() => {
          const cn = circleNodeMap.get(selectedNodeDetail)!
          const riskColors: Record<string, string> = { high: '#f5222d', medium: '#faad14', low: '#52c41a' }
          const roleLabels: Record<string, string> = { core: '核心(core)', bridge: '桥梁(bridge)', member: '成员(member)' }
          // Find entity community entries
          const entityComm = entityCommunityMap?.entities?.find((e: any) => e.id === cn.nodeId || e.name === cn.label)
          return (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: '#595959' }}>
                <InfoCircleOutlined style={{ marginRight: 4 }} />
                节点详情
              </div>
              <div style={{ fontSize: 10, color: '#8c8c8c', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, color: '#262626', fontSize: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {getEntityIcon(cn.entityType)}
                  {cn.label}
                </div>
                <div>ID: {cn.nodeId.slice(0, 20)}...</div>
                <div>类型: {cn.entityType || '未知'}</div>
                <div>层级: {RING_LABELS[cn.hopLevel]}</div>
                <div>角色: {roleLabels[cn.role] || cn.role}</div>
              </div>

              {/* Compliance score */}
              {cn.complianceScore != null ? (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: '#595959', marginBottom: 2 }}>合规评分</div>
                  <Progress
                    percent={cn.complianceScore}
                    size="small"
                    strokeColor={
                      cn.complianceScore >= 80 ? '#52c41a' :
                      cn.complianceScore >= 60 ? '#faad14' :
                      cn.complianceScore >= 40 ? '#fa8c16' : '#f5222d'
                    }
                    format={(p) => `${p}分`}
                    style={{ fontSize: 10 }}
                  />
                </div>
              ) : (
                <div style={{ fontSize: 10, color: '#8c8c8c', marginBottom: 8 }}>合规评分: 暂无数据</div>
              )}

              {/* Community affiliations */}
              {entityComm && entityComm.communities.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: '#595959', marginBottom: 2 }}>所属群体</div>
                  {entityComm.communities.map((c: any, i: number) => (
                    <Tag key={i} style={{ fontSize: 10, lineHeight: '16px', marginBottom: 2 }} color="purple">
                      群体 #{c.community_id} ({c.role || 'member'}, {c.size}成员)
                    </Tag>
                  ))}
                </div>
              )}

              {/* Risk path IDs */}
              {cn.matchedPathIds.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: '#595959', marginBottom: 2 }}>关联风险路径</div>
                  {cn.matchedPathIds.map((pid) => (
                    <div key={pid} style={{ fontSize: 10, color: '#f5222d' }}>{pid}</div>
                  ))}
                </div>
              )}

              {/* Risk level */}
              {cn.riskLevel && (
                <Tag color={riskColors[cn.riskLevel]} style={{ fontSize: 10, lineHeight: '18px' }}>
                  {cn.riskLevel === 'high' ? '高风险' : cn.riskLevel === 'medium' ? '中风险' : '低风险'}
                </Tag>
              )}

              <div style={{ marginTop: 8, borderTop: '1px solid #f0f0f0', paddingTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 9 }}>点击画布空白处关闭</Text>
              </div>
            </>
          )
        })() : (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: '#595959' }}>
              <WarningOutlined style={{ marginRight: 4 }} />
              风险路径
            </div>
            {riskPaths.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 10 }}>暂无风险路径</Text>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[...riskPaths]
                  .sort((a, b) => {
                    const rank: Record<string, number> = { high: 3, medium: 2, low: 1 }
                    return (rank[b.risk_level] ?? 0) - (rank[a.risk_level] ?? 0)
                  })
                  .map(path => {
                    const active = selectedPathId === path.path_id
                    const riskColor = path.risk_level === 'high' ? '#f5222d'
                      : path.risk_level === 'medium' ? '#faad14' : '#52c41a'
                    return (
                      <div
                        key={path.path_id}
                        onClick={() => setSelectedPathId(active ? null : path.path_id)}
                        style={{
                          padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
                          fontSize: 10,
                          background: active ? '#fff7e6' : 'transparent',
                          borderLeft: `3px solid ${riskColor}`,
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}
                      >
                        <NodeIndexOutlined style={{ fontSize: 10, color: riskColor }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {path.path_id}
                        </span>
                        <Tag
                          color={riskColor}
                          style={{ fontSize: 9, lineHeight: '14px', margin: 0, padding: '0 3px' }}
                        >
                          {path.risk_level === 'high' ? '高' : path.risk_level === 'medium' ? '中' : '低'}
                        </Tag>
                      </div>
                    )
                  })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default CommunityCircleView
