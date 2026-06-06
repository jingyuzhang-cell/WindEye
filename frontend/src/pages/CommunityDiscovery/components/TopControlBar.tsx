import {
  CaretRightOutlined,
  ReloadOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  Button,
  InputNumber,
  Select,
  Space,
  Switch,
  Tooltip,
} from 'antd';
import React, { useEffect, useState } from 'react';
import type { AlgorithmInfo, DiscoverParams } from '../service';
import { getAlgorithms } from '../service';

const LAYER_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'Subject', label: '主体' },
  { value: 'Event', label: '事件' },
  { value: 'Feature', label: '特征' },
  { value: 'Regulation', label: '法规' },
];

interface TopControlBarProps {
  loading: boolean;
  onDiscover: (params: DiscoverParams) => void;
  onCompare?: (params: Omit<DiscoverParams, 'method'>) => void;
  onReset: () => void;
}

const TopControlBar: React.FC<TopControlBarProps> = ({ loading, onDiscover, onCompare, onReset }) => {
  const [algorithms, setAlgorithms] = useState<AlgorithmInfo[]>([]);
  const [method, setMethod] = useState<string>('wcc');
  const [layer, setLayer] = useState<string>('all');
  const [minSize, setMinSize] = useState<number>(3);
  const [maxNodes, setMaxNodes] = useState<number>(5000);
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    getAlgorithms()
      .then(setAlgorithms)
      .catch(() => {
        // Fallback to known algorithms if API unavailable
        setAlgorithms([
          { name: 'wcc', label: 'WCC', description: '连通分量', complexity: 'O(n+m)' },
          { name: 'louvain', label: 'Louvain', description: '模块度优化', complexity: 'O(n log n)' },
          { name: 'label_propagation', label: 'LPA', description: '标签传播', complexity: 'O(n+m)' },
          { name: 'leiden', label: 'Leiden', description: 'Leiden算法', complexity: 'O(n log n)' },
          { name: 'girvan_newman', label: 'G-N', description: '边介数分裂', complexity: 'O(n·m²)' },
          { name: 'spectral', label: 'Spectral', description: '谱聚类', complexity: 'O(n³)' },
          { name: 'infomap', label: 'Infomap', description: '信息论随机游走', complexity: 'O(m)' },
        ]);
      });
  }, []);

  const handleDiscover = () => {
    if (compareMode && onCompare) {
      onCompare({ layer, minSize, maxNodes });
    } else {
      onDiscover({ layer, method, minSize, maxNodes });
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        padding: '6px 16px',
      }}
    >
      {!compareMode && (
        <Select
          size="small"
          value={method}
          onChange={setMethod}
          options={algorithms.map((a) => ({
            value: a.name,
            label: (
              <Tooltip title={`${a.description} — ${a.complexity}`}>
                {a.label}
              </Tooltip>
            ),
          }))}
          style={{ width: 130 }}
          popupMatchSelectWidth={false}
        />
      )}

      {compareMode && (
        <span
          style={{
            fontSize: 12,
            color: '#1890ff',
            fontWeight: 600,
            background: 'rgba(24,144,255,0.08)',
            padding: '2px 10px',
            borderRadius: 12,
          }}
        >
          <SwapOutlined style={{ marginRight: 4 }} />
          对比模式 (7 种算法)
        </span>
      )}

      <Select
        size="small"
        value={layer}
        onChange={setLayer}
        options={LAYER_OPTIONS}
        style={{ width: 80 }}
        variant="borderless"
      />

      <Tooltip title="最小群体规模">
        <InputNumber
          size="small"
          min={1}
          max={50}
          value={minSize}
          onChange={(v) => setMinSize(v ?? 3)}
          style={{ width: 56 }}
          variant="borderless"
          prefix={<span style={{ color: '#999', fontSize: 11 }}>≥</span>}
        />
      </Tooltip>

      <Tooltip title="最大节点数">
        <InputNumber
          size="small"
          min={100}
          max={10000}
          step={500}
          value={maxNodes}
          onChange={(v) => setMaxNodes(v ?? 5000)}
          style={{ width: 76 }}
          variant="borderless"
          prefix={<span style={{ color: '#999', fontSize: 11 }}>≤</span>}
        />
      </Tooltip>

      <Tooltip title={compareMode ? '对比模式：同时运行所有算法' : '单算法模式'}>
        <Switch
          size="small"
          checked={compareMode}
          onChange={setCompareMode}
          checkedChildren="对比"
          unCheckedChildren="单选"
        />
      </Tooltip>

      <Space size={2}>
        <Tooltip title={compareMode ? '开始对比分析' : '开始发现'}>
          <Button
            type="primary"
            size="small"
            icon={<CaretRightOutlined />}
            loading={loading}
            onClick={handleDiscover}
          />
        </Tooltip>
        <Tooltip title="重置">
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={onReset}
            disabled={loading}
          />
        </Tooltip>
      </Space>
    </div>
  );
};

export default TopControlBar;
