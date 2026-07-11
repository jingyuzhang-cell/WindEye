import {
  BuildOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FilePdfOutlined,
  InboxOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import G6 from '@antv/g6';
import {
  App,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Drawer,
  Empty,
  Progress,
  Radio,
  Row,
  Select,
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
import React, { useEffect, useRef, useState } from 'react';
import {
  EDGE_STYLE_MAP,
  FACTOR_TYPE_MAP,
} from '../graphConfig';
import { useCrawlStore } from '../DataCollection/store/crawlStore';
import { useCrawlSSE } from '../DataCollection/hooks/useCrawlSSE';
import QuickInputPanel from '../DataCollection/components/QuickInputPanel';
import CrawlProgress from '../DataCollection/components/CrawlProgress';
import CrawlResult from '../DataCollection/components/CrawlResult';

const { Dragger } = Upload;

// ─── Types ───────────────────────────────────────────────────────────
type StageName =
  | 'data_import'
  | 'event_extraction'
  | 'feature_extraction'
  | 'regulation';

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
  role?: string;
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

interface MissingRegulation {
  id: string;
  feature: string;
  regulationName: string;
  article: string;
  reason: string;
  source: string;
  recordedAt?: string;
  buildId?: string;
  resolved?: boolean;
  resolvedAt?: string;
}

interface QccLookupRecord {
  id: string;
  subjectName: string;
  subjectType: string;
  reason: string;
  status: 'queued' | 'running' | 'success' | 'failed';
  time: string;
  result?: any;
  retryCount?: number;
  errorMessage?: string;
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
  missingRegulations?: string[];
  qccLookups?: number;
  subjectCount?: number;
  eventCount?: number;
  featureCount?: number;
  regulationCount?: number;
}

interface JsonArtifact {
  stage: string;
  source?: string;
  fileName?: string;
  jsonPath: string;
  jsonlPath?: string;
  nodeCount?: number;
  edgeCount?: number;
  nodeTypeCounts?: Record<string, number>;
  edgeTypeCounts?: Record<string, number>;
  extractionMode?: 'dify' | 'fallback' | string;
  fallbackCount?: number;
  announcementType?: string;
  eventTitle?: string;
  riskLevel?: string;
  size?: number;
  createdAt?: string;
}

// ─── Constants ───────────────────────────────────────────────────────
const STAGES: StageDef[] = [
  { key: 'data_import', title: '第一步：爬虫抽取 / 数据导入', icon: <CloudUploadOutlined />, description: '采集、上传与文件解析' },
  { key: 'event_extraction', title: '第二步-1：风险事件 Dify', icon: <ThunderboltOutlined />, description: '将第一步得到的文件送入风险事件 Dify 工作流' },
  { key: 'feature_extraction', title: '第二步：Dify 生成 JSON / 手动入库', icon: <ExclamationCircleOutlined />, description: '风险事件 Dify、特征层 Dify、JSON 导入 Neo4j 分步执行' },
];

const MAIN_STAGE_KEYS: StageName[] = ['data_import', 'feature_extraction'];
const UPLOADED_SOURCE_KEY = 'uploaded_docs';
const API_DIRECT_BASE = 'http://127.0.0.1:8002';
const KG_OUTPUT_PATHS = {
  event_extraction: 'backend/kg_outputs/risk_events',
  feature_extraction: 'backend/kg_outputs/risk_features',
  regulation_linking: 'backend/kg_outputs/regulations',
};

const apiUrl = (path: string) => {
  const isLocalDev = typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return isLocalDev && path.startsWith('/api/') ? `${API_DIRECT_BASE}${path}` : path;
};

const apiFetch = (path: string, init?: RequestInit) => fetch(apiUrl(path), init);

const getStageDef = (key: StageName) => STAGES.find((stage) => stage.key === key);
const getStageTitle = (key: StageName) => getStageDef(key)?.title || key;
const getMainStageKey = (key: StageName) => (
  key === 'data_import' ? 'data_import' : 'feature_extraction'
);

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
  const [missingRegulations, setMissingRegulations] = useState<MissingRegulation[]>([]);
  const [qccLookupRecords, setQccLookupRecords] = useState<QccLookupRecord[]>([]);
  const [importPreview, setImportPreview] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [importResult, setImportResult] = useState<ImportStats | null>(null);
  const [stageLogs, setStageLogs] = useState<StageLog[]>([]);
  const [buildHistory, setBuildHistory] = useState<BuildRecord[]>([]);
  const [jsonArtifacts, setJsonArtifacts] = useState<JsonArtifact[]>([]);

  // UI state
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [selectedCrawlers, setSelectedCrawlers] = useState<string[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scannedFiles, setScannedFiles] = useState<Record<string, { name: string; size: number; size_display: string }[]>>({});
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [running, setRunning] = useState(false);
  const [eventViewMode, setEventViewMode] = useState<'table' | 'timeline'>('table');
  const [selectedEvent, setSelectedEvent] = useState<ExtractedEvent | null>(null);
  const [importing, setImporting] = useState(false);
  const [importTab, setImportTab] = useState<'upload' | 'crawl'>('upload');
  const [regulationFiles, setRegulationFiles] = useState<any[]>([]);
  const [regulationProcessing, setRegulationProcessing] = useState(false);

  // ─── Crawl store / SSE (from DataCollection) ──────────────────────
  const crawlRunning = useCrawlStore((s) => s.isRunning);
  const crawlResult = useCrawlStore((s) => s.result);
  const crawlDataType = useCrawlStore((s) => s.dataType);
  const crawlSources = useCrawlStore((s) => s.sources);
  const crawlKeywords = useCrawlStore((s) => s.keywords);
  const crawlDateRange = useCrawlStore((s) => s.dateRange);
  const crawlMaxPages = useCrawlStore((s) => s.maxPages);
  const crawlMaxFiles = useCrawlStore((s) => s.maxFiles);
  const { startCrawl, cancelCrawl } = useCrawlSSE();

  const handleStartCrawl = () => {
    const payload: any = {
      mode: 'quick',
      data_type: crawlDataType,
      sources: crawlSources.length > 0 ? crawlSources : undefined,
      keywords: crawlKeywords.length > 0 ? crawlKeywords : undefined,
      max_pages: crawlMaxPages,
      max_files: crawlMaxFiles,
      date_start: crawlDateRange?.[0] || undefined,
      date_end: crawlDateRange?.[1] || undefined,
    };
    // Switch right panel to show crawl progress
    setActiveStage('data_import');
    setImportTab('crawl');
    startCrawl(payload);
  };

  // G6 refs
  const graphContainer = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);

  // Load build history from backend on mount
  useEffect(() => {
    const loadBuildHistory = async () => {
      try {
        const res = await apiFetch('/api/v1/pipeline/build-log?limit=50');
        const data = await res.json();
        if (data.logs && data.logs.length > 0) {
          const records: BuildRecord[] = data.logs.map((log: any) => ({
            buildId: log.buildId || '',
            createdAt: log.createdAt || '',
            dataSource: log.dataSource || '',
            status: log.status || 'completed',
            entityCount: log.entityCount || 0,
            edgeCount: log.edgeCount || 0,
            duration: log.duration || 0,
            missingRegulations: log.missingRegulations || [],
            qccLookups: log.qccLookups || 0,
            subjectCount: log.subjectCount,
            eventCount: log.eventCount,
            featureCount: log.featureCount,
            regulationCount: log.regulationCount,
          }));
          setBuildHistory(records);
        }
      } catch {
        // Backend may not be available; keep empty history
      }
    };
    loadBuildHistory();
  }, []);

  const loadJsonArtifacts = async () => {
    try {
      const res = await apiFetch('/api/v1/pipeline/json-artifacts?limit=100');
      const data = await res.json();
      if (data.success && Array.isArray(data.artifacts)) {
        setJsonArtifacts(data.artifacts);
      }
    } catch {
      // Backend may not be available; keep current artifact list.
    }
  };

  const assertBackendReachable = async () => {
    try {
      const res = await apiFetch('/api/v1/pipeline/json-artifacts?limit=1');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return true;
    } catch {
      const message = '后端服务未连接，或还没有重启到最新版本。请确认 WindEye backend 在 http://localhost:8002 运行后再上传法规。';
      addLog('regulation', message, 'error');
      msg.error(message);
      return false;
    }
  };

  const artifactNumber = (value: unknown) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const getArtifactNodeCount = (stage: string, labels?: string[]) => {
    const stageArtifacts = jsonArtifacts.filter((item) => item.stage === stage);
    if (labels?.length) {
      const labelTotal = stageArtifacts.reduce((sum, item) => (
        sum + labels.reduce((inner, label) => inner + artifactNumber(item.nodeTypeCounts?.[label]), 0)
      ), 0);
      if (labelTotal > 0) {
        return labelTotal;
      }
    }
    return stageArtifacts.reduce((sum, item) => sum + artifactNumber(item.nodeCount), 0);
  };

  const getArtifactEdgeCount = (stage: string) => (
    jsonArtifacts
      .filter((item) => item.stage === stage)
      .reduce((sum, item) => sum + artifactNumber(item.edgeCount), 0)
  );

  const displayedSubjectCount = subjects.length || getArtifactNodeCount('event_extraction', [
    'COMPANY',
    'Company',
    'PERSON',
    'Person',
    'ORG',
    'Organization',
    'REGULATOR',
    'Regulator',
  ]);
  const displayedEventCount = events.length || getArtifactNodeCount('event_extraction');
  const displayedFeatureCount = features.length || getArtifactNodeCount('feature_extraction', [
    'RiskFeature',
    'RiskFactor',
    'RISK_FEATURE',
    'Feature',
  ]);

  useEffect(() => {
    loadJsonArtifacts();
  }, []);

  // ─── Stage index helpers ──────────────────────────────────────────
  const activeMainStage = getMainStageKey(activeStage);
  const stageIndex = Math.max(0, MAIN_STAGE_KEYS.findIndex((key) => key === activeMainStage));
  const completedStages = MAIN_STAGE_KEYS.filter((key) => {
    const idx = MAIN_STAGE_KEYS.findIndex((item) => item === key);
    return idx < stageIndex || (idx === stageIndex && buildStatus === 'completed');
  });

  // ─── Logging ─────────────────────────────────────────────────────
  const addLog = (stage: StageName, message: string, level: StageLog['level'] = 'info') => {
    const now = new Date().toLocaleTimeString();
    setStageLogs((prev) => [...prev, { time: now, stage, message, level }]);
  };

  const saveBuildLogToBackend = async (record: BuildRecord) => {
    try {
      await apiFetch('/api/v1/pipeline/build-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch {
      // Silently ignore save failures — logs are kept in frontend state
    }
  };

  const isSubjectMissingInGraph = (subject: SubjectEntity) => {
    const status = String(subject.properties?.status || subject.properties?.match_status || '').toLowerCase();
    const matchedBy = String(subject.properties?.matched_by || '').toLowerCase();
    return (
      !status ||
      ['unresolved', 'not_found', 'missing', 'new', 'low_confidence'].some((item) => status.includes(item)) ||
      matchedBy === 'qcc_pending'
    );
  };

  const runQccLookupRecord = async (record: QccLookupRecord) => {
    setQccLookupRecords((prev) =>
      prev.map((item) => (item.id === record.id ? { ...item, status: 'running' as const } : item)),
    );
    try {
      const res = await apiFetch(`/api/v1/pipeline/qcc/lookup?subject=${encodeURIComponent(record.subjectName)}`);
      const data = await res.json();
      if (data.success) {
        setQccLookupRecords((prev) =>
          prev.map((item) =>
            item.id === record.id
              ? { ...item, status: 'success' as const, result: data, time: new Date().toLocaleTimeString() }
              : item,
          ),
        );
        addLog('data_import', `企查查补全成功: ${record.subjectName}`, 'success');
      } else {
        throw new Error(data.message || '查询失败');
      }
    } catch (err: any) {
      setQccLookupRecords((prev) =>
        prev.map((item) =>
          item.id === record.id
            ? { ...item, status: 'failed' as const, errorMessage: err.message, retryCount: (item.retryCount || 0) + 1 }
            : item,
        ),
      );
      addLog('data_import', `企查查补全失败: ${record.subjectName} - ${err.message}`, 'error');
    }
  };

  const callQccLookupForMissingSubjects = (nextSubjects: SubjectEntity[]) => {
    const targets = nextSubjects.filter(isSubjectMissingInGraph);
    if (targets.length === 0) return;

    const now = new Date().toLocaleTimeString();
    const existing = new Set(qccLookupRecords.map((item) => item.subjectName));
    const appended: QccLookupRecord[] = targets
      .filter((subject) => !existing.has(subject.name))
      .map((subject) => ({
        id: `qcc_${subject.id || subject.name}_${Date.now()}`,
        subjectName: subject.name,
        subjectType: subject.type,
        reason: '主体层节点未在图数据库命中，调用企查查检索主体基础信息',
        status: 'queued' as const,
        time: now,
      }));

    if (appended.length > 0) {
      setQccLookupRecords((prev) => {
        const current = new Set(prev.map((item) => item.subjectName));
        const fresh = appended.filter((item) => !current.has(item.subjectName));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
      appended.forEach((record) => {
        void runQccLookupRecord(record);
      });
    }
    addLog('data_import', `主体层 ${targets.length} 个节点未在图数据库中找到，已调用企查查检索方法补全主体信息`, 'warning');
  };

  const triggerQccLookup = async (recordId: string) => {
    const record = qccLookupRecords.find((r) => r.id === recordId);
    if (!record) return;
    await runQccLookupRecord(record);
  };

  const triggerAllQccLookups = async () => {
    const queued = qccLookupRecords.filter((r) => r.status === 'queued');
    addLog('data_import', `开始批量企查查补全 ${queued.length} 个主体...`, 'info');
    for (const record of queued) {
      await triggerQccLookup(record.id);
    }
    const success = qccLookupRecords.filter((r) => r.status === 'success').length;
    const failed = qccLookupRecords.filter((r) => r.status === 'failed').length;
    addLog('data_import', `企查查补全完成: ${success} 成功, ${failed} 失败`, success > 0 ? 'success' : 'warning');
  };

  const recordMissingRegulations = (stage: StageName, data: any, nodes: any[] = []) => {
    const rawMissing = data?.missing_regulations || data?.missingRegulations || data?.unmatched_regulations || data?.not_found_regulations || [];
    const missingFromNodes = nodes
      .filter((node) => {
        const status = String(node.properties?.status || node.properties?.match_status || '').toLowerCase();
        return node.properties?.matched === false || ['not_found', 'missing', 'unmatched'].some((item) => status.includes(item));
      })
      .map((node) => ({
        feature: node.properties?.matched_feature || node.properties?.feature || node.properties?.feature_name || '',
        regulationName: node.label || node.properties?.name || node.properties?.regulation || '未识别法规',
        article: node.properties?.article || '',
        reason: node.properties?.reason || '特征层连接的法规条款未在法规知识库中找到',
        source: node.properties?.source_doc || selectedCrawlers[0] || '当前构建',
      }));

    const now = new Date().toISOString();
    const currentBuildId = buildId;
    const normalized = [...rawMissing, ...missingFromNodes].map((item: any, index: number) => ({
      id: item.id || `missing_reg_${Date.now()}_${index}`,
      feature: item.feature || item.matched_feature || item.feature_name || '未标注特征',
      regulationName: item.regulationName || item.regulation || item.name || '未识别法规',
      article: item.article || item.clause || item.article_no || '',
      reason: item.reason || '特征层连接的法规条款未在法规知识库中找到',
      source: item.source || item.source_doc || selectedCrawlers[0] || '当前构建',
      recordedAt: now,
      buildId: currentBuildId || undefined,
      resolved: false,
    }));

    if (normalized.length === 0) return;

    setMissingRegulations((prev) => {
      const seen = new Set(prev.map((item) => `${item.regulationName}-${item.article}-${item.feature}`));
      const appended = normalized.filter((item) => !seen.has(`${item.regulationName}-${item.article}-${item.feature}`));
      return appended.length > 0 ? [...prev, ...appended] : prev;
    });
    addLog(stage, `记录 ${normalized.length} 条法规未命中信息，等待补充到法规知识库`, 'warning');
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
        const res = await apiFetch(`/api/v1/pipeline/files/${source}`);
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
      const name = ent.canonicalName || ent.normalizedName || ent.name || ent.mention || ent.title || `实体_${i}`;
      const entType = ent.entityType || ent.type || ent.label || ent.entity_type || 'Unknown';
      const id = ent.kgNodeId || ent.id || ent.kg_id || `ent_${i}`;

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
          role: ent.role || ent.properties?.role || '',
          confidence: ent.confidence || ent.score || 0.5,
          sourceDoc: ent.sourceFile || ent.source || ent.source_doc || '',
          properties: {
            ...(ent.properties || ent.attributes || {}),
            role: ent.role || ent.properties?.role || '',
            status: ent.status || ent.properties?.status,
            match_status: ent.matchStatus || ent.properties?.match_status,
            matched_by: ent.matchedBy || ent.properties?.matched_by,
            match_score: ent.score ?? ent.properties?.match_score,
            linking: ent.linking || ent.properties?.linking,
            evidence: ent.evidenceText || ent.properties?.evidence,
            source_doc: ent.sourceFile || ent.source || ent.source_doc,
            entity_type: entType,
          },
        });
      }
    }

    setSubjects(newSubjects);
    setEvents(newEvents);
    callQccLookupForMissingSubjects(newSubjects);

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
    recordMissingRegulations('feature_extraction', extractStage, newRegs);

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
      addLog('feature_extraction',
        `数据加载完成: ${newSubjects.length} 主体, ${newEvents.length} 事件, ${newFeatures.length} 特征, ${newRegs.length} 法规`,
        'success'
      );
    }
  };

  const readApiResponse = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }
  };

  const uploadStageOneFiles = async () => {
    const files = uploadedFiles
      .map((item) => item.originFileObj || item)
      .filter(Boolean);

    if (files.length === 0) {
      return null;
    }

    setPipelineRunning(true);
    setBuildStatus('running');
    setRunning(true);
    setStageLogs([]);
    setOverallProgress(5);
    setActiveStage('data_import');
    setSubjects([]);
    setEvents([]);
    setFeatures([]);
    setRegulations([]);
    setMissingRegulations([]);
    setQccLookupRecords([]);
    setImportPreview(null);
    setImportResult(null);
    addLog('data_import', `正在读取上传文件：${files.length} 个文件`, 'info');

    const form = new FormData();
    files.forEach((file) => form.append('files', file));

    const startTime = Date.now();
    const res = await apiFetch(`/api/v1/pipeline/uploads?source=${UPLOADED_SOURCE_KEY}&clear_existing=true`, {
      method: 'POST',
      body: form,
    });
    const data = await readApiResponse(res);
    if (!res.ok || !data.success) {
      throw new Error(data.detail || data.message || '上传文件失败');
    }

    setSelectedCrawlers([UPLOADED_SOURCE_KEY]);
    const parsedDocs: DataSource[] = (data.saved || []).map((item: any, index: number) => ({
      id: `${UPLOADED_SOURCE_KEY}_${index}_${item.savedName || item.name}`,
      name: item.name || item.savedName || `上传文件_${index + 1}`,
      type: 'pdf',
      size: item.size || 0,
      pages: 0,
      status: item.status === 'error' ? 'error' : 'done',
      recordCount: item.chars || 0,
    }));
    setDataSources(parsedDocs);
    setScannedFiles({
      [UPLOADED_SOURCE_KEY]: (data.saved || []).map((item: any) => ({
        name: item.savedName || item.name,
        size: item.size || 0,
        size_display: item.size ? `${Math.max(1, Math.round(item.size / 1024))}KB` : '-',
      })),
    });
    setPipelineRunning(false);
    setRunning(false);
    setBuildStatus('paused');
    setOverallProgress(100);
    setActiveStage('feature_extraction');

    const duration = (Date.now() - startTime) / 1000;
    addLog('data_import', `第一步完成：已读取 ${data.records || parsedDocs.length} 个文件，共 ${(data.totalChars || 0).toLocaleString()} 个字符`, 'success');
    msg.success(`第一步完成，已读取上传文件，耗时 ${duration.toFixed(1)}s`);

    const record: BuildRecord = {
      buildId: `build_${Date.now()}`,
      createdAt: new Date().toISOString(),
      dataSource: '上传文件',
      status: 'completed',
      entityCount: data.records || parsedDocs.length,
      edgeCount: 0,
      duration,
      missingRegulations: [],
      qccLookups: 0,
      subjectCount: 0,
      eventCount: 0,
      featureCount: 0,
      regulationCount: 0,
    };
    setBuildHistory((prev) => [record, ...prev]);
    saveBuildLogToBackend(record);
    return data;
  };

  const handleStartBuild = async () => {
    if (uploadedFiles.length === 0 && selectedCrawlers.length === 0) {
      msg.warning('请先上传PDF文件或选择爬虫数据源');
      return;
    }
    try {
      if (uploadedFiles.length > 0) {
        await uploadStageOneFiles();
        return;
      }
      await handleRunPipeline();
    } catch (err: any) {
      setPipelineRunning(false);
      setRunning(false);
      setBuildStatus('failed');
      addLog('data_import', `第一步启动失败: ${err.message}`, 'error');
      msg.error(`第一步启动失败: ${err.message}`);
    }
  };

  const handleRunPipeline = async (sourceOverride?: string) => {
    const source = sourceOverride || selectedCrawlers[0];
    if (!source) {
      msg.warning('请先选择数据源');
      return;
    }
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
    setMissingRegulations([]);
    setQccLookupRecords([]);
    setImportPreview(null);
    setImportResult(null);
    addLog('data_import', `正在为 ${source} 启动 ETL 预处理流水线（不会写入 Neo4j，不会删除源文件）...`, 'info');

    const startTime = Date.now();
    let lastStage = '';

    try {
      const res = await apiFetch(`/api/v1/pipeline/run?source=${encodeURIComponent(source)}&end_stage=resolve`, { method: 'POST' });
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
          const statusRes = await apiFetch('/api/v1/pipeline/status');
          const statusData = await statusRes.json();
          if (statusData.status === 'idle') {
            clearInterval(pollInterval);
            setPipelineRunning(false);
            setRunning(false);
            setBuildStatus('paused');
            setOverallProgress(100);
            setActiveStage('feature_extraction');
            addLog('data_import', '第一步完成：爬虫抽取和数据导入完成，源文件已保留，可进入风险事件 Dify', 'success');

            // Fetch real entity data from the pipeline
            try {
              const entitiesRes = await apiFetch(`/api/v1/pipeline/entities/${encodeURIComponent(source)}`);
              const entitiesData = await entitiesRes.json();
              if (entitiesData.success) {
                const stages = entitiesData.data.stages || {};
                populateStageResults(stages);
              }
            } catch {
              addLog('feature_extraction', '实体数据获取失败，仅显示统计信息', 'warning');
            }

            const duration = (Date.now() - startTime) / 1000;
            msg.success(`第一步处理完成，耗时 ${duration.toFixed(1)}s`);

            // Save to history
            const record: BuildRecord = {
              buildId: `build_${Date.now()}`,
              createdAt: new Date().toISOString(),
              dataSource: source,
              status: 'completed',
              entityCount: subjects.length || 0,
              edgeCount: 0,
              duration,
              missingRegulations: [],
              qccLookups: qccLookupRecords.length,
              subjectCount: subjects.length,
              eventCount: events.length,
              featureCount: features.length,
              regulationCount: regulations.length,
            };
            setBuildHistory((prev) => [record, ...prev]);
            saveBuildLogToBackend(record);

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
                setActiveStage('data_import');
                addLog('data_import', `阶段: ${info.label}`, 'info');
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
          addLog('data_import', '流水线超时，请检查后端状态', 'warning');
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
      const res = await apiFetch(
        `/api/v1/pipeline/extract/${stage}?source=${encodeURIComponent(source)}`,
        { method: 'POST' },
      );
      const data = await readApiResponse(res);
      if (!data.success) {
        throw new Error(data.message || data.detail || '提取失败');
      }
      const nodes = data.nodes || [];
      const edges = data.edges || [];
      if (nodes.length === 0 && edges.length === 0 && !data.json_artifact) {
        throw new Error(`Dify 返回空结果，未生成 JSON。保存目录：${KG_OUTPUT_PATHS[stage as keyof typeof KG_OUTPUT_PATHS] || 'backend/kg_outputs'}`);
      }
      addLog(stage, `${stage} 完成: ${nodes.length} 节点, ${edges.length} 关系`, 'success');
      recordMissingRegulations(stage, data, nodes);

      // Map nodes/edges to stage-specific state
      if (stage === 'event_extraction') {
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
      if (data.json_artifact?.jsonPath) {
        setJsonArtifacts((prev) => [data.json_artifact, ...prev]);
        addLog(stage, `Dify JSON 已保存: ${data.json_artifact.jsonPath}`, 'success');
      }
      return { data, nodes, edges };
    } catch (err: any) {
      addLog(stage, `提取失败: ${err.message}`, 'error');
      msg.error(`提取失败: ${err.message}`);
      return null;
    } finally {
      setExtracting((prev) => ({ ...prev, [stage]: false }));
    }
  };

  const importDifyJsonToNeo4j = async () => {
    const source = selectedCrawlers[0];
    if (!source) {
      msg.warning('请先在数据导入中选择数据源');
      return null;
    }

    setImporting(true);
    addLog('feature_extraction', '正在读取已保存的特征层 JSON，并导入 Neo4j...', 'info');
    const startTime = Date.now();
    try {
      const res = await apiFetch(
        '/api/v1/pipeline/json-artifacts/import?stage=feature_extraction',
        { method: 'POST' },
      );
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.detail || '导入失败');
      }
      recordMissingRegulations('feature_extraction', data, []);

      const durationSeconds = (Date.now() - startTime) / 1000;
      const nodeTotalFromApi = Number(data.nodes || 0);
      const edgeTotalFromApi = Number(data.edges || 0);
      const stats: ImportStats = {
        nodes: {
          subjects: subjects.length,
          events: events.length,
          features: features.length,
          regulations: 0,
        },
        edges: { INVOLVES: events.length, REFLECTS: features.length, WRITES_JSON: nodeTotalFromApi || features.length },
        durationSeconds,
        conflicts: 0,
      };
      setImportResult(stats);
      setOverallProgress(100);
      setBuildStatus('completed');
      setActiveStage('feature_extraction');
      addLog(
        'feature_extraction',
        `已保存 JSON 导入完成: 新增 ${nodeTotalFromApi || stats.nodes.subjects + stats.nodes.events + stats.nodes.features} 节点, ${edgeTotalFromApi || Object.values(stats.edges).reduce((a, b) => a + b, 0)} 条关系, 耗时 ${durationSeconds.toFixed(1)}s`,
        'success',
      );
      if (missingRegulations.length > 0) {
        addLog('feature_extraction', `本次构建有 ${missingRegulations.length} 条法规未能查询到`, 'warning');
      }
      if (data.jsonlPath) {
        addLog('feature_extraction', `入库来源 JSONL: ${data.jsonlPath}`, 'success');
      }
      msg.success('已保存的特征层 JSON 已导入 Neo4j');

      const record: BuildRecord = {
        buildId: buildId || `build_${Date.now()}`,
        createdAt: new Date().toISOString(),
        dataSource: source,
        status: 'completed',
        entityCount: nodeTotalFromApi || stats.nodes.subjects + stats.nodes.events + stats.nodes.features,
        edgeCount: edgeTotalFromApi || Object.values(stats.edges).reduce((a, b) => a + b, 0),
        duration: durationSeconds,
        missingRegulations: missingRegulations.map((item) => `${item.regulationName}${item.article ? ` ${item.article}` : ''}`),
        qccLookups: qccLookupRecords.length,
        subjectCount: subjects.length,
        eventCount: events.length,
        featureCount: features.length,
        regulationCount: regulations.length,
      };
      setBuildHistory((prev) => [record, ...prev]);
      saveBuildLogToBackend(record);
      return data;
    } catch (err: any) {
      addLog('feature_extraction', `JSON 入库失败: ${err.message}`, 'error');
      msg.error(`入库失败: ${err.message}`);
      return null;
    } finally {
      setImporting(false);
    }
  };

  const generateEventFeatureJson = async () => {
    const source = selectedCrawlers[0];
    if (!source) {
      msg.warning('请先完成第一步，导入上传文件');
      return null;
    }

    setActiveStage('feature_extraction');
    setBuildStatus('running');
    setOverallProgress(55);
    addLog('event_extraction', '手动执行：上传文件送入风险事件 Dify', 'info');
    const eventResult = await runExtraction('event_extraction');
    if (!eventResult) {
      setBuildStatus('failed');
      return null;
    }

    setOverallProgress(78);
    addLog('feature_extraction', '手动执行：风险事件 Dify 结果送入特征层 Dify，生成 JSON', 'info');
    const featureResult = await runExtraction('feature_extraction');
    setBuildStatus(featureResult ? 'paused' : 'failed');
    setOverallProgress(featureResult ? 88 : overallProgress);
    if (featureResult) {
      const eventNodes = artifactNumber(eventResult.data?.json_artifact?.nodeCount ?? eventResult.nodes?.length);
      const eventEdges = artifactNumber(eventResult.data?.json_artifact?.edgeCount ?? eventResult.edges?.length);
      const featureNodes = artifactNumber(featureResult.data?.json_artifact?.nodeCount ?? featureResult.nodes?.length);
      const featureEdges = artifactNumber(featureResult.data?.json_artifact?.edgeCount ?? featureResult.edges?.length);
      addLog(
        'feature_extraction',
        `JSON 已保存：事件层 ${eventNodes} 节点/${eventEdges} 关系；特征层 ${featureNodes} 节点/${featureEdges} 关系`,
        'success',
      );
      msg.success('事件层与特征层 JSON 已生成并保存');
    }
    return featureResult;
  };

  const uploadRegulationFiles = async () => {
    const files = regulationFiles
      .map((item) => item.originFileObj || item)
      .filter(Boolean);
    if (files.length === 0) {
      msg.warning('请先选择法规文件');
      return;
    }
    const backendReady = await assertBackendReachable();
    if (!backendReady) {
      return;
    }

    setRegulationProcessing(true);
    setActiveStage('regulation');
    addLog('regulation', `开始处理 ${files.length} 个法规文件：上传、实体识别、法规层 Dify、生成 JSON`, 'info');

    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        const res = await apiFetch('/api/v1/pipeline/regulations/upload?import_to_neo4j=false', {
          method: 'POST',
          body: form,
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : {};
        if (!res.ok || !data.success) {
          throw new Error(data.detail || data.message || `${file.name} 处理失败`);
        }

        if (data.json_artifact) {
          setJsonArtifacts((prev) => [data.json_artifact, ...prev]);
        }
        setRegulations((prev) => [
          ...prev,
          {
            id: `reg_upload_${Date.now()}_${prev.length}`,
            regulationName: file.name,
            article: `${data.nodes || 0} 节点`,
            articleText: `JSON 已保存到 ${data.json_artifact?.jsonPath || '-'}`,
            matchedFeature: '法规知识库',
            score: 1,
            violation: '',
          },
        ]);
        addLog(
          'regulation',
          `${file.name} 处理完成：${data.nodes || 0} 节点，${data.edges || 0} 关系，JSON ${data.json_artifact?.jsonPath || '已保存'}`,
          'success',
        );
      }
      setRegulationFiles([]);
      await loadJsonArtifacts();
      msg.success('法规文件已完成 Dify 抽取并生成 JSON');
    } catch (err: any) {
      const rawMessage = err?.message || String(err);
      const friendlyMessage = rawMessage.includes('Failed to fetch')
        ? '法规处理失败：无法连接 WindEye 后端上传接口。请重启后端和前端，确认前端代理指向 http://localhost:8002。'
        : `法规处理失败: ${rawMessage}`;
      addLog('regulation', friendlyMessage, 'error');
      msg.error(friendlyMessage);
    } finally {
      setRegulationProcessing(false);
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
    setMissingRegulations([]);
    setQccLookupRecords([]);
    setImportPreview(null);
    setImportResult(null);
    setStageLogs([]);
    setRunning(false);
    setPipelineRunning(false);
    setUploadedFiles([]);
    setSelectedCrawlers([]);
    setRegulationFiles([]);
    setScannedFiles({});
    setImportTab('upload');
    useCrawlStore.getState().reset();
    msg.info('已重置');
  };

  // ─── G6 preview for feature JSON import ───────────────────────────
  useEffect(() => {
    if (activeStage !== 'feature_extraction' || !importPreview || !graphContainer.current) return;

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
        style: { stroke: styleConfig.stroke, lineWidth: styleConfig.lineWidth, endArrow: { path: G6.Arrow.triangle(6, 8, 0), fill: styleConfig.stroke } },
      };
    });

    const graph = new G6.Graph({
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
        items={MAIN_STAGE_KEYS.map((key) => {
          const s = getStageDef(key)!;
          return {
          title: (
            <Button
              type="link"
              size="small"
              style={{ padding: 0, fontWeight: 600, fontSize: 14 }}
              onClick={() => setActiveStage(s.key)}
            >
              {s.title}
            </Button>
          ),
          description: (
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{s.description}</span>
              <Button
                size="small"
                type={activeStage === s.key ? 'primary' : 'default'}
                onClick={() => setActiveStage(s.key)}
                style={{ fontSize: 12 }}
              >
                {activeStage === s.key ? '当前' : '查看'}
              </Button>
            </Space>
          ),
          icon: completedStages.includes(s.key) ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : s.icon,
        };
        })}
      />
      {buildStatus !== 'idle' && (
        <div style={{ marginTop: 12 }}>
          <Progress percent={overallProgress} status={buildStatus === 'failed' ? 'exception' : buildStatus === 'paused' ? 'normal' : 'active'} size="small" />
        </div>
      )}
    </Card>
  );

  const renderRegulationHub = () => (
    <Card
      size="small"
      style={{ marginBottom: 16, borderColor: '#d3adf7', background: '#fcfaff' }}
      bodyStyle={{ padding: '14px 18px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Space direction="vertical" size={2} style={{ flex: 1, minWidth: 320 }}>
          <Space>
            <span style={{ fontSize: 16, fontWeight: 600 }}>法规知识库</span>
            <Tag color="purple">独立维护</Tag>
            <Tag color="default">不参与主流程</Tag>
          </Space>
          <span style={{ color: '#64748b', fontSize: 13 }}>
            位于第一步、第二步之外。上传法规后会走法规层 Dify，生成法规层 JSON；特征层只读查询这里的法规条款。
          </span>
        </Space>
        <Row gutter={12} style={{ minWidth: 300 }}>
          <Col span={12}>
            <Statistic title="已命中法规" value={regulations.length} valueStyle={{ fontSize: 18, color: '#45B7D1' }} />
          </Col>
          <Col span={12}>
            <Statistic title="未命中条款" value={missingRegulations.length} valueStyle={{ fontSize: 18, color: missingRegulations.length > 0 ? '#faad14' : '#52c41a' }} />
          </Col>
        </Row>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              loadJsonArtifacts();
              addLog('regulation', '已刷新法规知识库 JSON 产物和索引', 'success');
            }}
          >
            刷新索引
          </Button>
          <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setActiveStage('regulation')}>
            上传 / 维护法规
          </Button>
        </Space>
      </div>
    </Card>
  );

  // ─── Render: left panel ───────────────────────────────────────────
  const renderLeftPanel = () => (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {/* Unified Data Import Card */}
      <Card size="small" title="第一步：爬虫抽取和数据导入" style={{ marginBottom: 12 }}>
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
                      onChange={({ fileList }) => {
                        setUploadedFiles(fileList);
                        if (fileList.length > 0 && buildStatus !== 'running') {
                          setBuildStatus('idle');
                          setOverallProgress(0);
                          setActiveStage('data_import');
                        }
                      }}
                      beforeUpload={() => false}
                      disabled={running || pipelineRunning}
                      style={{ borderRadius: 8 }}
                    >
                      <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                      <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
                      <p className="ant-upload-hint">支持 PDF、DOCX、TXT 格式</p>
                    </Dragger>
                  </div>

                  <div style={{ display: 'none' }}>
                    <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
                      已爬取数据源
                      <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>选择后扫描文件并完成第一步</Tag>
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
                        </div>
                      )}
                    </div>
                  </div>

                  <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                    {buildStatus === 'idle' && (
                      <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        onClick={handleStartBuild}
                        loading={pipelineRunning}
                        disabled={uploadedFiles.length === 0 && selectedCrawlers.length === 0}
                      >
                        执行第一步
                      </Button>
                    )}
                    {(buildStatus === 'completed' || buildStatus === 'failed' || buildStatus === 'paused') && (
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
              label: '数据采集',
              children: (
                <div>
                  <QuickInputPanel />

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
                        切换到文件上传，扫描并完成第一步
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
        <Card size="small" title="构建状态与日志" style={{ marginBottom: 12 }}>
          <Row gutter={[12, 8]}>
            <Col span={12}>
              <Statistic title="主体实体" value={displayedSubjectCount} valueStyle={{ fontSize: 18 }} suffix={<Tag color="#FFC101">个</Tag>} />
            </Col>
            <Col span={12}>
              <Statistic title="事件层节点" value={displayedEventCount} valueStyle={{ fontSize: 18 }} suffix={<Tag color="#FF6B6B">个</Tag>} />
            </Col>
            <Col span={12}>
              <Statistic title="风险特征" value={displayedFeatureCount} valueStyle={{ fontSize: 18 }} suffix={<Tag color="#4CAF50">个</Tag>} />
            </Col>
            <Col span={12}>
              <Statistic title="法规未命中" value={missingRegulations.length} valueStyle={{ fontSize: 18, color: missingRegulations.length > 0 ? '#faad14' : undefined }} suffix={<Tag color="#45B7D1">条</Tag>} />
            </Col>
            <Col span={24}>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>企查查主体补全</div>
              <Row gutter={8}>
                <Col span={8}>
                  <Statistic title="待补全" value={qccLookupRecords.filter((r) => r.status === 'queued').length} valueStyle={{ fontSize: 16, color: '#1890ff' }} />
                </Col>
                <Col span={8}>
                  <Statistic title="成功" value={qccLookupRecords.filter((r) => r.status === 'success').length} valueStyle={{ fontSize: 16, color: '#52c41a' }} />
                </Col>
                <Col span={8}>
                  <Statistic title="失败" value={qccLookupRecords.filter((r) => r.status === 'failed').length} valueStyle={{ fontSize: 16, color: '#f5222d' }} />
                </Col>
              </Row>
              {qccLookupRecords.length > 0 && (
                <div style={{ maxHeight: 80, overflow: 'auto', marginTop: 4 }}>
                  {qccLookupRecords.slice(0, 10).map((r) => (
                    <div key={r.id} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                      <span>{r.subjectName}</span>
                      <Tag color={r.status === 'success' ? 'success' : r.status === 'failed' ? 'error' : r.status === 'running' ? 'processing' : 'default'} style={{ fontSize: 10, lineHeight: '16px' }}>
                        {r.status === 'queued' ? '待补全' : r.status === 'running' ? '补全中' : r.status === 'success' ? '已补全' : '失败'}
                      </Tag>
                    </div>
                  ))}
                </div>
              )}
            </Col>
          </Row>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>执行日志</div>
            <div style={{ maxHeight: 160, overflow: 'auto' }}>
              {stageLogs.slice(-12).reverse().map((log, i) => (
                <div key={i} style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2, fontFamily: 'monospace' }}>
                  <span style={{ color: log.level === 'error' ? '#f5222d' : log.level === 'success' ? '#52c41a' : log.level === 'warning' ? '#faad14' : '#666' }}>
                    [{log.time}] {getStageTitle(log.stage)}:
                  </span>{' '}
                  {log.message}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Step 2 Card */}
      {(buildStatus === 'completed' || buildStatus === 'paused') && (
        <Card size="small" title="第二步：生成 JSON 与手动入库" style={{ marginBottom: 12, background: '#f6ffed' }}>
          <div style={{ fontSize: 13, color: '#389e0d', marginBottom: 8 }}>
            第一步已完成，源文件已就绪。先将上传文件送入风险事件 Dify，再将风险事件结果送入特征层 Dify，生成 JSON；Neo4j 入库单独执行。
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
            JSON 会保存到 backend/kg_outputs/risk_events 与 backend/kg_outputs/risk_features；入库按钮只读取已保存的 JSON。
          </div>
          <Space style={{ width: '100%', justifyContent: 'center' }} wrap>
            <Button
              type="primary"
              size="middle"
              icon={<ThunderboltOutlined />}
              onClick={generateEventFeatureJson}
              loading={extracting['event_extraction'] || extracting['feature_extraction']}
              disabled={selectedCrawlers.length === 0}
            >
              生成事件/特征 JSON
            </Button>
            <Button
              size="middle"
              icon={<BuildOutlined />}
              onClick={importDifyJsonToNeo4j}
              loading={importing}
              disabled={jsonArtifacts.filter((item) => item.stage === 'feature_extraction').length === 0 && features.length === 0}
            >
              导入 Neo4j
            </Button>
          </Space>
          {buildStatus === 'completed' && importResult && (
            <div style={{ marginTop: 12 }}>
              <Tag color="success">入库完成</Tag>
              <Tag>节点: {importResult.nodes.subjects + importResult.nodes.events + importResult.nodes.features}</Tag>
              <Tag>关系: {Object.values(importResult.edges).reduce((a, b) => a + b, 0)}</Tag>
              <Tag>耗时: {importResult.durationSeconds.toFixed(1)}s</Tag>
            </div>
          )}
        </Card>
      )}

      {/* Build History */}
      <Card size="small" title="构建日志" style={{ marginBottom: 12 }}>
        {buildHistory.length === 0 ? (
          <Empty description="暂无构建记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          buildHistory.slice(0, 10).map((rec) => (
            <Collapse key={rec.buildId} size="small" ghost items={[{
              key: rec.buildId,
              label: (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {new Date(rec.createdAt).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {rec.dataSource} | {rec.entityCount}节点 {rec.edgeCount}关系 | 耗时{typeof rec.duration === 'number' ? rec.duration.toFixed(1) : rec.duration}s
                    </div>
                  </div>
                  <Tag color={rec.status === 'completed' ? 'success' : 'error'}>
                    {rec.status === 'completed' ? '完成' : '失败'}
                  </Tag>
                </div>
              ),
              children: (
                <div>
                  <Descriptions size="small" column={2}>
                    <Descriptions.Item label="新增节点">{rec.entityCount} 个</Descriptions.Item>
                    <Descriptions.Item label="新增关系">{rec.edgeCount} 条</Descriptions.Item>
                    <Descriptions.Item label="企查查补全">{rec.qccLookups || 0} 个主体</Descriptions.Item>
                    <Descriptions.Item label="法规未命中">{rec.missingRegulations?.length || 0} 条</Descriptions.Item>
                  </Descriptions>
                  {rec.missingRegulations && rec.missingRegulations.length > 0 && (
                    <div style={{ marginTop: 4, fontSize: 11, color: '#faad14' }}>
                      <span style={{ fontWeight: 500 }}>未命中法规: </span>
                      {rec.missingRegulations.slice(0, 3).join('; ')}
                      {rec.missingRegulations.length > 3 ? ` 等${rec.missingRegulations.length}条` : ''}
                    </div>
                  )}
                </div>
              ),
            }]} />
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
              {importTab === 'crawl' ? '数据采集' : '数据导入结果'}
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
                    后端正在执行文件解析、主体识别、实体对齐与待入库 JSON 准备
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    处理完成后源文件会保留，供风险事件 Dify 使用
                  </div>
                </div>
              </Card>
            ) : (
              <Empty description={importTab === 'crawl' ? '请先在左侧"数据采集"标签页中选择四个网站来源，然后点击"开始采集"' : '尚未导入数据。请先在左侧上传PDF文件或选择爬虫数据源，然后点击【执行第一步】或扫描文件后点击【运行爬虫抽取/导入】。'}>
                <Space>
                  {importTab === 'crawl' ? (
                    <Button type="primary" icon={<CloudDownloadOutlined />} onClick={() => setImportTab('crawl')}>
                      去数据采集
                    </Button>
                  ) : (
                    <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStartBuild}>执行第一步</Button>
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

  // ─── Render: Stage 2 - Event Extraction (第二步-1) ────────────────
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
  const renderFeatureExtraction = () => {
    const eventArtifacts = jsonArtifacts.filter((item) => item.stage === 'event_extraction');
    const featureArtifacts = jsonArtifacts.filter((item) => item.stage === 'feature_extraction');
    const hasFeatureJson = featureArtifacts.length > 0;
    const eventNodeCount = events.length || getArtifactNodeCount('event_extraction');
    const featureNodeCount = features.length || getArtifactNodeCount('feature_extraction', [
      'RiskFeature',
      'RiskFactor',
      'RISK_FEATURE',
      'Feature',
    ]);
    const featureEmptyText = buildStatus === 'failed'
      ? `特征层 JSON 未生成。请查看左侧日志，输出目录：${KG_OUTPUT_PATHS.feature_extraction}`
      : hasFeatureJson
        ? '特征层 JSON 已保存，可点击“导入 Neo4j”。'
        : `尚未生成特征层 JSON。输出目录：${KG_OUTPUT_PATHS.feature_extraction}`;

    return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>第二步：事件/特征 Dify 生成 JSON 与手动入库</span>
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={extracting['event_extraction'] || extracting['feature_extraction']}
            onClick={generateEventFeatureJson}
            disabled={selectedCrawlers.length === 0 || pipelineRunning}
          >
            生成事件/特征 JSON
          </Button>
          <Button
            size="small"
            icon={<BuildOutlined />}
            loading={importing}
            onClick={importDifyJsonToNeo4j}
            disabled={selectedCrawlers.length === 0 || pipelineRunning || (jsonArtifacts.filter((item) => item.stage === 'feature_extraction').length === 0 && features.length === 0)}
          >
            导入 Neo4j
          </Button>
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="事件层节点" value={eventNodeCount} valueStyle={{ fontSize: 20, color: '#FF6B6B' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="特征层节点" value={featureNodeCount} valueStyle={{ fontSize: 20, color: '#4CAF50' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="已保存 JSON" value={eventArtifacts.length + featureArtifacts.length} valueStyle={{ fontSize: 20, color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="法规未命中" value={missingRegulations.length} valueStyle={{ fontSize: 20, color: missingRegulations.length > 0 ? '#faad14' : '#52c41a' }} /></Card></Col>
      </Row>

      <Card size="small" title="JSON 文件保存位置" style={{ marginBottom: 12 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space wrap>
            <Tag color="blue">风险事件: {KG_OUTPUT_PATHS.event_extraction}</Tag>
            <Tag color="green">特征层: {KG_OUTPUT_PATHS.feature_extraction}</Tag>
          </Space>
          {eventArtifacts.length + featureArtifacts.length === 0 ? (
            <Empty description="当前没有实际生成的 JSON 文件。Dify 返回空结果时不会保存 JSON。" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Table
              dataSource={[...eventArtifacts, ...featureArtifacts]}
              rowKey={(record) => record.jsonPath}
              size="small"
              pagination={false}
              columns={[
                { title: '类型', dataIndex: 'stage', key: 'stage', width: 120, render: (stage: string) => <Tag color={stage === 'event_extraction' ? 'blue' : 'green'}>{stage === 'event_extraction' ? '风险事件' : '特征层'}</Tag> },
                {
                  title: '处理方式',
                  dataIndex: 'extractionMode',
                  key: 'extractionMode',
                  width: 110,
                  render: (mode: string) => mode === 'fallback'
                    ? <Tag color="gold">本地兜底</Tag>
                    : <Tag color="processing">Dify 抽取</Tag>,
                },
                {
                  title: '公告类型',
                  dataIndex: 'announcementType',
                  key: 'announcementType',
                  width: 140,
                  render: (text: string, record: JsonArtifact) => (
                    <Tooltip title={record.eventTitle || text || '-'}>
                      <Tag color={record.extractionMode === 'fallback' ? 'default' : 'orange'}>{text || '-'}</Tag>
                    </Tooltip>
                  ),
                },
                { title: '节点', dataIndex: 'nodeCount', key: 'nodeCount', width: 80, render: (value: number) => value ?? 0 },
                { title: '关系', dataIndex: 'edgeCount', key: 'edgeCount', width: 80, render: (value: number) => value ?? 0 },
                { title: '文件路径', dataIndex: 'jsonPath', key: 'jsonPath', ellipsis: true, render: (path: string) => <Tooltip title={path}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{path}</span></Tooltip> },
              ]}
            />
          )}
        </Space>
      </Card>

      <Card size="small" title="风险事件 Dify 输出（作为特征层输入）" style={{ marginBottom: 12 }} extra={
        <Tag color="blue">第一步文件 → 风险事件 Dify</Tag>
      }>
        {events.length === 0 ? (
          <Empty description="尚未生成风险事件。请点击“生成事件/特征 JSON”。" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            dataSource={events}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 5 }}
            columns={[
              { title: '事件标题', dataIndex: 'title', key: 'title', ellipsis: true },
              { title: '事件类型', dataIndex: 'eventType', key: 'eventType', width: 120, render: (text: string) => <Tag color="orange">{text}</Tag> },
              { title: '涉及主体', dataIndex: 'subjects', key: 'subjects', width: 220, render: (items: string[]) => <Space size={4} wrap>{(items || []).map((name) => <Tag key={name} color="#FFC101">{name}</Tag>)}</Space> },
              { title: '风险等级', dataIndex: 'riskLevel', key: 'riskLevel', width: 100, render: (level: string) => <Badge status={level === 'high' ? 'error' : 'warning'} text={level === 'high' ? '高' : '中'} /> },
            ]}
          />
        )}
      </Card>

      <Card size="small" title="JSON 入库状态" style={{ marginBottom: 12 }} extra={
        <Button
          size="small"
          type="primary"
          icon={<BuildOutlined />}
          loading={importing}
          disabled={selectedCrawlers.length === 0 || features.length === 0}
          onClick={importDifyJsonToNeo4j}
        >
          导入已保存 JSON
        </Button>
      }>
        {importResult ? (
          <Space wrap>
            <Tag color="success">已入库</Tag>
            <Tag>新增节点 {importResult.nodes.subjects + importResult.nodes.events + importResult.nodes.features}</Tag>
            <Tag>新增关系 {Object.values(importResult.edges).reduce((a, b) => a + b, 0)}</Tag>
            <Tag>耗时 {importResult.durationSeconds.toFixed(1)}s</Tag>
          </Space>
        ) : (
          <Space wrap>
            <Tag color="blue">风险事件 JSON 与特征层 JSON 会先保存到文件夹</Tag>
            <Tag color="purple">法规层只读查询，未命中写入日志</Tag>
            <Tag color="default">点击按钮后才导入 Neo4j</Tag>
          </Space>
        )}
      </Card>

      {features.length === 0 ? (
        <Empty description={buildStatus === 'idle' ? '请先执行第一步，再生成事件/特征 JSON' : featureEmptyText} />
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

      <Card size="small" title="待入库图谱预览" style={{ marginTop: 12 }}>
        {importPreview ? (
          <div ref={graphContainer} style={{ width: '100%', height: 400, background: '#fafafa', borderRadius: 8 }} />
        ) : (
          <Empty description="运行风险事件 Dify 或特征层 Dify 后生成预览" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>
    </div>
  );
  };

  // ─── Render: Stage 5 - Regulation Linking ─────────────────────────
  const renderRegulationLinking = () => (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>法规层知识库（独立维护）</span>
        <Space>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => {
              loadJsonArtifacts();
              addLog('regulation', '已刷新法规知识库 JSON 产物和索引，主流程将只读查询法规条款', 'success');
            }}
          >
            刷新法规库
          </Button>
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={8}><Card size="small"><Statistic title="已命中法规" value={regulations.length} valueStyle={{ fontSize: 20, color: '#45B7D1' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="未命中条款" value={missingRegulations.length} valueStyle={{ fontSize: 20, color: missingRegulations.length > 0 ? '#faad14' : '#52c41a' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="违规认定" value={regulations.filter((r) => r.violation).length} valueStyle={{ fontSize: 20, color: '#f5222d' }} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12, background: '#f8fafc' }}>
        <Space direction="vertical" size={4}>
          <span style={{ fontWeight: 500 }}>法规层已从构建主流程拆出。</span>
          <span style={{ color: '#64748b', fontSize: 13 }}>
            新增法规会先上传文件，经过法规层 Dify 做实体识别和关系抽取，生成 JSON 保存到项目目录；特征层连接法规条款时只查询这个知识库。
          </span>
        </Space>
      </Card>

      <Card size="small" title="上传法规文件并生成 JSON" style={{ marginBottom: 12 }} extra={
        <Tag color="purple">保存目录: backend/kg_outputs/regulations</Tag>
      }>
        <Dragger
          multiple
          accept=".pdf,.docx,.txt,.md"
          fileList={regulationFiles}
          beforeUpload={() => false}
          onChange={({ fileList }) => setRegulationFiles(fileList)}
          disabled={regulationProcessing}
          style={{ borderRadius: 8 }}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽法规文件到此区域</p>
          <p className="ant-upload-hint">上传后会经过法规层 Dify 框架，生成法规层 JSON 文件；支持 PDF、DOCX、TXT、MD。</p>
        </Dragger>
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Space>
            <Button size="small" onClick={() => setRegulationFiles([])} disabled={regulationProcessing || regulationFiles.length === 0}>
              清空
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<CloudUploadOutlined />}
              loading={regulationProcessing}
              disabled={regulationFiles.length === 0}
              onClick={uploadRegulationFiles}
            >
              上传并抽取法规
            </Button>
          </Space>
        </div>
      </Card>

      <Card size="small" title="已生成 JSON 文件" style={{ marginBottom: 12 }}>
        {jsonArtifacts.length === 0 ? (
          <Empty description="暂无 JSON 产物。运行风险事件、特征层或法规 Dify 后会在这里显示。" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            dataSource={jsonArtifacts}
            rowKey={(record) => record.jsonPath}
            size="small"
            pagination={{ pageSize: 6 }}
            columns={[
              {
                title: '类型',
                dataIndex: 'stage',
                key: 'stage',
                width: 120,
                render: (stage: string) => {
                  const map: Record<string, { text: string; color: string }> = {
                    event_extraction: { text: '风险事件', color: 'orange' },
                    feature_extraction: { text: '特征层', color: 'green' },
                    regulation_linking: { text: '法规层', color: 'purple' },
                  };
                  const item = map[stage] || { text: stage, color: 'default' };
                  return <Tag color={item.color}>{item.text}</Tag>;
                },
              },
              {
                title: '处理方式',
                dataIndex: 'extractionMode',
                key: 'extractionMode',
                width: 110,
                render: (mode: string) => mode === 'fallback'
                  ? <Tag color="gold">本地兜底</Tag>
                  : <Tag color="processing">Dify 抽取</Tag>,
              },
              {
                title: '公告类型',
                dataIndex: 'announcementType',
                key: 'announcementType',
                width: 140,
                render: (text: string, record: JsonArtifact) => (
                  <Tooltip title={record.eventTitle || text || '-'}>
                    <Tag color={record.extractionMode === 'fallback' ? 'default' : 'orange'}>{text || '-'}</Tag>
                  </Tooltip>
                ),
              },
              { title: '节点', dataIndex: 'nodeCount', key: 'nodeCount', width: 80, render: (value: number) => value ?? '-' },
              { title: '关系', dataIndex: 'edgeCount', key: 'edgeCount', width: 80, render: (value: number) => value ?? '-' },
              {
                title: 'JSON 文件',
                dataIndex: 'jsonPath',
                key: 'jsonPath',
                ellipsis: true,
                render: (path: string) => <Tooltip title={path}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{path}</span></Tooltip>,
              },
              {
                title: '时间',
                dataIndex: 'createdAt',
                key: 'createdAt',
                width: 180,
                render: (value: string) => value ? new Date(value).toLocaleString() : '-',
              },
            ]}
          />
        )}
      </Card>

      <Card size="small" title="未命中法规条款记录" style={{ marginBottom: 12 }}>
        {missingRegulations.length === 0 ? (
          <Empty description="暂无未命中法规条款" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table dataSource={missingRegulations} rowKey="id" size="small" pagination={false} columns={[
            { title: '风险特征', dataIndex: 'feature', key: 'feature', width: 160, ellipsis: true },
            { title: '法规名称', dataIndex: 'regulationName', key: 'regulationName', width: 180, ellipsis: true },
            { title: '条款', dataIndex: 'article', key: 'article', width: 90, render: (t: string) => t ? <Tag color="orange">{t}</Tag> : '-' },
            { title: '来源', dataIndex: 'source', key: 'source', width: 130, ellipsis: true },
            { title: '记录原因', dataIndex: 'reason', key: 'reason', ellipsis: true },
          ]} />
        )}
      </Card>

      {regulations.length === 0 ? (
        <Empty description="暂无本次命中的法规条款。法规库可独立维护，后续加入新法规即可。" />
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

  // ─── Stage router ──────────────────────────────────────────────────
  const renderStageContent = () => {
    switch (activeStage) {
      case 'data_import': return renderDataImport();
      case 'event_extraction': return renderEventExtraction();
      case 'feature_extraction': return renderFeatureExtraction();
      case 'regulation': return renderRegulationLinking();
      default: return <Empty description="未知阶段" />;
    }
  };

  // ─── Main render ───────────────────────────────────────────────────
  return (
    <PageContainer>
      {renderStepper()}
      {renderRegulationHub()}

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
              activeStage === 'regulation' ? (
                <Space>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>法规知识库（独立维护）</span>
                  <Tag color="purple">不参与主流程</Tag>
                </Space>
              ) : (
                <Space>
                  {getStageDef(activeStage)?.icon}
                  <span>{getStageTitle(activeStage)} - {getStageDef(activeStage)?.description}</span>
                  {running && <LoadingOutlined spin />}
                </Space>
              )
            }
            extra={
              <Space>
                {buildStatus === 'idle' && (
                  <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={handleStartBuild} disabled={uploadedFiles.length === 0 && selectedCrawlers.length === 0}>
                    执行第一步
                  </Button>
                )}
                {(activeStage === 'event_extraction' || activeStage === 'feature_extraction') && (buildStatus === 'paused' || buildStatus === 'completed' || buildStatus === 'running') && (
                  <Button size="small" icon={<ThunderboltOutlined />} onClick={() => setActiveStage('feature_extraction')}>
                    分步操作
                  </Button>
                )}
                {(buildStatus === 'running' || pipelineRunning) && (
                  <Button danger size="small" icon={<CloseCircleOutlined />} onClick={handleReset}>取消</Button>
                )}
                <Button size="small" onClick={() => {
                  const idx = MAIN_STAGE_KEYS.findIndex((key) => key === activeMainStage);
                  if (idx > 0) setActiveStage(MAIN_STAGE_KEYS[idx - 1]);
                }} disabled={stageIndex <= 0 || running || pipelineRunning}>上一阶段</Button>
                <Button size="small" onClick={() => {
                  const idx = MAIN_STAGE_KEYS.findIndex((key) => key === activeMainStage);
                  if (idx >= 0 && idx < MAIN_STAGE_KEYS.length - 1) setActiveStage(MAIN_STAGE_KEYS[idx + 1]);
                }} disabled={stageIndex < 0 || stageIndex >= MAIN_STAGE_KEYS.length - 1 || running || pipelineRunning}>下一阶段</Button>
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
