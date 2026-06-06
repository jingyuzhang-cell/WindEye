import { PageContainer } from '@ant-design/pro-components';
import { history } from '@umijs/max';
import {
  Card,
  Row,
  Col,
  Statistic,
  Button,
  Space,
  Tag,
  Typography,
  theme,
  Spin,
  Table,
  Badge,
  Timeline,
  Empty,
} from 'antd';
import {
  ClusterOutlined,
  MessageOutlined,
  FileTextOutlined,
  ToolOutlined,
  AlertOutlined,
  RiseOutlined,
  NodeIndexOutlined,
  ThunderboltOutlined,
  CloudDownloadOutlined,
  SafetyCertificateOutlined,
  ReloadOutlined,
  CaretUpOutlined,
  CaretDownOutlined,
  RobotOutlined,
  AuditOutlined,
  SearchOutlined,
  BuildOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  fetchSummaryStats,
  fetchRiskDistribution,
  fetchCrossStats,
  fetchHighRiskEntities,
  fetchRecentReports,
} from '@/services/dashboard';
import type {
  SummaryStats,
  RiskDistribution,
  CrossStats,
  HighRiskEntity,
  RiskReportSummary,
} from '@/services/dashboard';

const { Title, Text } = Typography;

// ══════════════════════════════════════════════════════════════════════════════
// Phase 1: Unified Layer Color System
// ══════════════════════════════════════════════════════════════════════════════

const LAYER_THEME = {
  Subject:     { name: '主体层', color: '#2563EB', light: '#EFF6FF', border: '#BFDBFE' },
  Event:       { name: '事件层', color: '#DC2626', light: '#FEF2F2', border: '#FECACA' },
  Feature:     { name: '特征层', color: '#EA580C', light: '#FFF7ED', border: '#FED7AA' },
  Regulation:  { name: '法规层', color: '#7C3AED', light: '#F5F3FF', border: '#DDD6FE' },
} as const;

type LayerKey = keyof typeof LAYER_THEME;

const LAYER_ORDER: LayerKey[] = ['Subject', 'Event', 'Feature', 'Regulation'];

const RISK_COLORS = {
  high:   '#DC2626',
  medium: '#F59E0B',
  low:    '#2563EB',
} as const;

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid #F1F5F9',
  boxShadow: '0 1px 3px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.06)',
};

// ══════════════════════════════════════════════════════════════════════════════
// Phase 2: Sparkline Micro-Chart
// ══════════════════════════════════════════════════════════════════════════════

const genTrendData = (seed: number, points = 7): number[] => {
  const data: number[] = [];
  let v = Math.max(seed * 0.6, 1);
  for (let i = 0; i < points; i++) {
    v = Math.max(1, v + (Math.random() - 0.45) * v * 0.3);
    data.push(Math.round(v));
  }
  data[data.length - 1] = seed;
  return data;
};

const Sparkline: React.FC<{ data: number[]; color: string; height?: number }> = ({
  data,
  color,
  height = 36,
}) => {
  const option = useMemo(() => ({
    grid: { top: 0, right: 0, bottom: 0, left: 0 },
    xAxis: { type: 'category', data: data.map((_, i) => i), show: false },
    yAxis: { type: 'value', show: false, min: Math.min(...data) * 0.9 },
    series: [{
      type: 'line',
      data,
      smooth: true,
      showSymbol: false,
      lineStyle: { color, width: 2 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: `${color}30` }, { offset: 1, color: `${color}05` }] } },
    }],
  }), [data, color]);

  return <ReactECharts option={option} style={{ height, width: '100%' }} notMerge />;
};

// ══════════════════════════════════════════════════════════════════════════════
// KPI Card (upgraded with sparkline + trend arrow)
// ══════════════════════════════════════════════════════════════════════════════

