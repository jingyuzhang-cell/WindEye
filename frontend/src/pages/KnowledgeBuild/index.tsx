import {
  BuildOutlined,
  CheckCircleOutlined,
  ClearOutlined,
  CloseCircleOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  ExportOutlined,
  FilePdfOutlined,
  InboxOutlined,
  LinkOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  App,
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Radio,
  Row,
  Select,
  Slider,
  Space,
  Statistic,
  Steps,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Upload,
} from 'antd';
const RadioGroup = Radio.Group;
const RadioButton = Radio.Button;
import type { ColumnsType } from 'antd/es/table';
import React, { useEffect, useRef, useState } from 'react';
import {
  EDGE_STYLE_MAP,
  FACTOR_TYPE_MAP,
  IMPORTANCE_MAP,
  RISK_TYPE_MAP,
} from '../graphConfig';
import { useCrawlStore } from '../DataCollection/store/crawlStore';
import { useCrawlSSE } from '../DataCollection/hooks/useCrawlSSE';
import QuickInputPanel from '../DataCollection/components/QuickInputPanel';
import ComplexInputPanel from '../DataCollection/components/ComplexInputPanel';
import TemplatePanel from '../DataCollection/components/TemplatePanel';
import CrawlProgress from '../DataCollection/components/CrawlProgress';
import CrawlResult from '../DataCollection/components/CrawlResult';

const { Dragger } = Upload;

// ─── Types ───────────────────────────────────────────────────────────
type StageName =
  | 'data_import'
  | 'subject_extraction'
  | 'event_extraction'
  | 'feature_extraction'
  | 'regulation_linking'
  | 'kg_import';

type BuildStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

interface StageDef {
  key: StageName;
  title: string;
  icon: React.ReactNode;
  description: string;
}

interface DataSource {
  id: string;
  name: string;
  type: 'pdf' | 'crawl' | 'existing';
  size?: number;
  pages?: number;
  status: 'pending' | 'parsing' | 'done' | 'error';
  recordCount?: number;
}

interface SubjectEntity {
  id: string;
  name: string;
  type: string;
  confidence: number;
  sourceDoc: string;
  properties: Record<string, any>;
}

interface ExtractedEvent {
  id: string;
  title: string;
  eventType: string;
  subjects: string[];
  time: string;
  riskLevel: string;
  description: string;
}

interface RiskFeature {
  id: string;
  name: string;
  featureType: string;
  riskLevel: string;
  relatedSubjects: string[];
  evidence: string;
  confidence: number;
}

interface RegulationMatch {
  id: string;
  regulationName: string;
  article: string;
  articleText: string;
  matchedFeature: string;
  score: number;
  violation: string;
}

interface ImportStats {
  nodes: { subjects: number; events: number; features: number; regulations: number };
  edges: Record<string, number>;
  durationSeconds: number;
  conflicts: number;
}

interface StageLog {
  time: string;
  stage: StageName;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

interface BuildRecord {
  buildId: string;
  createdAt: string;
  dataSource: string;
  status: BuildStatus;
  entityCount: number;
  edgeCount: number;
  duration: number;
}

// ─── Constants ───────────────────────────────────────────────────────
const STAGES: StageDef[] = [
  { key: 'data_import', title: '数据导入', icon: <CloudUploadOutlined />, description: '上传PDF/爬取数据' },
  { key: 'subject_extraction', title: '主体提取', icon: <SearchOutlined />, description: 'NER实体识别' },
  { key: 'event_extraction', title: '事件提取', icon: <ThunderboltOutlined />, description: '事件抽取与时序' },
  { key: 'feature_extraction', title: '风险特征', icon: <ExclamationCircleOutlined />, description: '风险因子提取' },
  { key: 'regulation_linking', title: '法规链接', icon: <LinkOutlined />, description: '法规条款匹配' },
  { key: 'kg_import', title: '图谱导入', icon: <BuildOutlined />, description: 'Neo4j写入' },
];

const CRAWLER_SOURCES = [
  { value: 'risk_event_sse', label: '上交所风险事件', description: '上交所股票交易异常波动/诉讼仲裁/风险警示公告 PDF' },
  { value: 'risk_event_szse', label: '深交所风险事件', description: '深交所自律监管措施公告 PDF' },
  { value: 'risk_event_bse', label: '北交所风险事件', description: '北交所纪律处分公告 PDF' },
  { value: 'risk_sentiment', label: '财经舆情', description: '证券之星财经新闻舆情 TXT 文件' },
];

const NODE_TYPE_COLORS: Record<string, string> = {
  COMPANY: '#FFC101', PERSON: '#1890FF', PFCOMPANY: '#722ED1',
  PFUND: '#008000', SECURITY: '#F5222D', EVENT: '#FF6B6B',
  TIME: '#52C41A', RiskFeature: '#4CAF50', RiskFactor: '#9C27B0',
  Regulation: '#FFC101', Law: '#1890FF', Action: '#45B7D1',
};

// ─── Component ───────────────────────────────────────────────────────
const KnowledgeBuild: React.FC = () => {
  const { message: msg } = App.useApp();

  // Build state
  const [buildStatus, setBuildStatus] = useState<BuildStatus>('idle');
  const [buildId, setBuildId] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<StageName>('data_import');
  const [overallProgress, setOverallProgress] = useState(0);
  const [abortRef] = useState<{ controller: AbortController | null }>({ controller: null });

  // Stage data
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [subjects, setSubjects] = useState<SubjectEntity[]>([]);
  const [events, setEvents] = useState<ExtractedEvent[]>([]);
  const [features, setFeatures] = useState<RiskFeature[]>([]);
  const [regulations, setRegulations] = useState<RegulationMatch[]>([]);
  const [importPreview, setImportPreview] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [importResult, setImportResult] = useState<ImportStats | null>(null);
  const [stageLogs, setStageLogs] = useState<StageLog[]>([]);
  const [buildHistory, setBuildHistory] = useState<BuildRecord[]>([]);

  // UI state
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [selectedCrawlers, setSelectedCrawlers] = useState<string[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scannedFiles, setScannedFiles] = useState<Record<string, { name: string; size: number; size_display: string }[]>>({});
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [running, setRunning] = useState(false);
  const [eventViewMode, setEventViewMode] = useState<'table' | 'timeline'>('table');
  const [selectedEvent, setSelectedEvent] = useState<ExtractedEvent | null>(null);
  const [editingSubject, setEditingSubject] = useState<SubjectEntity | null>(null);
  const [importing, setImporting] = useState(false);
  const [importTab, setImportTab] = useState<'upload' | 'crawl'>('upload');

  // ─── Crawl store / SSE (from DataCollection) ──────────────────────
  const crawlMode = useCrawlStore((s) => s.mode);
  const crawlRunning = useCrawlStore((s) => s.isRunning);
  const crawlResult = useCrawlStore((s) => s.result);
  const crawlDataType = useCrawlStore((s) => s.dataType);
  const crawlSources = useCrawlStore((s) => s.sources);
  const crawlKeywords = useCrawlStore((s) => s.keywords);
  const crawlMaxPages = useCrawlStore((s) => s.maxPages);
  const crawlMaxFiles = useCrawlStore((s) => s.maxFiles);
  const crawlNlQuery = useCrawlStore((s) => s.nlQuery);
  const crawlParsedIntent = useCrawlStore((s) => s.parsedIntent);
  const crawlTemplateId = useCrawlStore((s) => s.templateId);
  const crawlSetMode = useCrawlStore((s) => s.setMode);
  const { startCrawl, cancelCrawl } = useCrawlSSE();

  const handleStartCrawl = () => {
    const payload: any = {
      mode: crawlMode === 'template' ? 'template' : crawlMode === 'complex' ? 'complex' : 'quick',
      data_type: crawlDataType,
      sources: crawlSources.length > 0 ? crawlSources : undefined,
      keywords: crawlKeywords.length > 0 ? crawlKeywords : undefined,
      max_pages: crawlMaxPages,
      max_files: crawlMaxFiles,
    };
    if (crawlMode === 'complex') {
      payload.natural_language_query = crawlNlQuery;
      if (crawlParsedIntent) {
        payload.sources = crawlParsedIntent.sources;
        payload.keywords = crawlParsedIntent.keywords;
        payload.max_pages = crawlParsedIntent.max_pages;
      }
    }
    if (crawlMode === 'template') {
      payload.template_id = crawlTemplateId;
    }
    // Switch right panel to show crawl progress
    setActiveStage('data_import');
    startCrawl(payload);
  };

  // G6 refs
  const graphContainer = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);

