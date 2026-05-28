import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react'
import { Typography, Spin, Empty, message, Button, Tooltip, Statistic, Tag } from 'antd'
import G6 from '@antv/g6'
import axios from 'axios'
import type { Subgraph, SubgraphNode, SubgraphEdge, AlignmentFeature } from '../types/api'
import LegendPanel from './LegendPanel'
import NodeContextMenu from './NodeContextMenu'
import GraphToolbar, { LayoutMode } from './GraphToolbar'

const { Text } = Typography

const VALID_NODE_TYPES = new Set(['COMPANY', 'PERSON', 'EVENT', 'SUB_EVENT', 'TIME', 'RiskFeature', 'RiskFactor', 'Action', 'Regulation', 'Law'])

const NODE_VISUAL: Record<string, { color: string; size: number; labelOffset: number }> = {
  COMPANY: { color: '#FFC101', size: 34, labelOffset: 10 },
  PERSON: { color: '#1890FF', size: 26, labelOffset: 8 },
  EVENT: { color: '#FF6B6B', size: 30, labelOffset: 10 },
  SUB_EVENT: { color: '#FF9999', size: 20, labelOffset: 6 },
  TIME: { color: '#FF8C00', size: 16, labelOffset: 5 },
  RiskFeature: { color: '#4CAF50', size: 24, labelOffset: 8 },
  RiskFactor: { color: '#9C27B0', size: 22, labelOffset: 7 },
  Action: { color: '#45B7D1', size: 22, labelOffset: 7 },
  Regulation: { color: '#FFC101', size: 20, labelOffset: 6 },
  Law: { color: '#1890FF', size: 18, labelOffset: 6 },
}

