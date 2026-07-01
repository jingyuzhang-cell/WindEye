// graphConfig.ts
import { Tag } from 'antd';
export {
  getPrimaryNodeType,
  resolveLayer,
  resolveNodeType,
} from '@/utils/knowledgeGraph';
export type {
  GraphLayer,
  GraphLayoutMode,
  GraphLayoutSelection,
  GraphViewMode,
} from '@/types/knowledgeGraph';

/**
 * @deprecated 请从 '@/pages/KnowledgeGraph/config/visualTheme' 导入 LAYER_COLORS_WITH_UNKNOWN。
 * 保留此导出仅为向后兼容 SubjectPage / EventPage / FeaturePage / RegulationPage。
 */
export { LAYER_COLORS_WITH_UNKNOWN as GRAPH_LAYER_THEME } from '@/pages/KnowledgeGraph/config/visualTheme';

export const GRAPH_LAYOUT_LIMITS = {
  radialMaxNodes: 30,
  semanticForceMaxNodes: 150,
  displayNodeLimit: 150,
} as const;

// --- 接口定义 ---
export interface LayerConfig {
  layerName: string;      // 传给后端的 layer 参数 (e.g., 'Subject', 'Event')
  pageTitle: string;      // 页面标题
  apiPrefix: string;      // API 基础路径
  nodeStyles: Record<string, { color: string; label: string; layer?: number }>; // 节点颜色配置（layer 可选，用于 GeneralPage）
  relationLabels: Record<string, string>; // 关系中文映射
  propertyMap: Record<string, { label: string; isRisk?: boolean }>; // 侧边栏属性映射
}

// --- 公共工具映射 (如果所有层通用) ---
export const IMPORTANCE_MAP: Record<string, { label: string; color: string; priority: number }> = {
  '-3': { label: '极高风险', color: '#f5222d', priority: 1 },
  '-2': { label: '高风险', color: '#fa541c', priority: 2 },
  '-1': { label: '一般风险', color: '#faad14', priority: 3 },
  '0': { label: '提示信息', color: '#1890ff', priority: 4 },
};

  // 风险因子类型映射
export const FACTOR_TYPE_MAP: Record<string, string> = {
    '1': '财务预警',
    '2': '法律诉讼',
    '3': '股权变动',
  };
  
  // 风险事件类型映射
export const RISK_TYPE_MAP: Record<string, string> = {
    '1': '减持风险',
    '2': '违规风险',
    '3': '负面舆情',
  };

  // 层级边样式映射（按源/目标层级区分颜色和粗细）
  // 4层结构：0=Subject(公司/自然人), 1=Event(事件/时间), 2=Feature(风险特征/风险因子), 3=Regulation(法规)
export const EDGE_STYLE_MAP: Record<string, { stroke: string; lineWidth: number }> = {
    '0-1': { stroke: '#f5222d', lineWidth: 2.5 },    // Subject→Event
    '1-0': { stroke: '#f5222d', lineWidth: 2.5 },    // Event→Subject
    '1-2': { stroke: '#fa8c16', lineWidth: 2.5 },    // Event→Feature
    '2-1': { stroke: '#fa8c16', lineWidth: 2.5 },    // Feature→Event
    '2-3': { stroke: '#1890ff', lineWidth: 2.5 },    // Feature→Regulation
    '3-2': { stroke: '#1890ff', lineWidth: 2.5 },    // Regulation→Feature
    '0-2': { stroke: '#52c41a', lineWidth: 2.5 },    // Subject→Feature（跨层）
    '2-0': { stroke: '#52c41a', lineWidth: 2.5 },    // Feature→Subject（跨层）
    '0-3': { stroke: '#faad14', lineWidth: 2.5 },    // Subject→Regulation（跨层）
    '3-0': { stroke: '#faad14', lineWidth: 2.5 },    // Regulation→Subject（跨层）
    '1-3': { stroke: '#13c2c2', lineWidth: 2.5 },    // Event→Regulation（跨层）
    '3-1': { stroke: '#13c2c2', lineWidth: 2.5 },    // Regulation→Event（跨层）
    '0-0': { stroke: '#d1d1d6', lineWidth: 2 },      // Subject层内
    '1-1': { stroke: '#d1d1d6', lineWidth: 2 },      // Event层内
    '2-2': { stroke: '#d1d1d6', lineWidth: 2 },      // Feature层内
    '3-3': { stroke: '#d1d1d6', lineWidth: 2 },      // Regulation层内
    'default': { stroke: '#d1d1d6', lineWidth: 2 }   // 其他边
  };
  
