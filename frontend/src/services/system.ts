import { request } from '@umijs/max';

export const systemApi = {
  dashboard: () => request('/api/v1/admin/dashboard'),
  health: () => request('/api/v1/admin/health'),
  configs: () => request('/api/v1/admin/config'),
  updateConfigs: (items: Record<string, any>[]) =>
    request('/api/v1/admin/config', { method: 'PUT', data: { items } }),
  users: (params: Record<string, any>) =>
    request('/api/v1/admin/users', { params }),
  createUser: (data: Record<string, any>) =>
    request('/api/v1/admin/users', { method: 'POST', data }),
  updateUser: (id: number, data: Record<string, any>) =>
    request(`/api/v1/admin/users/${id}`, { method: 'PUT', data }),
  updateUserStatus: (id: number, status: number) =>
    request(`/api/v1/admin/users/${id}/status`, {
      method: 'PATCH',
      data: { status },
    }),
  deleteUser: (id: number) =>
    request(`/api/v1/admin/users/${id}`, { method: 'DELETE' }),
  roles: () => request('/api/v1/admin/roles'),
  createRole: (data: Record<string, any>) =>
    request('/api/v1/admin/roles', { method: 'POST', data }),
  updateRole: (id: number, data: Record<string, any>) =>
    request(`/api/v1/admin/roles/${id}`, { method: 'PUT', data }),
  deleteRole: (id: number) =>
    request(`/api/v1/admin/roles/${id}`, { method: 'DELETE' }),
  rolePermissions: (id: number) =>
    request(`/api/v1/admin/roles/${id}/permissions`),
  setRolePermissions: (id: number, permissionIds: number[]) =>
    request(`/api/v1/admin/roles/${id}/permissions`, {
      method: 'PUT',
      data: { permissionIds },
    }),
  permissions: () => request('/api/v1/admin/permissions'),
  auditLogs: (params: Record<string, any>) =>
    request('/api/v1/admin/audit-logs', { params }),
  apiLogs: (params: Record<string, any>) =>
    request('/api/v1/admin/api-logs', { params }),
  openApiStats: () => request('/api/v1/admin/api-logs/open-api-stats'),
  openApiMetrics: () => request('/api/v1/admin/open-api/metrics'),
  openApiRanking: (params?: Record<string, any>) =>
    request('/api/v1/admin/open-api/ranking', { params }),
  openApiDailyStats: (params?: Record<string, any>) =>
    request('/api/v1/admin/open-api/daily-stats', { params }),
  openApiCallLogs: (params: Record<string, any>) =>
    request('/api/v1/admin/open-api/call-logs', { params }),
  openApiCallLogDetail: (id: number) =>
    request(`/api/v1/admin/open-api/call-logs/${id}`),
};
