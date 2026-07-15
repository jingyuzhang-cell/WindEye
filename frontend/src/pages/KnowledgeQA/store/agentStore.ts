import { create } from 'zustand'
import type {
  ChatMessage,
  QueryRewriteResult,
  Subgraph,
  AlignmentFeature,
  RecommendationItem,
  RiskReport,
  RiskStage,
  CommunityResult,
  EntityCommunityMap,
  ResolvedEntity,
  EvidenceChains,
  RiskScores,
  GovernancePlan,
  ComplianceIndicator,
  EntityCandidate,
  ExpandedCommunityResult,
} from '../types/api'
import { generateComplianceCommunityReport, saveEntityAlias, searchEntityCandidates, sendUnifiedStream } from '../api/agent'
import { getNodeDisplayName } from '../components/graphStyles'

const generateSessionId = () => `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const ENTITY_ALIAS_STORAGE_KEY = 'windeye.entityAliases.v1'

// Normalize nodes from Neo4j format {id, labels, properties} to frontend format {id, type, ...}
// Also handles DRAEngine format {id, label, type} which already has a `type` field.
const VALID_TYPES = new Set(['COMPANY', 'PERSON', 'EVENT', 'SUB_EVENT', 'TIME', 'RiskFeature', 'RiskFactor', 'Action', 'Regulation', 'Law'])

export function normalizeSubgraphNodes(rawNodes: any[]): any[] {
  return rawNodes.map((n: any) => {
    // Already has a valid `type` field (DRAEngine format) — inject unified fields
    if (n.type && VALID_TYPES.has(n.type)) {
      const props = n.properties || {}
      return {
        ...n,
        properties: props,
        raw: n,
        entityType: n.entityType || n.type,
        entity_type: n.entity_type || n.type,
        label: n.label || n.title || n.name || String(n.id),
        compliance_score: n.compliance_score ?? props.compliance_score,
      }
    }

    // Neo4j format: extract type from `labels` array
    let nodeType = ''
    if (n.labels && Array.isArray(n.labels) && n.labels.length > 0) {
      for (const label of n.labels) {
        const upper = typeof label === 'string' ? label.toUpperCase() : ''
        if (upper === 'COMPANY' || upper === 'SUBJECT') { nodeType = 'COMPANY'; break }
        if (upper === 'PERSON') { nodeType = 'PERSON'; break }
        if (upper === 'EVENT') { nodeType = 'EVENT'; break }
        if (upper === 'SUB_EVENT') { nodeType = 'SUB_EVENT'; break }
        if (upper === 'TIME') { nodeType = 'TIME'; break }
        if (label === 'RiskFeature' || label === 'RiskFactor' || label === 'Action' || label === 'Regulation' || label === 'Law') {
          nodeType = label; break
        }
      }
      // Fallback: use first label, try to match known types
      if (!nodeType) {
        const firstLabel = String(n.labels[0])
        if (VALID_TYPES.has(firstLabel)) {
          nodeType = firstLabel
        } else {
          const upper = firstLabel.toUpperCase()
          if (VALID_TYPES.has(upper)) nodeType = upper
        }
      }
    }

    // DRAEngine format fallback: type might need normalization
    // Ontology layer types (Subject, Feature, Regulation) are mapped to concrete types
    if (!nodeType && typeof n.type === 'string') {
      const upper = String(n.type).toUpperCase()
      nodeType = upper === 'COMPANY' || upper === 'SUBJECT' ? 'COMPANY'
        : upper === 'PERSON' ? 'PERSON'
        : upper === 'EVENT' ? 'EVENT'
        : upper === 'FEATURE' ? 'RiskFeature'
        : upper === 'REGULATION' ? 'Regulation'
        : VALID_TYPES.has(n.type) ? n.type
        : VALID_TYPES.has(upper) ? upper
        : n.type // Preserve original type so downstream resolveNodeType can handle it
    }

    // Unified format: check entity_type from backend normalization
    if (!nodeType && (n as any).entity_type && VALID_TYPES.has((n as any).entity_type)) {
      nodeType = (n as any).entity_type
    }

    // Absolute fallback: derive type from node name heuristics
    if (!nodeType) {
      const fallbackName = String(n.name || n.title || n.label || n.id || '')
      const upper = fallbackName.toUpperCase()
      if (/公司|集团|有限|股份|银行|基金|证券|保险|CO|LTD|INC|CORP/i.test(upper)) {
        nodeType = 'COMPANY'
      } else if (/风险|事件|违约|违规|监管|处罚/i.test(upper)) {
        nodeType = 'RiskFeature'
      } else {
        nodeType = 'COMPANY'  // Default to prevent silent filtering
      }
    }

    // Final safety net: if resolved type is still not valid, force to COMPANY
    if (!VALID_TYPES.has(nodeType)) {
      console.warn('[normalizeSubgraphNodes] Resolved type not in VALID_TYPES, forcing COMPANY:', { id: n.id, name: n.name, title: n.title, resolvedType: nodeType, rawType: n.type, rawEntityType: n.entity_type, labels: n.labels })
      nodeType = 'COMPANY'
    }

    const props = n.properties || {}
    const normalizedType = nodeType
    const displayName = getNodeDisplayName(n)
    return {
      id: String(n.id),
      type: normalizedType,
      entityType: normalizedType,
      entity_type: normalizedType,
      properties: props,
      raw: n,
      label: displayName,
      title: displayName,
      name: displayName,
      zh_name: n.zh_name || props.zh_name || displayName,
      overview: n.overview || props.overview || props.RISK_INFO || '',
      popularity: n.popularity ?? props.popularity,
      rating: n.rating ?? props.rating,
      year: n.year ?? props.year,
      risk_level: (n.risk_level || props.risk_level || '').toString().toLowerCase() || undefined,
      compliance_score: n.compliance_score ?? props.compliance_score,
    }
  })
}

export function normalizeSubgraphEdges(rawEdges: any[]): any[] {
  return rawEdges.map((e: any) => ({
    id: e.id || e.element_id || e.elementId,
    source: String(e.source || e.start || ''),
    target: String(e.target || e.end || ''),
    relation: e.relation || e.label || e.type || 'RELATED',
    confidence: e.confidence,
  }))
}

const BACKEND_STAGE_TO_FRONTEND: Record<string, RiskStage['stage']> = {
  intent: 'planning',
  entity_resolution: 'planning',
  subgraph: 'retrieving',
  graph_analytics: 'entity_stats',
  community_detection: 'community',
  risk_analysis: 'analyzing',
  compliance: 'compliance',
  scoring: 'compliance',
  governance: 'reporting',
  reporting: 'reporting',
  done: 'reporting',
}

function mapBackendStage(backendStage: string): RiskStage['stage'] {
  return BACKEND_STAGE_TO_FRONTEND[backendStage] || 'retrieving'
}

function appendRiskProgress(
  stages: RiskStage[],
  stage: RiskStage['stage'],
  content: string,
): RiskStage[] {
  const next = { stage, content }
  const latest = stages[stages.length - 1]
  if (latest?.stage === next.stage && latest?.content === next.content) {
    return stages
  }
  return [...stages, next]
}

function mergeRiskReport(prev: RiskReport | null, patch: Partial<RiskReport>): RiskReport {
  return {
    ...(prev || {}),
    ...patch,
    // 元信息：最终 report 到达时优先使用最新值
    report_id: patch.report_id ?? prev?.report_id,
    generated_at: patch.generated_at ?? prev?.generated_at,
    executive_summary: patch.executive_summary ?? prev?.executive_summary,
    markdown_report: patch.markdown_report ?? prev?.markdown_report,
    integrated_report: patch.integrated_report ?? prev?.integrated_report,
    report_sections: patch.report_sections ?? prev?.report_sections,
    export_files: patch.export_files ?? prev?.export_files,
    report_download_url: patch.report_download_url ?? prev?.report_download_url,
    pipeline_trace: patch.pipeline_trace ?? prev?.pipeline_trace,
    compliance_indicator_details: patch.compliance_indicator_details ?? prev?.compliance_indicator_details,
    echarts_config: patch.echarts_config ?? prev?.echarts_config,
    // 中间阶段数据：渐进写入，新数据覆盖旧数据
    entity_stats: patch.entity_stats ?? prev?.entity_stats,
    community_info: patch.community_info ?? prev?.community_info,
    risk_paths: patch.risk_paths ?? prev?.risk_paths ?? [],
    anomaly_findings: patch.anomaly_findings ?? prev?.anomaly_findings ?? [],
    compliance_matches: patch.compliance_matches ?? prev?.compliance_matches ?? [],
    risk_scores: patch.risk_scores ?? prev?.risk_scores,
    governance_plan: patch.governance_plan ?? prev?.governance_plan,
    evidence_chains: patch.evidence_chains ?? prev?.evidence_chains,
  } as RiskReport
}

function compactText(value: unknown, fallback = ''): string {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}

function getSubgraphNodeName(node: any): string {
  return compactText(
    node?.title || node?.zh_name || node?.name || node?.label || node?.properties?.name || node?.properties?.COMPANY_NM || node?.id,
    '未知实体',
  )
}

function buildGraphQaAnswer(
  query: string,
  subgraph: Subgraph | null,
  resolvedEntities: ResolvedEntity[] = [],
): string {
  const nodes = subgraph?.nodes || []
  const edges = subgraph?.edges || []
  if (nodes.length === 0) {
    return '我暂时没有在图谱里找到明确匹配的实体或关系。可以把主体名称写完整一些，例如使用公司全称，我再帮你查。'
  }

  const nodeById = new Map(nodes.map((node: any) => [String(node.id), node]))

  // 优先从 resolved entities 确定中心实体
  let centerId = ''
  let centerName = ''
  let matchType = ''

  if (resolvedEntities.length > 0) {
    for (const re of resolvedEntities) {
      const candidateId = String(re.kg_node_id || '')
      if (nodeById.has(candidateId)) {
        centerId = candidateId
        centerName = re.canonical_name || re.raw || getSubgraphNodeName(nodeById.get(candidateId))
        matchType = re.match_type || ''
        break
      }
      for (const [nid, node] of nodeById) {
        const name = getSubgraphNodeName(node)
        if (name && re.canonical_name && name.includes(re.canonical_name)) {
          centerId = nid
          centerName = re.canonical_name
          matchType = re.match_type || ''
          break
        }
      }
      if (centerId) break
    }
  }

  // Fallback: use isCenter flag
  if (!centerId) {
    const centerNode = nodes.find((n: any) => n.isCenter || n.isMatched)
    if (centerNode) {
      centerId = String((centerNode as any).id)
      centerName = getSubgraphNodeName(centerNode)
    }
  }

  // Last resort: degree-based center
  if (!centerId) {
    const degree = new Map<string, number>()
    edges.forEach((edge: any) => {
      degree.set(String(edge.source), (degree.get(String(edge.source)) || 0) + 1)
      degree.set(String(edge.target), (degree.get(String(edge.target)) || 0) + 1)
    })
    const best = [...nodes].sort((a: any, b: any) =>
      (degree.get(String(b.id)) || 0) - (degree.get(String(a.id)) || 0))[0]
    centerId = best ? String((best as any).id) : ''
    centerName = best ? getSubgraphNodeName(best) : '查询主体'
  }

  if (!centerId) {
    return '我暂时无法确定查询的核心实体。可以补充完整名称，我再继续查询。'
  }

  // 直接关系：仅来自中心节点的一跳边
  const directEdges = edges.filter(
    (edge: any) => String(edge.source) === centerId || String(edge.target) === centerId,
  )
  const related = directEdges
    .map((edge: any) => {
      const otherId = String(edge.source) === centerId ? String(edge.target) : String(edge.source)
      const other = nodeById.get(otherId)
      return {
        name: getSubgraphNodeName(other),
        relation: compactText(edge.relation || (edge as any).type || (edge as any).label, '关联'),
      }
    })
    .filter((item) => item.name && item.name !== '未知实体' && item.name !== centerName)

  // 构建回答
  const lines: string[] = []
  const matchInfo = matchType ? `（${matchType}）` : ''
  lines.push(`已匹配到实体：**${centerName}**${matchInfo}`)

  if (related.length > 0) {
    lines.push('')
    lines.push(`**${centerName}** 的直接关联包括：`)
    related.slice(0, 8).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.name}（${item.relation}）`)
    })
    if (related.length > 8) {
      lines.push(`还有 ${related.length - 8} 个关联实体，可在右侧图谱继续查看。`)
    }
  } else {
    lines.push('')
    lines.push('当前图谱中暂未查询到该实体的一跳关联关系。可以提高穿透深度，或检查该实体是否存在关系入库。')
  }
  if (/简称|缩写/.test(query) || /^[\u4e00-\u9fa5]{2,4}$/.test(query.trim())) {
    lines.push('')
    lines.push('如果这是公司简称，可能对应多个图谱实体。你可以补充公司全称、地区或关联对象，我可以进一步精确定位。')
  }
  return lines.join('\n')
}

