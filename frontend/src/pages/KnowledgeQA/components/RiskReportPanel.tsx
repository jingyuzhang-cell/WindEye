import {
  ThunderboltOutlined,
  FileTextOutlined,
  ReloadOutlined,
  HistoryOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileMarkdownOutlined,
  LoadingOutlined,
  TeamOutlined,
  ClusterOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Drawer,
  Empty,
  List,
  Space,
  Spin,
  Steps,
  Tag,
  Typography,
  App,
  Tooltip,
  Progress,
} from 'antd';
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type { RiskReport, RiskStage, CommunityResult, EntityCommunityMap, ReportHistoryItem, Subgraph, ResolvedEntity, RiskScores, GovernancePlan } from '../types/api';
import { NODE_TYPE_COLORS, NODE_TYPE_LABELS } from './graphStyles'

const { Title, Text, Paragraph } = Typography;

const RISK_LEVEL_COLORS: Record<string, string> = {
  high: '#f5222d',
  medium: '#fa8c16',
  low: '#52c41a',
  insufficient_evidence: '#94a3b8',
};

const RISK_LEVEL_LABELS: Record<string, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
  insufficient_evidence: '证据不足',
};

const URGENCY_TAGS: Record<string, { color: string; label: string }> = {
  urgent: { color: '#f5222d', label: '紧急' },
  normal: { color: '#fa8c16', label: '一般' },
  low: { color: '#52c41a', label: '低' },
};

const COMMUNITY_PALETTE = ['#2563eb', '#7c3aed', '#16a34a', '#ea580c', '#dc2626', '#0891b2'];

const STAGE_LABELS: Record<string, string> = {
  planning: '任务规划',
  retrieving: '图谱检索',
  entity_stats: '实体统计',
  community: '群体发现',
  analyzing: '协同治理',
  compliance: '合规匹配',
  reporting: '报告生成',
};

type GovernancePhase = {
  id: string;
  title: string;
  modules: string;
  description: string;
  stages: RiskStage['stage'][];
};

const GOVERNANCE_PHASES: GovernancePhase[] = [
  {
    id: 'entity',
    title: '实体识别',
    modules: 'Intent / Entity',
    description: '意图识别、文件解析、实体对齐',
    stages: ['planning'],
  },
  {
    id: 'community',
    title: '群体发现',
    modules: 'Evidence / Community',
    description: '证据子图、实体统计、群体发现',
    stages: ['retrieving', 'entity_stats', 'community'],
  },
  {
    id: 'risk_path',
    title: '风险传导',
    modules: 'RiskPath',
    description: '风险路径枚举、异常关系识别',
    stages: ['analyzing'],
  },
  {
    id: 'compliance',
    title: '合规分析',
    modules: 'Compliance / Scoring',
    description: '法规匹配、合规评分、风险定级',
    stages: ['compliance'],
  },
  {
    id: 'report',
    title: '治理报告',
    modules: 'Governance / Reporter',
    description: '治理决策、报告生成、结果输出',
    stages: ['reporting'],
  },
];

function getGovernancePhaseForStage(stage: RiskStage): number {
  const content = stage.content || '';
  if (stage.stage === 'analyzing' && /风险评分|多维度风险评分/.test(content)) {
    return 3;
  }
  if (stage.stage === 'analyzing' && /治理方案|治理决策|治理动作|协同治理方案/.test(content)) {
    return 4;
  }

  const matched = GOVERNANCE_PHASES.findIndex((phase) => phase.stages.includes(stage.stage));
  return matched >= 0 ? matched : 0;
}

function getGovernancePhaseIndex(stages: RiskStage[], report: RiskReport | null): number {
  if (report) return GOVERNANCE_PHASES.length;
  if (!stages.length) return 0;

  return Math.max(...stages.map(getGovernancePhaseForStage));
}

function getGovernanceProgressPercent(activePhase: number, report: RiskReport | null): number {
  if (report) return 100;
  return Math.min(95, Math.max(8, Math.round(((activePhase + 0.35) / GOVERNANCE_PHASES.length) * 100)));
}

function inferClientEntityType(name: string): string {
  if (!name) return 'COMPANY'
  if (/公司|集团|有限|股份|实业|科技|投资|控股|银行|基金|证券|保险|信托|租赁|保理|资本|产业/.test(name)) return 'COMPANY'
  if (/律师|法官|董事长|总经理|法定代表人|股东|监事|董事|经理|主任|行长|总裁/.test(name)) return 'PERSON'
  if (/^[一-鿿]{2,4}$/.test(name) && !/公司|事件|风险|法|条例|规定|集团|有限|银行/.test(name)) return 'PERSON'
  if (/事件|事故|案件|诉讼|处罚|仲裁|纠纷|争议|违约|违规|违法|资金占用|冻结|判决|裁定/.test(name)) return 'EVENT'
  if (/风险|因子|指标|预警|异常|波动/.test(name)) return 'RiskFactor'
  if (/法$|条例$|办法$|规定$|细则$/.test(name)) return 'Regulation'
  return 'COMPANY'
}

function getNodeDisplayName(node: any): string {
  const props = node?.properties || {};
  return String(
    node?.name
    || node?.label
    || props.name
    || props.title
    || props.COMPANY_NM
    || props.PERSON_NM
    || props.SECURITY_NM
    || node?.id
    || ''
  );
}

function getNodeDisplayType(node: any): string {
  return String(node?.type || node?.label || node?.labels?.[0] || node?.properties?.type || inferClientEntityType(getNodeDisplayName(node)));
}

function resolveNodeVisual(entityType: string): { fill: string; stroke: string } {
  const t = (entityType || '').toUpperCase();
  if (t === 'COMPANY' || t === 'SUBJECT') return { fill: '#BAE7FF', stroke: '#1677ff' };
  if (t === 'PERSON') return { fill: '#D3ADF7', stroke: '#722ed1' };
  if (t === 'EVENT') return { fill: '#FFA39E', stroke: '#cf1322' };
  if (t === 'SUB_EVENT') return { fill: '#FFCCC7', stroke: '#cf1322' };
  if (t === 'TIME') return { fill: '#D9D9D9', stroke: '#595959' };
  if (t === 'RISKFEATURE') return { fill: '#B7EB8F', stroke: '#389e0d' };
  if (t === 'RISKFACTOR') return { fill: '#95DE64', stroke: '#389e0d' };
  if (t === 'ACTION') return { fill: '#D9D9D9', stroke: '#595959' };
  if (t === 'REGULATION') return { fill: '#FFE58F', stroke: '#d48806' };
  if (t === 'LAW') return { fill: '#FFD666', stroke: '#d48806' };
  return { fill: '#F5F5F5', stroke: '#8c8c8c' };
}

function getGraphCounts(graph: any): { nodes: number; edges: number } {
  return {
    nodes: Array.isArray(graph?.nodes) ? graph.nodes.length : 0,
    edges: Array.isArray(graph?.edges) ? graph.edges.length : 0,
  };
}

function getEdgeEndpoint(edge: any, key: 'source' | 'target'): string {
  const value = edge?.[key] ?? edge?.[`${key}_id`] ?? edge?.[`${key}Id`];
  if (typeof value === 'object' && value !== null) {
    return String(value.id || value.name || '');
  }
  return String(value || '');
}

function formatTimestamp(ts?: string): string {
  if (!ts) return new Date().toISOString().replace('T', ' ').slice(0, 19);
  return ts;
}

function generateReportId(ts?: string): string {
  const d = ts ? new Date(ts) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const seq = String(d.getTime() % 100000).padStart(5, '0');
  return `WIND-RPT-${y}${m}${day}-${seq}`;
}

interface RiskReportPanelProps {
  report: RiskReport | null;
  stages: RiskStage[];
  community: CommunityResult | null;
  entityCommunityMap: EntityCommunityMap | null;
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
  onJumpToGraph?: (entityId: string, entityName: string, entityType: string) => void;
  onAddToContext?: (entityId: string, entityName: string, entityType: string) => void;
  queryText?: string;
  currentSubgraph?: Subgraph | null;
  resolvedEntities?: ResolvedEntity[];
  riskScores?: RiskScores | null;
  governancePlan?: GovernancePlan | null;
  complianceScores?: Record<string, number> | null;
}

