/**
 * visualTheme.ts — 四层知识图谱统一视觉规范（唯一真相源）
 *
 * 所有节点颜色/形状/尺寸、边线型/颜色、图例映射均从此文件导出。
 * 页面组件、FourLayerGraph、graphConfig 均应从此导入，禁止手写散落样式逻辑。
 */

import type { GraphFilterLayer, GraphLayer, GraphLayoutMode, GraphViewMode } from '@/types/knowledgeGraph';

// ============================================================================
// 1. 四层颜色规范
// ============================================================================

export interface LayerColorSpec {
  label: string;
  color: string;
  background: string;
}

export const LAYER_COLORS: Record<GraphFilterLayer, LayerColorSpec> = {
  Subject:    { label: '主体层', color: '#1677ff', background: 'rgba(22,119,255,0.055)' },
  Event:      { label: '事件层', color: '#fa8c16', background: 'rgba(250,140,22,0.065)' },
  Feature:    { label: '特征层', color: '#f5222d', background: 'rgba(245,34,45,0.055)' },
  Regulation: { label: '法规层', color: '#52c41a', background: 'rgba(82,196,26,0.055)' },
};

export const LAYER_COLORS_WITH_UNKNOWN: Record<GraphLayer, LayerColorSpec> = {
  ...LAYER_COLORS,
  Unknown: { label: '未归类', color: '#8c8c8c', background: 'rgba(140,140,140,0.05)' },
};

// ============================================================================
// 2. 层级标签映射（节点 → 所属层判断）
// ============================================================================

export const LAYER_LABEL_MAP: Record<GraphFilterLayer, string[]> = {
  Subject:    ['Subject', 'COMPANY', 'PERSON', 'PFCOMPANY', 'PFUND', 'SECURITY', 'Actor', 'Account'],
  Event:      ['Event', 'EVENT', 'SubEvent', 'SUB_EVENT', 'TIME', 'REGULATOR', 'Means'],
  Feature:    ['Feature', 'RiskFeature', 'RiskFactor', 'AdvantageHolder', 'Influence', 'DisadvantageHolder', 'Advantage'],
  Regulation: ['Regulation', 'Law', 'Action', 'PartyWithResponsibility', 'Chapter', 'Section', 'Responsibility', 'RegulatoryAuthority', 'Restriction', 'PunishmentMeasure', 'Punishment', 'Violation', 'Title'],
};

/**
 * 根据节点 labels 判断所属层。
 * 优先匹配层级标签自身，其次匹配子类型标签。
 */
export function getNodeLayer(labels: string[]): GraphLayer {
  const labelSet = new Set(labels || []);
  // 先匹配层标记
  for (const layer of ['Subject', 'Event', 'Feature', 'Regulation'] as const) {
    if (labelSet.has(layer)) return layer;
  }
  // 再匹配子类型
  for (const [layer, typeLabels] of Object.entries(LAYER_LABEL_MAP)) {
    if (typeLabels.some(label => labelSet.has(label))) return layer as GraphFilterLayer;
  }
  return 'Unknown';
}

/**
 * 根据 labels 和所在层解析节点类型名。
 */
export function getNodeType(labels: string[], layer?: GraphLayer): string {
  const resolvedLayer = layer || getNodeLayer(labels);
  if (resolvedLayer === 'Unknown') return labels[0] || 'Unknown';

  const labelSet = new Set(labels || []);
  const priorityList = LAYER_LABEL_MAP[resolvedLayer];
  return priorityList.find(label => labelSet.has(label))
    || labels.find(label => !['Subject', 'Event', 'Feature', 'Regulation', 'Entity', 'NODE'].includes(label))
    || 'Unknown';
}

// ============================================================================
// 3. 节点形状映射（按类型标签 → G6 形状名）
// ============================================================================

/**
 * 节点类型 → G6 shape 名称。
 * 未列出的类型默认使用 'circle'。
 *
 * G6 内置形状: circle, rect, ellipse, diamond, triangle
 * 自定义注册形状: hexagon, invertedTriangle, roundRect, parallelogram, star
 * 自定义形状注册失败时自动 fallback 到 circle。
 */
