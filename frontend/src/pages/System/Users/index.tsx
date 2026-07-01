import { PlusOutlined } from '@ant-design/icons';
import { PageContainer, type ProColumns, ProTable } from '@ant-design/pro-components';
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Tag, message } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import type { ActionType } from '@ant-design/pro-components';
import { systemApi } from '@/services/system';

type SystemUsersProps = {
  embedded?: boolean;
};

export default function SystemUsers({ embedded = false }: SystemUsersProps) {
  const actionRef = useRef<ActionType | null>(null);
  const [open, setOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>();
  const [roles, setRoles] = useState<any[]>([]);
  const [form] = Form.useForm();

  const reloadUsers = () => {
    actionRef.current?.reload();
  };

  const closeModal = () => {
    setOpen(false);
    setEditingUser(undefined);
    form.resetFields();
  };

  const openCreateModal = () => {
    setEditingUser(undefined);
    form.resetFields();
    setOpen(true);
  };

  const openEditModal = (row: any) => {
    setEditingUser(row);
    form.resetFields();
    form.setFieldsValue({
      realName: row.realName,
      department: row.department,
      email: row.email,
      phone: row.phone,
      roleIds: row.roles?.map((role: any) => role.id) ?? [],
    });
    setOpen(true);
  };

  useEffect(() => {
    void systemApi.roles().then((res) => setRoles(res.data ?? []));
  }, []);

  const columns: ProColumns<any>[] = [
    { title: '用户名', dataIndex: 'username' },
    { title: '姓名', dataIndex: 'realName', search: false },
    { title: '部门', dataIndex: 'department', search: false },
    {
      title: '角色',
      dataIndex: 'roles',
      search: false,
      render: (_, row) => row.roles?.map((role: any) => (
        <Tag key={role.id}>{role.roleName}</Tag>
      )),
    },
    {
      title: '状态',
      dataIndex: 'status',
      valueType: 'select',
      valueEnum: {
        0: { text: '禁用', status: 'Default' },
        1: { text: '启用', status: 'Success' },
        2: { text: '锁定', status: 'Error' },
      },
    },
    { title: '最近登录', dataIndex: 'lastLoginAt', valueType: 'dateTime', search: false },
    {
      title: '操作',
      valueType: 'option',
      render: (_, row) => [
        <Button
          key="status"
          type="link"
          size="small"
          onClick={async () => {
            await systemApi.updateUserStatus(row.id, row.status === 1 ? 0 : 1);
            message.success(row.status === 1 ? '用户已禁用' : '用户已启用');
            reloadUsers();
          }}
        >
          {row.status === 1 ? '禁用' : '启用'}
        </Button>,
        <Button
          key="edit"
          type="link"
          size="small"
          onClick={() => openEditModal(row)}
        >
          编辑
        </Button>,
        <Popconfirm
          key="delete"
          title="确认删除该用户？"
          description="删除后该账号将无法登录。"
          okText="删除"
          cancelText="取消"
          onConfirm={async () => {
            await systemApi.deleteUser(row.id);
            message.success('用户已删除');
            reloadUsers();
          }}
        >
          <Button type="link" danger size="small">删除</Button>
        </Popconfirm>,
      ],
    },
  ];

  const content = (
    <>
      <ProTable
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        request={async (params) => {
          const res = await systemApi.users({
            page: params.current,
            pageSize: params.pageSize,
            keyword: params.username,
            status: params.status,
          });
          return { data: res.data, total: res.total, success: res.success };
        }}
        toolBarRender={() => [
          <Button key="new" type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建用户
          </Button>,
        ]}
      />
      <Modal
        title={editingUser ? '编辑用户' : '新建用户'}
        open={open}
        onCancel={closeModal}
        onOk={async () => {
          const values = await form.validateFields();
          if (editingUser) {
            await systemApi.updateUser(editingUser.id, values);
            message.success('用户已更新');
          } else {
            await systemApi.createUser(values);
            message.success('用户已创建');
          }
          closeModal();
          reloadUsers();
        }}
      >
        <Form form={form} layout="vertical">
          {!editingUser && (
            <>
              <Form.Item
                name="username"
                label="用户名"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 2, max: 64, message: '用户名长度需为 2-64 位' },
                ]}
              >
                <Input autoComplete="off" placeholder="请输入用户名" />
              </Form.Item>
              <Form.Item
                name="password"
                label="初始密码"
                rules={[
                  { required: true, message: '请输入初始密码' },
                  { min: 8, max: 64, message: '密码长度需为 8-64 位' },
                ]}
              >
                <Input.Password autoComplete="new-password" placeholder="至少 8 位" />
              </Form.Item>
            </>
          )}
          <Space style={{ width: '100%' }} align="start">
            <Form.Item name="realName" label="姓名"><Input /></Form.Item>
            <Form.Item name="department" label="部门"><Input /></Form.Item>
          </Space>
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '请输入正确的邮箱地址' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input />
          </Form.Item>
          <Form.Item name="roleIds" label="角色">
            <Select
              mode="multiple"
              allowClear
              placeholder="请选择角色"
              options={roles.map((role) => ({ label: role.roleName, value: role.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );

  if (embedded) {
    return content;
  }

  return <PageContainer title="用户管理">{content}</PageContainer>;
}