function buildPartialRiskAnswer(query: string, report: RiskReport | null, subgraph: Subgraph | null): string {
  const paths = report?.risk_paths || []
  const anomalies = report?.anomaly_findings || []
  const compliance = report?.compliance_matches || []
  const nodes = subgraph?.nodes?.length || report?.subgraph_summary?.node_count || 0
  const edges = subgraph?.edges?.length || report?.subgraph_summary?.edge_count || 0
  const lines: string[] = []

  lines.push('已按“协同治理社区报告”进入分析流程。')
  if (nodes || edges) {
    lines.push(`当前已检索到 ${nodes} 个节点、${edges} 条关系，右侧已切换到治理报告面板。`)
  }
  if (paths.length || anomalies.length || compliance.length) {
    lines.push(`已识别 ${paths.length} 条风险传导路径、${anomalies.length} 个异常发现、${compliance.length} 条合规匹配。`)
  } else {
    lines.push('目前证据仍在汇总中，若图谱证据不足，报告会优先展示已确认的主体、群体和关系。')
  }
  if (/简称|缩写|鑫达|华创/.test(query)) {
    lines.push('如果主体名称是简称，建议补充公司全称以提升实体对齐准确度。')
  }
  return lines.join('\n')
}

function extractAmbiguousShortMention(query: string): string | null {
  const trimmed = query.trim()
  if (/^[\u4e00-\u9fa5]{2,12}(?:集团|公司|控股|证券|银行|保险|基金|资本)$/.test(trimmed)
    && !/有限公司|有限责任|股份有限公司|集团有限公司|控股集团有限公司/.test(trimmed)) {
    return trimmed
  }
  if (/有限公司|有限责任|股份有限公司|集团有限公司|控股集团有限公司|投资管理有限公司|金融服务有限公司/.test(query)) return null
  const match = query.match(/^\s*([\u4e00-\u9fa5]{2,12}(?:集团|公司|控股|证券|银行|保险|基金|资本)?)(?:\s|与|和|的|有|关|查|风险|合规|传导|群体|社区|报告)/)
  const mention = match?.[1]?.trim()
  if (!mention) return null
  const stopWords = new Set(['哪些', '公司', '关系', '关联', '查询', '风险', '合规', '这个', '那个'])
  return stopWords.has(mention) ? null : mention
}

