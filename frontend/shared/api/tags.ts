import { apiRequest, buildQuery } from './http';
import type { PagedResponse, Tag, TagFilters, TagPayload } from './types';

export function listTags(filters: TagFilters = {}) {
  return apiRequest<PagedResponse<Tag>>(
    `/api/admin/tags${buildQuery({
      ...filters,
      size: filters.size ?? 20,
      page: filters.page ?? 0,
    })}`,
  );
}

export function createTag(payload: TagPayload) {
  return apiRequest<Tag>('/api/admin/tags', {
    method: 'POST',
    body: payload,
  });
}

export function updateTag(tagId: string, payload: TagPayload) {
  return apiRequest<Tag>(`/api/admin/tags/${tagId}`, {
    method: 'PUT',
    body: payload,
  });
}

export function deleteTag(tagId: string) {
  return apiRequest<void>(`/api/admin/tags/${tagId}`, {
    method: 'DELETE',
  });
}