// --- A. 总览层配置 (Overview) ---
export const GENERAL_CONFIG: LayerConfig = {
    layerName: 'General',
    pageTitle: '总览层图谱检索',
    apiPrefix: '/api/v1',
    nodeStyles: {
      'COMPANY': { color: '#FFC101', label: '公司', layer: 0 }, 
      'PERSON': { color: '#1890FF', label: '自然人', layer: 0 },
      'PFCOMPANY': { color: '#722ED1', label: '私募公司', layer: 0 },
      'PFUND': { color: '#008000', label: '私募基金', layer: 0 },
      'SECURITY': { color: '#F5222D', label: '证券', layer: 0 },
      'Actor': { color: '#2F54EB', label: '参与主体', layer: 0 },
      'Account': { color: '#13C2C2', label: '账户', layer: 0 },
      'EVENT': { color: '#FF6B6B', label: '主事件', layer: 1 },
      'SUB_EVENT': { color: '#FF9999', label: '子事件', layer: 1 },
      'SubEvent': { color: '#FF9999', label: '子事件', layer: 1 },
      'TIME': { color: '#FF8C00', label: '时间', layer: 1 },
      'REGULATOR': { color: '#722ED1', label: '监管机构', layer: 1 },
      'Means': { color: '#EB2F96', label: '手段', layer: 1 },
      'RiskFeature': { color: '#4CAF50', label: '风险特征', layer: 2 }, 
      'RiskFactor': { color: '#9C27B0', label: '风险因子', layer: 2 },
      'AdvantageHolder': { color: '#73D13D', label: '优势持有方', layer: 2 },
      'Influence': { color: '#95DE64', label: '影响', layer: 2 },
      'DisadvantageHolder': { color: '#A0D911', label: '劣势承受方', layer: 2 },
      'Advantage': { color: '#B7EB8F', label: '优势', layer: 2 },
      'Regulation': { color: '#722ED1', label: '法规', layer: 3 },
      'Law': { color: '#9254DE', label: '法律', layer: 3 },
      'Action': { color: '#45B7D1', label: '法规行为', layer: 3 },
      'PartyWithResponsibility': { color: '#13C2C2', label: '责任主体', layer: 3 },
      'Chapter': { color: '#B37FEB', label: '章节', layer: 3 },
      'Section': { color: '#D3ADF7', label: '条款', layer: 3 },
      'Responsibility': { color: '#36CFC9', label: '责任', layer: 3 },
      'RegulatoryAuthority': { color: '#5CDBD3', label: '监管机构', layer: 3 },
      'Restriction': { color: '#FF85C0', label: '限制', layer: 3 },
      'PunishmentMeasure': { color: '#FF7875', label: '处罚措施', layer: 3 },
      'Punishment': { color: '#FF4D4F', label: '处罚', layer: 3 },
      'Violation': { color: '#CF1322', label: '违规行为', layer: 3 },
      'Title': { color: '#ADC6FF', label: '标题', layer: 3 },
      'Unknown': { color: '#2196F3', label: '未知', layer: 0 } 
  },
    relationLabels: {
      'TRIGGERS': '发生','REFLECTS': '反映', 'COMPLIES_WITH': '遵守','PARTICIPATE_IN': '参与','REL_TYPE': '贡献度'
    },
    propertyMap: {
      // 公司属性
      COMPANY_NM: { label: '名称' },
      ORGNUM: { label: '统一社会信用代码' },
      STATUS: { label: '状态' },
      REG_CAPITAL: { label: '注册资本' },
      WARNING_NUM: { label: '风险预警总数', isRisk: true },
      RISK_INFO: { label: '风险详情', isRisk: true },
      // 事件属性
      action_type: { label: '事件动作类型' },
      event_category: { label: '事件分类', isRisk: true },
      name: { label: '事件名称' },
      node_type: { label: '节点类型' },
      normalized_time: { label: '事件时间' },
      PERIOD_INFO: { label: '周期信息' },
      text: { label: '事件详情' },
      title: { label: '事件标题' },
      // 特征属性
      feature_type: { label: '特征类型' },
      e_id: { label: '事件ID' },
      e_text: { label: '事件详情' },
      feature_nm: { label: '特征名称' },
      factor_nm: { label: '因子名称' },
      // 法规属性
      regulation_id: { label: '法规ID' },
      regulation_name: { label: '法规名称' },
      regulation_text: { label: '法规详情' },
      regulation_title: { label: '法规标题' },
    }
  };
  
