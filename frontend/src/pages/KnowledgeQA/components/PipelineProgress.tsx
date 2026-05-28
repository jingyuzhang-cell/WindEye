import React, { useMemo } from 'react';
import { Steps, Tag, Typography } from 'antd';
import {
  SearchOutlined,
  ApartmentOutlined,
  DatabaseOutlined,
  SafetyOutlined,
  FileTextOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { PipelineStage } from '../types/api';

const { Text } = Typography;

const STAGE_ICONS: Record<string, React.ReactNode> = {
  intent_parsing: <SearchOutlined />,
  path_planning: <ApartmentOutlined />,
  graph_retrieval: <DatabaseOutlined />,
  fact_verification: <SafetyOutlined />,
  answer_generation: <FileTextOutlined />,
};

const STAGE_LABELS: Record<string, string> = {
  intent_parsing: '意图解析',
  path_planning: '路径规划',
  graph_retrieval: '图谱检索',
  fact_verification: '事实校验',
  answer_generation: '答案生成',
};

interface PipelineProgressProps {
  stages: PipelineStage[];
  collapsed?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const PipelineProgress: React.FC<PipelineProgressProps> = ({ stages, collapsed }) => {
  const stageMap = useMemo(() => {
    const map = new Map<string, PipelineStage>();
    for (const s of stages) {
      const existing = map.get(s.stage_id);
      if (!existing || s.timestamp > existing.timestamp) {
        map.set(s.stage_id, s);
      }
    }
    return map;
  }, [stages]);

  const stageOrder = ['intent_parsing', 'path_planning', 'graph_retrieval', 'fact_verification', 'answer_generation'];

  const allDone = stageOrder.every((id) => {
    const s = stageMap.get(id);
    return s && s.progress >= 1.0;
  });

  const totalDuration = useMemo(() => {
    if (!allDone) return null;
    const timestamps = stageOrder
      .map((id) => stageMap.get(id)?.timestamp)
      .filter(Boolean) as number[];
    if (timestamps.length < 2) return null;
    return Math.max(...timestamps) - Math.min(...timestamps);
  }, [allDone, stageMap]);

  // Current active agent
  const currentStage = stages[stages.length - 1];
  const currentAgent = currentStage?.agent || '';
  const currentAction = currentStage?.agent_action || '';

  if (collapsed && allDone) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 0',
          marginBottom: 8,
        }}
      >
        <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          推理完成 · {stageOrder.length} 阶段
          {totalDuration ? ` · ${formatDuration(totalDuration)}` : ''}
        </Text>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '10px 14px',
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        borderRadius: 10,
        border: '1px solid #e2e8f0',
        marginBottom: 10,
      }}
    >
      <Steps
        size="small"
        current={-1}
        items={stageOrder.map((id) => {
          const s = stageMap.get(id);
          let status: 'wait' | 'process' | 'finish' | 'error' = 'wait';
          if (s?.progress === -1) status = 'error';
          else if (s?.progress !== undefined && s.progress >= 1.0) status = 'finish';
          else if (s) status = 'process';

          const icon =
            status === 'finish'
              ? React.cloneElement(STAGE_ICONS[id] as React.ReactElement, {
                  style: { color: '#52c41a' },
                })
              : status === 'error'
              ? React.cloneElement(STAGE_ICONS[id] as React.ReactElement, {
                  style: { color: '#ff4d4f' },
                })
              : status === 'process'
              ? React.cloneElement(STAGE_ICONS[id] as React.ReactElement, {
                  style: { color: '#1677ff' },
                })
              : STAGE_ICONS[id];

          return {
            title: (
              <span style={{ fontSize: 11, fontWeight: status === 'process' ? 600 : 400 }}>
                {STAGE_LABELS[id]}
              </span>
            ),
            status,
            icon,
          };
        })}
      />

      {/* Agent status bubble */}
      {currentAgent && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
            padding: '4px 10px',
            background: 'rgba(255, 255, 255, 0.8)',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
          }}
        >
          <Tag
            color="processing"
            style={{
              fontSize: 10,
              lineHeight: '18px',
              margin: 0,
              borderRadius: 4,
            }}
            icon={<LoadingOutlined spin />}
          >
            {currentAgent}
          </Tag>
          <Text
            type="secondary"
            style={{
              fontSize: 11,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {currentAction}
          </Text>
        </div>
      )}

      {/* Error indicator */}
      {currentStage?.progress === -1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
          <Text type="danger" style={{ fontSize: 11 }}>
            {currentAction}
          </Text>
        </div>
      )}
    </div>
  );
};

export default PipelineProgress;
