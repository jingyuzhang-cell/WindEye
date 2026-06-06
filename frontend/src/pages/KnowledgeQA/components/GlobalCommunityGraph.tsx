import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Spin, Empty, Button, Tooltip } from 'antd'
import { ZoomOutOutlined } from '@ant-design/icons'
import G6 from '@antv/g6'
import type {
  ExpandedCommunityResult,
  CommunityAggNode,
  CommunityAggEdge,
} from '../types/api'
import { COMMUNITY_COLORS } from './graphStyles'

interface Props {
  result: ExpandedCommunityResult | null
  expandedCommunityId: number | null
  onExpandCommunity: (communityId: number | null) => void
}

const COMM_NODE_SIZE = 60
const MEMBER_NODE_SIZE = 26

function getCommColor(communityId: number): string {
  return COMMUNITY_COLORS[(communityId - 1) % COMMUNITY_COLORS.length] || COMMUNITY_COLORS[0]
}

function getRiskColor(riskLevel?: string): string {
  if (riskLevel === 'high') return '#f5222d'
  if (riskLevel === 'medium') return '#faad14'
  if (riskLevel === 'low') return '#52c41a'
  return '#1890ff'
}

const GlobalCommunityGraph: React.FC<Props> = ({
  result,
  expandedCommunityId,
  onExpandCommunity,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const [level, setLevel] = useState<'community' | 'members'>('community')
  const [selectedComm, setSelectedComm] = useState<number | null>(null)

  const buildCommunityGraph = useCallback(() => {
    if (!result) return { nodes: [], edges: [] }
    const cg = result.communityGraph
    const nodes = (cg.nodes || []).map((n: CommunityAggNode) => ({
      id: `comm-${n.communityId}`,
      label: n.label || `社区 #${n.communityId}`,
      communityId: n.communityId,
      size: Math.max(COMM_NODE_SIZE, Math.min(COMM_NODE_SIZE * 2, (n.memberCount || n.size || 5) * 8)),
      nodeType: 'community',
      memberCount: n.memberCount || n.size || 0,
      topEntities: n.topEntityNames || [],
      riskLevel: n.riskLevel,
    }))
    const edges = (cg.edges || []).map((e: CommunityAggEdge, i: number) => ({
      id: e.id || `comm-edge-${i}`,
      source: `comm-${e.source}`,
      target: `comm-${e.target}`,
      label: e.relationTypes?.join(', ') || '',
      weight: e.weight || 1,
      riskLevel: e.riskLevel,
    }))
    return { nodes, edges }
  }, [result])

  const buildMemberGraph = useCallback((communityId: number) => {
    if (!result) return { nodes: [], edges: [] }
    const map = result.entityCommunityMap || {}
    const memberEntries = Object.entries(map).filter(
      ([, entry]) => entry.communityId === communityId,
    )
    const memberIds = new Set(memberEntries.map(([id]) => id))
    const nodes = memberEntries.map(([id, entry]) => ({
      id,
      label: entry.name || id,
      nodeType: entry.type || 'COMPANY',
      riskLevel: entry.riskLevel,
      role: entry.role,
      isSeed: entry.isSeed,
      size: entry.isSeed ? MEMBER_NODE_SIZE + 6 : MEMBER_NODE_SIZE,
      communityId,
    }))

    const edges = (result.communityEdges || [])
      .filter(
        (e) => e.sourceCommunityId === communityId || e.targetCommunityId === communityId,
      )
      .flatMap((e) => {
        const bridgeNodes = (e.bridgeNodeIds || []).filter((nid) => memberIds.has(nid))
        if (bridgeNodes.length < 2) return []
        const result: any[] = []
        for (let i = 0; i < bridgeNodes.length - 1; i++) {
          result.push({
            id: `bridge-${bridgeNodes[i]}-${bridgeNodes[i + 1]}`,
            source: bridgeNodes[i],
            target: bridgeNodes[i + 1],
            label: `桥接 → 社区#${e.targetCommunityId}`,
            style: { lineDash: [5, 5], stroke: getRiskColor(e.riskLevel) },
          })
        }
        return result
      })

    return { nodes, edges }
  }, [result])

  useEffect(() => {
    if (!result || !containerRef.current) return
    const container = containerRef.current
    const width = container.clientWidth || 600
    const height = container.clientHeight || 400

    if (graphRef.current) {
      graphRef.current.destroy()
      graphRef.current = null
    }

    let data: { nodes: any[]; edges: any[] }
    if (expandedCommunityId != null) {
      data = buildMemberGraph(expandedCommunityId)
      setLevel('members')
      setSelectedComm(expandedCommunityId)
      console.log(
        `[GlobalCommunityGraph] level=member communityId=${expandedCommunityId} members=${data.nodes.length} edges=${data.edges.length}`,
      )
    } else {
      data = buildCommunityGraph()
      setLevel('community')
      setSelectedComm(null)
      console.log(
        `[GlobalCommunityGraph] level=community communities=${data.nodes.length} edges=${data.edges.length}`,
      )
    }

    if (data.nodes.length === 0) {
      return
    }

    const isCommunityLevel = expandedCommunityId == null

    const graph = new G6.Graph({
      container,
      width,
      height,
      fitView: true,
      fitViewPadding: 40,
      animate: true,
      modes: {
        default: [
          'drag-canvas',
          'zoom-canvas',
          isCommunityLevel ? 'click-select' : 'drag-node',
        ],
      },
      defaultNode: {
        type: 'circle',
        size: isCommunityLevel ? COMM_NODE_SIZE : MEMBER_NODE_SIZE,
        labelCfg: {
          position: 'bottom',
          offset: 8,
          style: {
            fill: '#262626',
            fontSize: 11,
            fontWeight: 500,
          },
        },
      },
      defaultEdge: {
        style: {
          stroke: '#C0C0C0',
          lineWidth: 1.5,
        },
        labelCfg: {
          autoRotate: true,
          style: {
            fontSize: 9,
            fill: '#8c8c8c',
          },
        },
      },
    })

    // Community-level node click → expand
    graph.on('node:click', (evt: any) => {
      const model = evt.item?.getModel?.()
      if (model?.nodeType === 'community' && isCommunityLevel) {
        const commId = model.communityId
        console.log(`[GlobalCommunityGraph] expand communityId=${commId} members=${model.memberCount}`)
        onExpandCommunity(commId)
      }
    })

    // Canvas click on member level → back to community view
    graph.on('canvas:click', () => {
      if (!isCommunityLevel) {
        onExpandCommunity(null)
      }
    })

    data.nodes.forEach((n: any) => {
      if (n.nodeType === 'community') {
        const color = getCommColor(n.communityId)
        n.style = {
          fill: color,
          stroke: color,
          fillOpacity: 0.15,
          lineWidth: 2.5,
        }
        n.label = `${n.label}\n(${n.memberCount} 个成员)`
      } else {
        const color = getRiskColor(n.riskLevel)
        const roleStroke = n.role === 'core' ? color : n.role === 'bridge' ? '#fa8c16' : '#8c8c8c'
        const roleSize = n.isSeed ? n.size + 4 : n.size
        n.size = roleSize
        n.style = {
          fill: color,
          stroke: roleStroke,
          fillOpacity: 0.2,
          lineWidth: n.isSeed ? 3 : 1.5,
        }
      }
    })

    data.edges.forEach((e: any) => {
      if (e.riskLevel) {
        e.style = {
          stroke: getRiskColor(e.riskLevel),
          lineWidth: 2,
        }
      }
    })

    graph.data(data)
    graph.render()
    graphRef.current = graph

    return () => {
      graph?.destroy()
      graphRef.current = null
    }
  }, [result, expandedCommunityId, buildCommunityGraph, buildMemberGraph, onExpandCommunity])

  useEffect(() => {
    const handleResize = () => {
      if (graphRef.current && containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current
        graphRef.current.changeSize(clientWidth || 600, clientHeight || 400)
        graphRef.current.fitView(40)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (!result) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Empty description="暂无社区数据" />
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {level === 'members' && (
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 10,
          background: '#fff', borderRadius: 6, padding: '4px 8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          <Tooltip title="返回社区聚合视图">
            <Button
              size="small"
              icon={<ZoomOutOutlined />}
              onClick={() => onExpandCommunity(null)}
            >
              社区 #{selectedComm}
            </Button>
          </Tooltip>
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

export default GlobalCommunityGraph
