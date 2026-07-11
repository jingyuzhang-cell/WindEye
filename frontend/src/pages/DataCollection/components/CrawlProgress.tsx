import { Alert, Progress, Statistic } from 'antd';
import React from 'react';
import { useCrawlStore } from '../store/crawlStore';

const CrawlProgress: React.FC = () => {
  const progress = useCrawlStore((s) => s.progress);
  const stage = useCrawlStore((s) => s.stage);
  const stageMessage = useCrawlStore((s) => s.stageMessage);
  const error = useCrawlStore((s) => s.error);
  const totalFilesDownloaded = useCrawlStore((s) => s.totalFilesDownloaded);
  const targetFiles = useCrawlStore((s) => s.targetFiles);
  const unlimitedMode = targetFiles === 0;
  const fileProgress = targetFiles > 0
    ? Math.min(100, Math.round((totalFilesDownloaded / targetFiles) * 100))
    : Math.round(progress);

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <Statistic
          title={targetFiles > 0 ? '已采集 / 目标' : '已采集文件'}
          value={targetFiles > 0 ? `${totalFilesDownloaded} / ${targetFiles}` : totalFilesDownloaded}
          valueStyle={{ fontSize: 28, color: '#1890ff' }}
        />
        <Progress
          percent={fileProgress}
          size="small"
          status={error ? 'exception' : undefined}
          style={{ marginTop: 12 }}
        />
      </div>
      {stage === 'crawling' && unlimitedMode && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="当前为全量采集模式"
          description="限制下载文件数为 0，本次会在所选时间范围内按最大页数继续抓取。"
        />
      )}
      {stageMessage && (
        <Alert
          type={error ? 'error' : 'info'}
          message={stageMessage}
          style={{ marginBottom: 12 }}
          showIcon
        />
      )}
    </div>
  );
};

export default CrawlProgress;
