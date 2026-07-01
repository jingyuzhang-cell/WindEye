import { PageContainer } from '@ant-design/pro-components';
import {
  ApiOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  message,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import React, { useEffect, useState } from 'react';
import { systemApi } from '@/services/system';
import ApiLogs from '../ApiLogs';
import AuditLogs from '../AuditLogs';
import SystemPermissions from '../Permissions';
import SystemRoles from '../Roles';
import SystemUsers from '../Users';

const { Text } = Typography;

const ServiceState: React.FC<{ name: string; value?: any }> = ({ name, value }) => {
  const up = value?.status === 'up';
  return (
    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
      <Text>{name}</Text>
      <Tag color={up ? 'success' : value?.status === 'disabled' ? 'default' : 'error'}>
        {up ? `正常 ${value?.latencyMs ?? 0}ms` : value?.status === 'disabled' ? '未启用' : '不可用'}
      </Tag>
    </Space>
  );
};

export default function SystemAdmin() {
  const [dashboard, setDashboard] = useState<any>({});
  const [health, setHealth] = useState<any>({});
  const [auditPreview, setAuditPreview] = useState<any[]>([]);
  const [apiErrorPreview, setApiErrorPreview] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [configSaving, setConfigSaving] = useState(false);

  useEffect(() => {
    void Promise.all([
      systemApi.dashboard(),
      systemApi.health(),
      systemApi.auditLogs({ page: 1, pageSize: 5 }),
      systemApi.apiLogs({ page: 1, pageSize: 5, statusCode: 500 }),
      systemApi.permissions(),
      systemApi.configs(),
    ]).then(([d, h, audit, apiErrors, perms, configRes]) => {
      setDashboard(d.data ?? {});
      setHealth(h.data?.services ?? {});
      setAuditPreview(audit.data ?? []);
      setApiErrorPreview(apiErrors.data ?? []);
      setPermissions(perms.data ?? []);
      setConfigs(configRes.data ?? []);
    });
  }, []);

  const stats = [
    ['用户总数', dashboard.users?.total ?? 0, <UserOutlined key="user" />],
    ['角色数量', dashboard.roles ?? 0, <TeamOutlined key="role" />],
    ['权限数量', dashboard.permissions ?? 0, <SafetyCertificateOutlined key="perm" />],
    ['API 调用', dashboard.api?.total ?? 0, <ApiOutlined key="api" />],
  ] as const;

  const permissionGroups = permissions.reduce<Record<string, number>>((acc, item) => {
    const type = item.permType || 'unknown';
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});

  const updateConfigRow = (index: number, field: 'configValue' | 'description', value: string) => {
    setConfigs((rows) =>
      rows.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  };

  const saveConfigs = async () => {
    setConfigSaving(true);
    try {
      const res = await systemApi.updateConfigs(
        configs.map(({ configKey, configValue, description }) => ({
          configKey,
          configValue,
          description,
        })),
      );
      setConfigs(res.data ?? configs);
      message.success('系统配置已保存');
    } finally {
      setConfigSaving(false);
    }
  };

  const overviewTab = (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card title="最近操作日志" size="small">
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={auditPreview}
            columns={[
              { title: '用户', dataIndex: 'username' },
              { title: '操作', dataIndex: 'operationName', ellipsis: true },
              {
                title: '结果',
                dataIndex: 'result',
                render: (value) => (
                  <Tag color={value === 'SUCCESS' ? 'success' : 'error'}>{value}</Tag>
                ),
              },
            ]}
          />
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card title="权限分布概览" size="small">
          <Descriptions column={2} size="small">
            {Object.entries(permissionGroups).map(([type, count]) => (
              <Descriptions.Item key={type} label={type}>
                {count}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>
      </Col>
      <Col xs={24}>
        <Card title="最近异常 API" size="small">
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={apiErrorPreview}
            columns={[
              { title: '时间', dataIndex: 'createdAt' },
              { title: '方法', dataIndex: 'method', width: 90 },
              { title: '路径', dataIndex: 'path', ellipsis: true },
              {
                title: '状态码',
                dataIndex: 'statusCode',
                width: 100,
                render: (value) => <Tag color="error">{value}</Tag>,
              },
              { title: 'Trace ID', dataIndex: 'traceId', ellipsis: true },
            ]}
          />
        </Card>
      </Col>
    </Row>
  );

  const systemConfigTab = (
    <Card
      title="系统配置"
      size="small"
      extra={
        <Button type="primary" loading={configSaving} onClick={saveConfigs}>
          保存配置
        </Button>
      }
    >
      <Table
        rowKey="configKey"
        size="small"
        pagination={false}
        dataSource={configs}
        columns={[
          {
            title: '配置项',
            dataIndex: 'configKey',
            width: 260,
            render: (value) => <Text code>{value}</Text>,
          },
          {
            title: '配置值',
            dataIndex: 'configValue',
            width: 240,
            render: (value, _row, index) => (
              <Input value={value} onChange={(event) => updateConfigRow(index, 'configValue', event.target.value)} />
            ),
          },
          {
            title: '说明',
            dataIndex: 'description',
            render: (value, _row, index) => (
              <Input value={value} onChange={(event) => updateConfigRow(index, 'description', event.target.value)} />
            ),
          },
          { title: '更新时间', dataIndex: 'updatedAt', width: 200 },
        ]}
      />
    </Card>
  );

  return (
    <PageContainer
      title="系统管理"
      content="统一的系统管理工作台，集中查看系统运行状态、用户角色权限、日志与开放 API 监控。"
    >
      <Row gutter={[16, 16]}>
        {stats.map(([title, value, icon]) => (
          <Col xs={24} sm={12} lg={6} key={title}>
            <Card size="small">
              <Statistic title={title} value={value} prefix={icon} />
            </Card>
          </Col>
        ))}
        <Col xs={24} lg={12}>
          <Card title="服务状态" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <ServiceState name="Neo4j" value={health.neo4j} />
              <ServiceState name="MySQL" value={health.mysql} />
              <ServiceState name="Redis" value={health.redis} />
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="API 运行指标" size="small">
            <Row gutter={16}>
              <Col span={12}>
                <Statistic title="错误数" value={dashboard.api?.errors ?? 0} />
              </Col>
              <Col span={12}>
                <Statistic
                  title="平均耗时"
                  value={dashboard.api?.averageLatencyMs ?? 0}
                  suffix="ms"
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
      <Card style={{ marginTop: 16 }}>
        <Tabs
          defaultActiveKey="users"
          items={[
            { key: 'overview', label: '总览', children: overviewTab },
            { key: 'users', label: '用户管理', children: <SystemUsers embedded /> },
            { key: 'roles', label: '角色管理', children: <SystemRoles embedded /> },
            { key: 'permissions', label: '权限配置', children: <SystemPermissions embedded /> },
            { key: 'audit', label: '操作日志', children: <AuditLogs embedded /> },
            { key: 'api', label: '开放 API 监控', children: <ApiLogs embedded /> },
            { key: 'config', label: '系统配置', children: systemConfigTab },
          ]}
        />
      </Card>
    </PageContainer>
  );
}
