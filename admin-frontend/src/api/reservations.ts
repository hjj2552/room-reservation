import { ApiError, apiRequest, buildQuery } from './http';
import type {
  ApiErrorResponse,
  PagedResponse,
  ReservationDetail,
  ReservationFilters,
  ReservationHistory,
  ReservationListItem,
  ReservationPayload,
} from './types';

export function listReservations(filters: ReservationFilters = {}) {
  return apiRequest<PagedResponse<ReservationListItem>>(
    `/api/admin/reservations${buildQuery({
      ...filters,
      size: filters.size ?? 20,
      page: filters.page ?? 0,
    })}`,
  );
}

export function getReservation(reservationId: string) {
  return apiRequest<ReservationDetail>(`/api/admin/reservations/${reservationId}`);
}

export function getReservationHistories(reservationId: string) {
  return apiRequest<ReservationHistory[]>(`/api/admin/reservations/${reservationId}/histories`);
}

export function createReservation(payload: ReservationPayload) {
  return apiRequest<ReservationDetail>('/api/admin/reservations', {
    method: 'POST',
    body: payload,
  });
}

export function updateReservation(reservationId: string, payload: ReservationPayload) {
  return apiRequest<ReservationDetail>(`/api/admin/reservations/${reservationId}`, {
    method: 'PUT',
    body: payload,
  });
}

export function approveReservation(reservationId: string, memo?: string) {
  return apiRequest<ReservationListItem>(`/api/admin/reservations/${reservationId}/approve`, {
    method: 'POST',
    body: memo ? { memo } : undefined,
  });
}

export function cancelReservation(reservationId: string, memo?: string) {
  return apiRequest<ReservationListItem>(`/api/admin/reservations/${reservationId}/cancel`, {
    method: 'POST',
    body: memo ? { memo } : undefined,
  });
}

export async function exportReservationsCsv(filters: ReservationFilters = {}) {
  const response = await fetch(
    `/api/admin/exports/reservations.csv${buildQuery({
      status: filters.status,
      roomId: filters.roomId,
      from: filters.from,
      to: filters.to,
      keyword: filters.keyword,
    })}`,
    { credentials: 'include' },
  );

  if (!response.ok) {
    let body: ApiErrorResponse | undefined;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    throw new ApiError(response.status, body);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'reservations.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
