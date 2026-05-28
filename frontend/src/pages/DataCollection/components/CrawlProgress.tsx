import { Alert, Progress, Statistic, Steps } from 'antd';
import React, { useEffect, useRef } from 'react';
import { useCrawlStore } from '../store/crawlStore';

const STAGES = [
  { key: 'parsing', title: '需求解析' },
  { key: 'matching', title: '数据源匹配' },
  { key: 'crawling', title: '数据爬取' },
  { key: 'assessing', title: '质量评估' },
  { key: 'trigger_etl', title: 'ETL触发' },
];

const CrawlProgress: React.FC = () => {
  const progress = useCrawlStore((s) => s.progress);
  const stage = useCrawlStore((s) => s.stage);
  const stageMessage = useCrawlStore((s) => s.stageMessage);
  const logs = useCrawlStore((s) => s.logs);
  const error = useCrawlStore((s) => s.error);
  const totalFilesDownloaded = useCrawlStore((s) => s.totalFilesDownloaded);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const currentIndex = STAGES.findIndex((s) => s.key === stage);

  const levelColor = (level: string) => {
    if (level === 'error') return '#ff4d4f';
    if (level === 'success') return '#52c41a';
    if (level === 'warning') return '#faad14';
    return 'var(--ant-color-text-secondary)';
  };

  return (
    <div>
      <Steps
        current={currentIndex >= 0 ? currentIndex : 0}
        items={STAGES.map((s) => ({ title: s.title }))}
        size="small"
        style={{ marginBottom: 16 }}
      />
      <Progress percent={Math.round(progress)} size="small" style={{ marginBottom: 12 }} />
      {stage === 'crawling' && totalFilesDownloaded > 0 && (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Statistic
            title="已下载文件"
            value={totalFilesDownloaded}
            valueStyle={{ fontSize: 28, color: '#1890ff' }}
            suffix="个"
          />
        </div>
      )}
      {stageMessage && (
        <Alert
          type={error ? 'error' : 'info'}
          message={stageMessage}
          style={{ marginBottom: 12 }}
          showIcon
        />
      )}
      <div
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: 12,
          padding: 12,
          borderRadius: 6,
          maxHeight: 240,
          overflowY: 'auto',
          lineHeight: 1.6,
        }}
      >
        {logs.map((log, i) => (
          <div key={i} style={{ color: levelColor(log.level) }}>
            <span style={{ color: '#888', marginRight: 8 }}>[{log.time}]</span>
            {log.message}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};

export default CrawlProgress;
