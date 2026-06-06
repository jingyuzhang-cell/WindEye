import {
  BugOutlined,
  ClearOutlined,
  DownOutlined,
  RightOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import {
  Button,
  Collapse,
  Drawer,
  Empty,
  Space,
  Tag,
  Typography,
  Tooltip,
} from 'antd';
import React, { useState, useMemo } from 'react';
import type { AgentTraceEntry } from '../store/agentStore';

const { Text, Paragraph } = Typography;

const AGENT_COLORS: Record<string, string> = {
  intent_agent: '#2855D1',
  probe: '#722ed1',
  planner: '#722ed1',
  compiler: '#fa8c16',
  verifier: '#52c41a',
  risk_analyst: '#f5222d',
  compliance: '#722ed1',
  scoring: '#fa8c16',
  governance: '#52c41a',
  reporter: '#2855D1',
};

const AGENT_LABELS: Record<string, string> = {
  intent_agent: '意图识别',
  probe: '探查',
  planner: '规划',
  compiler: '编译',
  verifier: '验证',
  risk_analyst: '风险分析',
  compliance: '合规匹配',
  scoring: '风险评分',
  governance: '治理方案',
  reporter: '报告生成',
};

interface AgentTracePanelProps {
  traces: AgentTraceEntry[];
  visible: boolean;
  onClose: () => void;
  onClear: () => void;
}

const AgentTracePanel: React.FC<AgentTracePanelProps> = ({
  traces,
  visible,
  onClose,
  onClear,
}) => {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const groupedTraces = useMemo(() => {
    const groups: Record<string, AgentTraceEntry[]> = {};
    for (const trace of traces) {
      if (!groups[trace.agent]) {
        groups[trace.agent] = [];
      }
      groups[trace.agent].push(trace);
    }
    return groups;
  }, [traces]);

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            <BugOutlined style={{ marginRight: 8, color: '#fa8c16' }} />
            Agent 调试日志
            {traces.length > 0 && (
              <Tag style={{ marginLeft: 8, borderRadius: 10 }}>{traces.length}</Tag>
            )}
          </span>
          <Space size={4}>
            <Tooltip title="清空日志">
              <Button
                size="small"
                type="text"
                icon={<ClearOutlined />}
                onClick={onClear}
                disabled={traces.length === 0}
              />
            </Tooltip>
            <Tooltip title="关闭">
              <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
            </Tooltip>
          </Space>
        </div>
      }
      open={visible}
      onClose={onClose}
      width={480}
      placement="right"
      styles={{ body: { padding: '12px 16px' } }}
    >
      {traces.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text type="secondary">暂无 Agent 调试日志，发送查询后自动采集</Text>}
        />
      ) : (
        <Collapse
          size="small"
          activeKey={expandedKeys}
          onChange={(keys) => setExpandedKeys(Array.isArray(keys) ? keys as string[] : [keys as string])}
          expandIcon={({ isActive }) => (isActive ? <DownOutlined /> : <RightOutlined />)}
          items={Object.entries(groupedTraces).map(([agent, entries]) => ({
            key: agent,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: AGENT_COLORS[agent] || '#94a3b8',
                  }}
                />
                <Text strong style={{ fontSize: 13 }}>
                  {AGENT_LABELS[agent] || agent}
                </Text>
                <Tag style={{ borderRadius: 10, fontSize: 10, margin: 0 }}>{entries.length}</Tag>
              </div>
            ),
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {entries.map((entry, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '8px 10px',
                      background: '#f8fafc',
                      borderRadius: 6,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Text strong style={{ fontSize: 12, color: '#1e293b' }}>{entry.step}</Text>
                      <Text type="secondary" style={{ fontSize: 10 }}>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </Text>
                    </div>
                    <Paragraph
                      ellipsis={{ rows: 2, expandable: true }}
                      style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}
                    >
                      {entry.summary}
                    </Paragraph>
                    {entry.metrics && Object.keys(entry.metrics).length > 0 && (
                      <Collapse
                        size="small"
                        ghost
                        items={[{
                          key: `metrics-${idx}`,
                          label: <Text style={{ fontSize: 10, color: '#94a3b8' }}>指标详情</Text>,
                          children: (
                            <pre
                              style={{
                                fontSize: 10,
                                background: '#1e293b',
                                color: '#e2e8f0',
                                padding: 8,
                                borderRadius: 4,
                                overflow: 'auto',
                                maxHeight: 200,
                                margin: 0,
                              }}
                            >
                              {JSON.stringify(entry.metrics, null, 2)}
                            </pre>
                          ),
                        }]}
                      />
                    )}
                  </div>
                ))}
              </div>
            ),
          }))}
        />
      )}
    </Drawer>
  );
};

export default AgentTracePanel;
