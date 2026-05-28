import {
  ThunderboltOutlined,
  BulbOutlined,
  SafetyOutlined,
  FileTextOutlined,
  ReloadOutlined,
  HistoryOutlined,
  LinkOutlined,
  EyeOutlined,
  PlusOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileMarkdownOutlined,
  RiseOutlined,
  FallOutlined,
  MinusOutlined,
  LoadingOutlined,
  TeamOutlined,
  ClusterOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Collapse,
  Drawer,
  Empty,
  List,
  Progress,
  Space,
  Spin,
  Statistic,
  Steps,
  Tag,
  Typography,
  App,
  Tooltip,
  Row,
  Col,
} from 'antd';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import EventBarChart from './charts/EventBarChart';
import type { RiskReport, RiskStage, CommunityResult, ReportHistoryItem } from '../types/api';

const { Title, Text, Paragraph } = Typography;

const RISK_LEVEL_COLORS: Record<string, string> = {
  high: '#f5222d',
  medium: '#fa8c16',
  low: '#52c41a',
};

const RISK_LEVEL_BG: Record<string, string> = {
  high: 'rgba(245, 34, 45, 0.1)',
  medium: 'rgba(250, 140, 22, 0.1)',
  low: 'rgba(82, 196, 26, 0.1)',
};

const RISK_LEVEL_LABELS: Record<string, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
};

const URGENCY_TAGS: Record<string, { color: string; label: string }> = {
  urgent: { color: '#f5222d', label: '紧急' },
  normal: { color: '#fa8c16', label: '一般' },
  low: { color: '#52c41a', label: '低' },
};

const STAGE_LABELS: Record<string, string> = {
  planning: '任务规划',
  retrieving: '图谱检索',
  entity_stats: '实体统计',
  community: '群体发现',
  analyzing: '风险分析',
  compliance: '合规匹配',
  reporting: '报告生成',
};

function computeRiskScore(riskPaths: RiskReport['risk_paths']): number {
  if (!riskPaths || riskPaths.length === 0) return 0;
  const weights = { high: 3, medium: 2, low: 1 };
  let totalWeight = 0;
  let maxWeight = 0;
  for (const p of riskPaths) {
    const w = weights[p.risk_level] || 1;
    totalWeight += w;
    maxWeight += 3;
  }
  return Math.round((totalWeight / maxWeight) * 100);
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
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
  onJumpToGraph?: (entityId: string, entityName: string, entityType: string) => void;
  onAddMonitor?: (entityName: string, entityType: string) => void;
  onGenerateTicket?: (recommendation: { action: string; department: string; urgency: string }) => void;
  queryText?: string;
}

