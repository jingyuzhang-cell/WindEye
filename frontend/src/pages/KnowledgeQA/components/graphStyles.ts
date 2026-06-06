// Shared graph color constants — imported by both EnhancedGraphPanel and LegendPanel

export const NODE_TYPE_COLORS: Record<string, string> = {
  COMPANY: '#1890ff', PERSON: '#722ed1', EVENT: '#f5222d',
  SUB_EVENT: '#f5222d', TIME: '#8c8c8c', RiskFeature: '#52c41a',
  RiskFactor: '#52c41a', Action: '#8c8c8c', Regulation: '#faad14', Law: '#faad14',
}

export const NODE_TYPE_LABELS: Record<string, string> = {
  COMPANY: '企业', PERSON: '人物', EVENT: '事件', SUB_EVENT: '子事件',
  TIME: '时间', RiskFeature: '风险特征', RiskFactor: '风险因子',
  Action: '操作', Regulation: '法规', Law: '法律',
}

export const RELATION_LABELS: Record<string, string> = {
  INVEST: '投资', GUARANTEE: '担保', WORK: '任职', CONTROLLER: '控制',
  MENTION: '涉及', TRIGGERS: '触发', REFLECTS: '反映',
  COMPLIES_WITH: '合规', CAUSE: '因果', BELONG: '归属',
}

export const EDGE_COLORS: Record<string, string> = {
  INVEST: '#1890ff', GUARANTEE: '#faad14', WORK: '#722ed1',
  CONTROLLER: '#722ed1', MENTION: '#f5222d', TRIGGERS: '#f5222d',
  REFLECTS: '#fa8c16', COMPLIES_WITH: '#722ed1', CAUSE: '#fa541c', BELONG: '#52c41a',
}

export const RISK_LEVEL_VISUAL: Record<string, { border: string; bg: string; label: string }> = {
  high:   { border: '#f5222d', bg: '#FFF2F0', label: '高风险' },
  medium: { border: '#faad14', bg: '#FFFBE6', label: '中风险' },
  low:    { border: '#52c41a', bg: '#F6FFED', label: '低风险' },
}

export const COMMUNITY_COLORS = [
  '#5B8FF9', '#5AD8A6', '#F6BD16', '#E8684A', '#9270CA',
  '#6DC8EC', '#FF9D4D', '#269A99', '#FF99C3', '#5D7092',
]