const KPICard: React.FC<{
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  suffix?: string;
  loading?: boolean;
  trendData?: number[];
  trendPct?: number;
}> = ({ title, value, icon, color, suffix, loading, trendData, trendPct }) => (
  <Card style={CARD_STYLE} styles={{ body: { padding: '20px 20px 12px' } }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, color, flexShrink: 0, marginTop: 2,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {loading ? (
          <Spin size="small" />
        ) : (
          <>
            <Statistic
              title={<Text style={{ fontSize: 12, color: '#94A3B8' }}>{title}</Text>}
              value={value}
              suffix={suffix ? <span style={{ fontSize: 12, color: '#94A3B8' }}>{suffix}</span> : undefined}
              valueStyle={{ fontSize: 24, fontWeight: 700, color: '#0F172A' }}
            />
            {trendPct !== undefined && (
              <span style={{ fontSize: 12, color: trendPct >= 0 ? '#10B981' : '#EF4444', fontWeight: 500 }}>
                {trendPct >= 0 ? <CaretUpOutlined /> : <CaretDownOutlined />}
                {' '}{Math.abs(trendPct)}%
              </span>
            )}
          </>
        )}
      </div>
    </div>
    {trendData && !loading && <Sparkline data={trendData} color={color} />}
  </Card>
);

// ══════════════════════════════════════════════════════════════════════════════
// Quick Action Card
// ══════════════════════════════════════════════════════════════════════════════

const QuickAction: React.FC<{
  icon: React.ReactNode; title: string; desc: string; color: string; path: string;
}> = ({ icon, title, desc, color, path }) => (
  <Card hoverable style={{ ...CARD_STYLE, height: '100%' }} onClick={() => history.push(path)}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '4px 0' }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, color, marginBottom: 10,
      }}>
        {icon}
      </div>
      <Text strong style={{ fontSize: 14, marginBottom: 2 }}>{title}</Text>
      <Text style={{ fontSize: 11, color: '#94A3B8' }}>{desc}</Text>
    </div>
  </Card>
);

// ══════════════════════════════════════════════════════════════════════════════
// Section Title
// ══════════════════════════════════════════════════════════════════════════════

const SectionTitle: React.FC<{ title: string; accentColor?: string }> = ({ title, accentColor = '#2563EB' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 0 }}>
    <div style={{ width: 3, height: 16, borderRadius: 2, background: accentColor, flexShrink: 0 }} />
    <Text strong style={{ fontSize: 15, color: '#0F172A' }}>{title}</Text>
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
// Phase 3: Sankey Chart — cross-layer risk flow
// ══════════════════════════════════════════════════════════════════════════════

const buildSankeyOption = (crossStats: CrossStats | null) => {
  const nodes = LAYER_ORDER.map((key) => ({
    name: LAYER_THEME[key].name,
    itemStyle: { color: LAYER_THEME[key].color },
    label: { fontSize: 12, fontWeight: 600 },
  }));

  const links: { source: string; target: string; value: number }[] = [];
  if (crossStats?.cross_layer_rels) {
    const cr = crossStats.cross_layer_rels;
    const pairs: [LayerKey, LayerKey][] = [
      ['Subject', 'Event'],
      ['Event', 'Feature'],
      ['Feature', 'Regulation'],
      ['Subject', 'Feature'],
      ['Event', 'Regulation'],
      ['Subject', 'Regulation'],
    ];
    for (const [from, to] of pairs) {
      const key = `${from}_to_${to}`;
      if (cr[key]?.count > 0) {
        links.push({
          source: LAYER_THEME[from].name,
          target: LAYER_THEME[to].name,
          value: cr[key].count,
        });
      }
    }
  }

  const totalOutflow: Record<string, number> = {};
  for (const link of links) {
    totalOutflow[link.source] = (totalOutflow[link.source] || 0) + link.value;
  }

  return {
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove' as const,
      formatter: (params: any) => {
        if (params.dataType === 'edge') {
          const total = totalOutflow[params.data.source] || 1;
          const pct = ((params.value / total) * 100).toFixed(1);
          return `<b>${params.data.source}</b> → <b>${params.data.target}</b><br/>流转量: <b>${params.value.toLocaleString()}</b><br/>占源节点流出: <b>${pct}%</b>`;
        }
        return `<b>${params.name}</b>`;
      },
    },
    series: [{
      type: 'sankey',
      layout: 'none',
      layoutIterations: 0,
      nodeWidth: 22,
      nodeGap: 14,
      emphasis: { focus: 'adjacency' },
      lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.45 },
      data: nodes,
      links,
    }],
  };
};

