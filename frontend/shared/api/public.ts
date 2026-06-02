import { apiRequest, buildQuery } from './http';
import type {
  PublicReservationPayload,
  PublicReservationDetail,
  PublicReservationEditDetail,
  PublicReservationResult,
  PublicReservationUpdatePayload,
  PublicRoom,
  PublicSettings,
  PublicWeeklyReservations,
} from './types';

export function listPublicRooms() {
  return apiRequest<PublicRoom[]>('/api/public/rooms');
}

export function getPublicSettings() {
  return apiRequest<PublicSettings>('/api/public/settings');
}

export function getPublicWeeklyReservations(roomId: string, weekStart: string) {
  return apiRequest<PublicWeeklyReservations>(
    `/api/public/rooms/${roomId}/weekly-reservations${buildQuery({ weekStart })}`,
  );
}

export function createPublicReservation(payload: PublicReservationPayload) {
  return apiRequest<PublicReservationResult>('/api/public/reservations', {
    method: 'POST',
    body: payload,
  });
}

export function getPublicReservation(reservationId: string) {
  return apiRequest<PublicReservationDetail>(`/api/public/reservations/${reservationId}`);
}

export function verifyPublicReservationForEdit(reservationId: string, cancelPassword: string) {
  return apiRequest<PublicReservationEditDetail>(`/api/public/reservations/${reservationId}/edit`, {
    method: 'POST',
    body: { cancelPassword },
  });
}

export function updatePublicReservation(reservationId: string, payload: PublicReservationUpdatePayload) {
  return apiRequest<PublicReservationDetail>(`/api/public/reservations/${reservationId}`, {
    method: 'PUT',
    body: payload,
  });
}

export function cancelPublicReservation(reservationId: string, cancelPassword: string) {
  return apiRequest<PublicReservationDetail>(`/api/public/reservations/${reservationId}/cancel`, {
    method: 'POST',
    body: { cancelPassword },
  });
}
