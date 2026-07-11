import { PageContainer } from '@ant-design/pro-components';
import {
  Button,
  Card,
  Col,
  Radio,
  Row,
  Space,
} from 'antd';
import {
  CloudDownloadOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import React from 'react';
import { useCrawlStore } from './store/crawlStore';
import { useCrawlSSE } from './hooks/useCrawlSSE';
import QuickInputPanel from './components/QuickInputPanel';
import ComplexInputPanel from './components/ComplexInputPanel';
import TemplatePanel from './components/TemplatePanel';
import CrawlProgress from './components/CrawlProgress';
import CrawlResult from './components/CrawlResult';
import TaskHistory from './components/TaskHistory';
import CrawledFileList from './components/CrawledFileList';
import JsonArtifactList from './components/JsonArtifactList';

const DataCollectionPage: React.FC = () => {
  const mode = useCrawlStore((s) => s.mode);
  const isRunning = useCrawlStore((s) => s.isRunning);
  const result = useCrawlStore((s) => s.result);
  const templateId = useCrawlStore((s) => s.templateId);
  const setMode = useCrawlStore((s) => s.setMode);
  const { startCrawl, cancelCrawl } = useCrawlSSE();

  const dataType = useCrawlStore((s) => s.dataType);
  const sources = useCrawlStore((s) => s.sources);
  const keywords = useCrawlStore((s) => s.keywords);
  const maxPages = useCrawlStore((s) => s.maxPages);
  const maxFiles = useCrawlStore((s) => s.maxFiles);
  const dateRange = useCrawlStore((s) => s.dateRange);
  const nlQuery = useCrawlStore((s) => s.nlQuery);
  const parsedIntent = useCrawlStore((s) => s.parsedIntent);
  const storeTemplateId = useCrawlStore((s) => s.templateId);

  const handleStart = () => {
    const payload: any = {
      mode: mode === 'template' ? 'template' : mode === 'complex' ? 'complex' : 'quick',
      data_type: dataType,
      sources: sources.length > 0 ? sources : undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
      max_pages: maxPages,
      max_files: maxFiles || 0,
      date_start: dateRange?.[0] || undefined,
      date_end: dateRange?.[1] || undefined,
    };

    if (mode === 'complex') {
      payload.natural_language_query = nlQuery;
      if (parsedIntent) {
        payload.sources = parsedIntent.sources;
        payload.keywords = parsedIntent.keywords;
        payload.max_pages = parsedIntent.max_pages;
      }
    }

    if (mode === 'template') {
      payload.template_id = storeTemplateId;
    }

    startCrawl(payload);
  };

  return (
    <PageContainer
      header={{
        title: (
          <Space>
            <CloudDownloadOutlined />
            <span>数据采集</span>
          </Space>
        ),
        subTitle: '多智能体协同爬取系统 — 快速 / 智能 / 模板 三种模式',
      }}
    >
      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Card
            title="采集配置"
            extra={
              <Radio.Group
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                size="small"
              >
                <Radio.Button value="quick">快速采集</Radio.Button>
                <Radio.Button value="complex">智能采集</Radio.Button>
                <Radio.Button value="template">模板采集</Radio.Button>
              </Radio.Group>
            }
            style={{ marginBottom: 16 }}
          >
            {mode === 'quick' && <QuickInputPanel />}
            {mode === 'complex' && <ComplexInputPanel />}
            {mode === 'template' && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <TemplatePanel />
                <div style={{ marginTop: 12, color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
                  点击上方模板即可自动填充采集参数
                </div>
              </div>
            )}

            <div style={{ marginTop: 20, textAlign: 'right' }}>
              <Space>
                {isRunning ? (
                  <Button danger icon={<StopOutlined />} onClick={cancelCrawl}>
                    取消采集
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={handleStart}
                    size="large"
                  >
                    开始采集
                  </Button>
                )}
              </Space>
            </div>
          </Card>

          {isRunning && (
            <>
              <Card title="采集进度" style={{ marginBottom: 16 }}>
                <CrawlProgress />
              </Card>
              <Card title="已采集文件" style={{ marginBottom: 16 }}>
                <CrawledFileList />
              </Card>
            </>
          )}

          {result && !isRunning && (
            <>
              <Card title="采集结果" style={{ marginBottom: 16 }}>
                <CrawlResult />
              </Card>
              <div style={{ marginBottom: 16 }}>
                <CrawledFileList />
              </div>
            </>
          )}

          {!isRunning && !result && (
            <div style={{ marginBottom: 16 }}>
              <CrawledFileList />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <JsonArtifactList />
          </div>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="采集模板" size="small" style={{ marginBottom: 16 }}>
            <TemplatePanel />
          </Card>
          <div style={{ marginBottom: 16 }}>
            <JsonArtifactList compact />
          </div>
          <Card title="历史任务" size="small">
            <TaskHistory />
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default DataCollectionPage;
