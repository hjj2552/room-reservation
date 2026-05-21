import { apiRequest, buildQuery } from './http';
import type { AdminRoom, PagedResponse, RoomPayload } from './types';

export interface RoomListFilters {
  enabled?: boolean;
  includeDeleted?: boolean;
  keyword?: string;
  page?: number;
  size?: number;
}

export function listRooms(filters: RoomListFilters = { enabled: true, includeDeleted: false, size: 100 }) {
  return apiRequest<PagedResponse<AdminRoom>>(
    `/api/admin/rooms${buildQuery({
      enabled: filters.enabled,
      includeDeleted: filters.includeDeleted ?? false,
      keyword: filters.keyword,
      page: filters.page ?? 0,
      size: filters.size ?? 100,
    })}`,
  );
}

export function getRoom(roomId: string) {
  return apiRequest<AdminRoom>(`/api/admin/rooms/${roomId}`);
}

export function createRoom(payload: RoomPayload) {
  return apiRequest<AdminRoom>('/api/admin/rooms', {
    method: 'POST',
    body: payload,
  });
}

export function updateRoom(roomId: string, payload: RoomPayload) {
  return apiRequest<AdminRoom>(`/api/admin/rooms/${roomId}`, {
    method: 'PUT',
    body: payload,
  });
}

export function updateRoomEnabled(roomId: string, enabled: boolean) {
  return apiRequest<AdminRoom>(`/api/admin/rooms/${roomId}/enabled`, {
    method: 'PATCH',
    body: { enabled },
  });
}
