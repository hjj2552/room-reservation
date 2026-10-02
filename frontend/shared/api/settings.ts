import { apiRequest } from './http';
import type { OperationSettings } from './types';

export function getSettings(signal?: AbortSignal) {
  return apiRequest<OperationSettings>('/api/admin/settings', { signal });
}

export function updateSettings(payload: OperationSettings) {
  return apiRequest<OperationSettings>('/api/admin/settings', {
    method: 'PUT',
    body: payload,
  });
}
