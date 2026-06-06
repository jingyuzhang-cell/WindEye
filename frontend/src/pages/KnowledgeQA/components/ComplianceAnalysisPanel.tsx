import React, { useMemo, useState, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty, InputNumber, Progress, Slider, Table, Tag, Tooltip, Typography, Button } from 'antd'
import {
  AuditOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import type { ComplianceIndicator, ComplianceIndicatorScore, RiskReport, Subgraph } from '../types/api'

const { Text, Title } = Typography

// ── Types ────────────────────────────────────────────────────────────────────

interface ComplianceAnalysisPanelProps {
  report: RiskReport | null
  currentSubgraph?: Subgraph | null
  isLoading?: boolean
  onJumpToGraph?: (entityId: string, entityName: string, entityType: string) => void
  complianceIndicators?: ComplianceIndicator[] | null
}

interface ScoredIndicator extends ComplianceIndicatorScore {
  key: string
}

interface L2Summary {
  key: string
  name: string
  l1Name: string
  score: number
  children: ScoredIndicator[]
}

interface L1Summary {
  key: string
  name: string
  weight: number
  score: number
  children: L2Summary[]
}

interface TreeRow {
  key: string
  name: string
  l1Name: string
  l2Name: string | null
  l3Name: string | null
  level: 1 | 2 | 3
  objective: number | null
  subjective: number | null
  score: number
  weight: number | null
  evidence: string
  category: string
  indicatorId: string | null
  children?: TreeRow[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const L1_STYLE: Record<string, { color: string; icon: React.ReactNode }> = {
  '数据合规性': { color: '#1677ff', icon: <DatabaseOutlined /> },
  '算法合规性': { color: '#722ed1', icon: <AuditOutlined /> },
  '内容合规性': { color: '#13a8a8', icon: <SafetyCertificateOutlined /> },
}

const DEFAULT_WEIGHTS = [35, 35, 30]
const WEIGHT_PRESETS = [
  { label: '默认 35/35/30', values: [35, 35, 30] },
  { label: '内容优先 20/30/50', values: [20, 30, 50] },
  { label: '算法优先 25/50/25', values: [25, 50, 25] },
  { label: '数据优先 50/30/20', values: [50, 30, 20] },
  { label: '均衡 34/33/33', values: [34, 33, 33] },
]
const L1_ORDER = ['数据合规性', '算法合规性', '内容合规性']
const SCORE_LEVELS = [
  { range: '90-100', label: '高合规', color: '#52c41a' },
  { range: '75-89', label: '较合规', color: '#1677ff' },
  { range: '60-74', label: '中等合规', color: '#fa8c16' },
  { range: '0-59', label: '低合规', color: '#f5222d' },
]
const TABLE_SCROLL_X = 514

const FULL_FALLBACK_INDICATORS: Array<Omit<ComplianceIndicator, 'category' | 'evidence'> & {
  category: ComplianceIndicator['category']
  evidence?: string
}> = [
  { id: 'data-source-auth', l1: '数据合规性', l2: '数据来源合法性', l3: '数据来源清单与授权证明', objective: 80, category: 'data_driven' },
  { id: 'data-no-illegal', l1: '数据合规性', l2: '数据来源合法性', l3: '禁止使用非法爬取、内幕信息等', objective: 70, category: 'policy_driven' },
  { id: 'data-local-storage', l1: '数据合规性', l2: '数据跨境与本地化', l3: '境内资本市场相关数据存储', objective: 90, category: 'policy_driven' },
  { id: 'data-cross-border', l1: '数据合规性', l2: '数据跨境与本地化', l3: '跨境数据传输履行安全评估与备案', objective: 80, category: 'policy_driven' },
  { id: 'data-quality-report', l1: '数据合规性', l2: '数据完整性与准确性', l3: '建立数据质量评估报告', objective: 80, category: 'data_driven' },
  { id: 'data-authoritative', l1: '数据合规性', l2: '数据完整性与准确性', l3: '关键金融数据对接权威信源验证', objective: 90, category: 'evidence_based' },
  { id: 'data-representation', l1: '数据合规性', l2: '数据偏见控制', l3: '群体代表性分析', objective: 70, category: 'data_driven' },
  { id: 'data-bias-mitigation', l1: '数据合规性', l2: '数据偏见控制', l3: '数据偏见缓解机制', objective: 80, category: 'policy_driven' },
  { id: 'data-pipl-compliance', l1: '数据合规性', l2: '个人信息处理合规', l3: '遵守个人信息保护法', objective: 90, category: 'policy_driven' },
  { id: 'data-investor-consent', l1: '数据合规性', l2: '个人信息处理合规', l3: '投资者画像数据单独授权', objective: 80, category: 'policy_driven' },
  { id: 'data-encryption', l1: '数据合规性', l2: '数据安全防护', l3: '数据分级分类加密脱敏', objective: 80, category: 'data_driven' },
  { id: 'data-breach-response', l1: '数据合规性', l2: '数据安全防护', l3: '数据泄露应急响应机制与日志留存', objective: 90, category: 'policy_driven' },
  { id: 'algo-gov-committee', l1: '算法合规性', l2: '算法治理与问责', l3: '设立人工智能治理委员会', objective: 80, category: 'policy_driven' },
  { id: 'algo-lifecycle-mgmt', l1: '算法合规性', l2: '算法治理与问责', l3: '算法全生命周期管理制度', objective: 70, category: 'policy_driven' },
  { id: 'algo-filing', l1: '算法合规性', l2: '算法治理与问责', l3: '算法备案信息与供应商清单', objective: 80, category: 'policy_driven' },
  { id: 'algo-third-party', l1: '算法合规性', l2: '算法治理与问责', l3: '第三方模型血缘证明', objective: 70, category: 'evidence_based' },
  { id: 'algo-bias-detect', l1: '算法合规性', l2: '算法公平性与非歧视', l3: '偏见检测与缓解', objective: 80, category: 'data_driven' },
  { id: 'algo-disparity-disclose', l1: '算法合规性', l2: '算法公平性与非歧视', l3: '公开披露决策差异率', objective: 70, category: 'policy_driven' },
  { id: 'algo-stress-test', l1: '算法合规性', l2: '算法公平性与非歧视', l3: '反操纵与压力测试', objective: 80, category: 'evidence_based' },
  { id: 'algo-no-inducement', l1: '算法合规性', l2: '算法公平性与非歧视', l3: '禁止嵌入诱导性交易策略', objective: 90, category: 'policy_driven' },
  { id: 'algo-explain-user', l1: '算法合规性', l2: '算法可解释性与安全', l3: '用户可理解决策解释', objective: 80, category: 'evidence_based' },
  { id: 'algo-explain-report', l1: '算法合规性', l2: '算法可解释性与安全', l3: '可解释AI生成归因报告', objective: 80, category: 'evidence_based' },
  { id: 'algo-robustness', l1: '算法合规性', l2: '算法可解释性与安全', l3: '模型鲁棒性测试机制', objective: 70, category: 'evidence_based' },
  { id: 'algo-failure-drill', l1: '算法合规性', l2: '算法可解释性与安全', l3: '算法失效应急演练', objective: 80, category: 'policy_driven' },
  { id: 'content-authoritative-src', l1: '内容合规性', l2: '内容真实性与准确性', l3: 'AI生成市场分析链接权威数据源', objective: 80, category: 'evidence_based' },
  { id: 'content-hallucination-detect', l1: '内容合规性', l2: '内容真实性与准确性', l3: 'AI幻觉检测拦截模块', objective: 80, category: 'evidence_based' },
  { id: 'content-completeness', l1: '内容合规性', l2: '内容真实性与准确性', l3: '信息完整性控制', objective: 90, category: 'data_driven' },
  { id: 'content-ai-label', l1: '内容合规性', l2: '内容透明度与标识', l3: 'AI生成内容强制标识', objective: 90, category: 'policy_driven' },
  { id: 'content-traceable', l1: '内容合规性', l2: '内容透明度与标识', l3: '用户可查询生成依据', objective: 90, category: 'evidence_based' },
  { id: 'content-audit-log', l1: '内容合规性', l2: '内容透明度与标识', l3: 'AI生成内容审计日志记录与追溯', objective: 80, category: 'policy_driven' },
  { id: 'content-no-fake-exec', l1: '内容合规性', l2: '反滥用与风险防控', l3: '禁止生成高管虚假言论/伪造财报', objective: 80, category: 'policy_driven' },
  { id: 'content-sensitive-filter', l1: '内容合规性', l2: '反滥用与风险防控', l3: '敏感词库与AI内容过滤系统', objective: 90, category: 'policy_driven' },
  { id: 'content-investor-suitability', l1: '内容合规性', l2: '反滥用与风险防控', l3: '投资者适当性匹配', objective: 80, category: 'policy_driven' },
  { id: 'content-no-highrisk-push', l1: '内容合规性', l2: '反滥用与风险防控', l3: '禁止向非合格投资者推送高风险策略', objective: 90, category: 'policy_driven' },
]

function clamp(v: number): number {
  if (Number.isNaN(v)) return 0
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10))
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#52c41a'
  if (score >= 75) return '#1677ff'
  if (score >= 60) return '#fa8c16'
  return '#f5222d'
}

function getScoreLabel(score: number): string {
  if (score >= 90) return '高合规'
  if (score >= 75) return '较合规'
  if (score >= 60) return '中等合规'
  return '低合规'
}

// ── Fallback: build full indicator data when no complianceIndicators ─────────

function buildLegacyMetrics(report: RiskReport | null, currentSubgraph?: Subgraph | null): ScoredIndicator[] {
  const nodes = currentSubgraph?.nodes || []
  const paths = report?.risk_paths || []
  const matches = report?.compliance_matches || []
  const chains = report?.evidence_chains?.chains || []

  const nodesWithRichProps = nodes.filter((node) => {
    const props = node.properties || {}
    return Object.keys(props).filter((key) => props[key] !== undefined && props[key] !== null && props[key] !== '').length >= 3
  }).length
  const dataCompleteness = nodes.length > 0 ? (nodesWithRichProps / nodes.length) * 100 : 76
  const pathExplainability = paths.length > 0
    ? (paths.filter((path) => path.path_description || path.path_text).length / paths.length) * 100
    : 72
  const avgComplianceConf = chains.length > 0
    ? chains.reduce((sum, c) => sum + ((c.confidence || 0) * 100), 0) / chains.length
    : 82
  const evidenceConfidence = report?.evidence_chains?.overall_confidence !== undefined
    ? report.evidence_chains.overall_confidence * 100
    : 74
  const scoringCompleteness = report?.risk_scores?.final_overall !== undefined ? 88 : 74
  const nodeTypeCount = new Set(nodes.map((node) => node.type || node.entityType || node.entity_type).filter(Boolean)).size

  const dynamicScores: Record<string, { objective: number; evidence: string }> = {
    'data-source-auth': { objective: nodes.length > 0 ? 90 : 68, evidence: `${nodes.length || 0} 个证据子图节点` },
    'data-quality-report': { objective: clamp(dataCompleteness), evidence: `${nodesWithRichProps}/${nodes.length || 0} 个节点包含完整属性` },
    'data-representation': {
      objective: nodeTypeCount >= 3 ? 85 : 72,
      evidence: `子图覆盖 ${nodeTypeCount} 类实体，用于群体代表性分析`,
    },
    'data-authoritative': {
      objective: clamp((evidenceConfidence + avgComplianceConf) / 2),
      evidence: `证据链置信度 ${Math.round(evidenceConfidence)}%，合规匹配 ${matches.length} 条`,
    },
    'data-encryption': { objective: 85, evidence: '敏感字段仅在详情面板展示，建议结合数据分级策略复核' },
    'algo-lifecycle-mgmt': {
      objective: scoringCompleteness,
      evidence: `综合风险评分 ${report?.risk_scores?.final_overall ?? '待生成'}`,
    },
    'algo-filing': {
      objective: matches.length > 0 ? 78 : 72,
      evidence: `${matches.length} 条合规匹配记录可用于备案信息复核`,
    },
    'algo-third-party': {
      objective: clamp(65 + chains.length * 3),
      evidence: `基于 ${chains.length} 条证据链，模型血缘可追溯性待复核`,
    },
    'algo-bias-detect': {
      objective: paths.length > 0 && nodeTypeCount >= 3 ? 85 : 75,
      evidence: `${paths.length} 条风险路径覆盖 ${nodeTypeCount} 类实体`,
    },
    'algo-stress-test': {
      objective: report?.risk_scores?.final_overall !== undefined ? 80 : 76,
      evidence: `综合风险评分 ${report?.risk_scores?.final_overall ?? '待生成'}，建议纳入压力测试`,
    },
    'algo-explain-user': { objective: clamp(pathExplainability), evidence: `${paths.length} 条风险路径具备说明` },
    'algo-explain-report': { objective: clamp(evidenceConfidence), evidence: `${chains.length} 条证据链支撑归因报告` },
    'algo-robustness': {
      objective: report?.risk_scores?.final_overall !== undefined ? 78 : 70,
      evidence: '基于风险评分稳定性与证据链一致性初步评估',
    },
    'content-authoritative-src': {
      objective: clamp(avgComplianceConf),
      evidence: `${matches.length} 条法规/证据匹配用于权威数据源校验`,
    },
    'content-hallucination-detect': {
      objective: clamp((avgComplianceConf + evidenceConfidence) / 2),
      evidence: `合规匹配置信度与证据链置信度联合评估`,
    },
    'content-completeness': {
      objective: clamp((dataCompleteness + 90) / 2),
      evidence: `${nodesWithRichProps}/${nodes.length || 0} 个节点包含完整属性`,
    },
    'content-traceable': {
      objective: chains.length > 0 ? clamp(70 + chains.length * 5) : 82,
      evidence: `${chains.length} 条证据链可追溯`,
    },
  }

  return FULL_FALLBACK_INDICATORS.map((item) => ({
    ...item,
    objective: dynamicScores[item.id]?.objective ?? item.objective,
    evidence: dynamicScores[item.id]?.evidence ?? item.evidence ?? `需人工复核：${item.l3}`,
    key: item.id,
    subjective: 0,
    score: clamp(dynamicScores[item.id]?.objective ?? item.objective),
  }))
}

// ── Component ────────────────────────────────────────────────────────────────

const ComplianceAnalysisPanel: React.FC<ComplianceAnalysisPanelProps> = ({
  report,
  currentSubgraph,
  isLoading,
  onJumpToGraph,
  complianceIndicators,
}) => {
  const [subjectiveMap, setSubjectiveMap] = useState<Record<string, number>>({})
  const [draftSubjectiveMap, setDraftSubjectiveMap] = useState<Record<string, number>>({})
  const [weights, setWeights] = useState<number[]>(DEFAULT_WEIGHTS)
  const [chartsExpanded, setChartsExpanded] = useState(true)
  const [isMaximized, setIsMaximized] = useState(false)

  // ── Escape key to exit maximize ────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setIsMaximized(false)
  }, [])

  useEffect(() => {
    if (isMaximized) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
    return undefined
  }, [isMaximized, handleKeyDown])

  const updateWeight = useCallback((index: number, rawValue: number | null) => {
    const value = Math.max(0, Math.min(100, Math.round(rawValue ?? weights[index] ?? 0)))
    const next = [...weights]
    const otherIndexes = next.map((_, i) => i).filter((i) => i !== index)
    const otherSum = otherIndexes.reduce((sum, i) => sum + next[i], 0)
    const targetOtherSum = 100 - value

    next[index] = value
    if (otherSum > 0) {
      otherIndexes.forEach((i) => {
        next[i] = Math.round((next[i] / otherSum) * targetOtherSum)
      })
    } else {
      const first = otherIndexes[0]
      const second = otherIndexes[1]
      next[first] = Math.floor(targetOtherSum / 2)
      next[second] = targetOtherSum - next[first]
    }

    const diff = 100 - next.reduce((sum, item) => sum + item, 0)
    if (diff !== 0) {
      const targetIndex = otherIndexes.find((i) => next[i] + diff >= 0) ?? index
      next[targetIndex] += diff
    }

    setWeights(next)
  }, [weights])

  const updateSubjectiveDraft = useCallback((indicatorId: string, rawValue: number | null) => {
    const value = Math.max(-10, Math.min(10, Math.round(rawValue ?? 0)))
    setDraftSubjectiveMap((prev) => {
      const next = { ...prev }
      const committed = subjectiveMap[indicatorId] ?? 0
      if (value === committed) {
        delete next[indicatorId]
      } else {
        next[indicatorId] = value
      }
      return next
    })
  }, [subjectiveMap])

  const confirmSubjectiveDraft = useCallback(() => {
    setSubjectiveMap((prev) => ({ ...prev, ...draftSubjectiveMap }))
    setDraftSubjectiveMap({})
  }, [draftSubjectiveMap])

  const cancelSubjectiveDraft = useCallback(() => {
    setDraftSubjectiveMap({})
  }, [])

  const draftSubjectiveCount = Object.keys(draftSubjectiveMap).length

  // ── Build scored indicators from backend data ──────────────────────

  const scoredIndicators: ScoredIndicator[] = useMemo(() => {
    const source = complianceIndicators && complianceIndicators.length > 0
      ? complianceIndicators
      : null

    if (source) {
      return source.map((ind) => {
        const sub = subjectiveMap[ind.id] ?? 0
        const score = clamp(ind.objective + sub)
        return { ...ind, key: ind.id, subjective: sub, score }
      })
    }

    const legacy = buildLegacyMetrics(report, currentSubgraph)
    return legacy.map((m) => ({
      ...m,
      subjective: subjectiveMap[m.id] ?? 0,
      score: clamp(m.objective + (subjectiveMap[m.id] ?? 0)),
    }))
  }, [complianceIndicators, report, currentSubgraph, subjectiveMap])

  // ── Build hierarchy tree ──────────────────────────────────────────

  const hierarchy = useMemo(() => {
    const l2Map = new Map<string, ScoredIndicator[]>()
    for (const ind of scoredIndicators) {
      const key = `${ind.l1}|||${ind.l2}`
      if (!l2Map.has(key)) l2Map.set(key, [])
      l2Map.get(key)!.push(ind)
    }

    const l1Map = new Map<string, L2Summary[]>()
    for (const [key, children] of l2Map) {
      const [l1Name, l2Name] = key.split('|||')
      const l2Score = clamp(children.reduce((s, c) => s + c.score, 0) / children.length)
      if (!l1Map.has(l1Name)) l1Map.set(l1Name, [])
      l1Map.get(l1Name)!.push({
        key: `${l1Name}|||${l2Name}`,
        name: l2Name,
        l1Name,
        score: l2Score,
        children,
      })
    }

    const l1Summaries: L1Summary[] = L1_ORDER.filter((name) => l1Map.has(name)).map((name, idx) => {
      const children = l1Map.get(name)!
      const l1Score = clamp(children.reduce((s, c) => s + c.score, 0) / children.length)
      return { key: name, name, weight: weights[idx] / 100, score: l1Score, children }
    })

    return l1Summaries
  }, [scoredIndicators, weights])

  // ── Overall score ─────────────────────────────────────────────────

  const overallScore = useMemo(() => {
    if (hierarchy.length === 0) return 0
    let total = 0
    let totalWeight = 0
    for (let i = 0; i < hierarchy.length; i++) {
      const w = weights[i] / 100
      total += hierarchy[i].score * w
      totalWeight += w
    }
    return totalWeight > 0 ? clamp(total / totalWeight) : 0
  }, [hierarchy, weights])

  // ── Build tree rows for Ant Design Table ──────────────────────────

  const treeData: TreeRow[] = useMemo(() => {
    return hierarchy.map((l1) => ({
      key: l1.key,
      name: l1.name,
      l1Name: l1.name,
      l2Name: null,
      l3Name: null,
      level: 1 as const,
      objective: null,
      subjective: null,
      score: l1.score,
      weight: l1.weight,
      evidence: '',
      category: '',
      indicatorId: null,
      children: l1.children.map((l2) => ({
        key: l2.key,
        name: l2.name,
        l1Name: l1.name,
        l2Name: l2.name,
        l3Name: null,
        level: 2 as const,
        objective: null,
        subjective: null,
        score: l2.score,
        weight: null,
        evidence: '',
        category: '',
        indicatorId: null,
        children: l2.children.map((l3) => ({
          key: l3.id,
          name: l3.l3,
          l1Name: l1.name,
          l2Name: l2.name,
          l3Name: l3.l3,
          level: 3 as const,
          objective: l3.objective,
          subjective: l3.subjective,
          score: l3.score,
          weight: null,
          evidence: l3.evidence,
          category: l3.category,
          indicatorId: l3.id,
        })),
      })),
    }))
  }, [hierarchy])

  // ── Charts ────────────────────────────────────────────────────────

  const radarOption = useMemo(() => ({
    tooltip: { trigger: 'item' },
    radar: {
      center: ['50%', '54%'],
      radius: '62%',
      indicator: hierarchy.map((l1) => ({ name: l1.name, max: 100 })),
      axisName: { color: '#475569', fontSize: 11, padding: [2, 4] },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
      splitArea: { areaStyle: { color: ['#ffffff', '#f8fafc'] } },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
    },
    series: [{
      type: 'radar',
      data: [{
        value: hierarchy.map((l1) => l1.score),
        name: '综合分',
        areaStyle: { color: 'rgba(22,119,255,0.18)' },
        lineStyle: { color: '#1677ff', width: 2 },
        itemStyle: { color: '#1677ff' },
      }],
    }],
  }), [hierarchy])

  const barOption = useMemo(() => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 20, right: 12, top: 18, bottom: 20, containLabel: true },
    xAxis: {
      type: 'category',
      data: hierarchy.map((l1) => l1.name.replace('合规性', '')),
      axisLabel: { color: '#475569', fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    series: [{
      name: '一级得分',
      type: 'bar',
      data: hierarchy.map((l1) => ({
        value: l1.score,
        itemStyle: { color: getScoreColor(l1.score), borderRadius: [4, 4, 0, 0] },
      })),
      barMaxWidth: 34,
      label: { show: true, position: 'top', color: '#475569', fontSize: 11, formatter: '{c}' },
    }],
  }), [hierarchy])

  const l2RadarOptions = useMemo(() => hierarchy.map((l1) => {
    const color = L1_STYLE[l1.name]?.color || '#1677ff'
    return {
      key: l1.key,
      title: l1.name.replace('合规性', ''),
      color,
      option: {
        tooltip: { trigger: 'item' },
        radar: {
          center: ['50%', '56%'],
          radius: '58%',
          indicator: l1.children.map((l2) => ({ name: l2.name, max: 100 })),
          axisName: { color: '#475569', fontSize: 10, padding: [2, 4] },
          splitLine: { lineStyle: { color: '#e2e8f0' } },
          splitArea: { areaStyle: { color: ['#ffffff', '#f8fafc'] } },
          axisLine: { lineStyle: { color: '#cbd5e1' } },
        },
        series: [{
          type: 'radar',
          data: [{
            value: l1.children.map((l2) => l2.score),
            name: `${l1.name}二级指标`,
            areaStyle: { color: `${color}24` },
            lineStyle: { color, width: 2 },
            itemStyle: { color },
          }],
        }],
      },
    }
  }), [hierarchy])

  // ── Tree table columns ────────────────────────────────────────────

  const treeColumns = useMemo(() => [
    {
      title: '指标',
      dataIndex: 'name',
      width: 238,
      render: (_: string, record: TreeRow) => {
        if (record.level === 1) {
          const style = L1_STYLE[record.name] || { color: '#8c8c8c', icon: null }
          return (
            <Tag color={style.color} style={{ margin: 0, fontWeight: 600, whiteSpace: 'normal', lineHeight: '20px' }}>
              {style.icon} {record.name}
            </Tag>
          )
        }
        if (record.level === 2) {
          return <Text style={{ display: 'block', fontSize: 12, fontWeight: 500, whiteSpace: 'normal' }}>{record.name}</Text>
        }
        return (
          <Tooltip title={record.evidence}>
            <Text style={{
              display: 'inline',
              fontSize: 12,
              cursor: 'help',
              borderBottom: '1px dashed #cbd5e1',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
            }}>
              {record.name}
            </Text>
          </Tooltip>
        )
      },
    },
    {
      title: '客观分',
      dataIndex: 'objective',
      width: 96,
      align: 'center' as const,
      render: (v: number | null, record: TreeRow) => {
        if (record.level !== 3 || v === null) return null
        return (
          <Progress
            percent={Math.round(v)}
            size="small"
            strokeColor={getScoreColor(v)}
            format={() => <span style={{ whiteSpace: 'nowrap' }}>{v}</span>}
            style={{ minWidth: 74, margin: 0 }}
          />
        )
      },
    },
    {
      title: '主观修正',
      dataIndex: 'subjective',
      width: 92,
      align: 'center' as const,
      render: (_: number | null, record: TreeRow) => {
        if (record.level !== 3 || record.indicatorId === null) return null
        const draftValue = draftSubjectiveMap[record.indicatorId]
        const hasDraft = draftValue !== undefined
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <InputNumber
              size="small"
              min={-10}
              max={10}
              step={1}
              value={hasDraft ? draftValue : record.subjective ?? 0}
              onChange={(val) => updateSubjectiveDraft(record.indicatorId!, typeof val === 'number' ? val : 0)}
              style={{
                width: 72,
                borderColor: hasDraft ? '#fa8c16' : undefined,
                boxShadow: hasDraft ? '0 0 0 1px rgba(250,140,22,0.12)' : undefined,
              }}
            />
            {hasDraft && <span style={{ width: 6, height: 6, borderRadius: 6, background: '#fa8c16', flexShrink: 0 }} />}
          </div>
        )
      },
    },
    {
      title: '得分',
      dataIndex: 'score',
      width: 88,
      align: 'center' as const,
      sorter: (a: TreeRow, b: TreeRow) => a.score - b.score,
      render: (v: number, record: TreeRow) => (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          minWidth: 70,
          whiteSpace: 'nowrap',
        }}>
          {record.level <= 2 && (
            <Progress
              percent={Math.round(v)}
              size="small"
              strokeColor={getScoreColor(v)}
              showInfo={false}
              style={{ width: 36, margin: 0 }}
            />
          )}
          <Text strong style={{ color: getScoreColor(v), fontSize: record.level === 1 ? 14 : 13, whiteSpace: 'nowrap' }}>
            {v.toFixed(record.level === 3 ? 0 : 1)}
          </Text>
        </div>
      ),
    },
  ], [draftSubjectiveMap, updateSubjectiveDraft])

  // ── Empty state ───────────────────────────────────────────────────

  if (!report && !isLoading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="生成治理报告后展示合规指标评分" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )
  }

  // ── Panel content ─────────────────────────────────────────────────

  const panelContent = (
    <div style={{
      height: '100%', overflow: 'auto', padding: '12px 16px',
      background: isMaximized ? '#f8fafc' : '#f8fafc',
      display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0,
    }}>
      {/* ── Header: overall score + weight config ── */}
      <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Progress
              type="circle"
              percent={Math.round(overallScore)}
              size={72}
              strokeColor={getScoreColor(overallScore)}
              format={(p) => (
                <span>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{p}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{getScoreLabel(overallScore)}</div>
                </span>
              )}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Title level={5} style={{ margin: 0, fontSize: 15 }}>
                  <SafetyCertificateOutlined style={{ color: '#13a8a8', marginRight: 6 }} />
                  合规分析面板
                </Title>
                <Button
                  size="small"
                  type="text"
                  icon={isMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  onClick={() => setIsMaximized(!isMaximized)}
                  style={{ color: '#94a3b8' }}
                />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            {hierarchy.map((l1, idx) => (
              <div key={l1.key} style={{ textAlign: 'center' }}>
                <Text style={{ fontSize: 11, color: '#64748b' }}>{l1.name}</Text>
                <div>
                  <Text strong style={{ fontSize: 18, color: getScoreColor(l1.score) }}>{l1.score.toFixed(1)}</Text>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Weight sliders */}
        <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {WEIGHT_PRESETS.map((preset) => {
              const active = weights.join('/') === preset.values.join('/')
              return (
                <Button
                  key={preset.label}
                  size="small"
                  type={active ? 'primary' : 'default'}
                  onClick={() => setWeights([...preset.values])}
                  style={{ borderRadius: 6, fontSize: 11 }}
                >
                  {preset.label}
                </Button>
              )
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {hierarchy.map((l1, idx) => (
              <div key={l1.key} style={{ display: 'grid', gridTemplateColumns: '52px minmax(92px, 1fr) 78px', alignItems: 'center', gap: 8 }}>
                <Tag color={L1_STYLE[l1.name]?.color} style={{ margin: 0, textAlign: 'center', borderRadius: 6 }}>
                  {l1.name.replace('合规性', '')}
                </Tag>
                <Slider
                  style={{ margin: 0 }}
                  min={0}
                  max={100}
                  step={1}
                  value={weights[idx]}
                  onChange={(val) => updateWeight(idx, val as number)}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <InputNumber
                    size="small"
                    min={0}
                    max={100}
                    step={1}
                    value={weights[idx]}
                    onChange={(val) => updateWeight(idx, typeof val === 'number' ? val : null)}
                    style={{ width: 56 }}
                  />
                  <Text style={{ fontSize: 12, color: '#475569' }}>%</Text>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Compact charts + legend ── */}
      <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', flexShrink: 0 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: chartsExpanded ? 4 : 0, cursor: 'pointer' }}
          onClick={() => setChartsExpanded(!chartsExpanded)}
        >
          <BarChartOutlined style={{ color: '#1677ff' }} />
          <Text strong style={{ fontSize: 13 }}>一级指标对比</Text>
          <div style={{ flex: 1 }} />
          <Text type="secondary" style={{ fontSize: 10 }}>{chartsExpanded ? '收起' : '展开'}</Text>
        </div>
        {chartsExpanded && (
          <>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, flexWrap: 'wrap' }}>
              <ReactECharts option={radarOption} style={{ height: 176, minWidth: 220, flex: '1 1 260px' }} />
              <ReactECharts option={barOption} style={{ height: 176, minWidth: 240, flex: '1.1 1 280px' }} />
              <div style={{
                width: 118,
                marginLeft: 'auto',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                justifyContent: 'center',
                alignSelf: 'stretch',
              }}>
                <Text type="secondary" style={{ fontSize: 11, textAlign: 'right' }}>评分等级</Text>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {SCORE_LEVELS.map((item) => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                      <Text style={{ fontSize: 10, color: '#475569', lineHeight: '14px' }}>{item.label}</Text>
                      <Text type="secondary" style={{ fontSize: 10, lineHeight: '14px' }}>{item.range}</Text>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 10 }}>
              {l2RadarOptions.map((item) => (
                <div
                  key={item.key}
                  style={{
                    minHeight: 190,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    background: '#fbfdff',
                    padding: '8px 10px 4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 8, background: item.color }} />
                    <Text strong style={{ fontSize: 12 }}>{item.title}二级指标对比</Text>
                  </div>
                  <ReactECharts option={item.option} style={{ height: 166, width: '100%' }} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── Tree Table ── */}
      <section style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12,
        flex: '0 0 auto', minHeight: 0, overflow: 'visible', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <Text strong style={{ fontSize: 13, display: 'block', flexShrink: 0 }}>
            指标评分明细 {scoredIndicators.length} 个三级指标
          </Text>
          {draftSubjectiveCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 6, background: '#fff7e6', border: '1px solid #ffd591' }}>
              <Text style={{ fontSize: 12, color: '#ad6800' }}>{draftSubjectiveCount} 项主观修正待确认</Text>
              <Button size="small" type="primary" onClick={confirmSubjectiveDraft} style={{ height: 24, fontSize: 12 }}>
                确认应用
              </Button>
              <Button size="small" onClick={cancelSubjectiveDraft} style={{ height: 24, fontSize: 12 }}>
                撤销
              </Button>
            </div>
          )}
        </div>
        <div style={{ minHeight: 0, overflowX: 'auto', overflowY: 'visible' }}>
          <Table
            size="small"
            rowKey="key"
            columns={treeColumns}
            dataSource={treeData}
            pagination={false}
            defaultExpandAllRows
            sticky
            tableLayout="fixed"
            scroll={{ x: TABLE_SCROLL_X }}
            rowClassName={(record: TreeRow) => record.level === 1 ? 'l1-row' : ''}
            onRow={(record: TreeRow) => {
              if (record.level === 1) return {}
              return {}
            }}
          />
        </div>
      </section>
    </div>
  )

  // ── Maximized overlay ─────────────────────────────────────────────

  if (isMaximized) {
    return (
      <>
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1040, background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setIsMaximized(false)}
        />
        <div style={{ position: 'fixed', inset: 24, zIndex: 1050 }}>
          {panelContent}
        </div>
      </>
    )
  }

  return panelContent
}

export default ComplianceAnalysisPanel
