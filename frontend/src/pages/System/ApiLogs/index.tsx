import { PageContainer, type ProColumns, ProTable } from '@ant-design/pro-components';
import { Button, Card, Col, Descriptions, Drawer, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import React, { useEffect, useState } from 'react';
import { systemApi } from '@/services/system';

const { Paragraph, Text } = Typography;

type OpenApiStats = {
  apiSource: string;
  updatedAt: string;
  periods: Record<string, {
    total: number;
    success: number;
    errors: number;
    successRate: number;
    averageLatencyMs: number;
  }>;
  endpoints: Array<{
    key: string;
    name: string;
    method: string;
    path: string;
    today: number;
    week: number;
    month: number;
    total: number;
    errors: number;
    successRate: number;
    averageLatencyMs: number;
  }>;
  daily: Array<{
    date: string;
    count: number;
    errors: number;
  }>;
  weekly: Array<{
    week: string;
    count: number;
    errors: number;
  }>;
  monthly: Array<{
    month: string;
    count: number;
    errors: number;
  }>;
};

type ApiLogsProps = {
  embedded?: boolean;
};

export default function ApiLogs({ embedded = false }: ApiLogsProps) {
  const [stats, setStats] = useState<OpenApiStats>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>();

  useEffect(() => {
    void systemApi.openApiStats().then((res) => setStats(res.data));
  }, []);

  const columns: ProColumns<any>[] = [
    { title: '时间', dataIndex: 'createdAt', valueType: 'dateTime', search: false },
    { title: '接口名称', dataIndex: 'apiName', search: false, ellipsis: true },
    {
      title: '方法',
      dataIndex: 'method',
      valueType: 'select',
      valueEnum: {
        GET: { text: 'GET' },
        POST: { text: 'POST' },
        PUT: { text: 'PUT' },
        PATCH: { text: 'PATCH' },
        DELETE: { text: 'DELETE' },
      },
      width: 90,
    },
    { title: '路径', dataIndex: 'path', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'statusCode',
      valueType: 'digit',
      render: (_, row) => <Tag color={row.statusCode < 400 ? 'success' : 'error'}>{row.statusCode}</Tag>,
      width: 90,
    },
    {
      title: '结果',
      dataIndex: 'success',
      valueType: 'select',
      valueEnum: {
        true: { text: '成功', status: 'Success' },
        false: { text: '失败', status: 'Error' },
      },
      render: (_, row) => <Tag color={row.success ? 'success' : 'error'}>{row.success ? '成功' : '失败'}</Tag>,
      width: 90,
    },
    { title: '耗时(ms)', dataIndex: 'latencyMs', sorter: true, search: false },
    { title: '最小耗时', dataIndex: 'minLatencyMs', hideInTable: true, valueType: 'digit' },
    { title: '最大耗时', dataIndex: 'maxLatencyMs', hideInTable: true, valueType: 'digit' },
    { title: '调用时间', dataIndex: 'createdAtRange', hideInTable: true, valueType: 'dateTimeRange' },
    { title: '用户名', dataIndex: 'username', hideInTable: true },
    { title: 'Trace ID', dataIndex: 'traceId', copyable: true, search: false },
    { title: 'Trace ID', dataIndex: 'traceId', hideInTable: true },
    {
      title: '操作',
      valueType: 'option',
      render: (_, row) => [
        <Button
          key="detail"
          type="link"
          onClick={async () => {
            const res = await systemApi.openApiCallLogDetail(row.id);
            setDetail(res.data);
            setDetailOpen(true);
          }}
        >
          查看详情
        </Button>,
      ],
    },
  ];

  const endpointColumns = [
    { title: '开放接口', dataIndex: 'name' },
    {
      title: '方法',
      dataIndex: 'method',
      width: 90,
      render: (method: string) => <Tag color="blue">{method}</Tag>,
    },
    { title: '路径', dataIndex: 'path', ellipsis: true },
    { title: '今日', dataIndex: 'today', width: 90 },
    { title: '本周', dataIndex: 'week', width: 90 },
    { title: '本月', dataIndex: 'month', width: 90 },
    { title: '累计', dataIndex: 'total', width: 90 },
    { title: '错误数', dataIndex: 'errors', width: 90 },
    {
      title: '成功率',
      dataIndex: 'successRate',
      width: 100,
      render: (value: number) => `${value}%`,
    },
    { title: '平均耗时(ms)', dataIndex: 'averageLatencyMs', width: 120 },
  ];

  const dailyColumns = [
    { title: '日期', dataIndex: 'date' },
    { title: '调用次数', dataIndex: 'count' },
    {
      title: '错误数',
      dataIndex: 'errors',
      render: (errors: number) => <Tag color={errors > 0 ? 'error' : 'success'}>{errors}</Tag>,
    },
    {
      title: '成功率',
      dataIndex: 'successRate',
      render: (value: number) => `${value}%`,
    },
  ];

  const weeklyColumns = [
    { title: '周', dataIndex: 'week' },
    { title: '调用次数', dataIndex: 'count' },
    {
      title: '错误数',
      dataIndex: 'errors',
      render: (errors: number) => <Tag color={errors > 0 ? 'error' : 'success'}>{errors}</Tag>,
    },
    {
      title: '成功率',
      dataIndex: 'successRate',
      render: (value: number) => `${value}%`,
    },
  ];

  const monthlyColumns = [
    { title: '月份', dataIndex: 'month' },
    { title: '调用次数', dataIndex: 'count' },
    {
      title: '错误数',
      dataIndex: 'errors',
      render: (errors: number) => <Tag color={errors > 0 ? 'error' : 'success'}>{errors}</Tag>,
    },
    {
      title: '成功率',
      dataIndex: 'successRate',
      render: (value: number) => `${value}%`,
    },
  ];

  const content = (
    <>
      <Card
        title="监控总览"
        style={{ marginBottom: 16 }}
        extra={<Text type="secondary">来源：{stats?.apiSource ?? 'docs/开放API接口文档.docx'}</Text>}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Statistic title="今日调用" value={stats?.periods.today.total ?? 0} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic title="本周调用" value={stats?.periods.week.total ?? 0} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic title="本月调用" value={stats?.periods.month.total ?? 0} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic title="累计调用" value={stats?.periods.total.total ?? 0} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="今日成功率"
              suffix="%"
              precision={1}
              value={stats?.periods.today.successRate ?? 100}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic title="今日错误数" value={stats?.periods.today.errors ?? 0} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic title="近 7 天调用" value={stats?.periods.last7Days.total ?? 0} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="平均耗时(ms)"
              precision={1}
              value={stats?.periods.last30Days.averageLatencyMs ?? 0}
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={16}>
          <Card title="开放接口调用排行">
            <Table
              size="small"
              rowKey="key"
              columns={endpointColumns}
              dataSource={stats?.endpoints ?? []}
              pagination={false}
            />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="近 30 天每日调用">
            <Table
              size="small"
              rowKey="date"
              columns={dailyColumns}
              dataSource={(stats?.daily ?? []).slice(-10).reverse()}
              pagination={false}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={12}>
          <Card title="近 12 周调用">
            <Table
              size="small"
              rowKey="week"
              columns={weeklyColumns}
              dataSource={(stats?.weekly ?? []).slice(-6).reverse()}
              pagination={false}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="近 12 月调用">
            <Table
              size="small"
              rowKey="month"
              columns={monthlyColumns}
              dataSource={(stats?.monthly ?? []).slice(-6).reverse()}
              pagination={false}
            />
          </Card>
        </Col>
      </Row>

      <ProTable
        rowKey="id"
        headerTitle="开放 API 调用明细"
        columns={columns}
        request={async (params) => {
          const [startTime, endTime] = Array.isArray(params.createdAtRange)
            ? params.createdAtRange
            : [];
          const res = await systemApi.openApiCallLogs({
            page: params.current,
            pageSize: params.pageSize,
            method: params.method,
            path: params.path,
            statusCode: params.statusCode,
            success: params.success,
            minLatencyMs: params.minLatencyMs,
            maxLatencyMs: params.maxLatencyMs,
            startTime,
            endTime,
            traceId: params.traceId,
            username: params.username,
          });
          return { data: res.data, total: res.total, success: res.success };
        }}
      />
      <Drawer
        title="开放 API 调用详情"
        width={720}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="接口名称">{detail?.apiName ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Trace ID">{detail?.traceId ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="请求方法">{detail?.method ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="请求路径">{detail?.path ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="请求用户">{detail?.username ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="IP">{detail?.ipAddress ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="状态码">{detail?.statusCode ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="结果">
            <Tag color={detail?.success ? 'success' : 'error'}>{detail?.success ? '成功' : '失败'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="耗时">{detail?.latencyMs ?? 0} ms</Descriptions.Item>
          <Descriptions.Item label="调用时间">{detail?.createdAt ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="错误信息">{detail?.errorMessage ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="User-Agent">{detail?.userAgent ?? '-'}</Descriptions.Item>
        </Descriptions>
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size={16}>
          <Card size="small" title="请求摘要">
            <Paragraph style={{ marginBottom: 0 }}>
              <pre>{JSON.stringify(detail?.requestSummary ?? {}, null, 2)}</pre>
            </Paragraph>
          </Card>
          <Card size="small" title="响应摘要">
            <Paragraph style={{ marginBottom: 0 }}>
              <pre>{JSON.stringify(detail?.responseSummary ?? {}, null, 2)}</pre>
            </Paragraph>
          </Card>
        </Space>
      </Drawer>
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <PageContainer
      title="开放 API 调用监控"
      content="合并展示开放 API 总览、接口排行、周期趋势和调用明细。统计范围来自开放 API 接口文档。"
    >
      {content}
    </PageContainer>
  );
}
