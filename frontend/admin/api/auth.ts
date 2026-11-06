import { ApiError, apiRequest } from '../../shared/api/http';
import type { AdminSession } from '../../shared/api/types';

export function getAdminSession() {
  return apiRequest<AdminSession>('/api/auth/admin/me');
}

export async function loginAdmin(payload: { username: string; password: string }) {
  try {
    return await apiRequest<AdminSession>('/api/auth/admin/login', {
      method: 'POST',
      body: payload,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 403 || error.body?.code !== 'INVALID_CSRF_TOKEN') {
      throw error;
    }
  }
  // A lost login response can leave revoked cookies. Prepare without changing the browser's
  // cookies, then retry this explicit login once; late preparation responses cannot log it out.
  const prepared = await apiRequest<{ sessionId: string; csrfToken: string }>('/api/auth/admin/login-session');
  return apiRequest<AdminSession>('/api/auth/admin/login', {
    method: 'POST', body: payload,
    headers: { 'X-Login-Session': prepared.sessionId, 'X-XSRF-TOKEN': prepared.csrfToken },
  });
}

export function logoutAdmin() {
  return apiRequest<void>('/api/auth/admin/logout', {
    method: 'POST',
  });
}
