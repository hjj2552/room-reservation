import { apiRequest } from './http';
import type { AdminSession } from './types';

export function getAdminSession() {
  return apiRequest<AdminSession>('/api/auth/admin/me');
}

export function loginAdmin(payload: { username: string; password: string }) {
  return apiRequest<AdminSession>('/api/auth/admin/login', {
    method: 'POST',
    body: payload,
  });
}

export function logoutAdmin() {
  return apiRequest<void>('/api/auth/admin/logout', {
    method: 'POST',
  });
}