  // ─── Stage index helpers ──────────────────────────────────────────
  const stageIndex = STAGES.findIndex((s) => s.key === activeStage);
  const completedStages = STAGES.filter((s) => {
    const idx = STAGES.findIndex((x) => x.key === s.key);
    return idx < stageIndex || (idx === stageIndex && buildStatus === 'completed');
  }).map((s) => s.key);

  // ─── Logging ─────────────────────────────────────────────────────
  const addLog = (stage: StageName, message: string, level: StageLog['level'] = 'info') => {
    const now = new Date().toLocaleTimeString();
    setStageLogs((prev) => [...prev, { time: now, stage, message, level }]);
  };

  const handleScanFiles = async () => {
    if (selectedCrawlers.length === 0) {
      msg.warning('请先选择数据源');
      return;
    }
    setScanLoading(true);
    const results: Record<string, any[]> = {};
    for (const source of selectedCrawlers) {
      try {
        const res = await fetch(`/api/v1/pipeline/files/${source}`);
        const data = await res.json();
        if (data.files) {
          results[source] = data.files;
        }
      } catch {
        results[source] = [];
      }
    }
    setScannedFiles(results);
    setScanLoading(false);
    const total = Object.values(results).reduce((a, b) => a + b.length, 0);
    if (total === 0) {
      msg.info('所选数据源中没有待处理文件');
    } else {
      msg.success(`扫描完成: 共 ${total} 个文件`);
    }
  };

  // ─── Map real pipeline results to rendering state ────────────────────
  const populateStageResults = (stages: Record<string, any>) => {
    // Extract entities from the extract stage
    const extractStage = stages.extract || stages.parse || {};
    const entities: any[] = extractStage.entities || extractStage.records || [];

    const newSubjects: SubjectEntity[] = [];
    const newEvents: ExtractedEvent[] = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < entities.length; i++) {
      const ent = entities[i];
      const name = ent.name || ent.mention || ent.title || `实体_${i}`;
      const entType = ent.type || ent.label || ent.entity_type || 'Unknown';
      const id = ent.id || ent.kg_id || `ent_${i}`;

      if (seenIds.has(id)) continue;
      seenIds.add(id);

      // Classify into subject, event, or feature based on type
      if (entType === 'EVENT' || entType === 'Event' || entType === 'event') {
        newEvents.push({
          id: String(id),
          title: name,
          eventType: ent.event_type || entType,
          subjects: ent.subjects || ent.entities || [],
          time: ent.time || ent.date || '',
          riskLevel: ent.risk_level || (ent.confidence > 0.7 ? 'medium' : 'low'),
          description: ent.description || ent.text || '',
        });
      } else {
        newSubjects.push({
          id: String(id),
          name,
          type: entType,
          confidence: ent.confidence || ent.score || 0.5,
          sourceDoc: ent.source || ent.source_doc || '',
          properties: ent.properties || ent.attributes || {},
        });
      }
    }

    setSubjects(newSubjects);
    setEvents(newEvents);

    // Features and regulations — derive from stats if available
    const featuresList = extractStage.stats?.features || extractStage.features || [];
    const newFeatures: RiskFeature[] = featuresList.map((f: any, i: number) => ({
      id: f.id || `feat_${i}`,
      name: f.name || f.feature_name || `风险特征_${i}`,
      featureType: f.type || f.feature_type || '1',
      riskLevel: f.risk_level || 'medium',
      relatedSubjects: f.subjects || f.entities || [],
      evidence: f.evidence || f.description || '',
      confidence: f.confidence || f.score || 0.7,
    }));
    setFeatures(newFeatures);

    const regsList = extractStage.stats?.regulations || extractStage.regulations || [];
    const newRegs: RegulationMatch[] = regsList.map((r: any, i: number) => ({
      id: r.id || `reg_${i}`,
      regulationName: r.regulation || r.name || '未知法规',
      article: r.article || '',
      articleText: r.text || r.article_text || '',
      matchedFeature: r.matched_feature || '',
      score: r.confidence || r.score || 0.7,
      violation: r.violation || '',
    }));
    setRegulations(newRegs);

    // Import results
    const importStage = stages.import || {};
    if (importStage.records_processed > 0 || importStage.stats) {
      const stats: ImportStats = {
        nodes: {
          subjects: newSubjects.length,
          events: newEvents.length,
          features: newFeatures.length,
          regulations: newRegs.length,
        },
        edges: importStage.stats?.edges || {},
        durationSeconds: 0,
        conflicts: importStage.stats?.conflicts || 0,
      };
      setImportResult(stats);
    }