const RiskReportPanel: React.FC<RiskReportPanelProps> = ({
  report,
  stages,
  community,
  entityCommunityMap,
  isLoading,
  error,
  onRetry,
  onJumpToGraph,
  onAddToContext,
  queryText,
  currentSubgraph,
  resolvedEntities,
  governancePlan: governancePlanProp,
}) => {
  const { message } = App.useApp();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyReports, setHistoryReports] = useState<ReportHistoryItem[]>([]);
  const [showAllPaths, setShowAllPaths] = useState(false);
  const [communityNodePositions, setCommunityNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingCommunityNodeId, setDraggingCommunityNodeId] = useState<string | null>(null);
  const [hoveredCommunityNodeId, setHoveredCommunityNodeId] = useState<string | null>(null);
  const [communityViewport, setCommunityViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [communityPanStart, setCommunityPanStart] = useState<{
    pointerId: number;
    startX: number;
    startY: number;
    viewX: number;
    viewY: number;
  } | null>(null);
  const [highlightSection, setHighlightSection] = useState<string | null>(null);
  const finalReportRef = useRef<HTMLDivElement>(null);

  const reportId = report?.report_id || generateReportId(report?.generated_at);

  const governancePlan = governancePlanProp || (report as any)?.governance_plan as GovernancePlan | null;

  const { highCount, mediumCount, lowCount, sortedEntities } = useMemo(() => {
    if (!report) {
      return { highCount: 0, mediumCount: 0, lowCount: 0, sortedEntities: [] };
    }

    let high = 0, medium = 0, low = 0;
    for (const path of report.risk_paths || []) {
      if (path.risk_level === 'high') high++;
      else if (path.risk_level === 'medium') medium++;
      else low++;
    }

    const entityCounts = new Map<string, { count: number; types: Set<string> }>();
    for (const path of report.risk_paths || []) {
      for (const entity of path.affected_entities || []) {
        const existing = entityCounts.get(entity);
        if (existing) {
          existing.count++;
        } else {
          entityCounts.set(entity, { count: 1, types: new Set() });
        }
      }
    }
    for (const anomaly of report.anomaly_findings || []) {
      for (const entity of anomaly.affected_entities || []) {
        const existing = entityCounts.get(entity);
        if (existing) {
          existing.count++;
        } else {
          entityCounts.set(entity, { count: 1, types: new Set() });
        }
      }
    }

    const sorted = Array.from(entityCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    return { highCount: high, mediumCount: medium, lowCount: low, sortedEntities: sorted };
  }, [report]);

  const activeGovernancePhase = getGovernancePhaseIndex(stages, report);
  const governanceProgressPercent = getGovernanceProgressPercent(activeGovernancePhase, report);
  const latestStageText = stages[stages.length - 1]?.content || '正在创建协同治理上下文...';

  const loadHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const resp = await fetch('/api/v1/risk/reports');
      if (resp.ok) {
        const data = await resp.json();
        const items = Array.isArray(data) ? data : (data.data || data.reports || []);
        setHistoryReports(items);
      }
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadHistoryReport = async (id: string) => {
    try {
      const resp = await fetch(`/api/v1/risk/reports/${id}`);
      if (resp.ok) {
        const data = await resp.json();
        message.success('报告已加载');
        setHistoryOpen(false);
        window.dispatchEvent(new CustomEvent('loadRiskReport', { detail: data }));
      }
    } catch {
      message.error('加载报告失败');
    }
  };

  const handleExportMD = () => {
    if (!report?.markdown_report) return;
    const header = `# WindEye 协同治理报告\n\n**报告编号**: ${reportId}\n**生成时间**: ${formatTimestamp(report.generated_at)}\n**查询**: ${queryText || report.query_summary || '-'}\n\n---\n\n`;
    const blob = new Blob([header + report.markdown_report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleExportWord = async () => {
    if (!report) return;
    const hide = message.loading('正在生成 Word 文档...', 0);
    try {
      const directDownloadUrl = report.export_files?.docx?.downloadUrl || report.report_download_url;
      if (directDownloadUrl) {
        const resp = await fetch(directDownloadUrl);
        if (!resp.ok) {
          throw new Error(`下载失败: ${resp.status}`);
        }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = report.export_files?.docx?.fileName || `${reportId}.docx`;
        a.click();
        URL.revokeObjectURL(url);
        message.success('Word 文档已下载');
        return;
      }
      const resp = await fetch('/api/v1/risk/reports/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report,
          reportId,
          queryText: queryText || report.query_summary || '-',
        }),
      });
      if (!resp.ok) {
        throw new Error(`导出失败: ${resp.status}`);
      }
      const blob = await resp.blob();
      if (blob.type.includes('application/json')) {
        const text = await blob.text();
        throw new Error(text || '导出失败');
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportId}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('Word 文档已生成');
    } catch (err: any) {
      message.error(err?.message || 'Word 导出失败');
    } finally {
      hide();
    }
  };

  const scrollToSection = (key: string) => {
    const el = document.getElementById(`risk-section-${key}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const sortedPaths = useMemo(() => {
    if (!report?.risk_paths) return [];
    const order = { high: 0, medium: 1, low: 2 };
    return [...report.risk_paths].sort(
      (a, b) => (order[a.risk_level] ?? 3) - (order[b.risk_level] ?? 3)
    );
  }, [report]);

  const displayedPaths = showAllPaths ? sortedPaths : sortedPaths.slice(0, 5);

  // Entity stats: priority → report.entity_stats → currentSubgraph.nodes → resolvedEntities → subgraph_summary
  const entityStats = report?.entity_stats;
  const totalEntities =
    entityStats?.total_entities
    || currentSubgraph?.nodes?.length
    || resolvedEntities?.length
    || report?.subgraph_summary?.node_count
    || 0;
  const topEntities = entityStats?.top_entities || [];

  // Community info from new API (community_info) or fallback from community prop
  const communityInfo = report?.community_info;
  const communities = communityInfo?.communities || community?.communities || [];
  const seededCommunityData: any = {
    ...(community || {}),
    ...(communityInfo || {}),
  };
  const communitySubgraph = seededCommunityData.subgraph || currentSubgraph;
  const connectedCommunitySubgraph = seededCommunityData.connected_subgraph || seededCommunityData.connectedSubgraph || currentSubgraph;
  const seedNodes = seededCommunityData.seed_nodes || seededCommunityData.seedNodes || [];
  const mergedEntityCommunityMap = seededCommunityData.entity_community_map || seededCommunityData.entityCommunityMap || entityCommunityMap || report?.entity_community_map;
  const subgraphCounts = getGraphCounts(communitySubgraph);
  const connectedSubgraphCounts = getGraphCounts(connectedCommunitySubgraph);
  const communityAlgorithm = seededCommunityData.algorithm || seededCommunityData.selected_method || seededCommunityData.method;

  const riskSubjects = useMemo(() => {
    const seen = new Set<string>();
    const subjects: { id: string; name: string; type: string; source: string }[] = [];
    const add = (name?: string, type?: string, id?: string, source = '识别') => {
      const cleanName = String(name || '').trim();
      if (!cleanName || seen.has(cleanName)) return;
      seen.add(cleanName);
      subjects.push({
        id: id || cleanName,
        name: cleanName,
        type: type || inferClientEntityType(cleanName),
        source,
      });
    };

    (resolvedEntities || []).forEach((entity: any) => {
      add(entity.name || entity.raw || entity.canonical_name, entity.type || entity.label, entity.kg_node_id || entity.id, '实体对齐');
    });
    topEntities.forEach((entity: any) => add(entity.name, entity.type, entity.id, '图谱统计'));
    sortedEntities.forEach(([name]) => add(name, inferClientEntityType(name), name, '风险涉及'));
    (currentSubgraph?.nodes || []).forEach((node: any) => {
      add(node.name || node.properties?.name || node.id, node.type || node.label || node.labels?.[0], node.id, '子图');
    });

    return subjects.slice(0, 12);
  }, [resolvedEntities, topEntities, sortedEntities, currentSubgraph]);

  const seedFlowNodes = useMemo(() => {
    const normalized = (Array.isArray(seedNodes) ? seedNodes : []).map((node: any) => ({
      id: String(node.id || node.kg_node_id || getNodeDisplayName(node)),
      name: getNodeDisplayName(node),
      type: getNodeDisplayType(node),
    })).filter((node: any) => node.name);
    if (normalized.length > 0) return normalized;
    return riskSubjects;
  }, [seedNodes, riskSubjects]);

  const communityIdByNode = useMemo(() => {
    const map = new Map<string, number>();
    const entityEntries = (mergedEntityCommunityMap as any)?.entities || [];
    entityEntries.forEach((entry: any) => {
      const communityId = entry?.communities?.[0]?.community_id;
      if (communityId === undefined || communityId === null) return;
      [entry.id, entry.name].filter(Boolean).forEach((key) => map.set(String(key), Number(communityId)));
    });
    communities.forEach((comm: any) => {
      const communityId = Number(comm.community_id ?? comm.id ?? 0);
      (comm.member_ids || []).forEach((id: any) => map.set(String(id), communityId));
      (comm.members || []).forEach((member: any) => {
        [member.id, member.name].filter(Boolean).forEach((key) => map.set(String(key), communityId));
      });
      (comm.top_entities || comm.core_nodes || []).forEach((member: any) => {
        [member.id, member.name].filter(Boolean).forEach((key) => map.set(String(key), communityId));
      });
    });
    return map;
  }, [mergedEntityCommunityMap, communities]);

  const communityPreviewGraph = useMemo(() => {
    const graphNodes = connectedCommunitySubgraph?.nodes || communitySubgraph?.nodes || currentSubgraph?.nodes || [];
    const graphEdges = connectedCommunitySubgraph?.edges || communitySubgraph?.edges || currentSubgraph?.edges || [];
    const maxPreviewNodes = Math.max(72, Math.min(120, communities.length * 16));
    const normalizedNodes: any[] = graphNodes.map((node: any, index: number) => {
      const id = String(node.id || getNodeDisplayName(node) || index);
      const name = getNodeDisplayName(node) || id;
      return {
        id,
        name,
        type: getNodeDisplayType(node),
        communityId: communityIdByNode.get(id) ?? communityIdByNode.get(name),
        isSeed: seedFlowNodes.some((seed) => seed.id === id || seed.name === name),
        degree: 0,
        radius: 2.1,
        x: 50,
        y: 50,
      };
    });

    const rawGroups = new Map<string, any[]>();
    normalizedNodes.forEach((node: any) => {
      const key = node.communityId !== undefined ? String(node.communityId) : 'unknown';
      rawGroups.set(key, [...(rawGroups.get(key) || []), node]);
    });
    communities.forEach((comm: any) => {
      const cid = String(comm.community_id ?? comm.id ?? 0);
      const existingGroup = rawGroups.get(cid) || [];
      if (existingGroup.length === 0) {
        const members = comm.members || comm.top_entities || [];
        const representativeMembers = members.length > 0
          ? members.slice(0, 8)
          : [{ id: `community-${cid}`, name: `群体 #${cid}`, type: 'Community' }];
        rawGroups.set(cid, representativeMembers.map((member: any, index: number) => {
          const name = String(member?.name || member || `群体 #${cid}`);
          return {
            id: String(member?.id || `community-${cid}-member-${index}`),
            name,
            type: member?.type || 'Entity',
            communityId: Number(cid),
            isSeed: false,
            degree: 0,
            radius: 1.8,
            x: 50,
            y: 50,
          };
        }));
      }
    });

    const groupOrder = Array.from(rawGroups.entries()).sort((a, b) => {
      if (a[0] === 'unknown') return 1;
      if (b[0] === 'unknown') return -1;
      return Number(a[0]) - Number(b[0]);
    });
    const selectedById = new Map<string, any>();
    const perGroupFloor = Math.max(4, Math.floor(maxPreviewNodes / Math.max(groupOrder.length, 1)));
    groupOrder.forEach(([, group]) => {
      const sorted = [...group].sort((a: any, b: any) => {
        if (a.isSeed && !b.isSeed) return -1;
        if (!a.isSeed && b.isSeed) return 1;
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
      });
      sorted.slice(0, perGroupFloor).forEach((node: any) => selectedById.set(node.id, node));
    });
    let roundRobinIndex = 0;
    while (selectedById.size < maxPreviewNodes) {
      let added = false;
      for (const [, group] of groupOrder) {
        const node = group[roundRobinIndex + perGroupFloor];
        if (node && !selectedById.has(node.id)) {
          selectedById.set(node.id, node);
          added = true;
          if (selectedById.size >= maxPreviewNodes) break;
        }
      }
      if (!added) break;
      roundRobinIndex += 1;
    }

    const nodes: any[] = Array.from(selectedById.values());
    const nodeById = new Map<string, any>(nodes.map((node: any) => [node.id, node]));
    const nodeByName = new Map<string, any>(nodes.map((node: any) => [node.name, node]));
    const edges: any[] = graphEdges
      .map((edge: any) => {
        const sourceKey = getEdgeEndpoint(edge, 'source');
        const targetKey = getEdgeEndpoint(edge, 'target');
        const source = nodeById.get(sourceKey) || nodeByName.get(sourceKey);
        const target = nodeById.get(targetKey) || nodeByName.get(targetKey);
        if (!source || !target || source.id === target.id) return null;
        return {
          id: edge.id || `${source.id}-${target.id}`,
          source,
          target,
          relation: edge.relation || edge.type || edge.label || '',
        };
      })
      .filter(Boolean)
      .slice(0, 120);

    edges.forEach((edge: any) => {
      edge.source.degree = (edge.source.degree || 0) + 1;
      edge.target.degree = (edge.target.degree || 0) + 1;
    });
    nodes.forEach((node: any) => {
      node.radius = node.isSeed
        ? Math.min(3.8, 2.5 + Math.sqrt(node.degree || 1) * 0.35)
        : Math.min(2.55, 1.35 + Math.sqrt(node.degree || 1) * 0.24);
    });

    const grouped = new Map<string, any[]>();
    nodes.forEach((node: any) => {
      const key = node.communityId !== undefined ? String(node.communityId) : 'unknown';
      grouped.set(key, [...(grouped.get(key) || []), node]);
    });
    const groups = Array.from(grouped.entries()).sort((a, b) => {
      if (a[0] === 'unknown') return 1;
      if (b[0] === 'unknown') return -1;
      return b[1].length - a[1].length;
    });
    const groupRadii = groups.map(([key, group]) => {
      if (groups.length === 1) return 24.0;
      if (key === 'unknown') return 8.0;
      // Dynamic radius based on member count, ensuring large groups get wider radii
      return Math.max(9.0, Math.min(26.0, Math.sqrt(group.length) * 3.8));
    });

    const centers = groups.map(([key, group], i) => {
      if (groups.length === 1) return { x: 50, y: 50 };
      if (key === 'unknown') return { x: 50, y: 88 };

      const angle = (i * 2 * Math.PI) / Math.max(1, groups.length - (groups.some(([k]) => k === 'unknown') ? 1 : 0));
      return {
        x: 50 + Math.cos(angle) * 28,
        y: 45 + Math.sin(angle) * 24,
      };
    });

    // Run 60 iterations of relaxation (force-directed placement of community centers)
    if (groups.length > 1) {
      for (let iter = 0; iter < 60; iter++) {
        for (let i = 0; i < groups.length; i++) {
          const c_i = centers[i];
          const r_i = groupRadii[i];
          let fx = 0;
          let fy = 0;

          // Repulsion from other communities
          for (let j = 0; j < groups.length; j++) {
            if (i === j) continue;
            const c_j = centers[j];
            const r_j = groupRadii[j];

            const dx = c_i.x - c_j.x;
            const dy = c_i.y - c_j.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            // Radii sum + safety margin to prevent crowding
            const minDist = r_i + r_j + 7.5;

            if (dist < minDist) {
              const force = (minDist - dist) / dist;
              fx += dx * force * 0.45;
              fy += dy * force * 0.45;
            }
          }

          // Gravity towards center (50, 46) to keep communities nicely contained
          fx += (50 - c_i.x) * 0.08;
          fy += (46 - c_i.y) * 0.08;

          c_i.x += fx;
          c_i.y += fy;

          // Constraints to keep groups within visible SVG bounds
          const margin = r_i + 3.0;
          c_i.x = Math.max(margin, Math.min(100 - margin, c_i.x));
          c_i.y = Math.max(margin + 5.0, Math.min(100 - margin - 5.0, c_i.y));
        }
      }
    }

    groups.forEach(([key, group], groupIndex) => {
      const center = centers[groupIndex];
      const r_i = groupRadii[groupIndex];
      const sortedGroup = [...group].sort((a: any, b: any) => {
        if (a.isSeed && !b.isSeed) return -1;
        if (!a.isSeed && b.isSeed) return 1;
        return (b.degree || 0) - (a.degree || 0);
      });
      const anchor = sortedGroup[0];
      const orbitNodes = sortedGroup.slice(1);
      if (anchor) {
        anchor.x = center.x;
        anchor.y = center.y;
      }

      const orbitRadiusX = r_i * 0.72;
      const orbitRadiusY = r_i * 0.62;

      if (orbitNodes.length <= 10) {
        // Single ring layout for smaller groups
        orbitNodes.forEach((node: any, index: number) => {
          const angle = (Math.PI * 2 * index) / Math.max(1, orbitNodes.length) - Math.PI / 2;
          node.x = Math.max(4, Math.min(96, center.x + Math.cos(angle) * orbitRadiusX));
          node.y = Math.max(4, Math.min(96, center.y + Math.sin(angle) * orbitRadiusY));
        });
      } else {
        // Multi-ring (concentric) layout for larger groups to prevent overlapping/clumping
        const innerCount = Math.floor(orbitNodes.length * 0.35);
        const outerCount = orbitNodes.length - innerCount;

        orbitNodes.forEach((node: any, index: number) => {
          if (index < innerCount) {
            const angle = (Math.PI * 2 * index) / Math.max(1, innerCount) - Math.PI / 2;
            node.x = Math.max(4, Math.min(96, center.x + Math.cos(angle) * orbitRadiusX * 0.48));
            node.y = Math.max(4, Math.min(96, center.y + Math.sin(angle) * orbitRadiusY * 0.48));
          } else {
            const outerIndex = index - innerCount;
            const angle = (Math.PI * 2 * outerIndex) / Math.max(1, outerCount) - Math.PI / 2;
            node.x = Math.max(4, Math.min(96, center.x + Math.cos(angle) * orbitRadiusX));
            node.y = Math.max(4, Math.min(96, center.y + Math.sin(angle) * orbitRadiusY));
          }
        });
      }
    });

    nodes.forEach((node: any) => {
      const moved = communityNodePositions[node.id];
      if (moved) {
        node.x = moved.x;
        node.y = moved.y;
      }
    });

    const groupHulls = groups.map(([key, group], index) => {
      const xs = group.map((node: any) => node.x);
      const ys = group.map((node: any) => node.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return {
        key,
        nodes: group,
        index,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
        rx: Math.max(8, (maxX - minX) / 2 + 4.5),
        ry: Math.max(7, (maxY - minY) / 2 + 4),
      };
    });

    return { nodes, edges, groups, groupHulls };
  }, [connectedCommunitySubgraph, communitySubgraph, currentSubgraph, communityIdByNode, seedFlowNodes, communityNodePositions]);

  const getCommunitySvgPoint = useCallback((event: React.PointerEvent<SVGElement>) => {
    const svg = event.currentTarget instanceof SVGSVGElement
      ? event.currentTarget
      : event.currentTarget.ownerSVGElement;
    if (!svg) return { x: 50, y: 50 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 50, y: 50 };
    const raw = point.matrixTransform(matrix.inverse());
    return {
      x: Math.max(4, Math.min(96, (raw.x - communityViewport.x) / communityViewport.scale)),
      y: Math.max(8, Math.min(92, (raw.y - communityViewport.y) / communityViewport.scale)),
    };
  }, [communityViewport]);

  const getCommunityRawPoint = useCallback((event: React.PointerEvent<SVGElement>) => {
    const svg = event.currentTarget instanceof SVGSVGElement
      ? event.currentTarget
      : event.currentTarget.ownerSVGElement;
    if (!svg) return { x: 50, y: 50 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 50, y: 50 };
    const raw = point.matrixTransform(matrix.inverse());
    return { x: raw.x, y: raw.y };
  }, []);

  const resetCommunityViewport = useCallback(() => {
    setCommunityViewport({ x: 0, y: 0, scale: 1 });
    setCommunityPanStart(null);
  }, []);

  const handleCommunityNodePointerDown = useCallback((event: React.PointerEvent<SVGGElement>, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingCommunityNodeId(nodeId);
    const point = getCommunitySvgPoint(event);
    setCommunityNodePositions((prev) => ({ ...prev, [nodeId]: point }));
  }, [getCommunitySvgPoint]);

  const handleCommunityCanvasPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getCommunityRawPoint(event);
    setCommunityPanStart({
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      viewX: communityViewport.x,
      viewY: communityViewport.y,
    });
  }, [communityViewport, getCommunityRawPoint]);

  const handleCommunityGraphPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (draggingCommunityNodeId) {
      const point = getCommunitySvgPoint(event);
      setCommunityNodePositions((prev) => ({ ...prev, [draggingCommunityNodeId]: point }));
      return;
    }
    if (communityPanStart) {
      const point = getCommunityRawPoint(event);
      setCommunityViewport((prev) => ({
        ...prev,
        x: Math.max(-80, Math.min(80, communityPanStart.viewX + point.x - communityPanStart.startX)),
        y: Math.max(-80, Math.min(80, communityPanStart.viewY + point.y - communityPanStart.startY)),
      }));
    }
  }, [communityPanStart, draggingCommunityNodeId, getCommunityRawPoint, getCommunitySvgPoint]);

  const stopCommunityGraphDrag = useCallback(() => {
    setDraggingCommunityNodeId(null);
    setCommunityPanStart(null);
  }, []);

  const handleCommunityWheel = useCallback((event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const nextScale = Math.max(0.75, Math.min(2.4, communityViewport.scale + (event.deltaY > 0 ? -0.12 : 0.12)));
    setCommunityViewport((prev) => ({
      ...prev,
      scale: nextScale,
      x: Math.max(-80, Math.min(80, prev.x * (nextScale / prev.scale))),
      y: Math.max(-80, Math.min(80, prev.y * (nextScale / prev.scale))),
    }));
  }, [communityViewport.scale]);

  const flowKeys = Array.isArray(seededCommunityData.visualization?.flow)
    ? seededCommunityData.visualization.flow
    : ['seed_nodes', 'subgraph', 'connected_subgraph', 'communities'];
  const flowLabelMap: Record<string, string> = {
    seed_nodes: '种子节点',
    n_hop_network: 'N 跳子图',
    subgraph: 'N 跳子图',
    connected_subgraph: '最大连通子图',
    communities: '群体结果',
  };
  const flowCards = [
    { key: 'seed_nodes', title: flowLabelMap[flowKeys[0]] || '种子节点', value: seedFlowNodes.length, desc: '风险主体输入' },
    { key: 'subgraph', title: flowLabelMap[flowKeys[1]] || 'N 跳子图', value: subgraphCounts.nodes, desc: `${subgraphCounts.edges} 条关系` },
    { key: 'connected_subgraph', title: flowLabelMap[flowKeys[2]] || '最大连通子图', value: connectedSubgraphCounts.nodes, desc: `${connectedSubgraphCounts.edges} 条关系` },
    { key: 'communities', title: flowLabelMap[flowKeys[3]] || '群体结果', value: communities.length, desc: '社区划分' },
  ];
  const compactSeedNames = seedFlowNodes.slice(0, 3).map((node) => node.name);
  const visibleCommunities = communities;

  const hasFinalReportText = Boolean(report?.executive_summary || report?.markdown_report || report?.integrated_report);
  const structuredReportSections = report?.report_sections || [];
  const hasRiskPathResult = sortedPaths.length > 0;
  const hasCommunityResult = communities.length > 0 || subgraphCounts.nodes > 0 || riskSubjects.length > 0;
  const isInsufficientEvidence = String(report?.overall_risk_level || '') === 'insufficient_evidence'
    || report?.risk_scores?.level === 'insufficient_evidence';
  const partialMissingItems = [
    !hasRiskPathResult ? '风险传导路径' : '',
    !(report?.compliance_matches?.length) ? '合规匹配' : '',
    !hasFinalReportText ? '完整报告正文' : '',
  ].filter(Boolean);
  const reportCompletenessLabel = hasFinalReportText && hasRiskPathResult
    ? '完整报告'
    : isInsufficientEvidence
      ? '证据不足报告'
      : '部分结果';
  const fallbackExecutiveSummary = report
    ? `当前已完成${riskSubjects.length || totalEntities || 0}个风险主体识别${hasCommunityResult ? '、群体发现' : ''}${hasRiskPathResult ? '、风险路径分析' : ''}。${partialMissingItems.length > 0 ? `尚缺少${partialMissingItems.join('、')}，建议确认实体别名并补齐图谱关系后重新分析。` : '正在汇总治理结论。'}`
    : '';

  // ── Empty state ──
  if (!report && !isLoading && stages.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <Text style={{ color: '#475569', fontSize: 14, display: 'block' }}>
                输入协同治理相关问题，生成协同治理报告
              </Text>
              <Text style={{ color: '#94A3B8', fontSize: 12 }}>
                实体识别 → 群体发现 → 风险传导 → 合规分析 → 治理报告
              </Text>
            </div>
          }
        />
      </div>
    );
  }

  if (!report && !isLoading && stages.length > 0) {
    return (
      <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px' }}>
        <Card
          bordered
          style={{ maxWidth: 720, margin: '40px auto', borderRadius: 8, borderColor: '#dbeafe' }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div>
                <Text strong style={{ color: '#1e293b', fontSize: 15, display: 'block', marginBottom: 6 }}>
                  本轮分析尚未形成完整治理报告
                </Text>
                <Text style={{ color: '#64748b', fontSize: 13 }}>
                  已完成阶段：{stages.length} 个；最新状态：{stages[stages.length - 1]?.content || '等待报告生成'}。
                </Text>
              </div>
            }
          />
          <Steps
            size="small"
            direction="vertical"
            style={{ marginTop: 18 }}
            current={Math.max(stages.length - 1, 0)}
            items={stages.slice(-6).map((stage) => ({
              title: STAGE_LABELS[stage.stage] || stage.stage,
              description: stage.content,
              status: 'finish' as const,
            }))}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="risk-report-panel" style={{ height: '100%', overflow: 'auto', padding: '12px 16px' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .risk-report-panel, .risk-report-panel * { visibility: visible; }
          .risk-report-panel { position: absolute; left: 0; top: 0; width: 100%; padding: 20px 40px !important; }
          .no-print { display: none !important; }
        }
        @keyframes sectionHighlight {
          0%, 100% { border-color: #e2e8f0; }
          50% { border-color: #2855D1; box-shadow: 0 0 12px rgba(40,85,209,0.15); }
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* ── Loading path module progress ── */}
        {isLoading && !report && (
          <Card
            size="small"
            className="no-print"
            style={{ borderRadius: 8, borderColor: '#dbeafe', background: '#ffffff' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div>
                <Text strong style={{ fontSize: 14, color: '#0f172a' }}>协同治理模块调用进度</Text>
                <div style={{ marginTop: 2 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {latestStageText}
                  </Text>
                </div>
              </div>
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                {Math.min(activeGovernancePhase + 1, GOVERNANCE_PHASES.length)} / {GOVERNANCE_PHASES.length}
              </Tag>
            </div>
            <Progress
              percent={governanceProgressPercent}
              showInfo={false}
              strokeColor="#2855D1"
              trailColor="#e2e8f0"
              size="small"
              style={{ marginBottom: 12 }}
            />
            <Steps
              size="small"
              current={activeGovernancePhase}
              status={error ? 'error' : 'process'}
              items={GOVERNANCE_PHASES.map((phase, index) => ({
                title: phase.title,
                description: (
                  <div style={{ minHeight: 42 }}>
                    <div style={{ color: index === activeGovernancePhase ? '#2855D1' : '#64748b', fontSize: 12, lineHeight: 1.4 }}>
                      {phase.modules}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.4 }}>
                      {phase.description}
                    </div>
                  </div>
                ),
              }))}
            />
          </Card>
        )}

        {/* ── Error state ── */}
        {error && !report && (
          <Card style={{ borderRadius: 8 }}>
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Text type="danger" style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>
                协同治理分析失败: {error}
              </Text>
              {onRetry && (
                <Button icon={<ReloadOutlined />} onClick={onRetry}>重试</Button>
              )}
            </div>
          </Card>
        )}

        {report && (
          <>
            {/* ═══ Report Header ═══ */}
            <Card size="small" style={{ borderRadius: 8 }} className="no-print">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, #2855D1 0%, #1A44B5 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 16,
                      flexShrink: 0,
                    }}
                  >
                    W
                  </div>
                  <div>
                    <Title level={5} style={{ margin: 0, fontSize: 15 }}>
                      <ThunderboltOutlined style={{ marginRight: 6, color: '#FFC101' }} />
                      协同治理报告
                    </Title>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {reportId} · {formatTimestamp(report.generated_at)}
                    </Text>
                  </div>
                </div>
                <Space>
                  <Tooltip title="历史报告">
                    <Button size="small" icon={<HistoryOutlined />} onClick={loadHistory} />
                  </Tooltip>
                  <Tooltip title="导出 Markdown">
                    <Button size="small" icon={<FileMarkdownOutlined />} onClick={handleExportMD} />
                  </Tooltip>
                  <Tooltip title="导出 Word">
                    <Button size="small" icon={<FileWordOutlined />} onClick={handleExportWord} />
                  </Tooltip>
                  <Tooltip title="导出 PDF">
                    <Button size="small" icon={<FilePdfOutlined />} onClick={handleExportPDF} />
                  </Tooltip>
                </Space>
              </div>
              {queryText && (
                <div style={{ marginTop: 6, padding: '4px 10px', background: '#f8fafc', borderRadius: 6 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    查询: {queryText}
                  </Text>
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { key: 'entity-stats', label: '风险主体', icon: <TeamOutlined />, color: '#2855D1' },
                  { key: 'community', label: '群体发现', icon: <ClusterOutlined />, color: '#722ed1' },
                  { key: 'risk-paths', label: '风险传导路径', icon: <NodeIndexOutlined />, color: '#f5222d' },
                  { key: 'final-report', label: '协同治理社区报告', icon: <FileTextOutlined />, color: '#0f766e' },
                ].map((step, idx, arr) => (
                  <React.Fragment key={step.key}>
                    <Button
                      size="small"
                      type="text"
                      icon={step.icon}
                      onClick={() => scrollToSection(step.key)}
                      style={{ color: step.color, padding: '0 6px', height: 24 }}
                    >
                      {step.label}
                    </Button>
                    {idx < arr.length - 1 && <Text type="secondary" style={{ fontSize: 12 }}>→</Text>}
                  </React.Fragment>
                ))}
              </div>
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: hasFinalReportText && hasRiskPathResult ? '#f0fdf4' : '#fff7e6',
                  border: hasFinalReportText && hasRiskPathResult ? '1px solid #bbf7d0' : '1px solid #ffd591',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <Space size={6} wrap>
                  <Tag color={hasFinalReportText && hasRiskPathResult ? 'success' : isInsufficientEvidence ? 'default' : 'warning'} style={{ margin: 0 }}>
                    {reportCompletenessLabel}
                  </Tag>
                  <Text style={{ fontSize: 12, color: '#475569' }}>
                    已展示：{[
                      riskSubjects.length ? '风险主体' : '',
                      hasCommunityResult ? '群体发现' : '',
                      hasRiskPathResult ? '风险传导' : '',
                      report?.compliance_matches?.length ? '合规分析' : '',
                      hasFinalReportText ? '报告正文' : '',
                    ].filter(Boolean).join('、') || '等待结果'}
                  </Text>
                </Space>
                {partialMissingItems.length > 0 && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    待补充：{partialMissingItems.join('、')}
                  </Text>
                )}
              </div>
            </Card>

            {/* ═══ Section 1: 风险主体 ═══ */}
            <div id="risk-section-entity-stats">
              <Card
                size="small"
                style={{
                  borderRadius: 8,
                  ...(highlightSection === 'entity-stats' ? { animation: 'sectionHighlight 1s ease-in-out 2' } : {}),
                }}
                title={
                  <span style={{ fontSize: 13 }}>
                    <TeamOutlined style={{ marginRight: 8, color: '#2855D1' }} />
                    风险主体
                    <Tag style={{ marginLeft: 8, fontSize: 10 }}>{riskSubjects.length || totalEntities} 个主体</Tag>
                  </span>
                }
              >
                {riskSubjects.length > 0 ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {riskSubjects.map((entity) => {
                      const color = (NODE_TYPE_COLORS as Record<string, string>)[entity.type] || '#2855D1';
                      const label = (NODE_TYPE_LABELS as Record<string, string>)[entity.type] || entity.type;
                      return (
                        <Tag
                          key={entity.id}
                          style={{
                            margin: 0,
                            borderRadius: 6,
                            fontSize: 12,
                            padding: '4px 8px',
                            cursor: onAddToContext ? 'pointer' : 'default',
                            background: `${color}10`,
                            border: `1px solid ${color}40`,
                            color,
                          }}
                          onClick={() => {
                            onAddToContext?.(entity.id, entity.name, entity.type);
                            if (onAddToContext) {
                              message.success(`已加入对话上下文：${entity.name}`);
                            }
                          }}
                          title={onAddToContext ? '加入对话上下文' : undefined}
                        >
                          {entity.name}
                          <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 10 }}>{label}</span>
                        </Tag>
                      );
                    })}
                  </div>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {isLoading ? '风险主体识别中...' : '暂无可展示的风险主体'}
                  </Text>
                )}
              </Card>
            </div>

            {/* ═══ Section 2: 群体发现 ═══ */}
            <div id="risk-section-community">
              <Card
                size="small"
                style={{
                  borderRadius: 8,
                  ...(highlightSection === 'community' ? { animation: 'sectionHighlight 1s ease-in-out 2' } : {}),
                }}
                title={
                  <span style={{ fontSize: 13 }}>
                    <ClusterOutlined style={{ marginRight: 8, color: '#722ed1' }} />
                    群体发现
                    {communities.length > 0 && (
                      <Tag style={{ marginLeft: 8, fontSize: 10 }}>{communities.length} 个群体</Tag>
                    )}
                  </span>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(132px, 1fr))', gap: 8, minWidth: 560 }}>
                      {flowCards.map((item, index) => (
                        <div
                          key={item.title}
                          style={{
                            height: 72,
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                            background: index === 3 ? '#f5f3ff' : '#f8fafc',
                          }}
                        >
                          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{item.title}</Text>
                          <Text strong style={{ fontSize: 22, color: index === 3 ? '#722ed1' : '#0f172a', lineHeight: '28px' }}>
                            {item.value}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>{item.desc}</Text>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                      <Tag style={{ margin: 0, borderRadius: 6, color: '#b45309', background: '#fffbeb', borderColor: '#fde68a' }}>
                        <ThunderboltOutlined style={{ marginRight: 4 }} />
                        风险主体种子 {seedFlowNodes.length} 个
                      </Tag>
                      {compactSeedNames.length > 0 && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {compactSeedNames.join('、')}{seedFlowNodes.length > compactSeedNames.length ? ` 等 ${seedFlowNodes.length} 个` : ''}
                        </Text>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {visibleCommunities.map((comm: any) => {
                        const cid = Number(comm.community_id ?? comm.id ?? 0);
                        const color = COMMUNITY_PALETTE[cid % COMMUNITY_PALETTE.length];
                        const members = comm.members || comm.top_entities || [];
                        const density = typeof comm.density === 'number' ? ` / 密度 ${comm.density.toFixed(2)}` : '';
                        return (
                          <span key={cid} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#475569' }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 0 3px ${color}18` }} />
                            群体 #{cid} · {comm.size || members.length} 成员{density}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    style={{
                      minHeight: 520,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                      padding: 14,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <Text strong style={{ fontSize: 14, display: 'block' }}>群体发现子图</Text>
                        <Text type="secondary" style={{ fontSize: 10 }}>
                          {connectedSubgraphCounts.nodes || subgraphCounts.nodes} 节点 / {connectedSubgraphCounts.edges || subgraphCounts.edges} 关系
                          {communityPreviewGraph.nodes.length < (connectedSubgraphCounts.nodes || subgraphCounts.nodes) && ` · 当前展示 ${communityPreviewGraph.groups.length} 个群体的 ${communityPreviewGraph.nodes.length} 个代表节点`}
                        </Text>
                      </div>
                      <Space size={6}>
                        {communityAlgorithm && <Tag style={{ fontSize: 10, margin: 0 }}>算法: {communityAlgorithm}</Tag>}
                        {(Object.keys(communityNodePositions).length > 0
                          || communityViewport.x !== 0
                          || communityViewport.y !== 0
                          || communityViewport.scale !== 1) && (
                          <Button
                            size="small"
                            type="text"
                            icon={<ReloadOutlined />}
                            onClick={() => {
                              setCommunityNodePositions({});
                              setDraggingCommunityNodeId(null);
                              resetCommunityViewport();
                            }}
                            style={{ fontSize: 11, height: 24, padding: '0 6px' }}
                          >
                            重置布局
                          </Button>
                        )}
                      </Space>
                    </div>
                    <div style={{ position: 'relative', height: 440, borderRadius: 8, background: '#ffffff', border: '1px solid #dbeafe', overflow: 'hidden' }}>
                      {communityPreviewGraph.nodes.length > 0 ? (
                        <svg
                          viewBox="0 0 100 100"
                          preserveAspectRatio="xMidYMid meet"
                          onPointerDown={handleCommunityCanvasPointerDown}
                          onPointerMove={handleCommunityGraphPointerMove}
                          onPointerUp={stopCommunityGraphDrag}
                          onPointerLeave={stopCommunityGraphDrag}
                          onWheel={handleCommunityWheel}
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'block',
                            cursor: draggingCommunityNodeId || communityPanStart ? 'grabbing' : 'grab',
                            touchAction: 'none',
                          }}
                        >
                          <defs>
                            <filter id="communityNodeShadow" x="-50%" y="-50%" width="200%" height="200%">
                              <feDropShadow dx="0" dy="1.5" stdDeviation="1.8" floodColor="#1d4ed8" floodOpacity="0.22" />
                            </filter>
                            <marker
                              id="communityArrow"
                              viewBox="0 0 10 10"
                              refX="8.5"
                              refY="5"
                              markerWidth="4"
                              markerHeight="4"
                              orient="auto-start-reverse"
                            >
                              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb" opacity="0.72" />
                            </marker>
                          </defs>
                          <g transform={`translate(${communityViewport.x} ${communityViewport.y}) scale(${communityViewport.scale})`}>
                          {communityPreviewGraph.groupHulls.map((hull: any) => {
                            if (hull.key === 'unknown' || !hull.nodes.length) return null;
                            const groupKey = hull.key;
                            const color = COMMUNITY_PALETTE[Number(groupKey) % COMMUNITY_PALETTE.length];
                            return (
                              <g key={groupKey}>
                                <ellipse
                                  cx={hull.cx}
                                  cy={hull.cy}
                                  rx={hull.rx}
                                  ry={hull.ry}
                                  fill={`${color}0f`}
                                  stroke={`${color}45`}
                                  strokeWidth="0.7"
                                  strokeDasharray="2.2 1.6"
                                  vectorEffect="non-scaling-stroke"
                                />
                                <text
                                  x={hull.cx - hull.rx + 2}
                                  y={Math.max(6, hull.cy - hull.ry + 4)}
                                  fontSize="2.4"
                                  fill={color}
                                  fontWeight="700"
                                >
                                  群体 #{groupKey}
                                </text>
                              </g>
                            );
                          })}
                          {communityPreviewGraph.edges.map((edge: any, index: number) => {
                            const dx = edge.target.x - edge.source.x;
                            const dy = edge.target.y - edge.source.y;
                            const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
                            const sx = edge.source.x + (dx / len) * (edge.source.radius + 0.6);
                            const sy = edge.source.y + (dy / len) * (edge.source.radius + 0.6);
                            const tx = edge.target.x - (dx / len) * (edge.target.radius + 1.0);
                            const ty = edge.target.y - (dy / len) * (edge.target.radius + 1.0);
                            const label = String(edge.relation || '').slice(0, 8);
                            const showEdgeLabel = Boolean(label)
                              && (hoveredCommunityNodeId === edge.source.id || hoveredCommunityNodeId === edge.target.id);
                            return (
                              <g key={`${edge.id}-${index}`}>
                                <line
                                  x1={sx}
                                  y1={sy}
                                  x2={tx}
                                  y2={ty}
                                  stroke="#2563eb"
                                  strokeWidth={edge.source.isSeed || edge.target.isSeed ? 0.82 : 0.58}
                                  strokeOpacity="0.58"
                                  markerEnd="url(#communityArrow)"
                                  vectorEffect="non-scaling-stroke"
                                >
                                  <title>{edge.relation || '关系'}</title>
                                </line>
                                {showEdgeLabel && (
                                  <g style={{ pointerEvents: 'none' }}>
                                    <rect
                                      x={(sx + tx) / 2 - Math.max(5, label.length * 1.35)}
                                      y={(sy + ty) / 2 - 2.6}
                                      width={Math.max(10, label.length * 2.7)}
                                      height="5.2"
                                      rx="1.5"
                                      fill="#ffffff"
                                      fillOpacity="0.9"
                                    />
                                    <text
                                      x={(sx + tx) / 2}
                                      y={(sy + ty) / 2 + 1.1}
                                      textAnchor="middle"
                                      fontSize="2.35"
                                      fill="#1e3a8a"
                                      fontWeight="700"
                                    >
                                      {label}
                                    </text>
                                  </g>
                                )}
                              </g>
                            );
                          })}
                          {communityPreviewGraph.nodes.map((node: any, index: number) => {
                            const visual = resolveNodeVisual(node.type);
                            const nodeFill = visual.fill;
                            const strokeColor = node.isSeed ? '#2855D1' : visual.stroke;
                            const strokeWidth = node.isSeed ? 1.6 : 1.0;
                            const color = node.communityId !== undefined
                              ? COMMUNITY_PALETTE[node.communityId % COMMUNITY_PALETTE.length]
                              : visual.stroke;
                            const isActiveNode = hoveredCommunityNodeId === node.id || draggingCommunityNodeId === node.id;
                            const showLabel = isActiveNode;
                            const fullLabel = node.name.length > 18 ? `${node.name.slice(0, 17)}...` : node.name;
                            const label = fullLabel;
                            const labelWidth = Math.max(20, Math.min(54, label.length * 3.0 + 7));
                            const labelX = Math.min(96 - labelWidth, Math.max(4, node.x - labelWidth / 2));
                            const labelY = Math.max(6, Math.min(93, node.y + node.radius + 2.5));
                            return (
                              <g
                                key={`${node.id}-${index}`}
                                onPointerDown={(event) => handleCommunityNodePointerDown(event, node.id)}
                                onPointerUp={stopCommunityGraphDrag}
                                onPointerEnter={() => setHoveredCommunityNodeId(node.id)}
                                onPointerLeave={() => setHoveredCommunityNodeId((current) => current === node.id ? null : current)}
                                style={{ cursor: draggingCommunityNodeId === node.id ? 'grabbing' : 'grab' }}
                              >
                                <title>{`${node.name}${node.communityId !== undefined ? ` / 群体 #${node.communityId}` : ''}`}</title>
                                {node.isSeed && (
                                  <>
                                    <circle
                                      cx={node.x}
                                      cy={node.y}
                                      r={node.radius + 1.4}
                                      fill="none"
                                      stroke="rgba(40, 85, 209, 0.28)"
                                      strokeWidth="2.0"
                                      vectorEffect="non-scaling-stroke"
                                    />
                                    <circle
                                      cx={node.x}
                                      cy={node.y}
                                      r={node.radius + 0.7}
                                      fill="none"
                                      stroke="rgba(40, 85, 209, 0.48)"
                                      strokeWidth="1.0"
                                      vectorEffect="non-scaling-stroke"
                                    />
                                  </>
                                )}
                                <circle
                                  cx={node.x}
                                  cy={node.y}
                                  r={node.radius}
                                  fill={nodeFill}
                                  stroke={strokeColor}
                                  strokeWidth={strokeWidth}
                                  filter="url(#communityNodeShadow)"
                                  vectorEffect="non-scaling-stroke"
                                />
                                {showLabel && (
                                  <g style={{ pointerEvents: 'none' }}>
                                    <rect
                                      x={labelX}
                                      y={labelY}
                                      width={labelWidth}
                                      height="7.2"
                                      rx="1.8"
                                      fill="#ffffff"
                                      fillOpacity="0.94"
                                      stroke={`${visual.stroke}55`}
                                      strokeWidth="0.45"
                                      vectorEffect="non-scaling-stroke"
                                    />
                                    <text
                                      x={labelX + labelWidth / 2}
                                      y={labelY + 4.9}
                                      textAnchor="middle"
                                      fontSize="2.65"
                                      fill="#0f172a"
                                      fontWeight={node.isSeed ? '700' : '600'}
                                    >
                                      {label}
                                    </text>
                                  </g>
                                )}
                              </g>
                            );
                          })}
                          </g>
                        </svg>
                      ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>等待子图数据</Text>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                      {seedFlowNodes.length > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#475569' }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2563eb', border: '2px solid #f59e0b' }} />
                          种子节点
                        </span>
                      )}
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        拖拽空白处移动画布，滚轮缩放；节点名称默认收起，悬浮显示完整名称。
                      </Text>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* ═══ Section 3: 风险传导路径 ═══ */}
            <div id="risk-section-risk-paths">
              {sortedPaths.length > 0 ? (
                <Card
                  size="small"
                  style={{
                    borderRadius: 8,
                    ...(highlightSection === 'risk-paths' ? { animation: 'sectionHighlight 1s ease-in-out 2' } : {}),
                  }}
                  title={
                    <span style={{ fontSize: 13 }}>
                      <NodeIndexOutlined style={{ marginRight: 8, color: '#f5222d' }} />
                      风险传导路径 ({sortedPaths.length})
                    </span>
                  }
                  extra={
                    <Space size={4}>
                      <Tag color="error" style={{ fontSize: 10, borderRadius: 4 }}>高风险 {highCount}</Tag>
                      <Tag color="warning" style={{ fontSize: 10, borderRadius: 4 }}>中风险 {mediumCount}</Tag>
                      <Tag color="success" style={{ fontSize: 10, borderRadius: 4 }}>低风险 {lowCount}</Tag>
                    </Space>
                  }
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {displayedPaths.map((path) => (
                        <div
                          key={path.path_id}
                          style={{
                            padding: '10px 12px',
                            background: '#f8fafc',
                            borderRadius: 6,
                            borderLeft: `4px solid ${RISK_LEVEL_COLORS[path.risk_level] || '#fa8c16'}`,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                            <Tag color={RISK_LEVEL_COLORS[path.risk_level]} style={{ fontSize: 10, borderRadius: 4, lineHeight: '18px', margin: 0 }}>
                              {path.risk_level === 'high' ? '高风险' : path.risk_level === 'medium' ? '中风险' : '低风险'}
                            </Tag>
                            <Text strong style={{ fontSize: 12 }}>{path.path_id}</Text>
                            {path.confidence !== undefined && (
                              <Tag style={{ fontSize: 10, borderRadius: 4, lineHeight: '18px', margin: 0, background: '#f0f5ff', border: '1px solid #d6e4ff', color: '#2855D1' }}>
                                {(path.confidence * 100).toFixed(0)}%
                              </Tag>
                            )}
                            {onJumpToGraph && path.affected_entities?.length > 0 && (
                              <Button
                                size="small"
                                type="link"
                                icon={<EyeOutlined />}
                                style={{ fontSize: 10, padding: 0, height: 20 }}
                                onClick={() => onJumpToGraph(path.affected_entities[0], path.affected_entities[0], 'Entity')}
                              >
                                查看图谱
                              </Button>
                            )}
                          </div>
                          {((path as any).community_path?.length > 0) && (
                            <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                              <Text type="secondary" style={{ fontSize: 10 }}>社区路径:</Text>
                              {(path as any).community_path.map((cid: number, idx: number, arr: number[]) => (
                                <React.Fragment key={cid}>
                                  <Tag
                                    style={{
                                      margin: 0, borderRadius: 4, fontSize: 10, lineHeight: '16px',
                                      background: `${COMMUNITY_PALETTE[cid % COMMUNITY_PALETTE.length]}16`,
                                      border: `1px solid ${COMMUNITY_PALETTE[cid % COMMUNITY_PALETTE.length]}50`,
                                      color: COMMUNITY_PALETTE[cid % COMMUNITY_PALETTE.length],
                                    }}
                                  >
                                    社区 #{cid}
                                  </Tag>
                                  {idx < arr.length - 1 && <span style={{ color: '#94a3b8', fontSize: 12 }}>→</span>}
                                </React.Fragment>
                              ))}
                            </div>
                          )}
                          <Text style={{ fontSize: 12, color: '#475569' }}>{path.path_description}</Text>
                          {path.affected_entities && path.affected_entities.length > 0 && (
                            <div style={{ marginTop: 8, overflowX: 'auto', paddingBottom: 4 }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 'max-content' }}>
                                {path.affected_entities.slice(0, 12).map((entity, idx) => {
                                  const etype = inferClientEntityType(entity)
                                  const color = (NODE_TYPE_COLORS as Record<string, string>)[etype] || '#8c8c8c'
                                  const label = (NODE_TYPE_LABELS as Record<string, string>)[etype] || etype
                                  return (
                                    <React.Fragment key={entity}>
                                      {idx > 0 && <span style={{ color: '#94a3b8', fontSize: 14 }}>→</span>}
                                      <Tooltip title={`${label}: ${entity}`}>
                                        <Tag
                                          style={{
                                            fontSize: 11, borderRadius: 16, cursor: onJumpToGraph ? 'pointer' : 'default',
                                            border: `1px solid ${color}40`, background: `${color}10`, color,
                                            margin: 0, padding: '3px 9px',
                                          }}
                                          onClick={() => onJumpToGraph?.(entity, entity, etype)}
                                        >
                                          {entity.length > 14 ? entity.slice(0, 12) + '...' : entity}
                                        </Tag>
                                      </Tooltip>
                                    </React.Fragment>
                                  )
                                })}
                                {path.affected_entities.length > 12 && (
                                  <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>+{path.affected_entities.length - 12} 更多</Text>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                  {sortedPaths.length > 5 && (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => setShowAllPaths(!showAllPaths)}
                      style={{ marginTop: 8, padding: 0 }}
                    >
                      {showAllPaths ? '收起，仅显示前 5 条' : `展开全部 ${sortedPaths.length} 条路径`}
                    </Button>
                  )}
                </Card>
              ) : (
                <Card
                  size="small"
                  style={{ borderRadius: 8 }}
                  title={
                    <span style={{ fontSize: 13 }}>
                      <NodeIndexOutlined style={{ marginRight: 8, color: '#f5222d' }} />
                      风险传导路径
                    </span>
                  }
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {isLoading ? '风险路径分析进行中...' : isInsufficientEvidence ? '图谱证据不足，暂未形成稳定风险传导路径。' : '未检测到风险传导路径。'}
                    </Text>
                    {(riskSubjects.length > 0 || hasCommunityResult) && (
                      <div style={{ padding: '10px 12px', borderRadius: 8, background: '#fff7e6', border: '1px solid #ffd591' }}>
                        <Text strong style={{ fontSize: 12, color: '#ad6800' }}>
                          已保留部分分析结果
                        </Text>
                        <Text style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#8c6d1f' }}>
                          当前已识别 {riskSubjects.length || totalEntities} 个风险主体
                          {hasCommunityResult ? '，并完成群体/子图预览' : ''}。建议确认主体别名、补齐关联关系后重新生成路径。
                        </Text>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </div>

            {/* ═══ Section 4: 协同治理社区报告 ═══ */}
            <div id="risk-section-final-report" ref={finalReportRef}>
              <Card
                size="small"
                style={{
                  borderRadius: 8,
                  border: highlightSection === 'final-report' ? '2px solid #2855D1' : undefined,
                  transition: 'border-color 0.5s ease',
                  ...(highlightSection === 'final-report' ? { animation: 'sectionHighlight 1s ease-in-out 2' } : {}),
                }}
                title={
                  <span style={{ fontSize: 13 }}>
                    <FileTextOutlined style={{ marginRight: 8, color: '#2855D1' }} />
                    协同治理社区报告
                  </span>
                }
                extra={
                  <Space size={4} className="no-print">
                    <Tooltip title="导出 Markdown">
                      <Button size="small" icon={<FileMarkdownOutlined />} onClick={handleExportMD} />
                    </Tooltip>
                    <Tooltip title="导出 Word">
                      <Button size="small" icon={<FileWordOutlined />} onClick={handleExportWord} />
                    </Tooltip>
                    <Tooltip title="导出 PDF">
                      <Button size="small" icon={<FilePdfOutlined />} onClick={handleExportPDF} />
                    </Tooltip>
                  </Space>
                }
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <Title level={5} style={{ margin: '0 0 8px', fontSize: 15 }}>
                      <ThunderboltOutlined style={{ marginRight: 8, color: '#FFC101' }} />
                      社区治理结论
                    </Title>
                    <Paragraph
                      ellipsis={{ rows: 4, expandable: true }}
                      style={{ color: '#475569', fontSize: 13, marginBottom: 0 }}
                    >
                      {report.executive_summary || fallbackExecutiveSummary}
                    </Paragraph>
                  </div>
                </div>

                {structuredReportSections.length > 0 ? (
                  <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                    {structuredReportSections.map((section) => (
                      <div
                        key={section.id}
                        style={{
                          padding: '14px 16px',
                          background: '#f8fafc',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <Text strong style={{ display: 'block', fontSize: 13, color: '#1e293b', marginBottom: 6 }}>
                          {section.title}
                        </Text>
                        <Paragraph style={{ color: '#475569', fontSize: 13, marginBottom: section.bullets?.length ? 8 : 0 }}>
                          {section.summary}
                        </Paragraph>
                        {section.bullets && section.bullets.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {section.bullets.map((bullet, idx) => (
                              <div key={`${section.id}-${idx}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <span style={{ color: '#2855D1', fontWeight: 700, lineHeight: '20px' }}>•</span>
                                <Text style={{ color: '#334155', fontSize: 12, lineHeight: 1.7 }}>{bullet}</Text>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : report.integrated_report || report.markdown_report ? (
                  <div className="markdown-report" style={{ fontSize: 13, lineHeight: 1.75, color: '#334155', marginTop: 12, padding: '14px 16px', background: '#f8fafc', borderRadius: 8 }}>
                    <ReactMarkdown>{report.integrated_report || report.markdown_report}</ReactMarkdown>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, lineHeight: 1.75, color: '#334155', marginTop: 12, padding: '14px 16px', background: '#f8fafc', borderRadius: 8, border: '1px dashed #cbd5e1' }}>
                    <Text strong style={{ display: 'block', marginBottom: 6 }}>报告正文尚未完整生成</Text>
                    <Text style={{ display: 'block', color: '#64748b' }}>
                      系统已展示当前可确认的主体、群体和部分风险证据。{partialMissingItems.length > 0 ? `待补充模块：${partialMissingItems.join('、')}。` : ''}
                    </Text>
                    <Text style={{ display: 'block', color: '#64748b', marginTop: 4 }}>
                      可先确认实体别名、补齐关联公司关系和监管/资金往来证据，再重新生成完整社区风险报告。
                    </Text>
                  </div>
                )}

                {governancePlan?.actions && governancePlan.actions.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>协同处置动作</Text>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {governancePlan.actions.slice(0, 4).map((action, idx) => {
                        const urgency = URGENCY_TAGS[action.priority] || URGENCY_TAGS.normal;
                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 8,
                              padding: '8px 12px',
                              background: action.priority === 'urgent' ? '#fff2f0' : '#f8fafc',
                              borderRadius: 6,
                              border: action.priority === 'urgent' ? '1px solid #ffccc7' : '1px solid #e2e8f0',
                            }}
                          >
                            <span style={{ fontSize: 18, fontWeight: 700, color: urgency.color, minWidth: 24, textAlign: 'center', lineHeight: 1.2 }}>
                              {idx + 1}
                            </span>
                            <div style={{ flex: 1 }}>
                              <Text strong style={{ fontSize: 12 }}>{action.measure}</Text>
                              <Text style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>
                                {action.target} · {action.risk_issue}
                              </Text>
                              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <Tag color={urgency.color} style={{ borderRadius: 4, fontSize: 10, margin: 0 }}>
                                  {urgency.label}
                                </Tag>
                                <Tag style={{ borderRadius: 4, fontSize: 10, margin: 0 }}>{action.department}</Tag>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* ═══ Error banner ═══ */}
            {error && report && (
              <Card size="small" style={{ borderRadius: 8, border: '1px solid #ffccc7' }} className="no-print">
                <Text type="danger" style={{ fontSize: 12 }}>注意: {error}</Text>
              </Card>
            )}
          </>
        )}

      </div>

      {/* ═══ Report History Drawer ═══ */}
      <Drawer
        title="历史报告"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        width={360}
      >
        {historyLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin indicator={<LoadingOutlined spin />} />
          </div>
        ) : historyReports.length === 0 ? (
          <Empty description="暂无历史报告" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            dataSource={historyReports}
            renderItem={(item) => (
              <List.Item
                style={{ cursor: 'pointer', padding: '10px 12px', borderRadius: 6 }}
                onClick={() => loadHistoryReport(item.report_id)}
              >
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text strong style={{ fontSize: 12 }}>{item.report_id}</Text>
                    <Tag
                      color={RISK_LEVEL_COLORS[item.overall_risk_level] || '#fa8c16'}
                      style={{ borderRadius: 4, fontSize: 10 }}
                    >
                      {RISK_LEVEL_LABELS[item.overall_risk_level] || item.overall_risk_level?.toUpperCase()}
                    </Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                    {item.query_summary || '-'}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    {item.generated_at ? formatTimestamp(item.generated_at) : ''} · {item.subtasks_completed} 个子任务
                  </Text>
                </div>
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </div>
  );
};

export default RiskReportPanel;