export const NODE_SHAPE_MAP: Record<string, string> = {
  /* ---- Subject 主体层 ---- */
  'COMPANY':   'rect',
  'PFCOMPANY': 'rect',
  'Actor':     'rect',
  'Account':   'rect',
  'PERSON':    'circle',
  'PFUND':     'diamond',
  'SECURITY':  'hexagon',

  /* ---- Event 事件层 ---- */
  'EVENT':      'circle',
  'SubEvent':   'roundRect',
  'SUB_EVENT':  'roundRect',
  'TIME':       'ellipse',
  'REGULATOR':  'hexagon',
  'Means':      'parallelogram',

  /* ---- Feature 特征层 ---- */
  'RiskFeature':        'circle',
  'RiskFactor':         'diamond',
  'AdvantageHolder':    'triangle',
  'Influence':          'ellipse',
  'DisadvantageHolder': 'invertedTriangle',
  'Advantage':          'star',

  /* ---- Regulation 法规层 ---- */
  'Law':                 'circle',
  'Action':              'rect',
  'PartyWithResponsibility': 'diamond',
  'Chapter':             'roundRect',
  'Section':             'roundRect',
  'Responsibility':      'ellipse',
  'RegulatoryAuthority': 'hexagon',
  'Restriction':         'triangle',
  'PunishmentMeasure':   'star',
  'Punishment':          'star',
  'Violation':           'invertedTriangle',
  'Title':               'ellipse',
};

/** G6 内置原生支持的形状集合 */
const G6_BUILTIN_SHAPES = new Set(['circle', 'rect', 'ellipse', 'diamond', 'triangle']);

/**
 * 获取节点 G6 形状，带 fallback。
 * 如果目标形状非内置且未注册成功，降级为 circle。
 */
export function getNodeShape(nodeType: string): string {
  const shape = NODE_SHAPE_MAP[nodeType] || 'circle';
  return shape;
}

/**
 * 判断形状是否为 G6 内置（无需自定义注册）。
 */
export function isBuiltinShape(shape: string): boolean {
  return G6_BUILTIN_SHAPES.has(shape);
}

// ============================================================================
// 4. 节点尺寸规范
// ============================================================================

export interface NodeSizeSpec {
  floor: number;  // 层内最小尺寸 (px)
  max: number;    // 层内最大尺寸 (px)
}

/** 降低节点基准尺寸，避免遮挡和画布拥挤 */
export const NODE_SIZE_BY_LAYER: Record<GraphLayer, NodeSizeSpec> = {
  Subject:    { floor: 28, max: 38 },
  Event:      { floor: 24, max: 30 },
  Feature:    { floor: 22, max: 26 },
  Regulation: { floor: 18, max: 22 },
  Unknown:    { floor: 14, max: 18 },
};

/** 中心节点尺寸上浮比例 */
export const CENTER_SIZE_BOOST = 1.10;

// ============================================================================
// 5. 边样式规范
// ============================================================================

export interface EdgeVisualSpec {
  lineWidth: number;
  dashPattern: number[] | undefined; // undefined = 实线
  stroke: string;
}

/**
 * 跨层边样式映射（增强版——提高默认可读性）。
 * Subject-Event: 实线 2.2px
 * Event-Feature: 虚线 [6,4] 1.8px
 * Feature-Regulation: 点线 [2,4] 1.5px
 * 长跨度跨层: 点线 [2,4] 1.2px
 */
