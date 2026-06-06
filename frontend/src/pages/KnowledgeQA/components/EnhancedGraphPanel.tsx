import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react'
import { Spin, Empty, message, Button, Tooltip } from 'antd'
import G6 from '@antv/g6'
import axios from 'axios'
import type { Subgraph, SubgraphNode, SubgraphEdge, AlignmentFeature, EntityCommunityMap } from '../types/api'
import type { LegendStats } from './LegendPanel'
import NodeContextMenu from './NodeContextMenu'
import GraphToolbar, { LayoutMode } from './GraphToolbar'
import { NODE_TYPE_COLORS, NODE_TYPE_LABELS, RELATION_LABELS, RISK_LEVEL_VISUAL } from './graphStyles'

const VALID_NODE_TYPES = new Set(['COMPANY', 'PERSON', 'EVENT', 'SUB_EVENT', 'TIME', 'RiskFeature', 'RiskFactor', 'Action', 'Regulation', 'Law'])

const NODE_VISUAL: Record<string, { fill: string; stroke: string; size: number; labelOffset: number }> = {
  COMPANY:     { fill: '#BAE7FF', stroke: '#1677ff', size: 34, labelOffset: 10 },
  PERSON:      { fill: '#D3ADF7', stroke: '#722ed1', size: 26, labelOffset: 8 },
  EVENT:       { fill: '#FFA39E', stroke: '#cf1322', size: 30, labelOffset: 10 },
  SUB_EVENT:   { fill: '#FFCCC7', stroke: '#cf1322', size: 20, labelOffset: 6 },
  TIME:        { fill: '#D9D9D9', stroke: '#595959', size: 16, labelOffset: 5 },
  RiskFeature: { fill: '#B7EB8F', stroke: '#389e0d', size: 24, labelOffset: 8 },
  RiskFactor:  { fill: '#95DE64', stroke: '#389e0d', size: 22, labelOffset: 7 },
  Action:      { fill: '#D9D9D9', stroke: '#595959', size: 22, labelOffset: 7 },
  Regulation:  { fill: '#FFE58F', stroke: '#d48806', size: 20, labelOffset: 6 },
  Law:         { fill: '#FFD666', stroke: '#d48806', size: 18, labelOffset: 6 },
}

const NODE_DEFAULT_VISUAL = { fill: '#F5F5F5', stroke: '#8c8c8c', size: 14, labelOffset: 5 }
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

const COMMUNITY_COLORS = [
  '#1890ff', '#f5222d', '#52c41a', '#fa8c16', '#722ed1',
  '#13c2c2', '#eb2f96', '#faad14', '#2f54eb', '#a0d911',
  '#f759ab', '#5cdbd3',
]
const COMMUNITY_BG_COLORS = [
  'rgba(24,144,255,0.12)', 'rgba(245,34,45,0.12)', 'rgba(82,196,26,0.12)', 'rgba(250,140,22,0.12)', 'rgba(114,46,209,0.12)',
  'rgba(19,194,194,0.12)', 'rgba(235,47,150,0.12)', 'rgba(250,173,20,0.12)', 'rgba(47,84,235,0.12)', 'rgba(160,217,17,0.12)',
  'rgba(247,89,171,0.12)', 'rgba(92,219,211,0.12)',
]
const getCommunityColor = (communityId: number): { stroke: string; bg: string } => {
  const idx = (communityId - 1) % COMMUNITY_COLORS.length
  return { stroke: COMMUNITY_COLORS[idx], bg: COMMUNITY_BG_COLORS[idx] }
}

const normalizeNeo4jNode = (raw: any): SubgraphNode => {
  const props = raw.properties || {}
  const labels: string[] = raw.labels || []
  // Expand API returns {id, label, type} with type as a raw Neo4j label — prefer it
  let rawType = raw.type || labels[0] || 'Unknown'

  // Map Neo4j labels to frontend type constants
  const type = rawType === 'Company' ? 'COMPANY'
    : rawType === 'Person' ? 'PERSON'
    : rawType === 'Event' ? 'EVENT'
    : rawType === 'Subject' ? 'COMPANY'
    : rawType === 'Feature' ? 'RiskFeature'
    : rawType === 'Regulation' ? 'Regulation'
    : rawType === 'Law' ? 'Law'
    : VALID_NODE_TYPES.has(rawType) ? rawType
    // Expand API may return types like PFCOMPANY, PFUND, SECURITY, REGULATOR — map to parent layers
    : rawType === 'PFCOMPANY' || rawType === 'PFUND' || rawType === 'SECURITY' ? 'COMPANY'
    : rawType === 'REGULATOR' ? 'EVENT'
    : rawType.toUpperCase?.() || rawType

  return {
    id: String(raw.id),
    type,
    entityType: type,
    entity_type: type,
    label: raw.label || props.title || props.name || props.COMPANY_NM || raw.id,
    score: props.score ?? raw.score ?? 1,
    title: props.title || props.name || props.COMPANY_NM || raw.label || raw.id,
    name: props.name || props.COMPANY_NM || props.title || raw.label || raw.id,
    zh_name: props.zh_name || raw.label || props.name,
    overview: props.overview || props.RISK_INFO || '',
    popularity: props.popularity,
    rating: props.rating,
    year: props.year,
  }
}

const normalizeNeo4jEdge = (raw: any): SubgraphEdge => ({
  source: String(raw.source || raw.start),
  target: String(raw.target || raw.end),
  relation: raw.label || raw.relation || raw.type || 'RELATED',
})

const EDGE_STYLE_MAP: Record<string, { stroke: string; lineDash?: number[]; lineWidth: number; opacity: number }> = {
  // Subject-layer types (from spec — primary display types)
  INVEST:       { stroke: '#1890ff', lineDash: [],       lineWidth: 2,   opacity: 0.8 },
  GUARANTEE:    { stroke: '#faad14', lineDash: [],       lineWidth: 2,   opacity: 0.8 },
  WORK:         { stroke: '#722ed1', lineDash: [],       lineWidth: 1.5, opacity: 0.7 },
  CONTROLLER:   { stroke: '#722ed1', lineDash: [],       lineWidth: 1.5, opacity: 0.7 },
  MENTION:      { stroke: '#f5222d', lineDash: [],       lineWidth: 2,   opacity: 0.8 },
  // Cross-layer types (existing)
  TRIGGERS:       { stroke: '#f5222d', lineDash: [],       lineWidth: 2,   opacity: 0.8 },
  REFLECTS:       { stroke: '#fa8c16', lineDash: [],       lineWidth: 1.5, opacity: 0.7 },
  COMPLIES_WITH:  { stroke: '#722ed1', lineDash: [],       lineWidth: 1.5, opacity: 0.7 },
  CAUSE:          { stroke: '#fa541c', lineDash: [],       lineWidth: 1.5, opacity: 0.7 },
  BELONG:         { stroke: '#52c41a', lineDash: [],       lineWidth: 1,   opacity: 0.5 },
}
const EDGE_DEFAULT_STYLE = { stroke: '#cbd5e1', lineDash: [], lineWidth: 0.8, opacity: 0.4 }
const PATH_EDGE_KEY_SEP = '->'