const normalizeNeo4jNode = (raw: any): SubgraphNode => {
  const props = raw.properties || {}
  const labels: string[] = raw.labels || []
  return {
    id: String(raw.id),
    type: labels[0] || 'Unknown',
    score: props.score ?? 1,
    title: props.title || props.name || props.COMPANY_NM || raw.id,
    name: props.name || props.COMPANY_NM || props.title || raw.id,
    zh_name: props.zh_name || props.name,
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
  TRIGGERS: { stroke: '#f5222d', lineDash: [], lineWidth: 2, opacity: 0.8 },
  REFLECTS: { stroke: '#fa8c16', lineDash: [], lineWidth: 1.5, opacity: 0.7 },
  COMPLIES_WITH: { stroke: '#722ed1', lineDash: [4, 4], lineWidth: 1.5, opacity: 0.7 },
  MENTION: { stroke: '#45B7D1', lineDash: [2, 3], lineWidth: 1, opacity: 0.5 },
  CAUSE: { stroke: '#fa541c', lineDash: [], lineWidth: 1.5, opacity: 0.7 },
  BELONG: { stroke: '#52c41a', lineDash: [2, 3], lineWidth: 1, opacity: 0.5 },
}
const EDGE_DEFAULT_STYLE = { stroke: '#cbd5e1', lineDash: [], lineWidth: 0.8, opacity: 0.4 }

const buildG6Data = (
  subgraph: Subgraph | null,
  subjectIds?: string[],
  neighborIds?: string[],
) => {
  if (!subgraph) return { nodes: [], edges: [] }

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
    const minSize = 18
    const maxSize = 50
    return minSize + (degree / maxDegree) * (maxSize - minSize)
  }

  // Build path node id set for path highlighting
  const pathNodeIds = new Set<string>()
  const pathEdgeKeys = new Set<string>()
  for (const path of subgraph.paths || []) {
    for (const nid of path.nodeIds || []) {
      pathNodeIds.add(String(nid))
    }
    const nids = path.nodeIds || []
    for (let i = 0; i < nids.length - 1; i++) {
      pathEdgeKeys.add(`${nids[i]}→${nids[i + 1]}`)
      pathEdgeKeys.add(`${nids[i + 1]}→${nids[i]}`)
    }
  }

  const validNodeIds = new Set<string>()
  const nodes = subgraph.nodes
    .filter((n: SubgraphNode) => VALID_NODE_TYPES.has(n.type))
    .map((node: SubgraphNode) => {
      const nodeIdStr = String(node.id)
      validNodeIds.add(nodeIdStr)
      const visual = NODE_VISUAL[node.type] ?? { color: '#a1a1aa', size: 14, labelOffset: 5 }
      let label = String(node.title || (node as any).zh_name || (node as any).name || node.id)
      if (label.length > 15) label = label.slice(0, 12) + '...'

      // Risk-level color mapping
      const riskLevel = (node as any).risk_level || (node as any).riskLevel
      const riskColor =
        riskLevel === 'high' ? '#f5222d' :
        riskLevel === 'medium' ? '#fa8c16' :
        riskLevel === 'low' ? '#52c41a' :
        null
      const fillColor = riskColor || visual.color

      // Degree-based size
      const deg = degreeMap.get(nodeIdStr) || 1
      const nodeSize = scaleSize(deg)

      const isPathNode = pathNodeIds.has(nodeIdStr)
      const isSubject = subjectIdSet.has(nodeIdStr)
      const isNeighbor = neighborIdSet.has(nodeIdStr)

      // Subject nodes: larger, thick blue border
      // Neighbor nodes: secondary blue border
      // Path nodes: medium blue border
      const borderColor = isSubject ? '#2855D1'
        : isNeighbor ? '#1890FF'
        : isPathNode ? '#2855D1'
        : (node.type === 'COMPANY' ? fillColor : 'transparent')
      const borderWidth = isSubject ? 4
        : isNeighbor ? 2
        : isPathNode ? 3
        : (node.type === 'COMPANY' ? 2 : 0)
      const finalSize = isSubject ? nodeSize * 1.3
        : isNeighbor ? nodeSize * 1.1
        : nodeSize

      return {
        id: nodeIdStr,
        label,
        _type: node.type,
        type: 'circle',
        size: finalSize,
        _riskLevel: riskLevel || null,
        _isPathNode: isPathNode,
        _isSubject: isSubject,
        _isNeighbor: isNeighbor,
        _degree: deg,
        style: {
          fill: fillColor,
          stroke: borderColor,
          lineWidth: borderWidth,
          cursor: 'pointer',
          shadowColor: isSubject ? 'rgba(40, 85, 209, 0.4)' : undefined,
          shadowBlur: isSubject ? 12 : 0,
        },
        labelCfg: {
          position: 'bottom',
          offset: visual.labelOffset + Math.max(0, (finalSize - 20) * 0.3),
          style: {
            fill: '#1e293b',
            fontSize: isSubject ? 13 : (node.type === 'COMPANY' ? 12 : 10),
            fontWeight: isSubject ? 800 : (isNeighbor || isPathNode) ? 700 : (node.type === 'COMPANY' ? 600 : 500),
            background: {
              fill: 'rgba(255, 255, 255, 0.85)',
              padding: [2, 4, 2, 4],
              radius: 4,
            },
          },
        },
      }
    })
  const edges = subgraph.edges
    .filter((e: SubgraphEdge) => validNodeIds.has(String(e.source)) && validNodeIds.has(String(e.target)))
    .map((edge: SubgraphEdge, idx: number) => {
      const relStyle = EDGE_STYLE_MAP[edge.relation] ?? EDGE_DEFAULT_STYLE
      const edgeKey = `${edge.source}→${edge.target}`
      const isPathEdge = pathEdgeKeys.has(edgeKey)
      return {
        id: `edge-${idx}`,
        source: String(edge.source),
        target: String(edge.target),
        relation: edge.relation,
        type: 'quadratic',
        _isPathEdge: isPathEdge,
        label: edge.relation,
        labelCfg: {
          autoRotate: true,
          refX: 0,
          refY: 2,
          style: {
            fontSize: 9,
            fill: '#475569',
            fontWeight: 500,
            background: {
              fill: 'rgba(255, 255, 255, 0.88)',
              padding: [1, 4, 1, 4],
              radius: 3,
            },
          },
        },
        style: {
          ...relStyle,
          endArrow: true,
          curvature: 0.15,
          lineWidth: isPathEdge ? (relStyle.lineWidth || 1) * 2.5 : relStyle.lineWidth,
          stroke: isPathEdge ? '#2855D1' : relStyle.stroke,
          lineDash: isPathEdge ? [8, 4] : relStyle.lineDash,
          opacity: isPathEdge ? 1 : relStyle.opacity,
        },
      }
    })
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
}

interface Props {
  subgraph: Subgraph | null
  alignmentFeatures: AlignmentFeature[]
  onNodeDoubleClick?: (nodeId: string, nodeName: string, nodeType: string) => void
  onNodeHover?: (nodeId: string | null) => void
  highlightedEntity?: string | null
}