const RiskReportPanel: React.FC<RiskReportPanelProps> = ({
  report,
  stages,
  community,
  isLoading,
  error,
  onRetry,
  onJumpToGraph,
  onAddMonitor,
  onGenerateTicket,
  queryText,
}) => {
  const { message } = App.useApp();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyReports, setHistoryReports] = useState<ReportHistoryItem[]>([]);
  const [showAllPaths, setShowAllPaths] = useState(false);
  const [highlightSection, setHighlightSection] = useState<string | null>(null);
  const finalReportRef = useRef<HTMLDivElement>(null);

  const reportId = report?.report_id || generateReportId(report?.generated_at);

  const riskScore = useMemo(
    () => (report ? computeRiskScore(report.risk_paths) : 0),
    [report]
  );

  // Auto-scroll to final report when report loads
  useEffect(() => {
    if (report && finalReportRef.current) {
      const timer = setTimeout(() => {
        finalReportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setHighlightSection('final-report');
        setTimeout(() => setHighlightSection(null), 2000);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [report?.report_id]);

  const { highCount, mediumCount, lowCount, sortedEntities, entityTypeData } = useMemo(() => {
    if (!report) {
      return { highCount: 0, mediumCount: 0, lowCount: 0, sortedEntities: [], entityTypeData: [] };
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

    const typeCountMap = new Map<string, number>();
    if (report.raw_data) {
      for (const row of report.raw_data) {
        const t = row.type || row.entity_type || 'Unknown';
        typeCountMap.set(t, (typeCountMap.get(t) || 0) + 1);
      }
    }
    const typeData = Array.from(typeCountMap.entries())
      .map(([name, count], idx) => ({
        name,
        count,
        color: ['#1890ff', '#52c41a', '#fa8c16', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96'][idx % 7],
      }))
      .sort((a, b) => b.count - a.count);

    return { highCount: high, mediumCount: medium, lowCount: low, sortedEntities: sorted, entityTypeData: typeData };
  }, [report]);

  const stageOrder: RiskStage['stage'][] = ['planning', 'retrieving', 'entity_stats', 'community', 'analyzing', 'compliance', 'reporting'];
  const completedStages = new Set(stages.map((s) => s.stage));
  const currentStageIdx = stageOrder.findIndex((s) => !completedStages.has(s));
  const activeStep = currentStageIdx >= 0 ? currentStageIdx : stageOrder.length;

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
    const header = `# WindEye 风险分析报告\n\n**报告编号**: ${reportId}\n**生成时间**: ${formatTimestamp(report.generated_at)}\n**查询**: ${queryText || report.query_summary || '-'}\n\n---\n\n`;
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

  const handleExportWord = () => {
    if (!report?.markdown_report) return;
    let html = report.markdown_report
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');
    html = `<html><head><meta charset="utf-8"><style>body{font-family:'Microsoft YaHei',sans-serif;max-width:800px;margin:40px auto;line-height:1.8;color:#333}h1{color:#1a1a2e;border-bottom:2px solid #2855D1;padding-bottom:8px}h2{color:#2855D1}h3{color:#475569}li{margin:4px 0}</style></head><body><h1>WindEye 风险分析报告</h1><p><strong>报告编号:</strong> ${reportId}<br/><strong>生成时间:</strong> ${formatTimestamp(report.generated_at)}<br/><strong>查询:</strong> ${queryText || report.query_summary || '-'}</p><hr/><p>${html}</p></body></html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportId}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scrollToSection = (key: string) => {
    const el = document.getElementById(`risk-section-${key}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Empty state ──
  if (!report && !isLoading && stages.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <Text style={{ color: '#475569', fontSize: 14, display: 'block' }}>
                输入风险相关问题，生成风险分析报告
              </Text>
              <Text style={{ color: '#94A3B8', fontSize: 12 }}>
                任务规划 → 图谱检索 → 实体统计 → 群体发现 → 风险分析 → 合规匹配 → 报告生成
              </Text>
            </div>
          }
        />
      </div>
    );
  }

  const sortedPaths = useMemo(() => {
    if (!report?.risk_paths) return [];
    const order = { high: 0, medium: 1, low: 2 };
    return [...report.risk_paths].sort(
      (a, b) => (order[a.risk_level] ?? 3) - (order[b.risk_level] ?? 3)
    );
  }, [report]);

  const sortedRecommendations = useMemo(() => {
    if (!report?.recommendations) return [];
    const order = { urgent: 0, normal: 1, low: 2 };
    return [...report.recommendations].sort(
      (a, b) => (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3)
    );
  }, [report]);

  const displayedPaths = showAllPaths ? sortedPaths : sortedPaths.slice(0, 5);

  // Entity stats from new API (entity_stats) or fallback from subgraph_summary
  const entityStats = report?.entity_stats;
  const totalEntities = entityStats?.total_entities || report?.subgraph_summary?.node_count || 0;
  const entityTypeCounts = entityStats?.entity_type_counts || {};
  const topEntities = entityStats?.top_entities || [];

  // Community info from new API (community_info) or fallback from community prop
  const communityInfo = report?.community_info;
  const communities = communityInfo?.communities || community?.communities || [];

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
        {/* ── Progress indicator ── */}
        {isLoading && stages.length > 0 && (
          <Card size="small" style={{ borderRadius: 8 }} className="no-print">
            <Steps
              size="small"
              current={activeStep}
              status={error ? 'error' : 'process'}
              items={stageOrder.map((key) => ({
                title: STAGE_LABELS[key as keyof typeof STAGE_LABELS] || key,
              }))}
            />
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {stages[stages.length - 1]?.content || '初始化中...'}
              </Text>
            </div>
          </Card>
        )}

        {/* ── Loading state ── */}
        {isLoading && !report && stages.length === 0 && (
          <Card style={{ borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div style={{ textAlign: 'center' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16, color: '#94a3b8', fontSize: 14 }}>
                正在初始化风险分析流程...
              </div>
            </div>
          </Card>
        )}

        {/* ── Error state ── */}
        {error && !report && (
          <Card style={{ borderRadius: 8 }}>
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Text type="danger" style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>
                风险分析失败: {error}
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
                      风险分析报告
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
              {/* Key metrics row */}
              <Row gutter={12} style={{ marginTop: 12 }}>
                <Col span={6}>
                  <Statistic title="实体总数" value={totalEntities} valueStyle={{ fontSize: 18, fontWeight: 700 }} />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="风险路径"
                    value={report.risk_paths?.length || 0}
                    valueStyle={{ fontSize: 18, fontWeight: 700, color: RISK_LEVEL_COLORS[report.overall_risk_level] }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic title="异常发现" value={report.anomaly_findings?.length || 0} valueStyle={{ fontSize: 18, fontWeight: 700 }} />
                </Col>
                <Col span={6}>
                  <Statistic title="合规匹配" value={report.compliance_matches?.length || 0} valueStyle={{ fontSize: 18, fontWeight: 700 }} />
                </Col>
              </Row>
            </Card>

            {/* ═══ Section 1: 实体统计 ═══ */}
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
                    实体统计
                    <Tag style={{ marginLeft: 8, fontSize: 10 }}>{totalEntities} 个实体</Tag>
                  </span>
                }
              >
                {Object.keys(entityTypeCounts).length > 0 ? (
                  <>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>实体类型分布</Text>
                    <EventBarChart
                      data={Object.entries(entityTypeCounts).map(([name, count], idx) => ({
                        name,
                        count,
                        color: ['#1890ff', '#52c41a', '#fa8c16', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96'][idx % 7],
                      }))}
                    />
                  </>
                ) : entityTypeData.length > 0 ? (
                  <>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>实体类型分布</Text>
                    <EventBarChart data={entityTypeData} />
                  </>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>暂无实体类型统计数据</Text>
                )}

                {topEntities.length > 0 && (
                  <>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12, marginBottom: 4 }}>前 {topEntities.length} 个实体</Text>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {topEntities.map((e, i) => (
                        <Tag
                          key={i}
                          style={{ fontSize: 11, borderRadius: 6, cursor: onJumpToGraph ? 'pointer' : 'default' }}
                          onClick={() => onJumpToGraph?.(e.id || e.name, e.name, e.type)}
                        >
                          {onJumpToGraph ? <LinkOutlined style={{ marginRight: 4, fontSize: 10 }} /> : null}
                          {e.name}
                          <span style={{ color: '#94a3b8', marginLeft: 4, fontSize: 10 }}>({e.type})</span>
                        </Tag>
                      ))}
                    </div>
                  </>
                )}

                {sortedEntities.length > 0 && topEntities.length === 0 && (
                  <List
                    size="small"
                    header={<Text type="secondary" style={{ fontSize: 11 }}>相关实体（前 10）</Text>}
                    dataSource={sortedEntities}
                    renderItem={([name, { count }]) => (
                      <List.Item
                        style={{ padding: '2px 0', cursor: onJumpToGraph ? 'pointer' : 'default' }}
                        onClick={() => onJumpToGraph?.(name, name, 'Entity')}
                      >
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 12 }} ellipsis>
                            {onJumpToGraph ? <LinkOutlined style={{ marginRight: 4, fontSize: 10 }} /> : null}
                            {name}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 10 }}>{count}x</Text>
                        </Space>
                      </List.Item>
                    )}
                  />
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
                {communities.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {communities.map((comm) => (
                      <div
                        key={comm.community_id}
                        style={{
                          padding: '10px 14px',
                          background: '#faf5ff',
                          borderRadius: 8,
                          border: '1px solid #f3e8ff',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <Text strong style={{ fontSize: 13, color: '#722ed1' }}>
                            群体 #{comm.community_id}
                          </Text>
                          <Tag color="purple" style={{ borderRadius: 4, fontSize: 10, margin: 0 }}>
                            {comm.size} 个成员
                          </Tag>
                          {comm.modularity !== undefined && comm.modularity !== null && (
                            <Tag style={{ fontSize: 10, borderRadius: 4, margin: 0, background: '#f0f5ff', border: '1px solid #d6e4ff', color: '#2855D1' }}>
                              模块度: {comm.modularity.toFixed(3)}
                            </Tag>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {comm.members?.slice(0, 15).map((m, i) => (
                            <Tag
                              key={i}
                              style={{ fontSize: 10, borderRadius: 6, cursor: onJumpToGraph ? 'pointer' : 'default' }}
                              onClick={() => onJumpToGraph?.(m.id, m.name, m.type)}
                            >
                              {onJumpToGraph ? <LinkOutlined style={{ marginRight: 2, fontSize: 10 }} /> : null}
                              {m.name}
                            </Tag>
                          ))}
                          {comm.members && comm.members.length > 15 && (
                            <Text type="secondary" style={{ fontSize: 10 }}>
                              +{comm.members.length - 15} 更多
                            </Text>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    当前子图规模较小，未检测到明显群体结构
                  </Text>
                )}
                {communityInfo?.algorithm && (
                  <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 8 }}>
                    算法: {communityInfo.algorithm}
                  </Text>
                )}
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
                        <Text style={{ fontSize: 12, color: '#475569' }}>{path.path_description}</Text>
                        {path.affected_entities && path.affected_entities.length > 0 && (
                          <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {path.affected_entities.slice(0, 8).map((e) => (
                              <Tag
                                key={e}
                                style={{ fontSize: 10, borderRadius: 4, cursor: onJumpToGraph ? 'pointer' : 'default' }}
                                onClick={() => onJumpToGraph?.(e, e, 'Entity')}
                              >
                                {e}
                              </Tag>
                            ))}
                            {path.affected_entities.length > 8 && (
                              <Text type="secondary" style={{ fontSize: 10 }}>+{path.affected_entities.length - 8} 更多</Text>
                            )}
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
                  <Text type="secondary" style={{ fontSize: 12 }}>未检测到风险传导路径</Text>
                </Card>
              )}
            </div>

            {/* ═══ Section 4: 综合风险报告 (default collapsed) ═══ */}
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
                    综合风险报告
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
                {/* Executive Summary */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <Title level={5} style={{ margin: '0 0 8px', fontSize: 15 }}>
                      <ThunderboltOutlined style={{ marginRight: 8, color: '#FFC101' }} />
                      执行摘要
                    </Title>
                    <Paragraph
                      ellipsis={{ rows: 3, expandable: true }}
                      style={{ color: '#475569', fontSize: 13, marginBottom: 0 }}
                    >
                      {report.executive_summary}
                    </Paragraph>
                  </div>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div
                      style={{
                        display: 'inline-block',
                        padding: '10px 20px',
                        borderRadius: 12,
                        background: RISK_LEVEL_BG[report.overall_risk_level] || RISK_LEVEL_BG.medium,
                        border: `2px solid ${RISK_LEVEL_COLORS[report.overall_risk_level] || RISK_LEVEL_COLORS.medium}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 28,
                          fontWeight: 800,
                          color: RISK_LEVEL_COLORS[report.overall_risk_level] || RISK_LEVEL_COLORS.medium,
                          lineHeight: 1,
                        }}
                      >
                        {RISK_LEVEL_LABELS[report.overall_risk_level] || '中风险'}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginTop: 4 }}>
                        {riskScore}
                        <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>/100</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Anomaly Findings */}
                {report.anomaly_findings && report.anomaly_findings.length > 0 && (
                  <Collapse
                    size="small"
                    ghost
                    style={{ marginBottom: 8 }}
                    items={[{
                      key: 'anomalies',
                      label: (
                        <span style={{ fontSize: 12 }}>
                          <BulbOutlined style={{ marginRight: 6, color: '#FF8C00' }} />
                          异常发现 ({report.anomaly_findings.length})
                        </span>
                      ),
                      children: (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {report.anomaly_findings.map((anomaly, idx) => (
                            <div key={idx} style={{ padding: '8px 12px', background: '#fffbeb', borderRadius: 6, border: '1px solid #fef3c7' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                <Text strong style={{ fontSize: 12 }}>{anomaly.anomaly_type}</Text>
                                <Progress
                                  percent={Math.round((anomaly.confidence || 0) * 100)}
                                  size="small"
                                  style={{ width: 100, margin: 0 }}
                                  strokeColor={(anomaly.confidence || 0) > 0.8 ? '#52c41a' : (anomaly.confidence || 0) > 0.5 ? '#fa8c16' : '#f5222d'}
                                />
                              </div>
                              <Text style={{ fontSize: 11, color: '#64748b', display: 'block' }}>{anomaly.evidence}</Text>
                              {anomaly.affected_entities && anomaly.affected_entities.length > 0 && (
                                <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  <Text type="secondary" style={{ fontSize: 10 }}>涉及: </Text>
                                  {anomaly.affected_entities.map((e) => (
                                    <Tag key={e} style={{ fontSize: 10, borderRadius: 4, cursor: onJumpToGraph ? 'pointer' : 'default' }} onClick={() => onJumpToGraph?.(e, e, 'Entity')}>
                                      {e}
                                    </Tag>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ),
                    }]}
                  />
                )}

                {/* Compliance Matches */}
                {report.compliance_matches && report.compliance_matches.length > 0 && (
                  <Collapse
                    size="small"
                    ghost
                    style={{ marginBottom: 8 }}
                    items={[{
                      key: 'compliance',
                      label: (
                        <span style={{ fontSize: 12 }}>
                          <SafetyOutlined style={{ marginRight: 6, color: '#722ed1' }} />
                          合规匹配 ({report.compliance_matches.length})
                        </span>
                      ),
                      children: (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {report.compliance_matches.map((match, idx) => (
                            <div key={idx} style={{ padding: '8px 12px', background: '#faf5ff', borderRadius: 6, border: '1px solid #f3e8ff' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                                <Text strong style={{ fontSize: 12 }}>{match.regulation}</Text>
                                {match.article && <Tag color="purple" style={{ fontSize: 10, borderRadius: 4, margin: 0 }}>{match.article}</Tag>}
                                {match.confidence !== undefined && (
                                  <Tag style={{ fontSize: 10, borderRadius: 4, margin: 0, background: '#f0f5ff', border: '1px solid #d6e4ff', color: '#2855D1' }}>
                                    {(match.confidence * 100).toFixed(0)}%
                                  </Tag>
                                )}
                                <Tag color="#722ed1" style={{ fontSize: 10, borderRadius: 4, margin: 0 }}>{match.suggested_action}</Tag>
                              </div>
                              <Text style={{ fontSize: 11, color: '#64748b', display: 'block' }}>{match.violation}</Text>
                            </div>
                          ))}
                        </div>
                      ),
                    }]}
                  />
                )}

                {/* Full Markdown Report */}
                {report.integrated_report || report.markdown_report ? (
                  <div className="markdown-report" style={{ fontSize: 13, lineHeight: 1.7, color: '#334155', marginTop: 12, padding: '12px 16px', background: '#f8fafc', borderRadius: 8 }}>
                    <ReactMarkdown>{report.integrated_report || report.markdown_report}</ReactMarkdown>
                  </div>
                ) : null}

                {/* Recommendations */}
                {sortedRecommendations.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>建议措施</Text>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {sortedRecommendations.map((rec, idx) => {
                        const urgency = URGENCY_TAGS[rec.urgency] || URGENCY_TAGS.normal;
                        const trendIcon = rec.urgency === 'urgent' ? <RiseOutlined /> : rec.urgency === 'low' ? <FallOutlined /> : <MinusOutlined />;
                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 8,
                              padding: '8px 12px',
                              background: rec.urgency === 'urgent' ? '#fff2f0' : '#f8fafc',
                              borderRadius: 6,
                              border: rec.urgency === 'urgent' ? '1px solid #ffccc7' : '1px solid transparent',
                            }}
                          >
                            <span style={{ fontSize: 18, fontWeight: 700, color: urgency.color, minWidth: 24, textAlign: 'center', lineHeight: 1.2 }}>
                              {idx + 1}
                            </span>
                            <div style={{ flex: 1 }}>
                              <Text strong style={{ fontSize: 12 }}>{rec.action}</Text>
                              <Text style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>{rec.reasoning}</Text>
                              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <Tag color={urgency.color} style={{ borderRadius: 4, fontSize: 10, margin: 0 }}>
                                  {trendIcon} {urgency.label}
                                </Tag>
                                <Tag style={{ borderRadius: 4, fontSize: 10, margin: 0 }}>{rec.department}</Tag>
                              </div>
                            </div>
                            <Space size={4} className="no-print">
                              {onAddMonitor && (
                                <Tooltip title="加入监控">
                                  <Button size="small" type="primary" ghost icon={<PlusOutlined />} style={{ fontSize: 10, height: 24, padding: '0 8px' }} onClick={() => onAddMonitor(rec.action, rec.department)}>
                                    监控
                                  </Button>
                                </Tooltip>
                              )}
                              {onGenerateTicket && (
                                <Tooltip title="生成工单">
                                  <Button size="small" icon={<FileTextOutlined />} style={{ fontSize: 10, height: 24, padding: '0 8px' }} onClick={() => onGenerateTicket(rec)}>
                                    工单
                                  </Button>
                                </Tooltip>
                              )}
                            </Space>
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

        {/* ═══ Quick-jump toolbar (fixed right side) ═══ */}
        {report && (
          <div
            className="no-print"
            style={{
              position: 'fixed',
              right: 24,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              zIndex: 100,
              background: 'rgba(255,255,255,0.95)',
              borderRadius: 10,
              padding: '6px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
              border: '1px solid #e2e8f0',
            }}
          >
            <Tooltip title="实体统计" placement="left">
              <Button
                size="small"
                type="text"
                icon={<TeamOutlined />}
                onClick={() => scrollToSection('entity-stats')}
                style={{ color: '#2855D1' }}
              />
            </Tooltip>
            <Tooltip title="群体发现" placement="left">
              <Button
                size="small"
                type="text"
                icon={<ClusterOutlined />}
                onClick={() => scrollToSection('community')}
                style={{ color: '#722ed1' }}
              />
            </Tooltip>
            <Tooltip title="风险传导路径" placement="left">
              <Button
                size="small"
                type="text"
                icon={<NodeIndexOutlined />}
                onClick={() => scrollToSection('risk-paths')}
                style={{ color: '#f5222d' }}
              />
            </Tooltip>
            <Tooltip title="综合风险报告" placement="left">
              <Button
                size="small"
                type="text"
                icon={<FileTextOutlined />}
                onClick={() => scrollToSection('final-report')}
                style={{ color: '#1e293b' }}
              />
            </Tooltip>
          </div>
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