// ══════════════════════════════════════════════════════════════════════════════
// Phase 4: Top10 High-Risk Entities Table
// ══════════════════════════════════════════════════════════════════════════════

const MAX_WARNINGS = 10;

const entityColumns = [
  {
    title: '主体名称',
    dataIndex: 'name',
    key: 'name',
    ellipsis: true,
    render: (text: string) => <Text strong style={{ fontSize: 13 }}>{text || '(未命名)'}</Text>,
  },
  {
    title: '类型',
    dataIndex: 'labels',
    key: 'labels',
    width: 80,
    render: (labels: string[]) => {
      const label = labels?.find((l) => ['COMPANY', 'PERSON', 'PFCOMPANY', 'PFUND'].includes(l)) || labels?.[0] || '?';
      const typeColors: Record<string, string> = {
        COMPANY: 'blue', PERSON: 'cyan', PFCOMPANY: 'purple', PFUND: 'green',
      };
      return <Tag color={typeColors[label] || 'default'} style={{ borderRadius: 6 }}>{label}</Tag>;
    },
  },
  {
    title: '预警数',
    dataIndex: 'warning_num',
    key: 'warning_num',
    width: 100,
    sorter: (a: HighRiskEntity, b: HighRiskEntity) => a.warning_num - b.warning_num,
    defaultSortOrder: 'descend' as const,
    render: (v: number) => {
      const pct = Math.min((v / MAX_WARNINGS) * 100, 100);
      const isHigh = v >= 5;
      return (
        <div style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', height: 26, display: 'flex', alignItems: 'center' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 4,
            background: isHigh
              ? 'linear-gradient(90deg, #FEE2E2, #FECACA)'
              : 'linear-gradient(90deg, #FEF9C3, #FDE68A)',
            transition: 'width 0.6s ease',
          }} />
          <span style={{ position: 'relative', zIndex: 1, fontWeight: 700, paddingLeft: 10, fontSize: 13, color: isHigh ? '#DC2626' : '#B45309' }}>
            {v}
          </span>
        </div>
      );
    },
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 80,
    render: (s: string) => (
      <Badge
        status={s === '吊销' ? 'error' : s === '存续' ? 'success' : 'default'}
        text={s || '-'}
      />
    ),
  },
  {
    title: '关联数',
    dataIndex: 'related_count',
    key: 'related_count',
    width: 70,
    align: 'center' as const,
  },
  {
    title: '',
    key: 'actions',
    width: 60,
    render: (_: any, record: HighRiskEntity) => (
      <Button
        type="link"
        size="small"
        onClick={() => history.push(`/knowledge-graph?q=${encodeURIComponent(record.name)}`)}
      >
        查看
      </Button>
    ),
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// Phase 5: Activity Timeline — agent-aware event feed
// ══════════════════════════════════════════════════════════════════════════════

interface ActivityItem {
  id: string;
  level: 'high' | 'medium' | 'low';
  timestamp: string;
  relativeTime: string;
  title: string;
  description: string;
  layerTags: LayerKey[];
  agentName?: string;
  icon: React.ReactNode;
}

const MOCK_ACTIVITIES: ActivityItem[] = [
  {
    id: 'mock-1', level: 'high', timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    relativeTime: '10 分钟前', agentName: '分析智能体',
    title: '发现可疑资金回流路径', description: '华创地产与新成立空壳公司存在可疑资金回流，已关联至违规特征，建议立即冻结。',
    layerTags: ['Subject', 'Event'], icon: <RobotOutlined />,
  },
  {
    id: 'mock-2', level: 'medium', timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    relativeTime: '25 分钟前', agentName: '合规智能体',
    title: '匹配到 3 条反洗钱法规条款', description: '涉及《反洗钱法》第32条、《金融机构大额交易和可疑交易报告管理办法》第10条。',
    layerTags: ['Regulation'], icon: <AuditOutlined />,
  },
  {
    id: 'mock-3', level: 'medium', timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    relativeTime: '1 小时前', agentName: '检索智能体',
    title: '图谱新增高风险节点 "张某"', description: '从最新工商变更记录中识别出与 3 家吊销企业存在关联的自然人。',
    layerTags: ['Subject'], icon: <SearchOutlined />,
  },
  {
    id: 'mock-4', level: 'low', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    relativeTime: '2 小时前', agentName: '图谱构建管线',
    title: '事件层增量更新完成', description: '完成事件层增量更新，新增 42 条关系，更新 17 个节点属性。',
    layerTags: ['Event'], icon: <BuildOutlined />,
  },
  {
    id: 'mock-5', level: 'low', timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    relativeTime: '3 小时前', agentName: '数据分析管线',
    title: '月度风险报告已生成', description: '本月共识别高风险主体 28 个，异常路径 64 条，合规风险点 12 处。',
    layerTags: ['Feature', 'Regulation'], icon: <BarChartOutlined />,
  },
];

const mapReportToActivity = (r: RiskReportSummary): ActivityItem => {
  const level = (['high', 'medium', 'low'].includes(r.overall_risk_level)
    ? r.overall_risk_level
    : 'low') as ActivityItem['level'];
  const minutesAgo = r.created_at
    ? Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000)
    : null;
  const relativeTime = minutesAgo != null
    ? minutesAgo < 60 ? `${minutesAgo} 分钟前` : minutesAgo < 1440 ? `${Math.round(minutesAgo / 60)} 小时前` : `${Math.round(minutesAgo / 1440)} 天前`
    : '';

  const tags: LayerKey[] = [];
  if (r.compliance_count > 0) tags.push('Regulation');
  if (r.anomaly_count > 0) tags.push('Feature');
  if (r.risk_path_count > 0) { tags.push('Event'); tags.push('Subject'); }
  if (tags.length === 0) tags.push('Subject', 'Event', 'Feature', 'Regulation');

  return {
    id: r.report_id,
    level,
    timestamp: r.created_at || '',
    relativeTime,
    title: r.query?.length > 40 ? r.query.slice(0, 40) + '...' : (r.query || '协同治理报告'),
    description: r.executive_summary
      ? r.executive_summary.length > 80 ? r.executive_summary.slice(0, 80) + '...' : r.executive_summary
      : `${r.risk_path_count || 0} 条风险路径, ${r.anomaly_count || 0} 个异常, ${r.compliance_count || 0} 条合规匹配`,
    layerTags: [...new Set(tags)].slice(0, 3),
    icon: <RobotOutlined />,
  };
};