export const EnhancedGraphPanel = forwardRef<EnhancedGraphPanelHandle, Props>(
  ({ subgraph, alignmentFeatures, onNodeDoubleClick, highlightedEntity }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const graphRef = useRef<any>(null)
    const subgraphRef = useRef(subgraph)
    subgraphRef.current = subgraph

    const [loading, setLoading] = useState(false)
    const [selectedNode, setSelectedNode] = useState<SubgraphNode | null>(null)
    const [liveStats, setLiveStats] = useState<any>(null)
    const [visibleCategories, setVisibleCategories] = useState<Set<string>>(new Set(VALID_NODE_TYPES))
    const [contextMenu, setContextMenu] = useState<{
      visible: boolean; x: number; y: number; nodeId: string; nodeName: string; nodeType: string;
    }>({ visible: false, x: 0, y: 0, nodeId: '', nodeName: '', nodeType: '' })
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [layoutMode, setLayoutMode] = useState<LayoutMode>('force')
    const [pathOnly, setPathOnly] = useState(false)
    const pathNodeIdsRef = useRef<Set<string>>(new Set())

    const syncGraphStats = useCallback(() => {
      const g = graphRef.current
      if (!g) return
      const gNodes = g.getNodes()
      const gEdges = g.getEdges()
      const nodeCounts: Record<string, number> = {}
      const edgeCounts: Record<string, number> = {}
      for (const n of gNodes) {
        const model = (n as any).getModel()
        const t = model?._type ?? ''
        if (VALID_NODE_TYPES.has(t)) nodeCounts[t] = (nodeCounts[t] ?? 0) + 1
      }
      for (const e of gEdges) {
        const model = (e as any).getModel()
        const rel = model?.relation ?? 'UNKNOWN'
        edgeCounts[rel] = (edgeCounts[rel] ?? 0) + 1
      }
      setLiveStats({ totalNodes: gNodes.length, totalEdges: gEdges.length, nodeCounts, edgeCounts })
    }, [])

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
              const v = NODE_VISUAL[n.type] || { color: '#94a3b8', size: 14, labelOffset: 5 }
              let label = String(n.title || n.zh_name || n.name || n.id)
              if (label.length > 15) label = label.slice(0, 12) + '...'
              try {
                graph.addItem('node', {
                  id: idStr,
                  label,
                  type: 'circle',
                  _type: n.type,
                  size: v.size,
                  style: {
                    fill: v.color,
                    stroke: n.type === 'COMPANY' ? v.color : 'transparent',
                    lineWidth: n.type === 'COMPANY' ? 2 : 0,
                    cursor: 'pointer',
                  },
                  labelCfg: {
                    position: 'bottom',
                    offset: v.labelOffset,
                    style: {
                      fill: '#1e293b',
                      fontSize: n.type === 'COMPANY' ? 12 : 10,
                      fontWeight: n.type === 'COMPANY' ? 600 : 500,
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
      graphRef.current?.fitView(30)
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
      }
      setTimeout(() => g.fitView(30), 400)
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
      g.fitView(30)
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
      if (raw) setSelectedNode(raw)
      setContextMenu((prev) => ({ ...prev, visible: false }))
    }, [contextMenu.nodeId])

    const handleContextAddMonitor = useCallback(() => {
      message.success(`Monitoring added for: ${contextMenu.nodeName}`)
      setContextMenu((prev) => ({ ...prev, visible: false }))
    }, [contextMenu.nodeName])

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
        const g6Data = buildG6Data(sg, subjectIds, neighborIds)
        pathNodeIdsRef.current = g6Data.pathNodeIds || new Set()
        graphRef.current.changeData(g6Data)
        graphRef.current.fitView(30)
        syncGraphStats()
        if (pathOnly) applyPathOnlyFilter(true)
      },
      fitView: () => graphRef.current?.fitView(30),
      resetHighlight: () => {
        if (!graphRef.current) return
        graphRef.current.getNodes().forEach((n: any) => graphRef.current?.clearItemStates(n))
        graphRef.current.getEdges().forEach((e: any) => graphRef.current?.clearItemStates(e))
      },
      focusNode: (nodeId) => {
        if (!graphRef.current) return
        graphRef.current.focusItem(nodeId, true)
        const raw = subgraphRef.current?.nodes.find((n: any) => String(n.id) === nodeId)
        if (raw) setSelectedNode(raw)
      },
      searchAndExpand,
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
        setSelectedNode(null)
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
            layout: {
              type: 'force',
              preventOverlap: true,
              nodeSize: 40,
              nodeSpacing: 40,
              linkDistance: 150,
              nodeStrength: -200,
            },
            defaultNode: { type: 'circle', size: 20 },
            defaultEdge: { type: 'quadratic', style: { endArrow: true } },
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
          syncGraphStats()

          const resizeObserver = new ResizeObserver(() => {
            if (containerRef.current && graphRef.current) {
              graphRef.current.changeSize(
                containerRef.current.clientWidth,
                containerRef.current.clientHeight
              )
              graphRef.current.fitView(30)
            }
          })
          resizeObserver.observe(containerRef.current)

          graph.on('node:click', (e: any) => {
            const raw = subgraphRef.current?.nodes.find(
              (n: any) => String(n.id) === e.item?.getID()
            )
            if (raw) setSelectedNode(raw)
          })
          graph.on('node:dblclick', (e: any) => {
            const nodeId = e.item?.getID()
            const nodeType = e.item?.getModel()._type || 'COMPANY'
            const nodeName = e.item?.getModel().label || nodeId
            onNodeDoubleClick?.(nodeId, nodeName, nodeType)
            searchAndExpand(nodeId, nodeType)
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
            setContextMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev))
            setSelectedNode(null)
          })

          // Pulse animation for high-risk nodes via a render timer
          let pulseFrame = 0
          const pulseHighRiskNodes = () => {
            if (!graph || graph.destroyed) return
            pulseFrame++
            const opacity = 0.5 + 0.5 * Math.sin(pulseFrame * 0.08)
            graph.getNodes().forEach((n: any) => {
              const model = n.getModel()
              if (model._riskLevel === 'high') {
                const container = n.getContainer?.()
                if (container) {
                  const circle = container.getChildByIndex?.(0)
                  if (circle && typeof circle.attr === 'function') {
                    circle.attr('opacity', opacity)
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
        <LegendPanel
          stats={liveStats}
          visibleCategories={visibleCategories}
          onToggle={toggleCategory}
          onHighlight={applyHighlight}
        />
        <div style={styles.graphArea}>
          <div ref={containerRef} style={styles.graphCanvas} />

          {/* 图谱统计浮层 */}
          {liveStats && (liveStats.totalNodes > 0 || liveStats.totalEdges > 0) && (
            <div style={styles.statsOverlay}>
              <Statistic title="节点总数" value={liveStats.totalNodes} valueStyle={{ fontSize: 20, fontWeight: 700 }} />
              <div style={styles.statsDivider} />
              <Statistic title="关系总数" value={liveStats.totalEdges} valueStyle={{ fontSize: 20, fontWeight: 700 }} />
              {Object.keys(liveStats.nodeCounts || {}).length > 0 && (
                <>
                  <div style={styles.statsDivider} />
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {Object.entries(liveStats.nodeCounts as Record<string, number>).slice(0, 4).map(([type, count]) => (
                      <Tag key={type} color={NODE_VISUAL[type]?.color || '#94a3b8'} style={{ fontSize: 10, margin: 0, borderRadius: 4 }}>
                        {type}: {count}
                      </Tag>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

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

          {selectedNode && (
            <div style={styles.infoCard}>
              <button onClick={() => setSelectedNode(null)} style={styles.closeBtn}>
                ×
              </button>
              <div style={{ padding: 16 }}>
                <Text strong style={{ fontSize: 16, display: 'block' }}>
                  {selectedNode.title || (selectedNode as any).zh_name || selectedNode.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {selectedNode.type}
                </Text>
                <div style={{ marginTop: 10, fontSize: 13, maxHeight: 200, overflowY: 'auto' }}>
                  {selectedNode.overview}
                </div>
              </div>
            </div>
          )}

          <NodeContextMenu
            visible={contextMenu.visible}
            x={contextMenu.x}
            y={contextMenu.y}
            nodeId={contextMenu.nodeId}
            nodeName={contextMenu.nodeName}
            nodeType={contextMenu.nodeType}
            onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
            onViewDetail={handleContextViewDetail}
            onAddMonitor={handleContextAddMonitor}
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
  statsOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 10,
    background: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 10,
    padding: '8px 14px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    border: '1px solid #e2e8f0',
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    pointerEvents: 'none',
    backdropFilter: 'blur(8px)',
  },
  statsDivider: { width: 1, height: 28, background: '#e2e8f0', flexShrink: 0 },
  infoCard: {
    position: 'absolute',
    top: 16,
    right: 60,
    width: 260,
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    zIndex: 10,
    border: '1px solid #e2e8f0',
  },
  closeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    background: 'none',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    color: '#94a3b8',
  },
}

export default EnhancedGraphPanel
