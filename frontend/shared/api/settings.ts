import { apiRequest } from './http';
import type { OperationSettings } from './types';

export function getSettings() {
  return apiRequest<OperationSettings>('/api/admin/settings');
}

export function updateSettings(payload: OperationSettings) {
  return apiRequest<OperationSettings>('/api/admin/settings', {
    method: 'PUT',
    body: payload,
  });
}

export function uploadSettingsLogo(file: File) {
  const formData = new FormData();
  formData.set('file', file);
  return apiRequest<{ logoUrl: string }>('/api/admin/settings/logo', {
    method: 'POST',
    body: formData,
  });
}
