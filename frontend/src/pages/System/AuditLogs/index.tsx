import { PageContainer, type ProColumns, ProTable } from '@ant-design/pro-components';
import { Tag } from 'antd';
import React from 'react';
import { systemApi } from '@/services/system';

type AuditLogsProps = {
  embedded?: boolean;
};

export default function AuditLogs({ embedded = false }: AuditLogsProps) {
  const columns: ProColumns<any>[] = [
    { title: '时间', dataIndex: 'createdAt', valueType: 'dateTime', search: false },
    { title: '用户', dataIndex: 'username', search: false },
    { title: '操作类型', dataIndex: 'operationType' },
    { title: '操作名称', dataIndex: 'operationName', search: false },
    { title: '资源', dataIndex: 'resourceType', search: false },
    {
      title: '结果',
      dataIndex: 'result',
      valueType: 'select',
      valueEnum: { SUCCESS: { text: '成功' }, FAILURE: { text: '失败' } },
      render: (_, row) => <Tag color={row.result === 'SUCCESS' ? 'success' : 'error'}>{row.result}</Tag>,
    },
    { title: 'Trace ID', dataIndex: 'traceId', copyable: true },
  ];
  const content = (
      <ProTable
        rowKey="id"
        columns={columns}
        request={async (params) => {
          const res = await systemApi.auditLogs({
            page: params.current,
            pageSize: params.pageSize,
            operationType: params.operationType,
            result: params.result,
            traceId: params.traceId,
          });
          return { data: res.data, total: res.total, success: res.success };
        }}
      />
  );

  if (embedded) {
    return content;
  }

  return <PageContainer title="操作日志">{content}</PageContainer>;
}