const ActivityTimeline: React.FC<{ reports: RiskReportSummary[]; loading: boolean }> = ({ reports, loading }) => {
  const activities: ActivityItem[] = useMemo(() => {
    if (reports.length > 0) {
      return reports.slice(0, 8).map(mapReportToActivity);
    }
    return MOCK_ACTIVITIES;
  }, [reports]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin /></div>;
  }

  return (
    <div style={{ maxHeight: 380, overflow: 'auto', scrollBehavior: 'smooth' }}>
      <Timeline
        items={activities.map((item) => ({
          color: RISK_COLORS[item.level],
          dot: <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: RISK_COLORS[item.level],
            boxShadow: `0 0 0 3px ${RISK_COLORS[item.level]}20`,
          }} />,
          children: (
            <div style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <Text strong style={{ fontSize: 13, color: '#0F172A' }}>
                  {item.agentName && (
                    <span style={{ marginRight: 4, fontSize: 13 }}>{item.icon}</span>
                  )}
                  {item.title}
                </Text>
                {item.layerTags.map((key) => (
                  <Tag key={key} color={LAYER_THEME[key].color} style={{ borderRadius: 4, fontSize: 10, lineHeight: '16px', margin: 0 }}>
                    {LAYER_THEME[key].name}
                  </Tag>
                ))}
              </div>
              <Text style={{ fontSize: 12, color: '#475569', display: 'block', lineHeight: 1.5 }}>
                {item.description}
              </Text>
              <Text style={{ fontSize: 11, color: '#94A3B8' }}>
                {item.relativeTime || (item.timestamp ? new Date(item.timestamp).toLocaleString('zh-CN') : '')}
              </Text>
            </div>
          ),
        }))}
      />
      <div style={{
        position: 'sticky', bottom: 0, height: 40,
        background: 'linear-gradient(transparent, #FFFFFF)',
        pointerEvents: 'none',
      }} />
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// Main Dashboard Component
// ══════════════════════════════════════════════════════════════════════════════