export const EDGE_CROSS_LAYER_SPEC: Record<string, EdgeVisualSpec> = {
  'Subject-Event':      { lineWidth: 2.2, dashPattern: undefined, stroke: '#4b5563' },
  'Event-Subject':      { lineWidth: 2.2, dashPattern: undefined, stroke: '#4b5563' },
  'Event-Feature':      { lineWidth: 1.8, dashPattern: [6, 4], stroke: '#6b7280' },
  'Feature-Event':      { lineWidth: 1.8, dashPattern: [6, 4], stroke: '#6b7280' },
  'Feature-Regulation': { lineWidth: 1.5, dashPattern: [2, 4], stroke: '#7c3aed' },
  'Regulation-Feature': { lineWidth: 1.5, dashPattern: [2, 4], stroke: '#7c3aed' },
  // 长跨度跨层关系
  'Subject-Feature':    { lineWidth: 1.2, dashPattern: [6, 4], stroke: '#6b7280' },
  'Feature-Subject':    { lineWidth: 1.2, dashPattern: [6, 4], stroke: '#6b7280' },
  'Subject-Regulation': { lineWidth: 1.2, dashPattern: [2, 4], stroke: '#7c3aed' },
  'Regulation-Subject': { lineWidth: 1.2, dashPattern: [2, 4], stroke: '#7c3aed' },
  'Event-Regulation':   { lineWidth: 1.2, dashPattern: [2, 4], stroke: '#7c3aed' },
  'Regulation-Event':   { lineWidth: 1.2, dashPattern: [2, 4], stroke: '#7c3aed' },
};

/** 同层边样式：浅灰实线 */
export const EDGE_INTRA_LAYER_SPEC: EdgeVisualSpec = {
  lineWidth: 1.1,
  dashPattern: undefined,
  stroke: '#b6bcc6',
};

/** 边特殊状态颜色 */
export const EDGE_STATE_COLORS = {
  selected:    '#722ed1',
  risk:        '#ff4d4f',
  hover:       '#1890ff',
  crossLayer:  '#8c8c8c',
  intraLayer:  '#d9d9d9',
  onPath:      '#f5222d',
} as const;

/**
 * 根据源/目标节点层获取边视觉规范。
 */
export function getEdgeVisualSpec(
  sourceLayer: GraphLayer,
  targetLayer: GraphLayer,
): EdgeVisualSpec {
  if (sourceLayer === targetLayer) return EDGE_INTRA_LAYER_SPEC;
  const key = `${sourceLayer}-${targetLayer}`;
  return EDGE_CROSS_LAYER_SPEC[key]
    ?? { lineWidth: 1, dashPattern: [4, 4], stroke: '#8c8c8c' };
}

// ============================================================================
// 6. 视图模式 ↔ 布局算法映射
// ============================================================================

/**
 * GraphViewMode 保留核心、全体与高级分析模式。
 * UI 默认展示 core / semantic 两种；
 * aggregate / community / path-focus 用于高级场景（聚合、社区发现、风险路径高亮）。
 */
export function resolveLayoutForViewMode(mode: GraphViewMode): GraphLayoutMode {
  switch (mode) {
    case 'core':
      return 'neo4j-force';
    case 'semantic':
      return 'neo4j-force';
    case 'aggregate':
      return 'aggregate';
    case 'community':
      return 'community';
    case 'path-focus':
      return 'path-focus';
    default:
      return 'free-force';
  }
}

/** UI 默认展示的两种视图模式 */
export const PRIMARY_VIEW_MODES: GraphViewMode[] = ['core', 'semantic'];

/** 高级视图模式（不在主 UI 展示但底层可用） */
export const ADVANCED_VIEW_MODES: GraphViewMode[] = ['aggregate', 'community', 'path-focus'];

// ============================================================================
// 7. 性能保护阈值
// ============================================================================

export const PERF_THRESHOLDS = {
  /** 节点数超过此值时仅给出提示，保留用户选择的全体视图 */
  AUTO_CORE_VIEW: 200,
  /** 节点数超过此值时自动隐藏普通节点标签 */
  HIDE_LABELS: 500,
  /** 节点数超过此值时提示缩小穿透深度 */
  WARN_LARGE_GRAPH: 800,
  /** 节点数小于此值时显示更多标签 */
  SHOW_MORE_LABELS: 80,
  /** 节点数大于此值时仅显示核心标签 */
  MINIMAL_LABELS: 300,
} as const;

// ============================================================================
// 7.5. 自由力导向布局配置
// ============================================================================

