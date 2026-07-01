/**
 * GraphDetailDrawer.tsx — 节点/边详情抽屉
 * 从 GeneralPage 提取，新增复制节点信息和⾼亮关联路径功能。
 */
import {
  AimOutlined,
  CopyOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Descriptions,
  Drawer,
  Space,
  Tag,
} from 'antd';
import React, { useCallback } from 'react';
import type {
  GraphFilterLayer,
  GraphLayoutMode,
  GraphViewMode,
  KGEdge,
  KGNode,
  KGSummary,
} from '@/types/knowledgeGraph';
import { LAYER_COLORS } from '../config/visualTheme';

interface GraphDetailDrawerProps {
  selectedNode: KGNode | null;
  selectedEdge: KGEdge | null;
  displayNodeCount: number;
  displayEdgeCount: number;
  viewMode: GraphViewMode;
  layoutMode: GraphLayoutMode;
  traceId: string | null;
  summary: KGSummary;
  warnings: string[];
  loading: boolean;
  onClose: () => void;
  onExpand: (node: KGNode) => void;
  onSetCenter: (node: KGNode) => void;
  onHighlightPath?: (node: KGNode) => void;
}

const VIEW_MODE_LABELS: Record<GraphViewMode, string> = {
  core: '核心视图',
  semantic: '全体视图',
  aggregate: '类型聚合',
  community: '社区聚类',
  'path-focus': '路径优先',
};

const LAYOUT_MODE_LABELS: Record<GraphLayoutMode, string> = {
  'neo4j-force': '弹性布局',
  'free-force': '自由力导向',
  aggregate: '类型聚合',
  cascade: '层级级联',
  radial: '中心放射',
  'semantic-force': '语义分布',
  community: '社区聚类',
  'path-focus': '路径优先',
};

const PROPERTY_LABEL_MAP: Record<string, string> = {
  COMPANY_NM: '名称', ORGNUM: '统一社会信用代码', STATUS: '状态',
  REG_CAPITAL: '注册资本', WARNING_NUM: '风险预警总数', RISK_INFO: '风险详情',
  action_type: '事件动作类型', event_category: '事件分类', name: '名称',
  node_type: '节点类型', normalized_time: '事件时间', PERIOD_INFO: '周期信息',
  text: '事件详情', title: '标题', feature_type: '特征类型', e_id: '事件ID',
  e_text: '事件详情', feature_nm: '特征名称', factor_nm: '因子名称',
  regulation_id: '法规ID', regulation_name: '法规名称', regulation_text: '法规详情',
  regulation_title: '法规标题',
};

const GraphDetailDrawer: React.FC<GraphDetailDrawerProps> = ({
  selectedNode,
  selectedEdge,
  displayNodeCount,
  displayEdgeCount,
  viewMode,
  layoutMode,
  traceId,
  summary,
  warnings,
  loading,
  onClose,
  onExpand,
  onSetCenter,
  onHighlightPath,
}) => {
  const { message } = App.useApp();

  const handleCopyNodeInfo = useCallback((node: KGNode) => {
    const lines = [
      `节点名称: ${node.name}`,
      `节点 ID: ${node.id}`,
      `层级: ${node.layer}`,
      `类型: ${node.type}`,
      `标签: ${node.labels.join(', ')}`,
      ...Object.entries(node.properties).map(
        ([k, v]) => `${PROPERTY_LABEL_MAP[k] || k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`,
      ),
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(
      () => message.success('节点信息已复制到剪贴板'),
      () => message.error('复制失败，请手动复制'),
    );
  }, [message]);

  const title = selectedNode
    ? `节点详情 - ${selectedNode.name}`
    : selectedEdge
      ? `关系详情 - ${selectedEdge.type}`
      : '图谱详情';

  return (
    <Drawer
      title={title}
      width={460}
      open={Boolean(selectedNode || selectedEdge)}
      mask={false}
      onClose={onClose}
    >
      {selectedNode && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="节点名称">{selectedNode.name}</Descriptions.Item>
            <Descriptions.Item label="节点 ID">{selectedNode.id}</Descriptions.Item>
            <Descriptions.Item label="层级">
              <Tag color={
                selectedNode.layer === 'Unknown'
                  ? 'default'
                  : LAYER_COLORS[selectedNode.layer as GraphFilterLayer]?.color
              }>
                {selectedNode.layer}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="类型">{selectedNode.type}</Descriptions.Item>
            <Descriptions.Item label="度数">{selectedNode.degree || 0}</Descriptions.Item>
            <Descriptions.Item label="标签">
              {selectedNode.labels.map(label => <Tag key={label}>{label}</Tag>)}
            </Descriptions.Item>
            {Object.entries(selectedNode.properties).map(([key, value]) => (
              <Descriptions.Item key={key} label={PROPERTY_LABEL_MAP[key] || key}>
                <span style={{ wordBreak: 'break-all' }}>
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </Descriptions.Item>
            ))}
          </Descriptions>

          <Button
            block
            type="primary"
            icon={<NodeIndexOutlined />}
            loading={loading}
            onClick={() => onExpand(selectedNode)}
          >
            按当前深度展开关联子图
          </Button>

          <Button
            block
            onClick={() => onSetCenter(selectedNode)}
          >
            设为中心节点
          </Button>

          <Button
            block
            icon={<CopyOutlined />}
            onClick={() => handleCopyNodeInfo(selectedNode)}
          >
            复制节点信息
          </Button>

          {onHighlightPath && (
            <Button
              block
              icon={<AimOutlined />}
              onClick={() => onHighlightPath(selectedNode)}
            >
              高亮关联路径
            </Button>
          )}
        </Space>
      )}

      {selectedEdge && (
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="关系类型">{selectedEdge.type}</Descriptions.Item>
          <Descriptions.Item label="原始类型">{selectedEdge.rawType || selectedEdge.type}</Descriptions.Item>
          <Descriptions.Item label="Source">{selectedEdge.source}</Descriptions.Item>
          <Descriptions.Item label="Target">{selectedEdge.target}</Descriptions.Item>
          {selectedEdge.count && (
            <Descriptions.Item label="聚合数量">{selectedEdge.count}</Descriptions.Item>
          )}
          {Object.entries(selectedEdge.properties || {}).map(([key, value]) => (
            <Descriptions.Item key={key} label={key}>
              <span style={{ wordBreak: 'break-all' }}>
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </span>
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}

      {(selectedNode || selectedEdge) && (
        <>
          <div style={{ fontWeight: 600, margin: '20px 0 10px' }}>图谱摘要</div>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="当前节点数">{displayNodeCount}</Descriptions.Item>
            <Descriptions.Item label="当前关系数">{displayEdgeCount}</Descriptions.Item>
            <Descriptions.Item label="视图模式">
              {VIEW_MODE_LABELS[viewMode] || viewMode}
            </Descriptions.Item>
            <Descriptions.Item label="布局模式">
              {LAYOUT_MODE_LABELS[layoutMode] || layoutMode}
            </Descriptions.Item>
            <Descriptions.Item label="Trace ID">{traceId || '-'}</Descriptions.Item>
            <Descriptions.Item label="是否截断">{summary.truncated ? '是' : '否'}</Descriptions.Item>
            {summary.truncatedBy && (
              <Descriptions.Item label="截断原因">{summary.truncatedBy}</Descriptions.Item>
            )}
            <Descriptions.Item label="Warnings">
              {warnings.length ? warnings.join('；') : '无'}
            </Descriptions.Item>
          </Descriptions>
        </>
      )}
    </Drawer>
  );
};

export default GraphDetailDrawer;
