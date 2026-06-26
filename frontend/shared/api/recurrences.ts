import { apiRequest, buildQuery } from './http';
import type {
  PagedResponse,
  RecurrenceCreatePayload,
  RecurrenceCreateResult,
  RecurrenceDetail,
  RecurrenceFilters,
  RecurrenceListItem,
  RecurrencePreview,
  RecurrencePreviewPayload,
} from './types';

export function previewRecurrence(payload: RecurrencePreviewPayload) {
  return apiRequest<RecurrencePreview>('/api/admin/recurrences/preview', {
    method: 'POST',
    body: payload,
  });
}

export function createRecurrence(payload: RecurrenceCreatePayload) {
  return apiRequest<RecurrenceCreateResult>('/api/admin/recurrences', {
    method: 'POST',
    body: payload,
  });
}

export function listRecurrences(filters: RecurrenceFilters = {}) {
  return apiRequest<PagedResponse<RecurrenceListItem>>(
    `/api/admin/recurrences${buildQuery({
      ...filters,
      includeDeleted: filters.includeDeleted ?? false,
      size: filters.size ?? 20,
      page: filters.page ?? 0,
    })}`,
  );
}

export function getRecurrence(recurrenceId: string) {
  return apiRequest<RecurrenceDetail>(`/api/admin/recurrences/${recurrenceId}`);
}

export function cancelRecurrence(recurrenceId: string, memo?: string) {
  return apiRequest<void>(`/api/admin/recurrences/${recurrenceId}/cancel`, {
    method: 'POST',
    body: memo ? { memo } : undefined,
  });
}
