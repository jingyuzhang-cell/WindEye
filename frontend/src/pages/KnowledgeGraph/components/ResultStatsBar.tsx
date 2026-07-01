import { Button, Popover, Space, Tag } from 'antd';
import React from 'react';
import type { GraphFilterLayer } from '@/types/knowledgeGraph';
import { LAYER_COLORS } from '../config/visualTheme';
import type { CurrentResultStats } from '../utils/graphStats';

const LAYER_ORDER: GraphFilterLayer[] = ['Subject', 'Event', 'Feature', 'Regulation'];

interface ResultStatsBarProps {
  stats: CurrentResultStats;
  selectedNodeTypesByLayer: Record<GraphFilterLayer, string[]>;
  selectedEdgeTypes: string[];
  onSelectNodeType: (layer: GraphFilterLayer, type: string) => void;
  onSelectEdgeType: (type: string) => void;
  onClearNodeTypes: () => void;
  onClearEdgeTypes: () => void;
}

function sortedEntries(counts: Record<string, number>): Array<[string, number]> {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function resolveNodeTypeLayer(stats: CurrentResultStats, type: string): GraphFilterLayer {
  const matched = LAYER_ORDER
    .map(layer => ({
      layer,
      count: stats.nodeTypeCountsByLayer[layer]?.[type] || 0,
    }))
    .sort((left, right) => right.count - left.count)[0];
  return matched?.count ? matched.layer : 'Subject';
}

const ResultStatsBar: React.FC<ResultStatsBarProps> = ({
  stats,
  selectedNodeTypesByLayer,
  selectedEdgeTypes,
  onSelectNodeType,
  onSelectEdgeType,
  onClearNodeTypes,
  onClearEdgeTypes,
}) => {
  const nodeEntries = sortedEntries(stats.nodeTypeCounts);
  const edgeEntries = sortedEntries(stats.edgeTypeCounts);

  const nodeTypeContent = (
    <div style={{ width: 320, maxHeight: 360, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>节点类型明细</strong>
        <Button size="small" type="link" onClick={onClearNodeTypes}>
          清空
        </Button>
      </div>
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        {nodeEntries.map(([type, count]) => {
          const layer = resolveNodeTypeLayer(stats, type);
          const selected = selectedNodeTypesByLayer[layer]?.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSelectNodeType(layer, type)}
              style={{
                width: '100%',
                border: `1px solid ${selected ? LAYER_COLORS[layer].color : '#f0f0f0'}`,
                borderRadius: 6,
                padding: '6px 8px',
                background: selected ? LAYER_COLORS[layer].background : '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#262626',
              }}
            >
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    marginRight: 8,
                    background: LAYER_COLORS[layer].color,
                  }}
                />
                {type}
              </span>
              <Tag color={LAYER_COLORS[layer].color}>{count.toLocaleString()}</Tag>
            </button>
          );
        })}
      </Space>
    </div>
  );

  const edgeTypeContent = (
    <div style={{ width: 320, maxHeight: 360, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>关系类型明细</strong>
        <Button size="small" type="link" onClick={onClearEdgeTypes}>
          清空
        </Button>
      </div>
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        {edgeEntries.map(([type, count]) => {
          const selected = selectedEdgeTypes.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSelectEdgeType(type)}
              style={{
                width: '100%',
                border: `1px solid ${selected ? '#1677ff' : '#f0f0f0'}`,
                borderRadius: 6,
                padding: '6px 8px',
                background: selected ? 'rgba(22,119,255,0.06)' : '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#262626',
              }}
            >
              <span>{type}</span>
              <Tag color={selected ? 'blue' : 'default'}>{count.toLocaleString()}</Tag>
            </button>
          );
        })}
      </Space>
    </div>
  );

  return (
    <Space size={[6, 6]} wrap>
      <Tag>{stats.totalNodeCount.toLocaleString()} 节点</Tag>
      <Tag>{stats.totalEdgeCount.toLocaleString()} 关系</Tag>
      {LAYER_ORDER.map(layer => (
        <Tag key={layer} color={LAYER_COLORS[layer].color}>
          {LAYER_COLORS[layer].label} {(stats.layerNodeCounts[layer] || 0).toLocaleString()}
        </Tag>
      ))}
      <Popover trigger="click" placement="bottomLeft" content={nodeTypeContent}>
        <Tag color="processing" style={{ cursor: 'pointer' }}>
          节点类型 {stats.nodeTypeCount.toLocaleString()}
        </Tag>
      </Popover>
      <Popover trigger="click" placement="bottomLeft" content={edgeTypeContent}>
        <Tag color="default" style={{ cursor: 'pointer' }}>
          关系类型 {stats.edgeTypeCount.toLocaleString()}
        </Tag>
      </Popover>
    </Space>
  );
};

export default ResultStatsBar;
