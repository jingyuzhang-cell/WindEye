import { PageContainer, type ProColumns, ProTable } from '@ant-design/pro-components';
import { Tag } from 'antd';
import React from 'react';
import { systemApi } from '@/services/system';

type SystemPermissionsProps = {
  embedded?: boolean;
};

export default function SystemPermissions({ embedded = false }: SystemPermissionsProps) {
  const columns: ProColumns<any>[] = [
    { title: '权限编码', dataIndex: 'permCode', copyable: true },
    { title: '名称', dataIndex: 'permName' },
    {
      title: '类型',
      dataIndex: 'permType',
      render: (_, row) => <Tag>{row.permType}</Tag>,
    },
    { title: '方法', dataIndex: 'httpMethod', width: 90 },
    { title: '资源', dataIndex: 'resourcePath', ellipsis: true },
  ];
  const content = (
      <ProTable
        rowKey="id"
        search={false}
        columns={columns}
        request={async () => {
          const res = await systemApi.permissions();
          return { data: res.data, success: res.success };
        }}
      />
  );

  if (embedded) {
    return content;
  }

  return <PageContainer title="权限清单">{content}</PageContainer>;
}