function getMentionNodeName(node: any): string {
  return getNodeDisplayName(node)
}

function getMentionNodeType(node: any): string {
  const props = node?.properties || {}
  return String(node?.type || node?.entityType || node?.entity_type || props.type || node?.labels?.[0] || '').toUpperCase()
}

function looksLikeCompanyName(name: string, type?: string): boolean {
  if (['EVENT', 'SUB_EVENT', 'RISKFEATURE', 'RISKFACTOR', 'REGULATION', 'LAW'].includes(type || '')) {
    return false
  }
  if (/事件|案件|诉讼|处罚|仲裁|纠纷|争议|违约|违规|违法|资金占用|冻结|判决|裁定|非法集资/.test(name)) {
    return false
  }
  return type === 'COMPANY' || type === 'SUBJECT' || /公司|集团|有限|股份|控股|金融服务|证券|银行|基金|资本/.test(name)
}

function resolveShortMentionFromCurrentGraph(
  mention: string,
  subgraph: Subgraph | null,
): { resolvedName?: string; candidates: string[] } {
  const nodes = subgraph?.nodes || []
  const matched = nodes
    .map((node: any) => {
      const name = getMentionNodeName(node)
      const type = getMentionNodeType(node)
      return { name, type }
    })
    .filter((item) => item.name && item.name !== mention && item.name.includes(mention))

  const unique = Array.from(
    new Map(matched.map((item) => [item.name, item])).values(),
  )
  const companyMatches = unique.filter((item) => looksLikeCompanyName(item.name, item.type))
  const preferred = companyMatches.length > 0 ? companyMatches : unique

  if (preferred.length === 1) {
    return { resolvedName: preferred[0].name, candidates: preferred.map((item) => item.name) }
  }
  return { candidates: preferred.slice(0, 6).map((item) => item.name) }
}

function readConfirmedAlias(alias: string): string | null {
  try {
    const raw = localStorage.getItem(ENTITY_ALIAS_STORAGE_KEY)
    const aliases = raw ? JSON.parse(raw) : {}
    const item = aliases?.[alias]
    return typeof item?.canonicalName === 'string' ? item.canonicalName : null
  } catch {
    return null
  }
}