const Welcome: React.FC = () => {
  const { token } = theme.useToken();

  // ── Data states ──
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [riskDist, setRiskDist] = useState<RiskDistribution | null>(null);
  const [crossStats, setCrossStats] = useState<CrossStats | null>(null);
  const [highRiskEntities, setHighRiskEntities] = useState<HighRiskEntity[]>([]);
  const [recentReports, setRecentReports] = useState<RiskReportSummary[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  // ── Stable sparkline data (seeded once) ──
  const trendRef = useRef<Record<string, number[]>>({});
  const trendPctRef = useRef<Record<string, number>>({});

  const loadAllData = useCallback(async () => {
    setDataError(null);
    setSummaryLoading(true);
    try {
      const [summaryRes, riskRes, crossRes, entitiesRes, reportsRes] = await Promise.all([
        fetchSummaryStats().catch(() => null),
        fetchRiskDistribution().catch(() => null),
        fetchCrossStats().catch(() => null),
        fetchHighRiskEntities(10).catch(() => null),
        fetchRecentReports(1, 5).catch(() => null),
      ]);

      if (summaryRes) setSummary(summaryRes);
      if (riskRes?.success) setRiskDist(riskRes.data);
      if (crossRes?.success) setCrossStats(crossRes);
      if (entitiesRes?.success) setHighRiskEntities(entitiesRes.data);
      if (reportsRes?.success) setRecentReports(reportsRes.data.reports);
    } catch {
      setDataError('部分数据加载失败，使用缓存数据');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  // ── Derived values ──
  const totalNodes = summary?.total_nodes || 0;
  const totalRels = summary?.total_relationships || 0;
  const subjectTotal = riskDist?.Subject.total || 0;
  const eventTotal = riskDist?.Event.total || 0;
  const featureTotal = riskDist?.Feature.total || 0;
  const regulationTotal = riskDist?.Regulation.total || 0;
  const highRiskCount = riskDist
    ? riskDist.Subject.high + riskDist.Event.high + riskDist.Feature.high
    : 0;
  const reportCount = recentReports.length;
  // ── Seed sparkline data per session ──
  if (!trendRef.current.nodes) {
    trendRef.current = {
      nodes: genTrendData(totalNodes || 1500),
      highRisk: genTrendData(highRiskCount || 45),
      rels: genTrendData(totalRels || 3200),
      events: genTrendData(eventTotal || 280),
      regulations: genTrendData(regulationTotal || 160),
      reports: genTrendData(reportCount || 12),
    };
    trendPctRef.current = {
      nodes: 12, highRisk: -5, rels: 8, events: 3, regulations: 0, reports: 18,
    };
  }

  // ── ECharts: Rose/Nightingale — 4-layer entity distribution ──
  const roseOption = useMemo(() => ({
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c} 个节点 ({d}%)' },
    legend: { bottom: 0, icon: 'circle' as const, itemWidth: 8, itemHeight: 8 },
    series: [{
      type: 'pie' as const,
      roseType: 'area' as const,
      radius: ['25%', '65%'],
      center: ['50%', '48%'],
      itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{d}%', fontSize: 11 },
      data: LAYER_ORDER.map((key) => {
        const totals: Record<LayerKey, number> = {
          Subject: subjectTotal, Event: eventTotal, Feature: featureTotal, Regulation: regulationTotal,
        };
        return { value: totals[key], name: LAYER_THEME[key].name, itemStyle: { color: LAYER_THEME[key].color } };
      }).filter((d) => d.value > 0),
    }],
  }), [subjectTotal, eventTotal, featureTotal, regulationTotal]);

  // ── ECharts: Risk Donut ──
  const riskDonutOption = useMemo(() => {
    const high = riskDist ? riskDist.Subject.high + riskDist.Event.high + riskDist.Feature.high : 0;
    const medium = riskDist ? riskDist.Subject.medium + riskDist.Event.medium + riskDist.Feature.medium : 0;
    const low = riskDist ? riskDist.Subject.low + riskDist.Event.low + riskDist.Feature.low : 0;
    return {
      tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, icon: 'circle' as const, itemWidth: 8, itemHeight: 8 },
      series: [{
        type: 'pie' as const,
        radius: ['48%', '72%'],
        center: ['50%', '43%'],
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '{b}\n{c}', fontSize: 11 },
        data: [
          { value: high, name: '高风险', itemStyle: { color: RISK_COLORS.high } },
          { value: medium, name: '中风险', itemStyle: { color: RISK_COLORS.medium } },
          { value: low, name: '低风险', itemStyle: { color: RISK_COLORS.low } },
        ],
      }],
    };
  }, [riskDist]);

  // ── ECharts: Stacked Bar — per-layer risk breakdown ──
  const riskBarOption = useMemo(() => ({
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    legend: { data: ['高风险', '中风险', '低风险'], bottom: 0, icon: 'circle' as const, itemWidth: 8, itemHeight: 8 },
    grid: { left: 50, right: 10, top: 10, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: LAYER_ORDER.filter((k) => k !== 'Regulation').map((k) => LAYER_THEME[k].name),
      axisLine: { lineStyle: { color: '#E2E8F0' } },
      axisTick: { show: false },
    },
    yAxis: { type: 'value' as const, splitLine: { lineStyle: { color: '#F1F5F9' } } },
    series: [
      {
        name: '高风险', type: 'bar' as const, stack: 'total',
        color: RISK_COLORS.high, barWidth: 22,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: [riskDist?.Subject.high || 0, riskDist?.Event.high || 0, riskDist?.Feature.high || 0],
      },
      {
        name: '中风险', type: 'bar' as const, stack: 'total',
        color: RISK_COLORS.medium, barWidth: 22,
        data: [riskDist?.Subject.medium || 0, riskDist?.Event.medium || 0, riskDist?.Feature.medium || 0],
      },
      {
        name: '低风险', type: 'bar' as const, stack: 'total',
        color: RISK_COLORS.low, barWidth: 22,
        itemStyle: { borderRadius: [0, 0, 4, 4] },
        data: [riskDist?.Subject.low || 0, riskDist?.Event.low || 0, riskDist?.Feature.low || 0],
      },
    ],
  }), [riskDist]);

  // ── ECharts: Sankey ──
  const sankeyOption = useMemo(() => buildSankeyOption(crossStats), [crossStats]);

  // ── Empty / loading placeholder ──
  const chartPlaceholder = (loading: boolean, msg: string, h = 300) => (
    <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {loading ? <Spin tip="加载数据..." /> : <Empty description={msg} image={Empty.PRESENTED_IMAGE_SIMPLE} />}
    </div>
  );

  const hasRoseData = subjectTotal + eventTotal + featureTotal + regulationTotal > 0;
  const hasRiskData = riskDist !== null;
  const hasCrossData = crossStats !== null;

  return (
    <PageContainer>
      {/* ── Hero Banner ── */}
      <Card
        style={{ borderRadius: 14, marginBottom: 24, overflow: 'hidden', border: 'none', boxShadow: '0 4px 24px rgba(15,23,42,0.08)' }}
        styles={{ body: { padding: '28px 36px', background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)' } }}
      >
        <Row align="middle" justify="space-between">
          <Col>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <ThunderboltOutlined style={{ fontSize: 28, color: '#FFC101' }} />
              <Title level={3} style={{ margin: 0, color: '#ffffff', fontWeight: 700 }}>
                WindEye 风瞳
              </Title>
            </div>
            <Text style={{ color: '#94A3B8', fontSize: 14 }}>
              Capital Markets Risk Transmission Monitoring Platform — 基于多层知识图谱的金融风险传导分析
            </Text>
          </Col>
          <Col>
            <Space>
              <Button
                type="primary"
                size="large"
                icon={<MessageOutlined />}
                onClick={() => history.push('/knowledge-qa')}
                style={{ borderRadius: 10, background: 'linear-gradient(135deg, #2855D1 0%, #1A44B5 100%)', border: 'none' }}
              >
                开始分析
              </Button>
              <Button
                size="large"
                icon={<ClusterOutlined />}
                onClick={() => history.push('/knowledge-graph')}
                style={{ borderRadius: 10, color: '#94A3B8', borderColor: '#334155' }}
              >
                浏览图谱
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* ── Phase 6: KPI Row (6 cards with sparklines) ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={4}>
          <KPICard title="图谱节点" value={totalNodes.toLocaleString()} icon={<NodeIndexOutlined />}
            color="#2563EB" suffix="个" loading={summaryLoading}
            trendData={trendRef.current.nodes} trendPct={trendPctRef.current.nodes} />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <KPICard title="高风险主体" value={highRiskCount.toLocaleString()} icon={<AlertOutlined />}
            color="#DC2626" suffix="个" loading={summaryLoading}
            trendData={trendRef.current.highRisk} trendPct={trendPctRef.current.highRisk} />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <KPICard title="关联关系" value={totalRels.toLocaleString()} icon={<RiseOutlined />}
            color="#EA580C" suffix="条" loading={summaryLoading}
            trendData={trendRef.current.rels} trendPct={trendPctRef.current.rels} />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <KPICard title="监控事件" value={eventTotal.toLocaleString()} icon={<ThunderboltOutlined />}
            color="#DC2626" suffix="个" loading={summaryLoading}
            trendData={trendRef.current.events} trendPct={trendPctRef.current.events} />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <KPICard title="法规条目" value={regulationTotal.toLocaleString()} icon={<SafetyCertificateOutlined />}
            color="#7C3AED" suffix="条" loading={summaryLoading}
            trendData={trendRef.current.regulations} trendPct={trendPctRef.current.regulations} />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <KPICard title="治理报告" value={recentReports.length > 0 ? `${recentReports.length}` : '0'} icon={<FileTextOutlined />}
            color="#10B981" suffix="份" loading={summaryLoading}
            trendData={trendRef.current.reports} trendPct={trendPctRef.current.reports} />
        </Col>
      </Row>

      {/* ── Row A: Sankey (wide) ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={14}>
          <Card
            title={<SectionTitle title="跨层风险流转" accentColor="#EA580C" />}
            style={CARD_STYLE}
          >
            {hasCrossData
              ? <ReactECharts option={sankeyOption} style={{ height: 340 }} />
              : chartPlaceholder(summaryLoading, '暂无跨层关系数据', 340)
            }
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <SectionTitle title="高风险主体 Top10" accentColor="#DC2626" />
                <Button size="small" icon={<ReloadOutlined />} onClick={loadAllData} style={{ borderRadius: 8 }}>刷新</Button>
              </div>
            }
            style={CARD_STYLE}
          >
            <Table
              dataSource={highRiskEntities}
              columns={entityColumns}
              rowKey="id"
              size="small"
              loading={summaryLoading}
              pagination={false}
              bordered={false}
              showHeader={true}
              scroll={{ y: 290 }}
              locale={{ emptyText: <Empty description={dataError || '暂无高风险主体'} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              onRow={(_: any, index?: number) => ({
                style: { cursor: 'pointer', background: index !== undefined && index % 2 === 0 ? '#FAFBFC' : '#FFFFFF' },
              })}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Row B: Rose + Risk Donut/Bar + Activity Timeline ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={8}>
          <Card title={<SectionTitle title="四层实体分布" accentColor="#2563EB" />} style={CARD_STYLE}>
            {hasRoseData
              ? <ReactECharts option={roseOption} style={{ height: 320 }} />
              : chartPlaceholder(summaryLoading, '暂无图谱数据', 320)
            }
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={<SectionTitle title="风险等级分布" accentColor="#F59E0B" />} style={CARD_STYLE}>
            <Row gutter={0}>
              <Col span={12}>
                {hasRiskData
                  ? <ReactECharts option={riskDonutOption} style={{ height: 200 }} />
                  : chartPlaceholder(summaryLoading, '', 200)
                }
              </Col>
              <Col span={12}>
                {hasRiskData
                  ? <ReactECharts option={riskBarOption} style={{ height: 200 }} />
                  : chartPlaceholder(summaryLoading, '', 200)
                }
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RiseOutlined style={{ color: '#DC2626' }} />
                <SectionTitle title="近期风险动态" accentColor="#DC2626" />
              </div>
            }
            style={CARD_STYLE}
          >
            <ActivityTimeline reports={recentReports} loading={summaryLoading} />
          </Card>
        </Col>
      </Row>

      {/* ── Row C: Quick Actions ── */}
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title={<SectionTitle title="快捷操作" accentColor="#2563EB" />} style={CARD_STYLE}>
            <Row gutter={[12, 12]}>
              <Col xs={12} sm={8} lg={4}>
                <QuickAction icon={<CloudDownloadOutlined />} title="数据采集" desc="多智能体协同网络爬虫" color="#EA580C" path="/data-collection" />
              </Col>
              <Col xs={12} sm={8} lg={4}>
                <QuickAction icon={<MessageOutlined />} title="协同治理" desc="自然语言查询风险传导路径" color="#2563EB" path="/knowledge-qa" />
              </Col>
              <Col xs={12} sm={8} lg={4}>
                <QuickAction icon={<ClusterOutlined />} title="知识图谱" desc="浏览四层资本市场图谱网络" color="#2563EB" path="/knowledge-graph" />
              </Col>
              <Col xs={12} sm={8} lg={4}>
                <QuickAction icon={<FileTextOutlined />} title="治理报告" desc="结构化风险分析与合规研判" color="#7C3AED" path="/knowledge-qa" />
              </Col>
              <Col xs={12} sm={8} lg={4}>
                <QuickAction icon={<ToolOutlined />} title="图谱构建" desc="ETL流水线与知识图谱构建" color="#10B981" path="/knowledge-build" />
              </Col>
              <Col xs={12} sm={8} lg={4}>
                <QuickAction icon={<AlertOutlined />} title="群体发现" desc="社群检测与中心性分析" color="#DC2626" path="/community-discovery" />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default Welcome;