const assignReadablePositions = (
  nodes: any[],
  edges: Array<{ source: string; target: string; relation?: string }>,
) => {
  if (nodes.length === 0) return

  const adjacency = new Map<string, Set<string>>()
  const relationMap = new Map<string, string>()
  nodes.forEach((node) => adjacency.set(node.id, new Set()))
  edges.forEach((edge) => {
    const source = String(edge.source)
    const target = String(edge.target)
    adjacency.get(source)?.add(target)
    adjacency.get(target)?.add(source)
    relationMap.set(`${source}${PATH_EDGE_KEY_SEP}${target}`, edge.relation || '')
    relationMap.set(`${target}${PATH_EDGE_KEY_SEP}${source}`, edge.relation || '')
  })

  const centerId = nodes
    .slice()
    .sort((a, b) => {
      const degreeDiff = (adjacency.get(b.id)?.size || 0) - (adjacency.get(a.id)?.size || 0)
      if (degreeDiff !== 0) return degreeDiff
      if (a._type === 'COMPANY' && b._type !== 'COMPANY') return -1
      if (b._type === 'COMPANY' && a._type !== 'COMPANY') return 1
      return String(a.label).localeCompare(String(b.label), 'zh-CN')
    })[0]?.id

  const center = nodes.find((node) => node.id === centerId) || nodes[0]
  center.x = 0
  center.y = 0
  center.size = Math.max(Number(center.size) || 0, 72)
  center.style = {
    ...(center.style || {}),
    lineWidth: Math.max(Number(center.style?.lineWidth) || 0, 4),
    shadowBlur: Math.max(Number(center.style?.shadowBlur) || 0, 14),
    shadowColor: center.style?.shadowColor || 'rgba(40, 85, 209, 0.28)',
  }

  const centerNeighbors = new Set(adjacency.get(center.id) || [])
  const ringNodes = nodes
    .filter((node) => node.id !== center.id)
    .sort((a, b) => {
      const relationA = relationMap.get(`${center.id}${PATH_EDGE_KEY_SEP}${a.id}`) || 'ZZZ'
      const relationB = relationMap.get(`${center.id}${PATH_EDGE_KEY_SEP}${b.id}`) || 'ZZZ'
      const relationOrder = ['INVEST', 'MENTION', 'WORK', 'REFLECTS', 'GUARANTEE', 'CONTROLLER']
      const relationDiff = relationOrder.indexOf(relationA) - relationOrder.indexOf(relationB)
      if (relationDiff !== 0) return relationDiff
      return String(a.label).localeCompare(String(b.label), 'zh-CN')
    })

  const oneHop = ringNodes.filter((node) => centerNeighbors.has(node.id))
  const otherHop = ringNodes.filter((node) => !centerNeighbors.has(node.id))
  const radius = Math.max(170, Math.min(230, nodes.length * 24))
  const startAngle = -Math.PI / 2
  const placeOnRing = (items: any[], r: number, angleOffset = 0) => {
    const count = Math.max(1, items.length)
    items.forEach((node, index) => {
      const angle = startAngle + angleOffset + (Math.PI * 2 * index) / count
      node.x = Math.cos(angle) * r
      node.y = Math.sin(angle) * r
    })
  }

  placeOnRing(oneHop, radius)
  placeOnRing(otherHop, radius + 170, Math.PI / Math.max(3, otherHop.length || 3))
}

