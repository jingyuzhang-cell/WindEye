import { DatePicker, InputNumber, Select, Slider, Space } from 'antd';
import React from 'react';
import { useCrawlStore } from '../store/crawlStore';

const { RangePicker } = DatePicker;

const DATA_TYPE_OPTIONS = [
  { value: 'risk_event', label: '风险事件' },
  { value: 'risk_sentiment', label: '风险舆情' },
];

const SOURCE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  risk_event: [
    { value: 'sse', label: '上交所' },
    { value: 'szse', label: '深交所' },
    { value: 'bse', label: '北交所' },
  ],
  risk_sentiment: [{ value: 'stockstar', label: '证券之星' }],
};

const QuickInputPanel: React.FC = () => {
  const dataType = useCrawlStore((s) => s.dataType);
  const sources = useCrawlStore((s) => s.sources);
  const maxPages = useCrawlStore((s) => s.maxPages);
  const maxFiles = useCrawlStore((s) => s.maxFiles);
  const setDataType = useCrawlStore((s) => s.setDataType);
  const setSources = useCrawlStore((s) => s.setSources);
  const setDateRange = useCrawlStore((s) => s.setDateRange);
  const setKeywords = useCrawlStore((s) => s.setKeywords);
  const setMaxPages = useCrawlStore((s) => s.setMaxPages);
  const setMaxFiles = useCrawlStore((s) => s.setMaxFiles);

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <div style={{ marginBottom: 4, fontWeight: 500 }}>数据类型</div>
        <Select
          value={dataType}
          onChange={(v) => {
            setDataType(v);
            setSources([]);
          }}
          options={DATA_TYPE_OPTIONS}
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <div style={{ marginBottom: 4, fontWeight: 500 }}>数据源 (可多选)</div>
        <Select
          mode="multiple"
          value={sources}
          onChange={setSources}
          options={SOURCE_OPTIONS[dataType] || []}
          placeholder="选择数据源，留空则使用全部"
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <div style={{ marginBottom: 4, fontWeight: 500 }}>日期范围 (可选)</div>
        <RangePicker
          style={{ width: '100%' }}
          onChange={(_, dateStrings) => setDateRange([dateStrings[0], dateStrings[1]])}
        />
      </div>

      <div>
        <div style={{ marginBottom: 4, fontWeight: 500 }}>关键词 (可选，回车添加)</div>
        <Select
          mode="tags"
          placeholder="输入关键词后按回车"
          onChange={setKeywords}
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <div style={{ marginBottom: 4, fontWeight: 500 }}>最大爬取页数: {maxPages}</div>
        <Slider min={1} max={50} value={maxPages} onChange={setMaxPages} />
      </div>

      <div>
        <div style={{ marginBottom: 4, fontWeight: 500 }}>限制下载文件数 (0 = 不限)</div>
        <InputNumber
          min={0}
          max={500}
          value={maxFiles}
          onChange={(v) => setMaxFiles(v || 0)}
          style={{ width: '100%' }}
          placeholder="0 表示不限制"
        />
      </div>
    </Space>
  );
};

export default QuickInputPanel;