// --- B. 主体层配置 (Subject) ---
export const SUBJECT_CONFIG: LayerConfig = {
  layerName: 'Subject',
  pageTitle: '主体层图谱检索',
  apiPrefix: '/api/v1',
  nodeStyles: {
    'COMPANY': { color: '#FFC101', label: '企业' },
    'PERSON': { color: '#1890FF', label: '自然人' },
    'PFCOMPANY': { color: '#722ED1', label: '私募公司' },
    'PFUND': { color: '#008000', label: '私募基金' },
    'SECURITY': { color: '#F5222D', label: '证券' },
    'Unknown': { color: '#BFBFBF', label: '未知' }
  },
  relationLabels: {
    'BRANCH': '分支机构(BRANCH)',
    'INVEST': '投资(INVEST)',
    'SUE': '诉讼(SUE)',
    'TRUSTEE': '信托受托方',
    'JOINDER': '共同签署人',
    'CUSTOMER': '客户',
    'GUARANTEE': '担保',
    'CONTROLLER': '控制',
    'SUPPLIER': '供应商',
    'ISSUE': '发行',
    'WORK': '工作',
    '__':'子公司'
  },
  propertyMap: {
    COMPANY_NM: { label: '名称' },
    ORGNUM: { label: '统一社会信用代码' },
    STATUS: { label: '状态' },
    REG_CAPITAL: { label: '注册资本' },
    WARNING_NUM: { label: '风险预警总数', isRisk: true },
    RISK_INFO: { label: '风险详情', isRisk: true },
    AFFILIATION: { label: '关联公司' },
    ID: { label: 'ID' },
    NAME: { label: '名称' },
    NODE_ID: { label: '节点ID' },
    NODE_TYPE: { label: '节点类型' },
    POSITION: { label: '职位' },
  }
};

// --- C. 事件层配置 (Event)
export const EVENT_CONFIG: LayerConfig = {
  layerName: 'Event',
  pageTitle: '事件层图谱检索',
  apiPrefix: '/api/v1',
  nodeStyles: {
    'COMPANY': { color: '#FFC101', label: '企业' },
    'PERSON': { color: '#1890FF', label: '自然人' },
    'TIME': { color: '#52C41A', label: '时间' },
    'EVENT': { color: '#FF6B6B', label: '事件' },
    'SUB_EVENT': { color: '#FF9999', label: '子事件' },
    'SubEvent': { color: '#FF9999', label: '子事件' },
    'REGULATOR': { color: '#722ED1', label: '监管机构' },
    'Means': { color: '#EB2F96', label: '手段' },
    'Unknown': { color: '#BFBFBF', label: '其他' }
  },
  relationLabels: {
    'MENTION': '提及', 'CAUSE': '引发', 'BELONG': '属于'
  },
  propertyMap: {
    EVENT_TITLE: { label: '事件标题' },
    EVENT_DATE: { label: '发生时间' },
    EVENT_TYPE: { label: '事件类型' },
    IMPACT_LEVEL: { label: '影响等级', isRisk: true }
  }
};

// --- D. 特征层配置 (Feature)
export const FEATURE_CONFIG: LayerConfig = {
    layerName: 'Feature',
    pageTitle: '特征层图谱检索',
    apiPrefix: '/api/v1',
    nodeStyles: {
      'RiskFeature': { color: '#4CAF50', label: '风险特征' },
      'RiskFactor': { color: '#9C27B0', label: '风险因子' },
      'AdvantageHolder': { color: '#73D13D', label: '优势持有方' },
      'Influence': { color: '#95DE64', label: '影响' },
      'DisadvantageHolder': { color: '#A0D911', label: '劣势承受方' },
      'Advantage': { color: '#B7EB8F', label: '优势' },
      'Unknown': { color: '#BFBFBF', label: '未知' }
    },
    relationLabels: {
      'MENTION': '提及', 'CAUSE': '引发', 'BELONG': '属于'
    },
    propertyMap: {
      EVENT_TITLE: { label: '事件标题' },
      EVENT_DATE: { label: '发生时间' },
      EVENT_TYPE: { label: '事件类型' },
      IMPACT_LEVEL: { label: '影响等级', isRisk: true }
    }
  };

  // --- E. 法规层配置 (Feature)
export const REGULATION_CONFIG: LayerConfig = {
    layerName: 'Regulation',
    pageTitle: '法规层图谱检索',
    apiPrefix: '/api/v1',
    nodeStyles: {
      'Regulation': { color: '#722ED1', label: '法规' },
      'Law': { color: '#9254DE', label: '法律' },
      'Action': { color: '#45B7D1', label: '法规行为' },
      'PartyWithResponsibility': { color: '#13C2C2', label: '责任主体' },
      'Chapter': { color: '#B37FEB', label: '章节' },
      'Section': { color: '#D3ADF7', label: '条款' },
      'Responsibility': { color: '#36CFC9', label: '责任' },
      'RegulatoryAuthority': { color: '#5CDBD3', label: '监管机构' },
      'Restriction': { color: '#FF85C0', label: '限制' },
      'PunishmentMeasure': { color: '#FF7875', label: '处罚措施' },
      'Punishment': { color: '#FF4D4F', label: '处罚' },
      'Violation': { color: '#CF1322', label: '违规行为' },
      'Title': { color: '#ADC6FF', label: '标题' },
      'Unknown': { color: '#BFBFBF', label: '未知' }
    },
    relationLabels: {
      'MENTION': '提及', 'CAUSE': '引发', 'BELONG': '属于'
    },
    propertyMap: {
      EVENT_TITLE: { label: '事件标题' },
      EVENT_DATE: { label: '发生时间' },
      EVENT_TYPE: { label: '事件类型' },
      IMPACT_LEVEL: { label: '影响等级', isRisk: true }
    }
  };