const buildG6Data = (
  subgraph: Subgraph | null,
  subjectIds?: string[],
  neighborIds?: string[],
  entityCommunityMap?: EntityCommunityMap | null,
) => {
  if (!subgraph) return { nodes: [], edges: [] }

  console.log('[EnhancedGraphPanel] input nodes=%d edges=%d paths=%d', subgraph.nodes?.length || 0, subgraph.edges?.length || 0, subgraph.paths?.length || 0)

  const subjectIdSet = new Set((subjectIds || []).map(String))
  const neighborIdSet = new Set((neighborIds || []).map(String))

  // Compute degree centrality for node sizing
  const degreeMap = new Map<string, number>()
  for (const e of subgraph.edges || []) {
    const src = String(e.source)
    const tgt = String(e.target)
    degreeMap.set(src, (degreeMap.get(src) || 0) + 1)
    degreeMap.set(tgt, (degreeMap.get(tgt) || 0) + 1)
  }
  const maxDegree = Math.max(1, ...Array.from(degreeMap.values()))
  const scaleSize = (degree: number): number => {
    const minSize = 26
    const maxSize = 64
    return minSize + (degree / maxDegree) * (maxSize - minSize)
  }

  // Build path node id set and edge id set for path highlighting
  const pathNodeIds = new Set<string>()
  const pathEdgeKeys = new Set<string>()
  const pathEdgeIds = new Set<string>()
  for (const path of subgraph.paths || []) {
    for (const nid of path.nodeIds || []) {
      pathNodeIds.add(String(nid))
    }
    // Prefer explicit edge_ids when available
    if (path.edgeIds && path.edgeIds.length > 0) {
      for (const eid of path.edgeIds) {
        pathEdgeIds.add(String(eid))
      }
    }
    // Fallback: infer edges from adjacent node pairs
    const nids = path.nodeIds || []
    for (let i = 0; i < nids.length - 1; i++) {
      pathEdgeKeys.add(`${nids[i]}${PATH_EDGE_KEY_SEP}${nids[i + 1]}`)
      pathEdgeKeys.add(`${nids[i + 1]}${PATH_EDGE_KEY_SEP}${nids[i]}`)
      pathEdgeKeys.add(`${nids[i]}→${nids[i + 1]}`)
      pathEdgeKeys.add(`${nids[i + 1]}→${nids[i]}`)
    }
  }

  // Build node → community mapping from entityCommunityMap
  const nodeCommunityMap = new Map<string, { communityIds: number[]; roles: string[] }>()
  if (entityCommunityMap?.entities) {
    for (const entry of entityCommunityMap.entities) {
      if (entry.communities && entry.communities.length > 0) {
        const key = entry.name || entry.id
        nodeCommunityMap.set(key, {
          communityIds: entry.communities.map((c) => c.community_id),
          roles: entry.communities.map((c) => c.role),
        })
      }
    }
  }

  // Resolve node type from unified format: type > entityType > entity_type > labels > heuristics
  const resolveNodeType = (node: SubgraphNode): string => {
    const t = node.type
    if (t && VALID_NODE_TYPES.has(t)) return t
    // Try uppercase variant (e.g. "Company" → "COMPANY")
    if (t) {
      const upper = (t as string).toUpperCase()
      if (upper === 'COMPANY' || upper === 'SUBJECT') return 'COMPANY'
      if (upper === 'PERSON') return 'PERSON'
      if (upper === 'EVENT') return 'EVENT'
      if (upper === 'SUB_EVENT') return 'SUB_EVENT'
      if (upper === 'TIME') return 'TIME'
      if (VALID_NODE_TYPES.has(upper)) return upper
    }
    // Unified format: check entityType then entity_type
    const entType = (node as any).entityType as string | undefined
    if (entType && VALID_NODE_TYPES.has(entType)) return entType
    const entType2 = (node as any).entity_type as string | undefined
    if (entType2 && VALID_NODE_TYPES.has(entType2)) return entType2

    // Neo4j format: type info is in `labels` array
    const labels = (node as any).labels as string[] | undefined
    if (labels && labels.length > 0) {
      for (const label of labels) {
        const upper = typeof label === 'string' ? label.toUpperCase() : ''
        if (upper === 'COMPANY' || upper === 'SUBJECT') return 'COMPANY'
        if (upper === 'PERSON') return 'PERSON'
        if (upper === 'EVENT') return 'EVENT'
        if (upper === 'SUB_EVENT') return 'SUB_EVENT'
        if (upper === 'TIME') return 'TIME'
        if (VALID_NODE_TYPES.has(label)) return label
      }
      // Last resort: check first label after uppercasing
      const first = String(labels[0])
      if (VALID_NODE_TYPES.has(first)) return first
      const upperFirst = first.toUpperCase()
      if (VALID_NODE_TYPES.has(upperFirst)) return upperFirst
    }
    // Absolute fallback: return 'COMPANY' to prevent silent node filtering
    return 'COMPANY'
  }

  // Resolve edge relation from either frontend format (relation) or Neo4j/DRAEngine (label/type)
  const resolveEdgeRelation = (edge: SubgraphEdge): string => {
    return edge.relation || (edge as any).label || (edge as any).type || 'RELATED'
  }

  const validNodeIds = new Set<string>()
  const nodes = subgraph.nodes
    .filter((n: SubgraphNode) => {
      const nt = resolveNodeType(n)
      if (nt === '' || !VALID_NODE_TYPES.has(nt)) {
        console.warn('[EnhancedGraphPanel] Dropped node — resolved type not in VALID_NODE_TYPES:', { id: n.id, title: n.title, type: n.type, resolvedType: nt })
        return false
      }
      return true
    })
    .map((node: SubgraphNode) => {
      const nodeIdStr = String(node.id)
      const nodeType = resolveNodeType(node)
      validNodeIds.add(nodeIdStr)
      const visual = NODE_VISUAL[nodeType] ?? NODE_DEFAULT_VISUAL
      let label = String(node.title || (node as any).label || (node as any).zh_name || (node as any).name || node.id)
      if (label.length > 15) label = label.slice(0, 12) + '...'

      // Risk-level color mapping
      const riskLevel = node.risk_level
      const complianceScore = node.compliance_score ?? (node.properties as any)?.compliance_score
      const riskVisual = riskLevel ? RISK_LEVEL_VISUAL[riskLevel] : null
      const fillColor = riskVisual?.bg || visual.fill
      const strokeColor = riskVisual?.border || visual.stroke

      // Degree-based size
      const deg = degreeMap.get(nodeIdStr) || 1
      const nodeSize = scaleSize(deg)

      const isPathNode = pathNodeIds.has(nodeIdStr)
      const isSubject = subjectIdSet.has(nodeIdStr)
      const isNeighbor = neighborIdSet.has(nodeIdStr)

      // Community coloring
      const nodeName = String(node.title || node.name || node.zh_name || '')
      const communityMatch = nodeCommunityMap.get(nodeName) || nodeCommunityMap.get(String(node.id))
      const communityIds = communityMatch?.communityIds || []
      const communityRoles = communityMatch?.roles || []
      const isBridge = communityRoles.includes('bridge') || communityIds.length >= 2
      const primaryCommunityId = communityIds.length > 0 ? communityIds[0] : null
      const communityColor = primaryCommunityId != null ? getCommunityColor(primaryCommunityId) : null

      // Community-based fill/stroke — bridge nodes get a special dual-color effect
      const communityFill = communityColor && !isSubject && !isPathNode ? communityColor.bg : undefined
      const communityStroke = communityColor ? communityColor.stroke : undefined

      // Keep entity type color visible; path state uses glow instead of replacing all borders.
      const borderColor = isSubject ? '#2855D1'
        : isNeighbor ? '#1890FF'
        : isPathNode ? strokeColor
        : isBridge ? communityStroke || strokeColor
        : communityStroke || strokeColor
      const borderWidth = isSubject ? 4
        : isNeighbor ? 2
        : isPathNode ? 2.5
        : isBridge ? 3
        : 2
      const finalSize = isSubject ? nodeSize * 1.3
        : isBridge ? nodeSize * 1.2
        : isNeighbor ? nodeSize * 1.1
        : nodeSize

      // Bridge nodes: dashed border with community color
      const lineDash = isBridge ? [4, 2] : undefined

      return {
        id: nodeIdStr,
        label,
        _type: nodeType,
        type: 'circle',
        size: finalSize,
        _riskLevel: riskLevel || null,
        _complianceScore: complianceScore ?? null,
        _isPathNode: isPathNode,
        _isSubject: isSubject,
        _isNeighbor: isNeighbor,
        _degree: deg,
        _communityIds: communityIds,
        _isBridge: isBridge,
        style: {
          fill: communityFill || fillColor,
          stroke: borderColor,
          lineWidth: borderWidth,
          lineDash: lineDash,
          cursor: 'pointer',
          shadowColor: riskLevel === 'high' ? 'rgba(245, 34, 45, 0.6)'
            : isSubject ? 'rgba(40, 85, 209, 0.4)'
            : isPathNode ? 'rgba(40, 85, 209, 0.22)'
            : undefined,
          shadowBlur: riskLevel === 'high' ? 20
            : isSubject ? 12
            : isPathNode ? 8
            : 0,
        },
        labelCfg: {
          position: 'bottom',
          offset: visual.labelOffset + Math.max(0, (finalSize - 20) * 0.3),
          style: {
            fill: '#1e293b',
            fontSize: isSubject ? 13 : (nodeType === 'COMPANY' ? 12 : 10),
            fontWeight: isSubject ? 800 : (isNeighbor || isPathNode) ? 700 : (nodeType === 'COMPANY' ? 600 : 500),
            background: {
              fill: 'rgba(255, 255, 255, 0.92)',
              padding: [2, 4, 2, 4],
              radius: 4,
            },
          },
        },
      }
    })
  let renderedPathEdgeCount = 0
  const edges = subgraph.edges
    .filter((e: SubgraphEdge) => validNodeIds.has(String(e.source)) && validNodeIds.has(String(e.target)))
    .map((edge: SubgraphEdge, idx: number) => {
      const relation = resolveEdgeRelation(edge)
      const relationLabel = RELATION_TEXT[relation] || RELATION_LABELS[relation] || relation
      const relStyle = EDGE_STYLE_MAP[relation] ?? EDGE_DEFAULT_STYLE
      // Confidence-based width scaling: strong >0.8 = +1px, weak <0.5 = -0.5px + lower opacity
      const confidence = edge.confidence
      const confWidthAdj = confidence !== undefined
        ? (confidence > 0.8 ? 1 : confidence < 0.5 ? -0.5 : 0)
        : 0
      const confOpacityAdj = confidence !== undefined && confidence < 0.5 ? 0.6 : 1
      const edgeKey = `${edge.source}→${edge.target}`
      const readableEdgeKey = `${edge.source}${PATH_EDGE_KEY_SEP}${edge.target}`
      const isPathEdge = pathEdgeKeys.has(readableEdgeKey) || pathEdgeKeys.has(edgeKey) || pathEdgeIds.has(String(edge.id || ''))
      if (isPathEdge) renderedPathEdgeCount += 1
      return {
        id: String(edge.id || `edge-${idx}`),
        source: String(edge.source),
        target: String(edge.target),
        relation,
        type: 'line',
        _isPathEdge: isPathEdge,
        label: relationLabel,
        labelCfg: {
          autoRotate: true,
          refX: 0,
          refY: 2,
          style: {
            fontSize: 11,
            fill: '#334155',
            fontWeight: 700,
            background: {
              fill: 'rgba(255, 255, 255, 0.96)',
              padding: [2, 5, 2, 5],
              radius: 4,
            },
          },
        },
        style: {
          ...relStyle,
          lineWidth: isPathEdge ? Math.max(3, (relStyle.lineWidth || 1) * 1.8) : (relStyle.lineWidth + confWidthAdj),
          stroke: isPathEdge ? '#2855D1' : relStyle.stroke,
          lineDash: [],
          opacity: isPathEdge ? 1 : relStyle.opacity * confOpacityAdj,
          endArrow: true,
        },
      }
    })
  assignReadablePositions(nodes, edges)
  console.log(`[buildG6Data] rendered nodes=${nodes.length} edges=${edges.length} pathNodes=${pathNodeIds.size} pathEdges=${renderedPathEdgeCount}`)
  console.log('[buildG6Data] rendered details:', { pathEdgeKeys: pathEdgeKeys.size, pathEdgeIds: pathEdgeIds.size })
  return { nodes, edges, pathNodeIds, pathEdgeKeys }
}