    const totalEntities = newSubjects.length + newEvents.length + newFeatures.length + newRegs.length;
    if (totalEntities > 0) {
      addLog('kg_import',
        `数据加载完成: ${newSubjects.length} 主体, ${newEvents.length} 事件, ${newFeatures.length} 特征, ${newRegs.length} 法规`,
        'success'
      );
    }
  };

  const handleStartBuild = () => {
    if (uploadedFiles.length === 0 && selectedCrawlers.length === 0) {
      msg.warning('请先上传PDF文件或选择爬虫数据源');
      return;
    }
    handleRunPipeline();
  };

  const handleRunPipeline = async () => {
    if (selectedCrawlers.length === 0) {
      msg.warning('请先选择数据源');
      return;
    }
    const source = selectedCrawlers[0];
    setPipelineRunning(true);
    setBuildStatus('running');
    setRunning(true);
    setStageLogs([]);
    setOverallProgress(0);
    setActiveStage('data_import');
    setSubjects([]);
    setEvents([]);
    setFeatures([]);
    setRegulations([]);
    setImportPreview(null);
    setImportResult(null);
    addLog('data_import', `正在为 ${source} 启动 ETL 流水线...`, 'info');

    const startTime = Date.now();
    let lastStage = '';

    try {
      const res = await fetch(`/api/v1/pipeline/run?source=${encodeURIComponent(source)}`, { method: 'POST' });
      const data = await res.json();
      addLog('data_import', `流水线已触发: ${data.message}`, 'success');
      setOverallProgress(10);

      // Stage name mapping for UI display
      const STAGE_PROGRESS: Record<string, { label: string; pct: number }> = {
        crawl: { label: '数据采集', pct: 15 },
        parse: { label: '文档解析', pct: 25 },
        extract: { label: '实体抽取', pct: 40 },
        link: { label: '实体链接', pct: 55 },
        resolve: { label: '实体消歧', pct: 65 },
        import: { label: '图谱导入', pct: 80 },
        index: { label: '索引构建', pct: 93 },
      };

      // Poll for pipeline status
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/v1/pipeline/status');
          const statusData = await statusRes.json();
          if (statusData.status === 'idle') {
            clearInterval(pollInterval);
            setPipelineRunning(false);
            setRunning(false);
            setBuildStatus('completed');
            setOverallProgress(100);
            setActiveStage('kg_import');
            addLog('kg_import', 'ETL 流水线执行完成', 'success');

            // Fetch real entity data from the pipeline
            try {
              const entitiesRes = await fetch(`/api/v1/pipeline/entities/${encodeURIComponent(source)}`);
              const entitiesData = await entitiesRes.json();
              if (entitiesData.success) {
                const stages = entitiesData.data.stages || {};
                populateStageResults(stages);
              }
            } catch {
              addLog('kg_import', '实体数据获取失败，仅显示统计信息', 'warning');
            }

            const duration = (Date.now() - startTime) / 1000;
            msg.success(`图谱构建完成! 耗时 ${duration.toFixed(1)}s`);

            // Save to history
            const record: BuildRecord = {
              buildId: `build_${Date.now()}`,
              createdAt: new Date().toISOString(),
              dataSource: source,
              status: 'completed',
              entityCount: subjects.length || 0,
              edgeCount: 0,
              duration,
            };
            setBuildHistory((prev) => [record, ...prev]);

            // Refresh scan results
            setScannedFiles({});
          } else if (statusData.current_run) {
            const run = statusData.current_run;
            const stage = run.stage || '';
            if (stage && stage !== lastStage) {
              lastStage = stage;
              const info = STAGE_PROGRESS[stage];
              if (info) {
                setOverallProgress(info.pct);
                setActiveStage(stage as StageName);
                addLog(stage as StageName, `阶段: ${info.label}`, 'info');
              }
            }
            if (run.status === 'failed') {
              clearInterval(pollInterval);
              setPipelineRunning(false);
              setRunning(false);
              setBuildStatus('failed');
              addLog((stage || 'data_import') as StageName, `流水线阶段失败: ${stage}`, 'error');
              msg.error('流水线执行失败');
            }
          }
        } catch {
          // Ignore polling errors
        }
      }, 1500);

      // Safety timeout: stop polling after 10 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (pipelineRunning) {
          setPipelineRunning(false);
          setRunning(false);
          addLog('kg_import', '流水线超时，请检查后端状态', 'warning');
        }
      }, 600000);
    } catch (err: any) {
      setPipelineRunning(false);
      setRunning(false);
      setBuildStatus('failed');
      addLog('data_import', `流水线触发失败: ${err.message}`, 'error');
      msg.error('构建失败: ' + err.message);
    }
  };

  // ── Stage 2-5: Dify extraction API ──────────────────────────────
  const [extracting, setExtracting] = useState<Record<string, boolean>>({});

  const runExtraction = async (stage: StageName) => {
    const source = selectedCrawlers[0];
    if (!source) {
      msg.warning('请先在数据导入中选择数据源');
      return;
    }
    setExtracting((prev) => ({ ...prev, [stage]: true }));
    addLog(stage, `正在调用 Dify 工作流 API (${stage})...`, 'info');
    try {
      const res = await fetch(
        `/api/v1/pipeline/extract/${stage}?source=${encodeURIComponent(source)}`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || '提取失败');
      }
      const nodes = data.nodes || [];
      const edges = data.edges || [];
      addLog(stage, `${stage} 完成: ${nodes.length} 节点, ${edges.length} 关系`, 'success');

      // Map nodes/edges to stage-specific state
      if (stage === 'subject_extraction') {
        const newSubjects: SubjectEntity[] = nodes.map((n: any, i: number) => ({
          id: n.id || `subj_${i}`,
          name: n.label || n.properties?.name || '',
          type: n.type || 'Unknown',
          confidence: n.properties?.confidence || 0.85,
          sourceDoc: source,
          properties: n.properties || {},
        }));
        setSubjects(newSubjects);
      } else if (stage === 'event_extraction') {
        const newEvents: ExtractedEvent[] = nodes.map((n: any, i: number) => ({
          id: n.id || `evt_${i}`,
          title: n.label || n.properties?.title || '',
          eventType: n.type || 'Event',
          subjects: n.properties?.subjects || [],
          time: n.properties?.time || '',
          riskLevel: n.properties?.risk_level || 'medium',
          description: n.properties?.description || '',
        }));
        setEvents(newEvents);
      } else if (stage === 'feature_extraction') {
        const newFeatures: RiskFeature[] = nodes.map((n: any, i: number) => ({
          id: n.id || `feat_${i}`,
          name: n.label || n.properties?.name || '',
          featureType: n.properties?.feature_type || '1',
          riskLevel: n.properties?.risk_level || 'medium',
          relatedSubjects: n.properties?.subjects || [],
          evidence: n.properties?.evidence || '',
          confidence: n.properties?.confidence || 0.7,
        }));
        setFeatures(newFeatures);
      } else if (stage === 'regulation_linking') {
        const newRegs: RegulationMatch[] = nodes.map((n: any, i: number) => ({
          id: n.id || `reg_${i}`,
          regulationName: n.label || n.properties?.name || '',
          article: n.properties?.article || '',
          articleText: n.properties?.article_text || '',
          matchedFeature: n.properties?.matched_feature || '',
          score: n.properties?.score || 0.7,
          violation: n.properties?.violation || '',
        }));
        setRegulations(newRegs);
      }

      // Build G6 preview from all accumulated data
      const allNodes: any[] = [];
      const allEdges: any[] = [];
      for (const n of nodes) {
        allNodes.push({
          id: n.id, label: n.label, color: NODE_TYPE_COLORS[n.type] || '#888',
          type: n.type, properties: n.properties,
        });
      }
      for (const e of edges) {
        allEdges.push({
          id: e.id, source: e.source, target: e.target,
          label: e.label, sourceName: e.sourceName, targetName: e.targetName,
        });
      }
      setImportPreview((prev) => ({
        nodes: [...(prev?.nodes || []), ...allNodes],
        edges: [...(prev?.edges || []), ...allEdges],
      }));

      if (data.cypher_statements > 0) {
        addLog(stage, `生成 ${data.cypher_statements} 条 Cypher 语句`, 'info');
      }
    } catch (err: any) {
      addLog(stage, `提取失败: ${err.message}`, 'error');
      msg.error(`提取失败: ${err.message}`);
    } finally {
      setExtracting((prev) => ({ ...prev, [stage]: false }));
    }
  };

  const handleReset = () => {
    abortRef.controller?.abort();
    setBuildStatus('idle');
    setBuildId(null);
    setActiveStage('data_import');
    setOverallProgress(0);
    setDataSources([]);
    setSubjects([]);
    setEvents([]);
    setFeatures([]);
    setRegulations([]);
    setImportPreview(null);
    setImportResult(null);
    setStageLogs([]);
    setRunning(false);
    setPipelineRunning(false);
    setUploadedFiles([]);
    setSelectedCrawlers([]);
    setScannedFiles({});
    setImportTab('upload');
    useCrawlStore.getState().reset();
    msg.info('已重置');
  };

  // ─── G6 preview for stage 6 ───────────────────────────────────────
  useEffect(() => {
    if (activeStage !== 'kg_import' || !importPreview || !graphContainer.current) return;

    let G6Module: any;
    import('@antv/g6').then((mod) => {
      G6Module = mod.default || mod;
      if (graphRef.current) { graphRef.current.destroy(); graphRef.current = null; }

      const width = graphContainer.current!.clientWidth || 700;
      const height = 450;

      const g6Nodes = importPreview.nodes.map((n: any) => ({
        id: n.id,
        label: n.label?.length > 20 ? n.label.slice(0, 20) + '...' : n.label,
        style: { fill: n.color || '#888', stroke: n.color || '#888' },
        labelCfg: { style: { fill: '#333', fontSize: 10 } },
      }));

      const g6Edges = importPreview.edges.map((e: any) => {
        const key = `${e.sourceLayer ?? 0}-${e.targetLayer ?? 0}`;
        const styleConfig = EDGE_STYLE_MAP[key] || EDGE_STYLE_MAP.default;
        return {
          id: e.id, source: e.source, target: e.target,
          label: e.label,
          style: { stroke: styleConfig.stroke, lineWidth: styleConfig.lineWidth, endArrow: { path: G6Module.Arrow.triangle(6, 8, 0), fill: styleConfig.stroke } },
        };
      });

      const graph = new G6Module.Graph({
        container: graphContainer.current!,
        width, height,
        fitView: true, fitViewPadding: 30,
        layout: { type: 'force', preventOverlap: true, nodeStrength: -300, edgeStrength: 0.2, linkDistance: 120 },
        defaultNode: { size: 35, type: 'circle' },
        defaultEdge: { style: { lineWidth: 1.5 } },
        modes: { default: ['drag-canvas', 'zoom-canvas', 'drag-node'] },
      });

      graph.data({ nodes: g6Nodes, edges: g6Edges });
      graph.render();
      graphRef.current = graph;
    });

    return () => {
      if (graphRef.current) { graphRef.current.destroy(); graphRef.current = null; }
    };
  }, [activeStage, importPreview]);

  // ─── Render: stage stepper ────────────────────────────────────────
  const renderStepper = () => (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Steps
        size="small"
        current={stageIndex}
        status={buildStatus === 'failed' ? 'error' : 'process'}
        items={STAGES.map((s) => ({
          title: s.title,
          description: s.description,
          icon: completedStages.includes(s.key) ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : s.icon,
        }))}
      />
      {buildStatus !== 'idle' && (
        <div style={{ marginTop: 12 }}>
          <Progress percent={overallProgress} status={buildStatus === 'failed' ? 'exception' : buildStatus === 'paused' ? 'normal' : 'active'} size="small" />
        </div>
      )}
    </Card>
  );

  // ─── Render: left panel ───────────────────────────────────────────
  const renderLeftPanel = () => (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {/* Unified Data Import Card */}
      <Card size="small" title="数据导入" style={{ marginBottom: 12 }}>
        <Tabs
          activeKey={importTab}
          onChange={(key) => { setImportTab(key as 'upload' | 'crawl'); }}
          size="small"
          items={[
            {
              key: 'upload',
              label: '文件上传',
              children: (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 13 }}>PDF 文档上传</div>
                    <Dragger
                      multiple
                      accept=".pdf,.docx,.txt"
                      fileList={uploadedFiles}
                      onChange={({ fileList }) => setUploadedFiles(fileList)}
                      beforeUpload={() => false}
                      disabled={running || pipelineRunning}
                      style={{ borderRadius: 8 }}
                    >
                      <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                      <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
                      <p className="ant-upload-hint">支持 PDF、DOCX、TXT 格式</p>
                    </Dragger>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
                      已爬取数据源
                      <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>选择后扫描文件并运行 ETL</Tag>
                    </div>
                    <Select
                      mode="multiple"
                      placeholder="选择数据源..."
                      value={selectedCrawlers}
                      onChange={(vals) => { setSelectedCrawlers(vals); setScannedFiles({}); }}
                      disabled={running || pipelineRunning}
                      style={{ width: '100%' }}
                      options={CRAWLER_SOURCES.map((s) => ({
                        value: s.value,
                        label: (
                          <Tooltip title={s.description}>
                            {s.label}
                          </Tooltip>
                        ),
                      }))}
                    />
                    <div style={{ marginTop: 8 }}>
                      <Button
                        icon={<SearchOutlined />}
                        size="small"
                        loading={scanLoading}
                        onClick={handleScanFiles}
                        disabled={running || pipelineRunning || selectedCrawlers.length === 0}
                      >
                        扫描已爬取文件
                      </Button>
                      {Object.keys(scannedFiles).length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          {Object.entries(scannedFiles).map(([source, files]) => (
                            <div key={source} style={{ marginBottom: 4 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                                {CRAWLER_SOURCES.find((s) => s.value === source)?.label || source}
                                <Tag color="blue" style={{ marginLeft: 6 }}>{files.length} 个文件</Tag>
                              </div>
                              {files.length > 0 && (
                                <div style={{ maxHeight: 100, overflow: 'auto', background: '#f8fafc', borderRadius: 4, padding: '4px 8px' }}>
                                  {files.map((f: any, i: number) => (
                                    <div key={i} style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{f.name}</span>
                                      <span>{f.size_display}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                          <Button
                            danger
                            size="small"
                            icon={<ClearOutlined />}
                            onClick={async () => {
                              for (const source of Object.keys(scannedFiles)) {
                                await fetch(`/api/v1/pipeline/files/${source}`, { method: 'DELETE' });
                              }
                              setScannedFiles({});
                              msg.success('已清空所有文件');
                            }}
                            style={{ marginTop: 4 }}
                          >
                            清空所有文件
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                    {buildStatus === 'idle' && (
                      <>
                        <Button
                          type="primary"
                          icon={<PlayCircleOutlined />}
                          onClick={handleStartBuild}
                          disabled={uploadedFiles.length === 0 && selectedCrawlers.length === 0}
                        >
                          开始构建
                        </Button>
                        {selectedCrawlers.length > 0 && Object.values(scannedFiles).some((f) => f.length > 0) && (
                          <Button
                            type="primary"
                            icon={<ThunderboltOutlined />}
                            onClick={handleRunPipeline}
                            loading={pipelineRunning}
                            style={{ background: '#52c41a', borderColor: '#52c41a' }}
                          >
                            运行 ETL 流水线
                          </Button>
                        )}
                      </>
                    )}
                    {(buildStatus === 'completed' || buildStatus === 'failed') && (
                      <Button icon={<ReloadOutlined />} onClick={handleReset}>重新构建</Button>
                    )}
                    {(buildStatus === 'running' || pipelineRunning) && (
                      <Button danger icon={<CloseCircleOutlined />} onClick={handleReset}>取消</Button>
                    )}
                  </Space>
                </div>
              ),
            },
            {
              key: 'crawl',
              label: '智能采集',
              children: (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <Radio.Group
                      value={crawlMode}
                      onChange={(e) => crawlSetMode(e.target.value)}
                      size="small"
                      optionType="button"
                      buttonStyle="solid"
                    >
                      <Radio.Button value="quick">快速采集</Radio.Button>
                      <Radio.Button value="complex">智能采集</Radio.Button>
                      <Radio.Button value="template">模板采集</Radio.Button>
                    </Radio.Group>
                  </div>

                  {crawlMode === 'quick' && <QuickInputPanel />}
                  {crawlMode === 'complex' && <ComplexInputPanel />}
                  {crawlMode === 'template' && (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                      <TemplatePanel />
                      <div style={{ marginTop: 8, color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>
                        点击模板即可自动填充采集参数
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 16, textAlign: 'right' }}>
                    <Space>
                      {crawlRunning ? (
                        <Button danger size="small" icon={<CloseCircleOutlined />} onClick={cancelCrawl}>
                          取消采集
                        </Button>
                      ) : (
                        <Button
                          type="primary"
                          size="small"
                          icon={<CloudDownloadOutlined />}
                          onClick={handleStartCrawl}
                        >
                          开始采集
                        </Button>
                      )}
                    </Space>
                  </div>

                  {crawlRunning && (
                    <div style={{ marginTop: 8 }}>
                      <Tag color="processing">采集进行中...</Tag>
                    </div>
                  )}
                  {crawlResult && !crawlRunning && (
                    <div style={{ marginTop: 8 }}>
                      <Tag color="success">采集完成</Tag>
                      <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
                        {crawlResult.total_files_downloaded} 文件 · {crawlResult.total_records} 记录 · 质量 {Math.round(crawlResult.quality_score * 100)}%
                      </div>
                      <Button
                        size="small"
                        type="link"
                        onClick={() => {
                          handleScanFiles();
                          setImportTab('upload');
                        }}
                        style={{ marginTop: 4 }}
                      >
                        切换到文件上传，扫描并运行 ETL 流水线 →
                      </Button>
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Pipeline Status Card */}
      {(buildStatus !== 'idle') && (
        <Card size="small" title="流水线状态" style={{ marginBottom: 12 }}>
          <Row gutter={[12, 8]}>
            <Col span={12}>
              <Statistic title="主体实体" value={subjects.length} valueStyle={{ fontSize: 18 }} suffix={<Tag color="#FFC101">个</Tag>} />
            </Col>
            <Col span={12}>
              <Statistic title="事件" value={events.length} valueStyle={{ fontSize: 18 }} suffix={<Tag color="#FF6B6B">个</Tag>} />
            </Col>
            <Col span={12}>
              <Statistic title="风险特征" value={features.length} valueStyle={{ fontSize: 18 }} suffix={<Tag color="#4CAF50">个</Tag>} />
            </Col>
            <Col span={12}>
              <Statistic title="法规匹配" value={regulations.length} valueStyle={{ fontSize: 18 }} suffix={<Tag color="#45B7D1">条</Tag>} />
            </Col>
          </Row>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>执行日志</div>
            <div style={{ maxHeight: 160, overflow: 'auto' }}>
              {stageLogs.slice(-8).reverse().map((log, i) => (
                <div key={i} style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2, fontFamily: 'monospace' }}>
                  <span style={{ color: log.level === 'error' ? '#f5222d' : log.level === 'success' ? '#52c41a' : log.level === 'warning' ? '#faad14' : '#666' }}>
                    [{log.time}] {STAGES.find((s) => s.key === log.stage)?.title}:
                  </span>{' '}
                  {log.message}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Build History */}
      <Card size="small" title="历史构建记录" style={{ marginBottom: 12 }}>
        {buildHistory.length === 0 ? (
          <Empty description="暂无历史记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          buildHistory.slice(0, 5).map((rec) => (
            <div key={rec.buildId} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{rec.buildId}</span>
                <Tag color={rec.status === 'completed' ? 'success' : 'error'}>
                  {rec.status === 'completed' ? '完成' : '失败'}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                {new Date(rec.createdAt).toLocaleString()} | {rec.dataSource} | {rec.entityCount}节点 {rec.edgeCount}关系 | 耗时{rec.duration}s
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );

  // ─── Render: Stage 1 - Data Import ─────────────────────────────────
  const renderDataImport = () => (
    <div>
      {/* Crawl tab results display */}
      {importTab === 'crawl' && (crawlRunning || crawlResult) ? (
        <>
          {crawlRunning && (
            <Card title="采集进度" size="small" style={{ marginBottom: 16 }}>
              <CrawlProgress />
            </Card>
          )}
          {crawlResult && !crawlRunning && (
            <Card title="采集结果" size="small" style={{ marginBottom: 16 }}>
              <CrawlResult />
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <Space>
                  <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    onClick={() => {
                      handleScanFiles();
                      setImportTab('upload');
                    }}
                  >
                    扫描已爬取文件
                  </Button>
                  <Button
                    icon={<CloudUploadOutlined />}
                    onClick={() => setImportTab('upload')}
                  >
                    切换到文件上传
                  </Button>
                </Space>
              </div>
            </Card>
          )}
        </>
      ) : (
        <>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              {importTab === 'crawl' ? '智能采集' : '数据导入结果'}
            </span>
            <Space>
              <Tag color="blue">文档数: {dataSources.length}</Tag>
              <Tag color="green">总页数: {dataSources.reduce((a, b) => a + (b.pages || 0), 0)}</Tag>
              <Tag color="purple">总字符: {dataSources.reduce((a, b) => a + (b.recordCount || 0), 0).toLocaleString()}</Tag>
            </Space>
          </div>

          {dataSources.length === 0 ? (
            pipelineRunning ? (
              <Card size="small" style={{ background: '#f6ffed', border: '1px solid #b7eb8f' }}>
                <div style={{ textAlign: 'center' }}>
                  <LoadingOutlined style={{ fontSize: 32, color: '#52c41a', marginBottom: 12 }} />
                  <div style={{ fontSize: 14, fontWeight: 500 }}>ETL 流水线执行中</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    后端正在执行 parse → extract → link → resolve → import → index 各阶段
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    处理完成后文件将自动清理
                  </div>
                </div>
              </Card>
            ) : (
              <Empty description={importTab === 'crawl' ? '请先在左侧"智能采集"标签页中配置采集参数，然后点击"开始采集"' : '尚未导入数据。请先在左侧上传PDF文件或选择爬虫数据源，然后点击【开始构建】或扫描文件后点击【运行 ETL 流水线】。'}>
                <Space>
                  {importTab === 'crawl' ? (
                    <Button type="primary" icon={<CloudDownloadOutlined />} onClick={() => setImportTab('crawl')}>
                      去智能采集
                    </Button>
                  ) : (
                    <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStartBuild}>开始构建</Button>
                  )}
                </Space>
              </Empty>
            )
          ) : (
            <Table
              dataSource={dataSources}
              rowKey="id"
              size="small"
              pagination={false}
              columns={[
                { title: '文件名', dataIndex: 'name', key: 'name', render: (t: string, r: DataSource) => <Space><FilePdfOutlined style={{ color: '#f5222d' }} />{t}</Space> },
                { title: '类型', dataIndex: 'type', key: 'type', width: 80, render: (t: string) => <Tag>{t === 'pdf' ? 'PDF' : t === 'crawl' ? '爬虫' : '已有'}</Tag> },
                { title: '大小', dataIndex: 'size', key: 'size', width: 100, render: (s: number) => s ? `${(s / 1024 / 1024).toFixed(1)} MB` : '-' },
                { title: '页数', dataIndex: 'pages', key: 'pages', width: 80, render: (p: number) => p ? `${p} 页` : '-' },
                { title: '解析字符', dataIndex: 'recordCount', key: 'recordCount', width: 100, render: (c: number) => c ? c.toLocaleString() : '-' },
                { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (s: string) => {
                  const map: Record<string, { color: string; text: string }> = { pending: { color: 'default', text: '待解析' }, parsing: { color: 'processing', text: '解析中' }, done: { color: 'success', text: '已完成' }, error: { color: 'error', text: '失败' } };
                  return <Tag color={map[s]?.color}>{map[s]?.text || s}</Tag>;
                }},
              ]}
            />
          )}

          {dataSources.length > 0 && (
            <Collapse style={{ marginTop: 12 }} size="small" items={[
              { key: 'preview', label: '文本分段预览', children: dataSources.map((ds) => (
                <div key={ds.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>{ds.name}</div>
                  <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, fontSize: 12, color: '#64748b', maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                    【文档内容预览】文本解析结果，共识别 {ds.recordCount?.toLocaleString()} 个字符。
                  </div>
                </div>
              )),
            }]} />
          )}
        </>
      )}
    </div>
  );

  // ─── Render: Stage 2 - Subject Extraction ─────────────────────────
  const subjectColumns: ColumnsType<SubjectEntity> = [
    { title: '实体名称', dataIndex: 'name', key: 'name', width: 180, ellipsis: true, render: (t: string) => <strong>{t}</strong> },
    { title: '类型', dataIndex: 'type', key: 'type', width: 100, render: (t: string) => <Tag color={NODE_TYPE_COLORS[t] || '#888'}>{t}</Tag> },
    { title: '置信度', dataIndex: 'confidence', key: 'confidence', width: 120, render: (v: number) => <Progress percent={Math.round(v * 100)} size="small" strokeColor={v > 0.9 ? '#52c41a' : v > 0.8 ? '#faad14' : '#f5222d'} /> },
    { title: '来源文档', dataIndex: 'sourceDoc', key: 'sourceDoc', width: 130, ellipsis: true },
    { title: '关键属性', key: 'props', width: 200, ellipsis: true, render: (_: any, r: SubjectEntity) => (
      <Space size={4} wrap>
        {Object.entries(r.properties).slice(0, 2).map(([k, v]) => <Tag key={k} style={{ fontSize: 11 }}>{k}: {String(v).slice(0, 15)}</Tag>)}
        {Object.keys(r.properties).length > 2 && <Tag>...</Tag>}
      </Space>
    )},
    {
      title: '操作', key: 'actions', width: 80,
      render: (_: any, r: SubjectEntity) => (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditingSubject(r)} disabled={running}>修正</Button>
      ),
    },
  ];

  const renderSubjectExtraction = () => (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>主体实体提取结果</span>
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={extracting['subject_extraction']}
            onClick={() => runExtraction('subject_extraction')}
            disabled={selectedCrawlers.length === 0 || pipelineRunning}
          >
            Dify 提取
          </Button>
          <Button size="small" icon={<ExportOutlined />} disabled={subjects.length === 0}>导出CSV</Button>
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="实体总数" value={subjects.length} valueStyle={{ fontSize: 20, color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="COMPANY" value={subjects.filter((s) => s.type === 'COMPANY').length} valueStyle={{ fontSize: 20, color: '#FFC101' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="PERSON" value={subjects.filter((s) => s.type === 'PERSON').length} valueStyle={{ fontSize: 20, color: '#1890FF' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="PFCOMPANY/PFUND" value={subjects.filter((s) => s.type === 'PFCOMPANY' || s.type === 'PFUND').length} valueStyle={{ fontSize: 20, color: '#722ED1' }} /></Card></Col>
      </Row>

      {subjects.length === 0 ? (
        <Empty description={buildStatus === 'idle' ? '请先启动构建流水线' : '提取中...'} />
      ) : (
        <Table dataSource={subjects} columns={subjectColumns} rowKey="id" size="small" expandable={{
          expandedRowRender: (r) => <pre style={{ fontSize: 11, margin: 0, maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(r.properties, null, 2)}</pre>,
        }} />
      )}

      {/* Edit Modal */}
      <Modal title="修正实体" open={!!editingSubject} onCancel={() => setEditingSubject(null)} onOk={() => { msg.success('已保存修正'); setEditingSubject(null); }} okText="保存" cancelText="取消">
        {editingSubject && (
          <Form layout="vertical" size="small">
            <Form.Item label="实体名称"><Input defaultValue={editingSubject.name} /></Form.Item>
            <Form.Item label="实体类型">
              <Select defaultValue={editingSubject.type} options={Object.entries(NODE_TYPE_COLORS).map(([k, v]) => ({ value: k, label: <Tag color={v}>{k}</Tag> }))} />
            </Form.Item>
            <Form.Item label="置信度"><Slider defaultValue={editingSubject.confidence} min={0} max={1} step={0.01} /></Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );

  // ─── Render: Stage 3 - Event Extraction ───────────────────────────
  const renderEventExtraction = () => (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>事件提取结果</span>
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={extracting['event_extraction']}
            onClick={() => runExtraction('event_extraction')}
            disabled={selectedCrawlers.length === 0 || pipelineRunning}
          >
            Dify 提取
          </Button>
          <RadioGroup value={eventViewMode} onChange={(e) => setEventViewMode(e.target.value)} size="small" optionType="button" buttonStyle="solid">
            <RadioButton value="table">表格视图</RadioButton>
            <RadioButton value="timeline">时间线视图</RadioButton>
          </RadioGroup>
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={8}><Card size="small"><Statistic title="事件总数" value={events.length} valueStyle={{ fontSize: 20, color: '#FF6B6B' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="高风险事件" value={events.filter((e) => e.riskLevel === 'high').length} valueStyle={{ fontSize: 20, color: '#f5222d' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="关联主体" value={new Set(events.flatMap((e) => e.subjects)).size} valueStyle={{ fontSize: 20, color: '#1890ff' }} /></Card></Col>
      </Row>

      {events.length === 0 ? (
        <Empty description={buildStatus === 'idle' ? '请先启动构建流水线' : '提取中...'} />
      ) : eventViewMode === 'table' ? (
        <Table dataSource={events} rowKey="id" size="small" columns={[
          { title: '事件标题', dataIndex: 'title', key: 'title', width: 240, ellipsis: true },
          { title: '事件类型', dataIndex: 'eventType', key: 'eventType', width: 100, render: (t: string) => <Tag color={t === '违规风险' ? 'red' : t === '减持风险' ? 'orange' : 'blue'}>{t}</Tag> },
          { title: '涉及主体', dataIndex: 'subjects', key: 'subjects', width: 180, render: (s: string[]) => <Space size={4} wrap>{s.map((n) => <Tag key={n} color="#FFC101">{n.length > 8 ? n.slice(0, 8) + '...' : n}</Tag>)}</Space> },
          { title: '时间', dataIndex: 'time', key: 'time', width: 110 },
          { title: '风险等级', dataIndex: 'riskLevel', key: 'riskLevel', width: 90, render: (l: string) => <Badge status={l === 'high' ? 'error' : 'warning'} text={l === 'high' ? '高' : '中'} /> },
          { title: '操作', key: 'actions', width: 60, render: (_: any, r: ExtractedEvent) => <Button type="link" size="small" onClick={() => setSelectedEvent(r)}>详情</Button> },
        ]} />
      ) : (
        <Timeline
          items={[...events].sort((a, b) => b.time.localeCompare(a.time)).map((e) => ({
            color: e.riskLevel === 'high' ? 'red' : 'orange',
            children: (
              <div>
                <div style={{ fontWeight: 500, cursor: 'pointer' }} onClick={() => setSelectedEvent(e)}>{e.title}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {e.time} | {e.eventType} | 涉及: {e.subjects.join(', ')}
                </div>
              </div>
            ),
          }))}
        />
      )}

      {/* Event Drawer */}
      <Drawer title="事件详情" open={!!selectedEvent} onClose={() => setSelectedEvent(null)} width={500}>
        {selectedEvent && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="事件标题">{selectedEvent.title}</Descriptions.Item>
            <Descriptions.Item label="事件类型"><Tag color={selectedEvent.eventType === '违规风险' ? 'red' : selectedEvent.eventType === '减持风险' ? 'orange' : 'blue'}>{selectedEvent.eventType}</Tag></Descriptions.Item>
            <Descriptions.Item label="发生时间">{selectedEvent.time}</Descriptions.Item>
            <Descriptions.Item label="风险等级"><Badge status={selectedEvent.riskLevel === 'high' ? 'error' : 'warning'} text={selectedEvent.riskLevel === 'high' ? '高风险' : '中风险'} /></Descriptions.Item>
            <Descriptions.Item label="涉及主体">{selectedEvent.subjects.map((s) => <Tag key={s} color="#FFC101">{s}</Tag>)}</Descriptions.Item>
            <Descriptions.Item label="事件描述">{selectedEvent.description}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );

  // ─── Render: Stage 4 - Feature Extraction ─────────────────────────
  const renderFeatureExtraction = () => (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>风险特征提取结果</span>
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={extracting['feature_extraction']}
            onClick={() => runExtraction('feature_extraction')}
            disabled={selectedCrawlers.length === 0 || pipelineRunning}
          >
            Dify 提取
          </Button>
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="特征总数" value={features.length} valueStyle={{ fontSize: 20, color: '#4CAF50' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="财务预警" value={features.filter((f) => f.featureType === '1').length} valueStyle={{ fontSize: 20, color: '#faad14' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="法律诉讼" value={features.filter((f) => f.featureType === '2').length} valueStyle={{ fontSize: 20, color: '#f5222d' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="股权变动" value={features.filter((f) => f.featureType === '3').length} valueStyle={{ fontSize: 20, color: '#1890ff' }} /></Card></Col>
      </Row>

      {features.length === 0 ? (
        <Empty description={buildStatus === 'idle' ? '请先启动构建流水线' : '提取中...'} />
      ) : (
        features.map((f) => (
          <Card key={f.id} size="small" style={{ marginBottom: 12 }} title={
            <Space>
              <ExclamationCircleOutlined style={{ color: f.riskLevel === 'high' ? '#f5222d' : '#faad14' }} />
              <span>{f.name}</span>
              <Tag color={f.featureType === '1' ? 'gold' : f.featureType === '2' ? 'red' : 'blue'}>{FACTOR_TYPE_MAP[f.featureType] || f.featureType}</Tag>
              <Tag color={f.riskLevel === 'high' ? 'error' : 'warning'}>{f.riskLevel === 'high' ? '高风险' : '中风险'}</Tag>
            </Space>
          } extra={
            <Space>
              <Tag>{f.relatedSubjects.length} 个关联主体</Tag>
              <Tag>置信度 {Math.round(f.confidence * 100)}%</Tag>
              <Button size="small" icon={<EditOutlined />} disabled={running}>调整</Button>
            </Space>
          }>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: 500, fontSize: 13 }}>关联主体: </span>
              {f.relatedSubjects.map((s) => <Tag key={s} color="#FFC101">{s}</Tag>)}
            </div>
            <div>
              <span style={{ fontWeight: 500, fontSize: 13 }}>证据片段: </span>
              <span style={{ color: '#64748b', fontSize: 13, background: '#f8fafc', padding: '6px 10px', borderRadius: 4, display: 'inline-block', marginTop: 4 }}>
                {f.evidence.split('').map((c, i) => {
                  const keywords = ['流动性缺口', '担保代偿', '违约', '离职', '处罚', '赎回'];
                  const highlighted = keywords.some((kw) => f.evidence.slice(i, i + kw.length) === kw);
                  if (highlighted) {
                    const kw = keywords.find((kw) => f.evidence.slice(i, i + kw.length) === kw);
                    return <mark key={i} style={{ background: '#FFF2B2', padding: '0 2px' }}>{kw}</mark>;
                  }
                  return null;
                })}
                {f.evidence}
              </span>
            </div>
          </Card>
        ))
      )}
    </div>
  );

  // ─── Render: Stage 5 - Regulation Linking ─────────────────────────
  const renderRegulationLinking = () => (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>法规链接结果</span>
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={extracting['regulation_linking']}
            onClick={() => runExtraction('regulation_linking')}
            disabled={selectedCrawlers.length === 0 || pipelineRunning}
          >
            Dify 提取
          </Button>
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={8}><Card size="small"><Statistic title="匹配法规" value={regulations.length} valueStyle={{ fontSize: 20, color: '#45B7D1' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="匹配条款" value={regulations.length} valueStyle={{ fontSize: 20, color: '#1890ff' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="违规认定" value={regulations.filter((r) => r.violation).length} valueStyle={{ fontSize: 20, color: '#f5222d' }} /></Card></Col>
      </Row>

      {regulations.length === 0 ? (
        <Empty description={buildStatus === 'idle' ? '请先启动构建流水线' : '匹配中...'} />
      ) : (
        <Table dataSource={regulations} rowKey="id" size="small" columns={[
          { title: '法规名称', dataIndex: 'regulationName', key: 'regulationName', width: 140, render: (t: string) => <strong>{t}</strong> },
          { title: '条款', dataIndex: 'article', key: 'article', width: 80, render: (t: string) => <Tag color="blue">{t}</Tag> },
          { title: '条款原文', dataIndex: 'articleText', key: 'articleText', width: 260, ellipsis: true, render: (t: string) => <Tooltip title={t}><span style={{ fontSize: 12 }}>{t.slice(0, 40)}...</span></Tooltip> },
          { title: '匹配特征', dataIndex: 'matchedFeature', key: 'matchedFeature', width: 120, render: (t: string) => <Tag color="green">{t}</Tag> },
          { title: '匹配分数', dataIndex: 'score', key: 'score', width: 120, render: (v: number) => <Progress percent={Math.round(v * 100)} size="small" strokeColor={v > 0.9 ? '#52c41a' : '#faad14'} /> },
          { title: '违规认定', dataIndex: 'violation', key: 'violation', width: 200, ellipsis: true, render: (t: string) => <span style={{ color: '#f5222d', fontSize: 12 }}>{t}</span> },
        ]} />
      )}
    </div>
  );

  // ─── Render: Stage 6 - KG Import ──────────────────────────────────
  const renderKGImport = () => (
    <div>
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>图谱导入</span>
      </div>

      {importResult ? (
        <>
          <Card size="small" style={{ marginBottom: 12, background: '#f6ffed', border: '1px solid #b7eb8f' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#52c41a' }}>导入完成</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  共导入 {importResult.nodes.subjects + importResult.nodes.events + importResult.nodes.features + importResult.nodes.regulations} 个节点, {Object.values(importResult.edges).reduce((a, b) => a + b, 0)} 条关系，耗时 {importResult.durationSeconds} 秒
                </div>
              </div>
            </div>
          </Card>

          <Row gutter={12} style={{ marginBottom: 12 }}>
            <Col span={12}>
              <Card size="small" title="节点统计">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="主体节点">{importResult.nodes.subjects} 个</Descriptions.Item>
                  <Descriptions.Item label="事件节点">{importResult.nodes.events} 个</Descriptions.Item>
                  <Descriptions.Item label="特征节点">{importResult.nodes.features} 个</Descriptions.Item>
                  <Descriptions.Item label="法规节点">{importResult.nodes.regulations} 个</Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title="关系统计">
                <Descriptions column={1} size="small">
                  {Object.entries(importResult.edges).map(([k, v]) => (
                    <Descriptions.Item key={k} label={k}>{v} 条</Descriptions.Item>
                  ))}
                </Descriptions>
              </Card>
            </Col>
          </Row>
        </>
      ) : (
        <div>
          {!importPreview ? (
            <Empty description={buildStatus === 'idle' ? '请先启动构建流水线' : '预览生成中...'} />
          ) : (
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Tag color="blue">待导入节点: {importPreview.nodes.length}</Tag>
                <Tag color="green">待导入关系: {importPreview.edges.length}</Tag>
              </Space>
            </div>
          )}
        </div>
      )}

      {/* G6 Preview */}
      <Card size="small" title="图谱预览" style={{ marginBottom: 12 }}
        extra={
          importPreview && !importResult && (
            <Space>
              <Button type="primary" size="small" icon={<BuildOutlined />} loading={importing} onClick={async () => {
                if (!importPreview) return;
                const source = selectedCrawlers[0];
                if (!source) {
                  msg.warning('请先在数据导入中选择数据源');
                  return;
                }
                setImporting(true);
                addLog('kg_import', '正在导入图谱到 Neo4j...', 'info');
                const startTime = Date.now();
                try {
                  const res = await fetch(
                    `/api/v1/pipeline/dify/import?source=${encodeURIComponent(source)}&dry_run=false`,
                    { method: 'POST' },
                  );
                  const data = await res.json();
                  if (!data.success && !data.nodes) {
                    throw new Error(data.detail || '导入失败');
                  }
                  const durationSeconds = (Date.now() - startTime) / 1000;
                  const stats: ImportStats = {
                    nodes: { subjects: subjects.length, events: events.length, features: features.length, regulations: regulations.length },
                    edges: { INVOLVES: events.length, REFLECTS: features.length, COMPLIES_WITH: regulations.length },
                    durationSeconds,
                    conflicts: 0,
                  };
                  setImportResult(stats);
                  setOverallProgress(100);
                  setBuildStatus('completed');
                  addLog('kg_import', `图谱导入完成! ${data.nodes || stats.nodes.subjects + stats.nodes.events + stats.nodes.features + stats.nodes.regulations} 节点, ${data.edges || 0} 关系, 耗时 ${durationSeconds.toFixed(1)}s`, 'success');
                  msg.success('图谱已成功导入 Neo4j!');

                  const record: BuildRecord = {
                    buildId: buildId || `build_${Date.now()}`,
                    createdAt: new Date().toISOString(),
                    dataSource: source,
                    status: 'completed',
                    entityCount: stats.nodes.subjects + stats.nodes.events + stats.nodes.features + stats.nodes.regulations,
                    edgeCount: Object.values(stats.edges).reduce((a, b) => a + b, 0),
                    duration: durationSeconds,
                  };
                  setBuildHistory((prev) => [record, ...prev]);
                } catch (err: any) {
                  addLog('kg_import', `导入失败: ${err.message}`, 'error');
                  msg.error(`导入失败: ${err.message}`);
                } finally {
                  setImporting(false);
                }
              }}>
                确认导入
              </Button>
            </Space>
          )
        }
      >
        <div ref={graphContainer} style={{ width: '100%', height: 400, background: '#fafafa', borderRadius: 8 }} />
      </Card>
    </div>
  );

  // ─── Stage router ──────────────────────────────────────────────────
  const renderStageContent = () => {
    switch (activeStage) {
      case 'data_import': return renderDataImport();
      case 'subject_extraction': return renderSubjectExtraction();
      case 'event_extraction': return renderEventExtraction();
      case 'feature_extraction': return renderFeatureExtraction();
      case 'regulation_linking': return renderRegulationLinking();
      case 'kg_import': return renderKGImport();
      default: return <Empty description="未知阶段" />;
    }
  };

  // ─── Main render ───────────────────────────────────────────────────
  return (
    <PageContainer>
      {renderStepper()}

      <Row gutter={16} style={{ height: 'calc(100vh - 240px)' }}>
        {/* Left Panel */}
        <Col span={7} style={{ height: '100%' }}>
          {renderLeftPanel()}
        </Col>

        {/* Right Panel */}
        <Col span={17} style={{ height: '100%', overflow: 'auto' }}>
          <Card
            size="small"
            title={
              <Space>
                {STAGES.find((s) => s.key === activeStage)?.icon}
                <span>{STAGES.find((s) => s.key === activeStage)?.title} - {STAGES.find((s) => s.key === activeStage)?.description}</span>
                {running && activeStage === STAGES[stageIndex]?.key && <LoadingOutlined spin />}
              </Space>
            }
            extra={
              <Space>
                {buildStatus === 'idle' && (
                  <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={handleStartBuild} disabled={uploadedFiles.length === 0 && selectedCrawlers.length === 0}>
                    开始构建
                  </Button>
                )}
                {(buildStatus === 'running' || pipelineRunning) && (
                  <Button danger size="small" icon={<CloseCircleOutlined />} onClick={handleReset}>取消</Button>
                )}
                <Button size="small" onClick={() => {
                  const idx = STAGES.findIndex((s) => s.key === activeStage);
                  if (idx > 0) setActiveStage(STAGES[idx - 1].key);
                }} disabled={stageIndex === 0 || running || pipelineRunning}>上一阶段</Button>
                <Button size="small" onClick={() => {
                  const idx = STAGES.findIndex((s) => s.key === activeStage);
                  if (idx < STAGES.length - 1) setActiveStage(STAGES[idx + 1].key);
                }} disabled={stageIndex === STAGES.length - 1 || running || pipelineRunning}>下一阶段</Button>
              </Space>
            }
            style={{ height: '100%' }}
            bodyStyle={{ height: 'calc(100% - 48px)', overflow: 'auto' }}
          >
            {renderStageContent()}
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default KnowledgeBuild;
