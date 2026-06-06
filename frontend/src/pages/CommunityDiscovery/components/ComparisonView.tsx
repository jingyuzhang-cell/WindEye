import {
  CrownOutlined,
  ThunderboltOutlined,
  PieChartOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { Empty, Table, Tag, Tooltip } from 'antd';
import React from 'react';
import type { CompareResultItem } from '../service';

interface ComparisonViewProps {
  results: CompareResultItem[];
}

function bestMark<T>(items: T[], key: (item: T) => number, higherIsBetter: boolean = true) {
  if (items.length === 0) return new Set<number>();
  const values = items.map(key);
  const best = higherIsBetter ? Math.max(...values) : Math.min(...values);
  const result = new Set<number>();
  items.forEach((_, idx) => {
    if (values[idx] === best && best !== 0) result.add(idx);
  });
  return result;
}

const ComparisonView: React.FC<ComparisonViewProps> = ({ results }) => {
  if (!results || results.length === 0) {
    return <Empty description="暂无对比数据，请先执行算法对比" />;
  }

  const validResults = results.filter((r) => !r.error);
  const bestModularity = bestMark(validResults, (r) => r.modularity);
  const bestCoverage = bestMark(validResults, (r) => r.coverage);
  const fastest = bestMark(validResults, (r) => r.runtime_ms, false);
  const mostCommunities = bestMark(validResults, (r) => r.communities_count);

  const columns = [
    {
      title: '算法',
      dataIndex: 'label',
      key: 'label',
      width: 100,
      render: (label: string, record: CompareResultItem) => (
        <span>
          {record.error ? (
            <Tooltip title={record.error}>
              <Tag color="red">{label}</Tag>
            </Tooltip>
          ) : (
            <Tag color="blue">{label}</Tag>
          )}
        </span>
      ),
    },
    {
      title: '社区数',
      dataIndex: 'communities_count',
      key: 'communities_count',
      width: 80,
      align: 'right' as const,
      render: (val: number, _: any, idx: number) => (
        <span style={{ fontWeight: mostCommunities.has(idx) ? 600 : 400 }}>
          {mostCommunities.has(idx) && <CrownOutlined style={{ color: '#faad14', marginRight: 4, fontSize: 11 }} />}
          {val || '-'}
        </span>
      ),
    },
    {
      title: '模块度',
      dataIndex: 'modularity',
      key: 'modularity',
      width: 90,
      align: 'right' as const,
      render: (val: number, _: any, idx: number) => (
        <span
          style={{
            fontWeight: bestModularity.has(idx) ? 600 : 400,
            color: val > 0.5 ? '#52c41a' : val > 0.3 ? '#faad14' : '#999',
          }}
        >
          {bestModularity.has(idx) && <CrownOutlined style={{ color: '#faad14', marginRight: 4, fontSize: 11 }} />}
          {val ? val.toFixed(4) : '-'}
        </span>
      ),
    },
    {
      title: '覆盖率',
      dataIndex: 'coverage',
      key: 'coverage',
      width: 90,
      align: 'right' as const,
      render: (val: number, _: any, idx: number) => (
        <span style={{ fontWeight: bestCoverage.has(idx) ? 600 : 400 }}>
          {bestCoverage.has(idx) && <PieChartOutlined style={{ color: '#1890ff', marginRight: 4, fontSize: 11 }} />}
          {val ? (val * 100).toFixed(1) + '%' : '-'}
        </span>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'runtime_ms',
      key: 'runtime_ms',
      width: 80,
      align: 'right' as const,
      render: (val: number, _: any, idx: number) => (
        <span style={{ fontWeight: fastest.has(idx) ? 600 : 400 }}>
          {fastest.has(idx) && <ThunderboltOutlined style={{ color: '#52c41a', marginRight: 4, fontSize: 11 }} />}
          {val ? val + 'ms' : '-'}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#1a1a2e',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <DashboardOutlined />
        算法对比结果
        <Tooltip title="绿色图标 = 最佳值">
          <Tag color="green" style={{ fontSize: 10, marginLeft: 4 }}>BEST</Tag>
        </Tooltip>
      </div>
      <Table
        dataSource={results}
        columns={columns}
        rowKey="method"
        size="small"
        pagination={false}
        locale={{ emptyText: '无对比数据' }}
        style={{ background: '#fff' }}
      />
    </div>
  );
};

export default ComparisonView;