/** 自由力导向布局的微弱初始偏移（不固定节点，仅提供初始 seed） */
export const FREE_FORCE_LAYER_SEED: Record<GraphFilterLayer, { dx: number; dy: number }> = {
  Subject:    { dx: -120, dy: 0 },
  Event:      { dx: 0,    dy: -80 },
  Feature:    { dx: 0,    dy: 80 },
  Regulation: { dx: 120,  dy: 0 },
};

/** G6 force layout 配置 */
export const FREE_FORCE_CONFIG = {
  type: 'force',
  preventOverlap: true,
  nodeSpacing: 18,
  linkDistance: 105,
  nodeStrength: -34,
  edgeStrength: 0.26,
  collideStrength: 0.62,
  alphaDecay: 0.045,
  alphaMin: 0.001,
};

/** Neo4j Browser 风格弹性力导向布局配置 */
export const NEO4J_FORCE_CONFIG = {
  type: 'force',
  preventOverlap: true,
  nodeSpacing: 90,
  linkDistance: (edge: any) => {
    const sourceLayer = edge.sourceLayer;
    const targetLayer = edge.targetLayer;
    const rel = edge.relationType || edge.type || edge.relation || edge.label;
    if (sourceLayer !== targetLayer) {
      const layerPair = `${sourceLayer}-${targetLayer}`;
      if (layerPair === 'Subject-Event' || layerPair === 'Event-Subject') return 180;
      if (layerPair === 'Event-Feature' || layerPair === 'Feature-Event') return 210;
      if (layerPair === 'Feature-Regulation' || layerPair === 'Regulation-Feature') return 230;
      return 220;
    }
    if (rel === 'MENTION') return 140;
    if (rel === 'INVEST') return 170;
    if (rel === 'GUARANTEE') return 180;
    if (rel === 'COMPLIES_WITH') return 240;
    if (rel === 'TRIGGERS' || rel === 'CAUSE') return 220;
    return 160;
  },
  nodeStrength: (node: any) => {
    if (node.isCenter) return -1200;
    if (node.isHub) return -1000;
    if (node.layer === 'Subject') return -850;
    if (node.layer === 'Event') return -700;
    if (node.layer === 'Feature') return -650;
    if (node.layer === 'Regulation') return -600;
    return -500;
  },
  edgeStrength: (edge: any) => {
    const rel = edge.relationType || edge.type || edge.relation || edge.label;
    if (rel === 'COMPLIES_WITH') return 0.06;
    if (rel === 'MENTION') return 0.04;
    if (rel === 'INVEST' || rel === 'GUARANTEE') return 0.08;
    return 0.06;
  },
  collideStrength: 1,
  alphaDecay: 0.035,
  alphaMin: 0.001,
};

// ============================================================================
// 8. 帮助函数：统一获取节点渲染样式
// ============================================================================

export interface NodeRenderStyle {
  color: string;
  size: number;
  shape: string;
  labelStyle: {
    fill: string;
    fontSize: number;
    fontWeight: number;
  };
}

export function getNodeRenderStyle(
  layer: GraphLayer,
  _nodeType: string,
  isCenter: boolean,
  isAggregate: boolean,
): NodeRenderStyle {
  const layerSpec = LAYER_COLORS_WITH_UNKNOWN[layer];
  const sizeSpec = NODE_SIZE_BY_LAYER[layer];
  let size = sizeSpec.floor;
  if (isCenter) size = Math.round(size * CENTER_SIZE_BOOST);
  if (isAggregate) size = Math.min(sizeSpec.max + 8, size + 6);

  return {
    color: layerSpec.color,
    size,
    shape: getNodeShape(_nodeType),
    labelStyle: {
      fill: '#262626',
      fontSize: 11,
      fontWeight: isCenter || isAggregate ? 600 : 400,
    },
  };
}

// ============================================================================
// 9. Hub 节点样式
// ============================================================================

export const HUB_NODE_STYLE = {
  stroke: '#faad14',
  lineWidth: 3.5,
  badgeColor: '#faad14',
  badgeTextColor: '#fff',
  shadowColor: 'rgba(250,173,20,0.35)',
  shadowBlur: 10,
} as const;
