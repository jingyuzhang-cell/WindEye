import { DatePicker, InputNumber, Slider, Space } from 'antd';
import React from 'react';
import { useCrawlStore } from '../store/crawlStore';

const { RangePicker } = DatePicker;

const QuickInputPanel: React.FC = () => {
  const maxPages = useCrawlStore((s) => s.maxPages);
  const maxFiles = useCrawlStore((s) => s.maxFiles);
  const setDateRange = useCrawlStore((s) => s.setDateRange);
  const setMaxPages = useCrawlStore((s) => s.setMaxPages);
  const setMaxFiles = useCrawlStore((s) => s.setMaxFiles);

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <div style={{ marginBottom: 4, fontWeight: 500 }}>日期范围（可选）</div>
        <RangePicker
          style={{ width: '100%' }}
          onChange={(_, dateStrings) => setDateRange([dateStrings[0], dateStrings[1]])}
        />
      </div>

      <div>
        <div style={{ marginBottom: 4, fontWeight: 500 }}>最大爬取页数：{maxPages}</div>
        <Slider min={1} max={50} value={maxPages} onChange={setMaxPages} />
      </div>

      <div>
        <div style={{ marginBottom: 4, fontWeight: 500 }}>限制下载文件数（0 = 不限）</div>
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