function writeConfirmedAlias(alias: string, candidate: EntityCandidate) {
  try {
    const raw = localStorage.getItem(ENTITY_ALIAS_STORAGE_KEY)
    const aliases = raw ? JSON.parse(raw) : {}
    aliases[alias] = {
      canonicalName: candidate.canonical_name,
      kgNodeId: candidate.kg_node_id,
      entityType: candidate.entity_type,
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(ENTITY_ALIAS_STORAGE_KEY, JSON.stringify(aliases))
  } catch {
    // Local cache is only an acceleration path; backend alias persistence is primary.
  }
}

function toLocalEntityCandidate(alias: string, name: string, index: number): EntityCandidate {
  return {
    raw: alias,
    canonical_name: name,
    kg_node_id: `local-${index}-${name}`,
    entity_type: 'COMPANY',
    labels: ['Subject'],
    match_type: 'local_graph',
    match_score: 0.72,
    confidence: 0.68,
    reason: '当前图谱主体匹配',
  }
}

function mergeEntityCandidates(
  alias: string,
  remote: EntityCandidate[],
  localNames: string[],
): EntityCandidate[] {
  const merged = new Map<string, EntityCandidate>()
  remote.forEach((item) => {
    if (item?.canonical_name) merged.set(item.canonical_name, item)
  })
  localNames.forEach((name, index) => {
    if (name && !merged.has(name)) {
      merged.set(name, toLocalEntityCandidate(alias, name, index))
    }
  })
  return [...merged.values()]
    .filter((item) => item.entity_type?.toUpperCase() !== 'EVENT')
    .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
    .slice(0, 30)
}

function buildClarifyAnswer(mention: string, candidates: string[] = []): string {
  if (candidates.length > 0) {
    return `你说的“${mention}”可能对应多个图谱实体，请再明确一下主体：\n${candidates.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
  }
  return `你说的“${mention}”可能是公司简称。为了避免把主体识别错，请补充一个更明确的名称，例如公司全称、地区，或直接输入类似“${mention}投资管理有限公司”。`
}

function buildCandidateConfirmAnswer(mention: string, candidates: EntityCandidate[]): string {
  const names = candidates.map((item, index) => `${index + 1}. ${item.canonical_name}`).join('\n')
  return `你说的“${mention}”可能对应多个主体。请选择一个确认；确认后会把“${mention}”保存为该主体的别名，后续可直接用简称查询。\n${names}`
}

function shouldAutoResolveCandidate(originalQuery: string, candidates: EntityCandidate[]): boolean {
  const trimmed = originalQuery.trim()
  if (/^[\u4e00-\u9fa5]{2,12}(?:集团|公司|控股|证券|银行|保险|基金|资本)$/.test(trimmed)) {
    return false
  }
  return candidates.length === 1 && (candidates[0].match_score || 0) >= 0.95
}

function buildConfirmedEntityRiskQuery(alias: string, candidate: EntityCandidate, originalQuery: string): string {
  const canonicalName = candidate.canonical_name
  const trimmed = originalQuery.trim()
  const hasRiskTask = /风险|传导|群体|社区|报告|合规|治理|异常|路径/.test(trimmed)
  if (hasRiskTask) {
    return trimmed.replace(alias, canonicalName)
  }
  return `分析${canonicalName}的风险传导、群体发现和社区报告`
}

function buildReportAnswer(report: RiskReport): string {
  const paths = report.risk_paths || []
  const anomalies = report.anomaly_findings || []
  const compliance = report.compliance_matches || []
  const recommendations = report.recommendations || []
  const scoreLevel = report.risk_scores?.level || report.overall_risk_level
  const scoreValue = report.risk_scores?.final_overall ?? report.risk_scores?.base_overall

  const lines: string[] = []
  lines.push(report.executive_summary || '协同治理分析已完成。')
  if (report.report_sections?.length) {
    lines.push(`已生成 ${report.report_sections.length} 个结构化报告章节。`)
  }
  lines.push('')
  lines.push(`总体研判：${scoreLevel || '待评估'}${scoreValue !== undefined && scoreValue !== null ? `，综合评分 ${scoreValue}` : ''}`)
  lines.push(`图谱证据：${report.subgraph_summary?.node_count ?? '-'} 个节点、${report.subgraph_summary?.edge_count ?? '-'} 条关系；识别 ${paths.length} 条风险路径、${anomalies.length} 个异常发现、${compliance.length} 条合规匹配。`)

  if (paths.length > 0) {
    lines.push('')
    lines.push('风险传导路径：')
    paths.slice(0, 4).forEach((p, index) => {
      const desc = compactText(p.path_description || p.path_text, '暂无路径描述')
      lines.push(`${index + 1}. [${p.risk_level || 'medium'}] ${desc}`)
    })
  }

  if (anomalies.length > 0) {
    lines.push('')
    lines.push('异常关系：')
    anomalies.slice(0, 3).forEach((a, index) => {
      lines.push(`${index + 1}. ${a.anomaly_type || '异常'}：${compactText(a.evidence, '暂无证据说明')}`)
    })
  }

  if (compliance.length > 0) {
    lines.push('')
    lines.push('合规风险：')
    compliance.slice(0, 3).forEach((c, index) => {
      const basis = [c.regulation, c.article].filter(Boolean).join(' ')
      lines.push(`${index + 1}. ${basis || '相关法规'}：${c.violation || c.suggested_action || '需进一步核验'}`)
    })
  }

  if (recommendations.length > 0) {
    lines.push('')
    lines.push('治理建议：')
    recommendations.slice(0, 4).forEach((r, index) => {
      lines.push(`${index + 1}. ${r.action}（${r.department || '责任部门待定'}，${r.urgency || 'normal'}）`)
    })
  }

  return lines.join('\n').slice(0, 1800)
}

function pickCommunityReportSeedNames(
  query: string,
  resolvedEntities: ResolvedEntity[] = [],
  subgraph: Subgraph | null = null,
): string[] {
  const resolved = resolvedEntities
    .map((item) => item.canonical_name || item.raw)
    .filter((name): name is string => Boolean(name))
  if (resolved.length > 0) return resolved.slice(0, 3)

  const nodeNames = (subgraph?.nodes || [])
    .map((node: any) => getNodeDisplayName(node))
    .filter((name) => Boolean(name) && /公司|集团|股份|有限|银行|证券|基金|控股/.test(name))
  if (nodeNames.length > 0) return nodeNames.slice(0, 3)

  return query ? [query] : []
}

type RouteDecision = 'graph' | 'clarify' | 'risk'
type RightPanelMode = 'graph' | 'risk' | 'compliance' | 'community_graph'

export interface AgentTraceEntry {
  agent: string
  step: string
  summary: string
  metrics: Record<string, unknown>
  timestamp: number
}

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

  // Unified Engine state
  resolvedEntities: ResolvedEntity[]
  evidenceChains: EvidenceChains | null
  riskScores: RiskScores | null
  governancePlan: GovernancePlan | null

  // Risk Report state
  riskReport: RiskReport | null
  riskStages: RiskStage[]
  riskCommunity: CommunityResult | null
  riskEntityCommunityMap: EntityCommunityMap | null
  complianceScores: Record<string, number> | null
  complianceIndicators: ComplianceIndicator[] | null

  // Expanded community state (two-level zoom)
  expandedCommunityResult: ExpandedCommunityResult | null
  expandedCommunityId: number | null
  selectedRiskPathId: string | null

  // File upload state
  uploadedFile: UploadedFileInfo | null
  fileUploading: boolean

  // Agent trace state
  agentTraces: AgentTraceEntry[]

  lastRiskQuery: string
  sendMessage: (query: string, rewrittenQuery?: string) => Promise<void>
  sendRiskQuery: (query: string, communityId?: number) => Promise<void>
  sendUnifiedMessage: (
    query: string,
    intentHint?: string,
    confirmedEntities?: EntityCandidate[],
    workflow?: string,
  ) => Promise<void>
  confirmEntityCandidate: (alias: string, candidate: EntityCandidate, originalQuery: string) => Promise<void>
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

  resolvedEntities: [],
  evidenceChains: null,
  riskScores: null,
  governancePlan: null,

  riskReport: null,
  riskStages: [],
  riskCommunity: null,
  riskEntityCommunityMap: null,
  complianceScores: null,
  complianceIndicators: null,

  expandedCommunityResult: null,
  expandedCommunityId: null,
  selectedRiskPathId: null,

  uploadedFile: null,
  fileUploading: false,
  agentTraces: [],

  lastRiskQuery: '',

  sendMessage: async (query: string, rewrittenQuery?: string) => {
    return get().sendUnifiedMessage(rewrittenQuery || query)
  },

  sendRiskQuery: async (query: string, communityId?: number, fileContent?: string) => {
    set({ lastRiskQuery: query })
    return get().sendUnifiedMessage(query, 'risk_analysis')
  },

  sendUnifiedMessage: async (
    query: string,
    intentHint?: string,
    confirmedEntities: EntityCandidate[] = [],
    workflow?: string,
  ) => {
    if (get().isLoading) return

    const originalQuery = query
    const ambiguousMention = !intentHint && confirmedEntities.length === 0 ? extractAmbiguousShortMention(query) : null
    if (ambiguousMention) {
      const confirmedAlias = readConfirmedAlias(ambiguousMention)
      if (confirmedAlias) {
        query = query.replace(ambiguousMention, confirmedAlias)
      }
      const resolved = resolveShortMentionFromCurrentGraph(ambiguousMention, get().currentSubgraph)
      if (confirmedAlias) {
        // The query has already been rewritten from the confirmed alias cache.
      } else {
        let remoteCandidates: EntityCandidate[] = []
        try {
          remoteCandidates = await searchEntityCandidates(ambiguousMention, 'COMPANY', 30)
        } catch (err) {
          console.warn('[agentStore] entity candidate search failed:', err)
        }
        const candidates = mergeEntityCandidates(ambiguousMention, remoteCandidates, resolved.candidates)
        if (shouldAutoResolveCandidate(originalQuery, candidates)) {
          query = query.replace(ambiguousMention, candidates[0].canonical_name)
        } else if (candidates.length > 0) {
          const userMsg: ChatMessage = {
            id: `user_${Date.now()}`,
            role: 'user',
            content: originalQuery,
            timestamp: Date.now(),
          }
          const assistantContent = buildCandidateConfirmAnswer(ambiguousMention, candidates)
          const assistantMsg: ChatMessage = {
            id: `asst_${Date.now()}`,
            role: 'assistant',
            content: assistantContent,
            timestamp: Date.now(),
            isLoading: false,
            data: {
              entityCandidates: {
                alias: ambiguousMention,
                originalQuery,
                candidates,
              },
            },
          }
          set((state) => ({
            messages: [...state.messages, userMsg, assistantMsg],
            currentRoute: 'graph',
            activeRightPanel: 'graph',
            clarifyMessage: assistantContent,
          }))
          return
        } else if (resolved.resolvedName) {
          query = query.replace(ambiguousMention, resolved.resolvedName)
        }
      }

      if (!confirmedAlias && query === originalQuery && resolved.candidates.length > 1) {
        const userMsg: ChatMessage = {
          id: `user_${Date.now()}`,
          role: 'user',
          content: originalQuery,
          timestamp: Date.now(),
        }
        const assistantMsg: ChatMessage = {
          id: `asst_${Date.now()}`,
          role: 'assistant',
          content: buildClarifyAnswer(ambiguousMention, resolved.candidates),
          timestamp: Date.now(),
          isLoading: false,
        }
        set((state) => ({
          messages: [...state.messages, userMsg, assistantMsg],
          currentRoute: 'graph',
          activeRightPanel: 'graph',
          clarifyMessage: assistantMsg.content,
        }))
        return
      }
    }

    if (ambiguousMention && query === originalQuery && !get().currentSubgraph?.nodes?.length) {
      // No local graph evidence is available yet. Let the backend resolver search
      // the KG instead of blocking the user with a hard-coded clarification.
    } else if (ambiguousMention && query === originalQuery) {
      const userMsg: ChatMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: originalQuery,
        timestamp: Date.now(),
      }
      const assistantMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: buildClarifyAnswer(ambiguousMention),
        timestamp: Date.now(),
        isLoading: false,
      }
      set((state) => ({
        messages: [...state.messages, userMsg, assistantMsg],
        currentRoute: 'graph',
        activeRightPanel: 'graph',
        clarifyMessage: assistantMsg.content,
      }))
      return
    }

    // Auto-detect risk intent from query keywords when no explicit hint provided
    if (!intentHint) {
      const riskKeywords = [
        '风险', '传导', '合规', '违规', '处罚', '监管',
        '担保', '关联交易', '资金占用', '内幕', '操纵',
        '洗钱', '欺诈', '违约', '评级', '预警',
        '治理报告', '社区报告', '社区风险', '群体风险', '风险报告', '协同治理',
      ]
      const fileAnalysisKeywords = ['该文件', '上传文件', '文件中', '这个文件', '该文档', '上传文档', '这个文档']
      if (
        riskKeywords.some((kw) => query.includes(kw))
        || (get().uploadedFile && fileAnalysisKeywords.some((kw) => query.includes(kw)))
      ) {
        intentHint = 'risk_analysis'
      }
    }

    const expectedIntent = intentHint ?? 'graph_qa'
    const expectsRiskReport = expectedIntent === 'risk_analysis'

    const { sessionId, roundId, messages, uploadedFile } = get()
    set({ roundId: roundId + 1 })

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: originalQuery,
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
      resolvedEntities: [],
      evidenceChains: null,
      riskScores: null,
      governancePlan: null,
      riskReport: null,
      riskStages: [],
      riskCommunity: null,
      riskEntityCommunityMap: null,
      complianceScores: null,
      complianceIndicators: null,
      expandedCommunityResult: null,
      expandedCommunityId: null,
      selectedRiskPathId: null,
      currentRoute: expectsRiskReport ? 'risk' : 'graph',
      activeRightPanel: expectsRiskReport ? 'risk' : 'graph',
    }))

    sendUnifiedStream(
      {
        query,
        fileContent: uploadedFile?.text ?? null,
        sessionId,
        roundId: roundId + 1,
        maxHop: 3,
        intentHint: intentHint ?? null,
        confirmedEntities,
        workflow: workflow ?? null,
      },
      {
        onStage: (_stage, data) => {
          const stageName = data.data?.stage_name || ''
          const stageAction = data.data?.agent_action || ''
          const frontendStage = mapBackendStage(data.stage || _stage)
          set((state) => ({
            riskStages: appendRiskProgress(state.riskStages, frontendStage, stageAction || stageName),
            messages: state.messages.map((m) =>
              m.id === tempId
                ? { ...m, thinkingStatus: stageAction || stageName }
                : m
            ),
          }))
        },

        onEntities: (data) => {
          const resolved = data.resolved || []
          set((state) => ({
            resolvedEntities: resolved,
            riskStages: appendRiskProgress(state.riskStages, 'planning', `实体对齐完成：${resolved.length} 个主体`),
          }))
        },

        onSubgraph: (graph) => {
          const rawNodes = (graph as any).nodes || []
          const normalized = {
            nodes: normalizeSubgraphNodes(rawNodes),
            edges: normalizeSubgraphEdges((graph as any).edges || []),
            paths: (graph as any).paths || [],
          }
          const nodeTypes = [...new Set(normalized.nodes.map((n: any) => n.type))]
          console.log(`[agentStore] onSubgraph nodes=${normalized.nodes.length} edges=${normalized.edges.length}`)
          console.log('[agentStore] onSubgraph details:', { paths: normalized.paths.length, nodeTypes })
          if (rawNodes.length > 0) {
            console.log('[agentStore] onSubgraph first raw node keys:', Object.keys(rawNodes[0]))
            console.log('[agentStore] onSubgraph first raw node:', rawNodes[0])
          }
          if (normalized.nodes.length > 0) {
            console.log('[agentStore] onSubgraph first normalized node keys:', Object.keys(normalized.nodes[0]))
            console.log('[agentStore] onSubgraph first normalized node:', normalized.nodes[0])
          }
          // Warn about any nodes whose type is still not in VALID_TYPES
          const invalid = normalized.nodes.filter((n: any) => !VALID_TYPES.has(n.type))
          if (invalid.length > 0) {
            console.warn('[agentStore] onSubgraph WARNING: nodes with invalid type after normalization:', invalid.map((n: any) => ({ id: n.id, title: n.title, type: n.type, entityType: n.entityType, entity_type: n.entity_type })))
          }
          set((state) => ({
            currentSubgraph: normalized as Subgraph,
            riskStages: appendRiskProgress(
              state.riskStages,
              'retrieving',
              `证据子图完成：${normalized.nodes.length} 个节点、${normalized.edges.length} 条关系`,
            ),
          }))
        },

        onEntityStats: (stats) => {
          set((state) => ({
            riskReport: mergeRiskReport(state.riskReport, { entity_stats: stats } as any),
            riskStages: appendRiskProgress(state.riskStages, 'entity_stats', '实体统计完成，准备群体发现'),
          }))
        },

        onCommunity: (info) => {
          console.log('[agentStore] onCommunity:', { communityCount: (info as any)?.communities?.length, method: (info as any)?.selected_method })
          const communityCount = Array.isArray((info as any)?.communities) ? (info as any).communities.length : 0
          set((state) => ({
            riskCommunity: info as CommunityResult,
            riskReport: mergeRiskReport(state.riskReport, { community_info: info } as any),
            riskStages: appendRiskProgress(state.riskStages, 'community', `群体发现完成：${communityCount} 个群体`),
          }))
        },

        onEntityCommunityMap: (map) => {
          console.log('[agentStore] onEntityCommunityMap:', { entityCount: (map as any)?.entities?.length, unmapped: (map as any)?.unmapped_count })
          set((state) => ({
            riskEntityCommunityMap: map as EntityCommunityMap,
            riskStages: appendRiskProgress(state.riskStages, 'community', '实体-群体映射完成'),
          }))
        },

        onCandidateRiskPaths: (paths) => {
          const arr = Array.isArray(paths) ? paths : []
          console.log('[agentStore] onCandidateRiskPaths:', { count: arr.length, firstPath: arr[0] })
          // Transform into SubgraphPath shape so buildG6Data highlights them
          const subgraphPaths = arr.map((p: any) => ({
            pathId: p.path_id || '',
            nodeIds: p.node_ids || [],
            edgeIds: p.edge_ids || [],
            score: p.confidence ?? 0.7,
          }))
          set((state) => {
            const currentPaths = state.currentSubgraph?.paths || []
            const mergedPaths = [...currentPaths]
            for (const sp of subgraphPaths) {
              if (!mergedPaths.some((existing) => existing.pathId === sp.pathId)) {
                mergedPaths.push(sp)
              }
            }
            console.log('[agentStore] onCandidateRiskPaths: merged subgraph.paths count =', mergedPaths.length)
            return {
              currentSubgraph: state.currentSubgraph
                ? { ...state.currentSubgraph, paths: mergedPaths }
                : null,
              riskStages: appendRiskProgress(state.riskStages, 'analyzing', `候选风险路径完成：${arr.length} 条`),
            }
          })
        },

        onRiskPaths: (paths) => {
          // The SSE event now sends { candidate_paths, interpreted_paths, merged_paths }
          const data: any = paths
          const interpretedArr: any[] = Array.isArray(data?.interpreted_paths)
            ? data.interpreted_paths
            : Array.isArray(data) ? data : []
          const mergedArr: any[] = Array.isArray(data?.merged_paths)
            ? data.merged_paths
            : interpretedArr

          // Store raw paths in riskReport for the text-based report panel
          set((state) => ({
            riskReport: mergeRiskReport(state.riskReport, {
              risk_paths: interpretedArr,
            } as any),
            riskStages: appendRiskProgress(state.riskStages, 'analyzing', `风险传导路径完成：${interpretedArr.length} 条`),
          }))

          // Also merge into currentSubgraph.paths so the graph view can highlight them
          if (mergedArr.length === 0) return
          const subgraphPaths = mergedArr.map((p: any) => ({
            pathId: p.path_id || '',
            nodeIds: p.node_ids || [],
            edgeIds: p.edge_ids || [],
            score: p.confidence ?? 0.7,
          }))
          set((state) => {
            const currentPaths = state.currentSubgraph?.paths || []
            const newPaths = [...currentPaths]
            for (const sp of subgraphPaths) {
              if (!newPaths.some((existing) => existing.pathId === sp.pathId)) {
                newPaths.push(sp)
              }
            }
            console.log('[agentStore] onRiskPaths: merged into subgraph.paths, count =', newPaths.length)
            return {
              currentSubgraph: state.currentSubgraph
                ? { ...state.currentSubgraph, paths: newPaths }
                : null,
            }
          })
        },

        onAnomalyFindings: (anomalies) => {
          const anomalyList = Array.isArray(anomalies) ? anomalies : (anomalies as any)?.anomalies ?? []
          set((state) => ({
            riskReport: mergeRiskReport(state.riskReport, {
              anomaly_findings: anomalyList,
            } as any),
            riskStages: appendRiskProgress(state.riskStages, 'analyzing', `异常关系识别完成：${anomalyList.length} 条`),
          }))
        },

        onCompliance: (matches) => {
          const complianceMatches = Array.isArray(matches) ? matches : (matches as any)?.matches ?? []
          set((state) => ({
            riskReport: mergeRiskReport(state.riskReport, {
              compliance_matches: complianceMatches,
            } as any),
            riskStages: appendRiskProgress(state.riskStages, 'compliance', `合规匹配完成：${complianceMatches.length} 条`),
          }))
        },

        onComplianceScores: (scores) => {
          const scoreMap = scores as Record<string, number>
          console.log('[agentStore] onComplianceScores keys=%d', Object.keys(scoreMap || {}).length)
          set((state) => ({
            complianceScores: scoreMap,
            riskStages: appendRiskProgress(state.riskStages, 'compliance', '合规指标评分完成'),
          }))
        },

        onComplianceIndicators: (data) => {
          const indicators = (data as any)?.indicators || data || []
          console.log('[agentStore] onComplianceIndicators count=%d', Array.isArray(indicators) ? indicators.length : 0)
          set((state) => ({
            complianceIndicators: Array.isArray(indicators) ? indicators : [],
            riskStages: appendRiskProgress(state.riskStages, 'compliance', '合规指标体系完成'),
          }))
        },

        onScoring: (scores) => {
          set((state) => ({
            riskScores: scores as RiskScores,
            riskReport: mergeRiskReport(state.riskReport, {
              risk_scores: scores,
              overall_risk_level: (scores as any)?.level,
            } as any),
            riskStages: appendRiskProgress(state.riskStages, 'compliance', '风险评分完成，准备治理报告'),
          }))
        },

        onGovernance: (plan) => {
          set((state) => ({
            governancePlan: plan as GovernancePlan,
            riskReport: mergeRiskReport(state.riskReport, { governance_plan: plan } as any),
            riskStages: appendRiskProgress(state.riskStages, 'reporting', '治理决策完成，生成报告中'),
          }))
        },

        onExpandedCommunity: (result) => {
          console.log('[agentStore] onExpandedCommunity:', {
            method: result.selectedMethod,
            communities: result.communities?.length,
            communityGraphNodes: result.communityGraph?.nodes?.length,
            communityGraphEdges: result.communityGraph?.edges?.length,
            seedCommunityId: result.seedCommunityId,
          })
          set((state) => ({
            expandedCommunityResult: result,
            expandedCommunityId: null,
            selectedRiskPathId: null,
            riskStages: appendRiskProgress(
              state.riskStages,
              'community',
              `扩展社区发现完成：${result.communities?.length || 0} 个社区，${result.communityGraph?.nodes?.length || 0} 个社区节点`,
            ),
          }))
        },

        onAgentTrace: (trace) => {
          set((state) => ({
            agentTraces: [...state.agentTraces, trace as AgentTraceEntry],
          }))
          console.groupCollapsed(
            `%c[AgentTrace] ${trace.agent} / ${trace.step}`,
            'color:#fa8c16;font-weight:bold',
          )
          console.log(trace.summary, trace.metrics)
          console.groupEnd()
        },

        onReport: (report) => {
          const structuredBaseReport = report as RiskReport
          set((state) => ({
            riskReport: mergeRiskReport(state.riskReport, structuredBaseReport),
            riskStages: appendRiskProgress(state.riskStages, 'reporting', '协同治理社区报告生成完成'),
            messages: state.messages.map((m) =>
              m.id === tempId
                ? {
                    ...m,
                    content: buildReportAnswer(structuredBaseReport),
                    isLoading: false,
                    thinkingStatus: undefined,
                    data: { echartsConfig: structuredBaseReport.echarts_config },
                  }
                : m
            ),
            isLoading: false,
            currentRoute: 'risk',
            activeRightPanel: 'risk',
          }))

          const snapshot = get()
          const seedNames = pickCommunityReportSeedNames(
            query,
            snapshot.resolvedEntities,
            snapshot.currentSubgraph,
          )
          if (seedNames.length > 0) {
            set((state) => ({
              riskStages: appendRiskProgress(state.riskStages, 'reporting', '正在生成在线社区报告...'),
            }))
            void generateComplianceCommunityReport({
              query,
              seedNames,
              maxHop: 2,
              maxPathLength: 4,
              exportFormats: ['docx'],
              responseMode: 'full',
              reportOptions: {
                includeDownloadUrl: true,
                includeServerPath: false,
              },
            }).then((communityReport) => {
              set((state) => ({
                riskReport: mergeRiskReport(state.riskReport, communityReport as RiskReport),
                governancePlan: (communityReport as any).governance_plan ?? state.governancePlan,
                complianceIndicators: Array.isArray((communityReport as any).compliance_indicator_details)
                  ? (communityReport as any).compliance_indicator_details
                  : state.complianceIndicators,
                riskStages: appendRiskProgress(state.riskStages, 'reporting', '在线社区报告替换完成'),
                messages: state.messages.map((m) =>
                  m.id === tempId
                    ? {
                        ...m,
                        content: buildReportAnswer(mergeRiskReport(state.riskReport, communityReport as RiskReport)),
                      }
                    : m
                ),
              }))
            }).catch((err) => {
              console.warn('[agentStore] generateComplianceCommunityReport failed:', err)
              set((state) => ({
                riskStages: appendRiskProgress(state.riskStages, 'reporting', '在线社区报告生成失败，已保留原报告'),
              }))
            })
          }
        },

        onDone: (data) => {
          const finalIntent = data?.intent_type || expectedIntent
          const isRisk = finalIntent === 'risk_analysis'
          set((state) => ({
            isLoading: false,
            riskStages: isRisk
              ? appendRiskProgress(state.riskStages, 'reporting', '协同治理分析完成')
              : state.riskStages,
            currentRoute: isRisk ? 'risk' : 'graph',
            activeRightPanel: isRisk ? 'risk' : 'graph',
            messages: state.messages.map((m) =>
              m.id === tempId
                ? {
                    ...m,
                    content: m.content || (isRisk
                      ? buildPartialRiskAnswer(query, state.riskReport, state.currentSubgraph)
                      : buildGraphQaAnswer(query, state.currentSubgraph, state.resolvedEntities)),
                    isLoading: false,
                    thinkingStatus: undefined,
                  }
                : m
            ),
          }))
        },

        onError: (msg) => {
          set((state) => ({
            isLoading: false,
            error: msg,
            messages: state.messages.map((m) =>
              m.id === tempId ? { ...m, content: `Error: ${msg}` } : m
            ),
          }))
        },
      }
    )
  },

  confirmEntityCandidate: async (alias: string, candidate: EntityCandidate, originalQuery: string) => {
    if (get().isLoading) return
    const canonicalName = candidate.canonical_name
    if (!alias || !canonicalName) return

    try {
      await saveEntityAlias(alias, candidate)
      writeConfirmedAlias(alias, candidate)
      const rewrittenQuery = buildConfirmedEntityRiskQuery(alias, candidate, originalQuery)
      const confirmMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: `已确认“${alias}”指代“${canonicalName}”，并已保存为别名。正在继续做风险传导、群体发现和社区报告。`,
        timestamp: Date.now(),
        isLoading: false,
      }
      set((state) => ({
        messages: [...state.messages, confirmMsg],
        clarifyMessage: null,
      }))
      await get().sendUnifiedMessage(rewrittenQuery, 'risk_analysis', [candidate], 'entity_risk_full')
    } catch (err: any) {
      const msg = err?.message || '实体别名保存失败'
      set((state) => ({
        error: msg,
        messages: [
          ...state.messages,
          {
            id: `asst_${Date.now()}`,
            role: 'assistant',
            content: `保存别名失败：${msg}`,
            timestamp: Date.now(),
            isLoading: false,
          },
        ],
      }))
    }
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
      riskEntityCommunityMap: null,
      complianceScores: null,
      complianceIndicators: null,
      expandedCommunityResult: null,
      expandedCommunityId: null,
      selectedRiskPathId: null,
      activeRightPanel: 'graph',
      resolvedEntities: [],
      evidenceChains: null,
      riskScores: null,
      governancePlan: null,
      uploadedFile: null,
      fileUploading: false,
      agentTraces: [],
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