export interface EnhancedGraphPanelHandle {
  refresh: (subgraph: Subgraph, alignmentFeatures: AlignmentFeature[], subjectIds?: string[], neighborIds?: string[]) => void
  fitView: () => void
  focusNode: (nodeId: string) => void
  resetHighlight: () => void
  clear: () => void
  searchAndExpand: (nodeId: string, nodeType: string) => void
  dimNonFocused: (subjectIds: string[], neighborIds: string[]) => void
  toggleCategory: (cat: string) => void
  applyHighlight: (cat: string | null) => void
  translateCanvas: (dx: number, dy: number) => void
}

interface Props {
  subgraph: Subgraph | null
  alignmentFeatures: AlignmentFeature[]
  entityCommunityMap?: EntityCommunityMap | null
  onNodeDoubleClick?: (nodeId: string, nodeName: string, nodeType: string) => void
  onNodeHover?: (nodeId: string | null) => void
  highlightedEntity?: string | null
  onNodeClick?: (node: SubgraphNode) => void
  onCanvasClick?: () => void
  onStatsChange?: (stats: LegendStats) => void
}

export const EnhancedGraphPanel = forwardRef<EnhancedGraphPanelHandle, Props>(
  ({ subgraph, alignmentFeatures, entityCommunityMap, onNodeDoubleClick, onNodeClick, onCanvasClick, onStatsChange, highlightedEntity }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const graphRef = useRef<any>(null)
    const subgraphRef = useRef(subgraph)
    subgraphRef.current = subgraph

    const [loading, setLoading] = useState(false)
    const [liveStats, setLiveStats] = useState<any>(null)
    const [visibleCategories, setVisibleCategories] = useState<Set<string>>(new Set(VALID_NODE_TYPES))
    const [contextMenu, setContextMenu] = useState<{
      visible: boolean; x: number; y: number; nodeId: string; nodeName: string; nodeType: string;
    }>({ visible: false, x: 0, y: 0, nodeId: '', nodeName: '', nodeType: '' })
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [layoutMode, setLayoutMode] = useState<LayoutMode>('concentric')
    const [pathOnly, setPathOnly] = useState(false)
    const pathNodeIdsRef = useRef<Set<string>>(new Set())
    const suppressNextCanvasClickRef = useRef(false)

    // Interactive filtering state
    const [activeNodeFilters, setActiveNodeFilters] = useState<Set<string>>(new Set())
    const [activeEdgeFilters, setActiveEdgeFilters] = useState<Set<string>>(new Set())
    const [activeRiskFilters, setActiveRiskFilters] = useState<Set<string>>(new Set())

    const applyGraphFilters = useCallback(() => {
      const g = graphRef.current
      if (!g) return
      const hasNodeFilter = activeNodeFilters.size > 0
      const hasEdgeFilter = activeEdgeFilters.size > 0
      const hasRiskFilter = activeRiskFilters.size > 0
      const hasAnyFilter = hasNodeFilter || hasEdgeFilter || hasRiskFilter

      g.getNodes().forEach((n: any) => {
        const model = n.getModel()
        const typeMatch = !hasNodeFilter || activeNodeFilters.has(model._type)
        const riskMatch = !hasRiskFilter || (model._riskLevel && activeRiskFilters.has(model._riskLevel))
        g.setItemState(n, 'dimmed', hasAnyFilter && !(typeMatch && riskMatch))
      })
      g.getEdges().forEach((e: any) => {
        const model = e.getModel()
        const relMatch = !hasEdgeFilter || activeEdgeFilters.has(model.relation)
        g.setItemState(e, 'dimmed', hasEdgeFilter && !relMatch)
      })
    }, [activeNodeFilters, activeEdgeFilters, activeRiskFilters])

    useEffect(() => { applyGraphFilters() }, [applyGraphFilters])

    const handleNodeTypeFilter = (type: string) => {
      setActiveNodeFilters((prev) => {
        const next = new Set(prev)
        if (next.has(type)) next.delete(type); else next.add(type)
        return next
      })
      setActiveEdgeFilters(new Set())
      setActiveRiskFilters(new Set())
    }
    const handleEdgeTypeFilter = (rel: string) => {
      setActiveEdgeFilters((prev) => {
        const next = new Set(prev)
        if (next.has(rel)) next.delete(rel); else next.add(rel)
        return next
      })
      setActiveNodeFilters(new Set())
      setActiveRiskFilters(new Set())
    }
    const handleRiskFilter = (level: string) => {
      setActiveRiskFilters((prev) => {
        const next = new Set(prev)
        if (next.has(level)) next.delete(level); else next.add(level)
        return next
      })
      setActiveNodeFilters(new Set())
      setActiveEdgeFilters(new Set())
    }
    const clearAllFilters = () => {
      setActiveNodeFilters(new Set())
      setActiveEdgeFilters(new Set())
      setActiveRiskFilters(new Set())
      setVisibleCategories(new Set(VALID_NODE_TYPES))
      const g = graphRef.current
      if (g) {
        g.getNodes().forEach((n: any) => g.showItem(n))
        g.getEdges().forEach((e: any) => g.showItem(e))
      }
    }

    const syncGraphStats = useCallback(() => {
      const g = graphRef.current
      if (!g) return
      const gNodes = g.getNodes()
      const gEdges = g.getEdges()
      const nodeCounts: Record<string, number> = {}
      const edgeCounts: Record<string, number> = {}
      const riskLevelCounts: Record<string, number> = {}
      for (const n of gNodes) {
        const model = (n as any).getModel()
        const t = model?._type ?? ''
        if (VALID_NODE_TYPES.has(t)) nodeCounts[t] = (nodeCounts[t] ?? 0) + 1
        const rl = model?._riskLevel
        if (rl) riskLevelCounts[rl] = (riskLevelCounts[rl] ?? 0) + 1
      }
      for (const e of gEdges) {
        const model = (e as any).getModel()
        const rel = model?.relation ?? 'UNKNOWN'
        edgeCounts[rel] = (edgeCounts[rel] ?? 0) + 1
      }
      const stats = { totalNodes: gNodes.length, totalEdges: gEdges.length, nodeCounts, edgeCounts, riskLevelCounts }
      setLiveStats(stats)
      onStatsChange?.(stats)
    }, [onStatsChange])

    const applyHighlight = useCallback((cat: string | null) => {
      const g = graphRef.current
      if (!g) return
      g.getNodes().forEach((n: any) =>
        g.setItemState(n, 'dimmed', cat ? n.getModel()._type !== cat : false)
      )
      g.getEdges().forEach((e: any) =>
        g.setItemState(e, 'dimmed', cat ? e.getModel().relation !== cat : false)
      )
    }, [])

    const toggleCategory = useCallback((cat: string) => {
      const g = graphRef.current
      if (!g) return
      setVisibleCategories((prev) => {
        const next = new Set(prev)
        const hide = next.has(cat)
        hide ? next.delete(cat) : next.add(cat)
        g.getNodes().forEach((n: any) => {
          if (n.getModel()._type === cat) hide ? g.hideItem(n) : g.showItem(n)
        })
        g.getEdges().forEach((e: any) => {
          if (e.getModel().relation === cat) hide ? g.hideItem(e) : g.showItem(e)
        })
        return next
      })
    }, [])

    const searchAndExpand = useCallback(
      async (nodeId: string, nodeType: string) => {
        const graph = graphRef.current
        if (!graph) {
          console.warn('Graph instance not ready for expansion')
          return
        }

        message.loading({ content: 'Exploring connections...', key: 'expand' })
        try {
          const url = `/api/v1/graph/expand?id=${encodeURIComponent(nodeId)}&type=${encodeURIComponent(nodeType)}`
          const res = await axios.get(url)

          const data = res.data
          if (!data || !Array.isArray(data.nodes)) {
            throw new Error('Invalid response format from server')
          }

          const { nodes: rawNodes, edges: rawEdges } = data
          const nN = (rawNodes || []).map(normalizeNeo4jNode)
          const nE = (rawEdges || []).map(normalizeNeo4jEdge)
          const addedNodeIds = new Set<string>()

          nN.forEach((n: SubgraphNode) => {
            const idStr = String(n.id)
            if (!graph.findById(idStr)) {
              const v = NODE_VISUAL[n.type] || NODE_DEFAULT_VISUAL
              let label = String(n.title || (n as any).label || n.zh_name || n.name || n.id)
              if (label.length > 15) label = label.slice(0, 12) + '...'
              try {
                graph.addItem('node', {
                  id: idStr,
                  label,
                  type: 'circle',
                  _type: n.type,
                  size: v.size,
                  style: {
                    fill: v.fill,
                    stroke: v.stroke,
                    lineWidth: 2,
                    cursor: 'pointer',
                  },
                  labelCfg: {
                    position: 'bottom',
                    offset: v.labelOffset,
                    style: {
                      fill: '#1e293b',
                      fontSize: 12,
                      fontWeight: 500,
                      background: {
                        fill: 'rgba(255,255,255,0.85)',
                        padding: [2, 4, 2, 4],
                        radius: 4,
                      },
                    },
                  },
                })
                addedNodeIds.add(idStr)
              } catch (e) {
                // Node may already exist, skip silently
              }
            } else {
              addedNodeIds.add(idStr)
            }
          })

          const seenEdges = new Set<string>()
          nE.forEach((e: SubgraphEdge, idx: number) => {
            const src = String(e.source)
            const tgt = String(e.target)
            const edgeKey = `${src}→${tgt}→${e.relation}`
            if (seenEdges.has(edgeKey)) return
            seenEdges.add(edgeKey)

            if (!graph.findById(src) || !graph.findById(tgt)) return

            const relStyle = EDGE_STYLE_MAP[e.relation] ?? EDGE_DEFAULT_STYLE
            const edgeId = `edge-exp-${nodeId}-${idx}-${Date.now()}`
            try {
              graph.addItem('edge', {
                id: edgeId,
                source: src,
                target: tgt,
                relation: e.relation,
                type: 'quadratic',
                style: { ...relStyle, endArrow: true, curvature: 0.15 },
              })
            } catch (err) {
              // Edge may already exist, skip silently
            }
          })

          graph.layout()
          syncGraphStats()
          graph.focusItem(String(nodeId), true)

          message.success({ content: 'Exploration complete', key: 'expand' })
        } catch (err) {
          console.error('Expand failed:', err)
          message.error({ content: 'Exploration failed', key: 'expand' })
        }
      },
      [syncGraphStats]
    )

    // ── Toolbar handlers ──
    const handleZoomIn = useCallback(() => {
      const g = graphRef.current
      if (!g) return
      const current = g.getZoom()
      g.zoomTo(current * 1.2)
    }, [])

    const handleZoomOut = useCallback(() => {
      const g = graphRef.current
      if (!g) return
      const current = g.getZoom()
      g.zoomTo(current * 0.8)
    }, [])

    const handleFitView = useCallback(() => {
      graphRef.current?.fitView(35)
    }, [])

    const handleToggleFullscreen = useCallback(() => {
      const container = containerRef.current
      if (!container) return
      if (!isFullscreen) {
        container.requestFullscreen?.().catch(() => {})
      } else {
        document.exitFullscreen?.().catch(() => {})
      }
      setIsFullscreen(!isFullscreen)
    }, [isFullscreen])

    const handleExportImage = useCallback((format: 'png' | 'svg') => {
      const g = graphRef.current
      if (!g) return
      const mime = format === 'svg' ? 'image/svg+xml' : 'image/png'
      g.downloadFullImage(`windeye-graph-${Date.now()}`, mime, {
        backgroundColor: '#ffffff',
        padding: 20,
      })
    }, [])

    const handleChangeLayout = useCallback((mode: LayoutMode) => {
      const g = graphRef.current
      if (!g) return
      setLayoutMode(mode)
      switch (mode) {
        case 'force':
          g.updateLayout({ type: 'force', preventOverlap: true, nodeSize: 40, nodeSpacing: 40, linkDistance: 150, nodeStrength: -200 })
          break
        case 'dagre':
          g.updateLayout({ type: 'dagre', rankdir: 'TB', nodesep: 20, ranksep: 60 })
          break
        case 'circular':
          g.updateLayout({ type: 'circular', radius: 250, ordering: 'degree' })
          break
        case 'concentric': {
          // Custom concentric layout algorithm
          const nodes = g.getNodes()
          const edges = g.getEdges()
          if (nodes.length === 0) break

          // Build adjacency map
          const adj = new Map<string, Set<string>>()
          nodes.forEach((n: any) => adj.set(n.getID(), new Set()))
          edges.forEach((e: any) => {
            const model = e.getModel()
            const src = String(model.source); const tgt = String(model.target)
            adj.get(src)?.add(tgt)
            adj.get(tgt)?.add(src)
          })

          // Find subject node(s) — highest degree nodes
          let subjectIds = new Set<string>()
          let maxDeg = 0
          nodes.forEach((n: any) => {
            const id = n.getID()
            const model = n.getModel()
            if (model._isSubject) subjectIds.add(id)
            const deg = adj.get(id)?.size || 0
            if (deg > maxDeg) maxDeg = deg
          })
          if (subjectIds.size === 0 && nodes.length > 0) {
            // Pick highest-degree node as center
            nodes.forEach((n: any) => {
              const id = n.getID()
              if ((adj.get(id)?.size || 0) === maxDeg) subjectIds.add(id)
            })
          }

          // BFS to compute hop distances from any subject node
          const hop = new Map<string, number>()
          const queue: string[] = []
          for (const sid of subjectIds) { hop.set(sid, 0); queue.push(sid) }
          while (queue.length > 0) {
            const cur = queue.shift()!
            const curHop = hop.get(cur) || 0
            for (const nb of adj.get(cur) || []) {
              if (!hop.has(nb)) { hop.set(nb, curHop + 1); queue.push(nb) }
            }
          }
          // Unreachable nodes get max hop + 1
          const maxHop = hop.size > 0 ? Math.max(...hop.values()) : 0
          nodes.forEach((n: any) => { if (!hop.has(n.getID())) hop.set(n.getID(), maxHop + 1) })

          // Group nodes by community
          const nodeComm = new Map<string, number>()
          nodes.forEach((n: any) => {
            const model = n.getModel()
            const cids = model._communityIds as number[] | undefined
            nodeComm.set(n.getID(), (cids && cids.length > 0) ? cids[0] : 0)
          })

          // Group nodes by ring (hop % 4 mapping: 0→center, 1→r1, 2→r2, 3+→r3)
          const rings: Map<number, { id: string; x: number; y: number; comm: number }[]> = new Map()
          rings.set(0, []); rings.set(1, []); rings.set(2, []); rings.set(3, [])
          nodes.forEach((n: any) => {
            const id = n.getID()
            const h = Math.min(hop.get(id) || 0, 3)
            rings.get(h)!.push({ id, x: 0, y: 0, comm: nodeComm.get(id) || 0 })
          })

          const radii = [0, 120, 240, 360]
          const center = { x: 400, y: 350 }

          // Place nodes ring by ring
          for (let ring = 0; ring <= 3; ring++) {
            const members = rings.get(ring) || []
            if (members.length === 0) continue

            // Sort by community so same-community nodes cluster together
            members.sort((a, b) => a.comm - b.comm)

            const r = radii[ring]
            members.forEach((m, i) => {
              const angle = (2 * Math.PI * i) / members.length - Math.PI / 2
              m.x = center.x + r * Math.cos(angle)
              m.y = center.y + r * Math.sin(angle)
            })

            // Place ring 0 (center) at the center
            if (ring === 0) {
              members.forEach((m) => { m.x = center.x; m.y = center.y })
            }
          }

          // Apply positions
          const allPositions = new Map<string, { x: number; y: number }>()
          for (const members of rings.values()) {
            for (const m of members) { allPositions.set(m.id, { x: m.x, y: m.y }) }
          }
          nodes.forEach((n: any) => {
            const pos = allPositions.get(n.getID())
            if (pos) g.updateItem(n, { x: pos.x, y: pos.y })
          })
          g.fitView(35)
          break
        }
      }
      if (mode !== 'concentric') {
        setTimeout(() => g.fitView(35), 400)
      }
    }, [])

    const applyPathOnlyFilter = useCallback((showPathOnly: boolean) => {
      const g = graphRef.current
      if (!g) return
      const pathIds = pathNodeIdsRef.current
      if (pathIds.size === 0) return
      if (showPathOnly) {
        g.getNodes().forEach((n: any) => {
          const id = n.getID()
          if (!pathIds.has(id)) g.hideItem(n)
          else g.showItem(n)
        })
        g.getEdges().forEach((e: any) => {
          const model = e.getModel()
          if (!model._isPathEdge) g.hideItem(e)
          else g.showItem(e)
        })
      } else {
        g.getNodes().forEach((n: any) => g.showItem(n))
        g.getEdges().forEach((e: any) => g.showItem(e))
      }
      g.fitView(35)
    }, [])

    const handleTogglePathOnly = useCallback(() => {
      setPathOnly((prev) => {
        const next = !prev
        applyPathOnlyFilter(next)
        return next
      })
    }, [applyPathOnlyFilter])

    // ── Context menu handlers ──
    const handleContextViewDetail = useCallback(() => {
      const raw = subgraphRef.current?.nodes.find(
        (n: any) => String(n.id) === contextMenu.nodeId
      )
      if (raw) {
        graphRef.current?.translate(-240, 0, { duration: 300, easing: 'easeCubic' })
        onNodeClick?.(raw)
      }
      setContextMenu((prev) => ({ ...prev, visible: false }))
    }, [contextMenu.nodeId, onNodeClick])

    const handleContextExpand = useCallback(() => {
      searchAndExpand(contextMenu.nodeId, contextMenu.nodeType)
      setContextMenu((prev) => ({ ...prev, visible: false }))
    }, [contextMenu.nodeId, contextMenu.nodeType, searchAndExpand])

    const handleContextGenerateReport = useCallback(() => {
      // Dispatch a custom event that the parent can listen to for switching to risk tab
      window.dispatchEvent(
        new CustomEvent('generateRiskForEntity', {
          detail: { entityId: contextMenu.nodeId, entityName: contextMenu.nodeName, entityType: contextMenu.nodeType },
        })
      )
      message.info(`Generating risk report for: ${contextMenu.nodeName}`)
      setContextMenu((prev) => ({ ...prev, visible: false }))
    }, [contextMenu.nodeId, contextMenu.nodeName, contextMenu.nodeType])

    const hasPaths = (subgraph?.paths?.length || 0) > 0

    useImperativeHandle(ref, () => ({
      refresh: (sg, _alignedFeatures, subjectIds, neighborIds) => {
        if (!graphRef.current) return
        const g6Data = buildG6Data(sg, subjectIds, neighborIds, entityCommunityMap)
        pathNodeIdsRef.current = g6Data.pathNodeIds || new Set()
        graphRef.current.changeData(g6Data)
        graphRef.current.fitView(35)
        syncGraphStats()
        if (pathOnly) applyPathOnlyFilter(true)
      },
      fitView: () => graphRef.current?.fitView(35),
      resetHighlight: () => {
        if (!graphRef.current) return
        graphRef.current.getNodes().forEach((n: any) => graphRef.current?.clearItemStates(n))
        graphRef.current.getEdges().forEach((e: any) => graphRef.current?.clearItemStates(e))
      },
      focusNode: (nodeId) => {
        if (!graphRef.current) return
        graphRef.current.focusItem(nodeId, true)
      },
      searchAndExpand,
      toggleCategory,
      applyHighlight,
      translateCanvas: (dx, dy) => {
        graphRef.current?.translate(dx, dy, { duration: 300, easing: 'easeCubic' })
      },
      dimNonFocused: (subjectIds, neighborIds) => {
        const g = graphRef.current
        if (!g) return
        if (subjectIds.length === 0) {
          g.getNodes().forEach((n: any) => g.clearItemStates(n))
          g.getEdges().forEach((e: any) => g.clearItemStates(e))
          return
        }
        const subjectSet = new Set(subjectIds.map(String))
        const neighborSet = new Set(neighborIds.map(String))
        g.getNodes().forEach((n: any) => {
          const id = n.getID()
          if (!subjectSet.has(id) && !neighborSet.has(id)) {
            g.setItemState(n, 'dimmed', true)
          }
        })
        g.getEdges().forEach((e: any) => {
          const model = e.getModel()
          const src = String(model.source)
          const tgt = String(model.target)
          const isRelevant = subjectSet.has(src) || subjectSet.has(tgt) || neighborSet.has(src) || neighborSet.has(tgt)
          if (!isRelevant) {
            g.setItemState(e, 'dimmed', true)
          }
        })
      },
      clear: () => {
        if (!graphRef.current) return
        graphRef.current.changeData({ nodes: [], edges: [] })
        setLiveStats(null)
      },
    }))

    useEffect(() => {
      let mounted = true
      let graph: any = null

      const init = () => {
        if (!containerRef.current) return
        setLoading(true)
        try {
          graph = new G6.Graph({
            container: containerRef.current,
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
            layout: { type: 'preset' },
            defaultNode: { type: 'circle', size: 20 },
            defaultEdge: { type: 'line', style: { endArrow: true } },
            modes: { default: ['drag-canvas', 'zoom-canvas', 'drag-node'] },
            nodeStateStyles: {
              dimmed: { opacity: 0.15 },
            },
            edgeStateStyles: {
              dimmed: { opacity: 0.08 },
            },
          })
          graphRef.current = graph
          graph.render()
          const initialSubgraph = subgraphRef.current
          if (initialSubgraph) {
            const g6Data = buildG6Data(initialSubgraph, undefined, undefined, entityCommunityMap)
            pathNodeIdsRef.current = g6Data.pathNodeIds || new Set()
            graph.changeData(g6Data)
            graph.fitView(35)
          }
          syncGraphStats()

          const resizeObserver = new ResizeObserver(() => {
            if (containerRef.current && graphRef.current) {
              graphRef.current.changeSize(
                containerRef.current.clientWidth,
                containerRef.current.clientHeight
              )
              graphRef.current.fitView(35)
            }
          })
          resizeObserver.observe(containerRef.current)

          graph.on('node:click', (e: any) => {
            const raw = subgraphRef.current?.nodes.find(
              (n: any) => String(n.id) === e.item?.getID()
            )
            if (raw) {
              suppressNextCanvasClickRef.current = true
              window.setTimeout(() => {
                suppressNextCanvasClickRef.current = false
              }, 120)
              onNodeClick?.(raw)
            }
          })
          graph.on('node:dblclick', (e: any) => {
            const nodeId = e.item?.getID()
            const nodeType = e.item?.getModel()._type || 'COMPANY'
            const nodeName = e.item?.getModel().label || nodeId
            onNodeDoubleClick?.(nodeId, nodeName, nodeType)
            searchAndExpand(nodeId, nodeType)
          })
          graph.on('node:mouseenter', (e: any) => {
            const model = e.item?.getModel()
            const nodeType = model?._type || ''
            const riskLevel = model?._riskLevel
            const complianceScore = model?._complianceScore
            const tooltipEl = document.getElementById('windeye-node-tooltip')
            if (tooltipEl) {
              const typeLabel = NODE_TYPE_LABELS[nodeType] || nodeType
              const typeColor = NODE_TYPE_COLORS[nodeType] || '#8c8c8c'
              const rv = riskLevel ? RISK_LEVEL_VISUAL[riskLevel] : null
              tooltipEl.innerHTML = `
                <div style="font-weight:600;font-size:13px;color:#1e293b;margin-bottom:4px">${model?.label || model?.id || ''}</div>
                <span style="display:inline-block;padding:1px 8px;border-radius:4px;font-size:11px;font-weight:600;color:${typeColor};background:${typeColor}15;border:1px solid ${typeColor}30">${typeLabel}</span>
                ${rv ? `<span style="display:inline-block;margin-left:6px;padding:1px 8px;border-radius:4px;font-size:11px;font-weight:600;color:${rv.border};background:${rv.bg};border:1px solid ${rv.border}40">${rv.label}</span>` : ''}
                ${complianceScore !== undefined && complianceScore !== null ? `<div style="margin-top:6px;font-size:11px;color:#64748b">合规指标总分：<b style="color:#1677ff">${Number(complianceScore).toFixed(1)}</b></div>` : ''}
              `
              tooltipEl.style.display = 'block'
            }
          })
          graph.on('node:mouseleave', () => {
            const tooltipEl = document.getElementById('windeye-node-tooltip')
            if (tooltipEl) tooltipEl.style.display = 'none'
          })
          graph.on('node:mousemove', (e: any) => {
            const tooltipEl = document.getElementById('windeye-node-tooltip')
            if (tooltipEl && tooltipEl.style.display === 'block') {
              const x = (e.originalEvent?.clientX || e.clientX || 0) + 15
              const y = (e.originalEvent?.clientY || e.clientY || 0) + 15
              tooltipEl.style.left = `${x}px`
              tooltipEl.style.top = `${y}px`
            }
          })
          graph.on('node:contextmenu', (e: any) => {
            e.originalEvent?.preventDefault?.()
            const model = e.item?.getModel()
            const nodeId = model?.id || e.item?.getID()
            const nodeName = model?.label || nodeId
            const nodeType = model?._type || 'Unknown'
            setContextMenu({
              visible: true,
              x: e.originalEvent?.clientX || e.clientX || 0,
              y: e.originalEvent?.clientY || e.clientY || 0,
              nodeId,
              nodeName,
              nodeType,
            })
          })
          graph.on('canvas:click', () => {
            if (suppressNextCanvasClickRef.current) {
              suppressNextCanvasClickRef.current = false
              return
            }
            setContextMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev))
            clearAllFilters()
            graph.translate(0, 0, { duration: 300, easing: 'easeCubic' })
            onCanvasClick?.()
          })

          // Pulse animation: outer ring glow for high-risk nodes (pulsing shadowBlur)
          let pulseFrame = 0
          const pulseHighRiskNodes = () => {
            if (!graph || graph.destroyed) return
            pulseFrame++
            const glowIntensity = 15 + 10 * Math.sin(pulseFrame * 0.06)
            graph.getNodes().forEach((n: any) => {
              const model = n.getModel()
              if (model._riskLevel === 'high') {
                const container = n.getContainer?.()
                if (container) {
                  const circle = container.getChildByIndex?.(0)
                  if (circle && typeof circle.attr === 'function') {
                    circle.attr('shadowBlur', glowIntensity)
                  }
                }
              }
            })
            ;(graph as any).__pulseTimer = requestAnimationFrame(pulseHighRiskNodes)
          }
          ;(graph as any).__pulseTimer = requestAnimationFrame(pulseHighRiskNodes)

          // Path flow animation
          let dashOffset = 0
          const animatePathEdges = () => {
            if (!graph || graph.destroyed) return
            dashOffset = (dashOffset + 0.3) % 16
            graph.getEdges().forEach((edge: any) => {
              const model = edge.getModel()
              if (model._isPathEdge) {
                const keyShape = edge.getKeyShape?.()
                if (keyShape && typeof keyShape.attr === 'function') {
                  keyShape.attr('lineDashOffset', -dashOffset)
                }
              }
            })
            ;(graph as any).__pathFlowTimer = requestAnimationFrame(animatePathEdges)
          }
          ;(graph as any).__pathFlowTimer = requestAnimationFrame(animatePathEdges)

          setLoading(false)
          return () => resizeObserver.disconnect()
        } finally {
          if (mounted) setLoading(false)
        }
      }

      init()
      return () => {
        mounted = false
        if ((graph as any).__pulseTimer) cancelAnimationFrame((graph as any).__pulseTimer)
        if ((graph as any).__pathFlowTimer) cancelAnimationFrame((graph as any).__pathFlowTimer)
        graph?.destroy()
      }
    }, [syncGraphStats, searchAndExpand])

    return (
      <div style={styles.root}>
        <div style={styles.graphArea}>
          <div ref={containerRef} style={styles.graphCanvas} />

          {/* Node hover tooltip */}
          <div
            id="windeye-node-tooltip"
            style={{
              display: 'none',
              position: 'fixed',
              zIndex: 1000,
              pointerEvents: 'none',
              background: '#fff',
              borderRadius: 8,
              padding: '8px 12px',
              boxShadow: '0 4px 16px rgba(15, 23, 42, 0.12)',
              border: '1px solid #e2e8f0',
              maxWidth: 220,
            }}
          />

          <GraphToolbar
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onFitView={handleFitView}
            onToggleFullscreen={handleToggleFullscreen}
            isFullscreen={isFullscreen}
            onExportImage={handleExportImage}
            onChangeLayout={handleChangeLayout}
            layoutMode={layoutMode}
            onTogglePathOnly={handleTogglePathOnly}
            pathOnly={pathOnly}
            hasPaths={hasPaths}
          />

          <NodeContextMenu
            visible={contextMenu.visible}
            x={contextMenu.x}
            y={contextMenu.y}
            nodeId={contextMenu.nodeId}
            nodeName={contextMenu.nodeName}
            nodeType={contextMenu.nodeType}
            onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
            onViewDetail={handleContextViewDetail}
            onExpand={handleContextExpand}
            onGenerateReport={handleContextGenerateReport}
          />

        </div>
      </div>
    )
  }
)

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' },
  graphArea: { flex: 1, position: 'relative', overflow: 'hidden' },
  graphCanvas: { width: '100%', height: '100%' },
}

export default EnhancedGraphPanel
