import { PlusOutlined } from '@ant-design/icons';
import { PageContainer, type ProColumns, ProTable } from '@ant-design/pro-components';
import { Button, Checkbox, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Tag, message } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import type { ActionType } from '@ant-design/pro-components';
import { systemApi } from '@/services/system';

const builtinRoleCodes = new Set(['admin', 'analyst', 'auditor', 'readonly']);

type SystemRolesProps = {
  embedded?: boolean;
};

export default function SystemRoles({ embedded = false }: SystemRolesProps) {
  const actionRef = useRef<ActionType | null>(null);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [role, setRole] = useState<any>();
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>();
  const [selected, setSelected] = useState<number[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    void systemApi.permissions().then((res) => setPermissions(res.data ?? []));
  }, []);

  const reloadRoles = () => {
    actionRef.current?.reload();
  };

  const closeRoleModal = () => {
    setRoleModalOpen(false);
    setEditingRole(undefined);
    form.resetFields();
  };

  const openCreateRole = () => {
    setEditingRole(undefined);
    form.resetFields();
    form.setFieldsValue({ status: 1, sortOrder: 0 });
    setRoleModalOpen(true);
  };

  const openEditRole = (row: any) => {
    setEditingRole(row);
    form.resetFields();
    form.setFieldsValue({
      roleName: row.roleName,
      description: row.description,
      status: row.status,
      sortOrder: row.sortOrder,
    });
    setRoleModalOpen(true);
  };

  const columns: ProColumns<any>[] = [
    { title: '角色编码', dataIndex: 'roleCode' },
    { title: '角色名称', dataIndex: 'roleName' },
    { title: '说明', dataIndex: 'description' },
    {
      title: '状态',
      dataIndex: 'status',
      search: false,
      render: (_, row) => (
        <Tag color={row.status === 1 ? 'green' : 'default'}>
          {row.status === 1 ? '启用' : '禁用'}
        </Tag>
      ),
    },
    { title: '排序', dataIndex: 'sortOrder', search: false },
    { title: '用户数', dataIndex: 'userCount', search: false },
    { title: '权限数', dataIndex: 'permissionCount', search: false },
    {
      title: '操作',
      valueType: 'option',
      render: (_, row) => {
        const deleteDisabled = row.userCount > 0 || builtinRoleCodes.has(row.roleCode);
        const deleteDescription = builtinRoleCodes.has(row.roleCode)
          ? '系统内置角色不能删除。'
          : row.userCount > 0
            ? '该角色仍有用户使用，不能删除。'
            : '删除后权限配置会同步移除。';
        return [
          <Button
            key="permissions"
            type="link"
            onClick={async () => {
              const res = await systemApi.rolePermissions(row.id);
              setSelected(res.data?.permissionIds ?? []);
              setRole(row);
            }}
          >
            配置权限
          </Button>,
          <Button key="edit" type="link" onClick={() => openEditRole(row)}>
            编辑
          </Button>,
          <Popconfirm
            key="delete"
            title="确认删除该角色？"
            description={deleteDescription}
            okText="删除"
            cancelText="取消"
            disabled={deleteDisabled}
            onConfirm={async () => {
              await systemApi.deleteRole(row.id);
              message.success('角色已删除');
              reloadRoles();
            }}
          >
            <Button type="link" danger disabled={deleteDisabled}>
              删除
            </Button>
          </Popconfirm>,
        ];
      },
    },
  ];

  const content = (
    <>
      <ProTable
        actionRef={actionRef}
        rowKey="id"
        search={false}
        columns={columns}
        request={async () => {
          const res = await systemApi.roles();
          return { data: res.data, success: res.success };
        }}
        toolBarRender={() => [
          <Button key="new" type="primary" icon={<PlusOutlined />} onClick={openCreateRole}>
            新建角色
          </Button>,
        ]}
      />
      <Modal
        title={editingRole ? '编辑角色' : '新建角色'}
        open={roleModalOpen}
        onCancel={closeRoleModal}
        onOk={async () => {
          const values = await form.validateFields();
          if (editingRole) {
            await systemApi.updateRole(editingRole.id, values);
            message.success('角色已更新');
          } else {
            await systemApi.createRole(values);
            message.success('角色已创建');
          }
          closeRoleModal();
          reloadRoles();
        }}
      >
        <Form form={form} layout="vertical">
          {!editingRole && (
            <Form.Item
              name="roleCode"
              label="角色编码"
              rules={[
                { required: true, message: '请输入角色编码' },
                { min: 2, max: 64, message: '角色编码长度需为 2-64 位' },
                {
                  pattern: /^[A-Za-z][A-Za-z0-9_-]*$/,
                  message: '角色编码需以字母开头，仅支持字母、数字、下划线和短横线',
                },
              ]}
            >
              <Input placeholder="例如 risk_admin" autoComplete="off" />
            </Form.Item>
          )}
          <Form.Item
            name="roleName"
            label="角色名称"
            rules={[
              { required: true, message: '请输入角色名称' },
              { min: 2, max: 128, message: '角色名称长度需为 2-128 位' },
            ]}
          >
            <Input placeholder="请输入角色名称" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
          <Space style={{ width: '100%' }} align="start">
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select
                style={{ width: 180 }}
                options={[
                  { label: '启用', value: 1 },
                  { label: '禁用', value: 0 },
                ]}
              />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序" rules={[{ required: true }]}>
              <InputNumber min={0} max={9999} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
      <Modal
        title={`配置权限 - ${role?.roleName ?? ''}`}
        open={Boolean(role)}
        width={720}
        onCancel={() => setRole(undefined)}
        onOk={async () => {
          await systemApi.setRolePermissions(role.id, selected);
          message.success('角色权限已更新');
          setRole(undefined);
          reloadRoles();
        }}
      >
        <Checkbox.Group
          value={selected}
          onChange={(values) => setSelected(values.map(Number))}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}
          options={permissions.map((item) => ({
            label: `${item.permName} (${item.permCode})`,
            value: item.id,
          }))}
        />
      </Modal>
    </>
  );

  if (embedded) {
    return content;
  }

  return <PageContainer title="角色管理">{content}</PageContainer>;
}
