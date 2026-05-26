import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelPublicReservation,
  createPublicReservation,
  getPublicReservation,
  getPublicSettings,
  getPublicWeeklyReservations,
  listPublicRooms,
} from '../api/public';
import type { PublicReservationPayload } from '../api/types';

export const publicReservationKeys = {
  rooms: ['public', 'rooms'] as const,
  settings: ['public', 'settings'] as const,
  weekly: (roomId: string, weekStart: string) => ['public', 'weekly-reservations', roomId, weekStart] as const,
  detail: (reservationId: string) => ['public', 'reservation', reservationId] as const,
};

export function usePublicRooms() {
  return useQuery({
    queryKey: publicReservationKeys.rooms,
    queryFn: listPublicRooms,
  });
}

export function usePublicSettings() {
  return useQuery({
    queryKey: publicReservationKeys.settings,
    queryFn: getPublicSettings,
  });
}

export function usePublicWeeklyReservations(roomId: string, weekStart: string) {
  return useQuery({
    queryKey: publicReservationKeys.weekly(roomId, weekStart),
    queryFn: () => getPublicWeeklyReservations(roomId, weekStart),
    enabled: Boolean(roomId && weekStart),
  });
}

export function usePublicReservationDetail(reservationId?: string) {
  return useQuery({
    queryKey: publicReservationKeys.detail(reservationId || ''),
    queryFn: () => getPublicReservation(reservationId || ''),
    enabled: Boolean(reservationId),
  });
}

export function useCreatePublicReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PublicReservationPayload) => createPublicReservation(payload),
    onSuccess: (_result, payload) => {
      queryClient.invalidateQueries({ queryKey: ['public', 'weekly-reservations'] });
    },
  });
}

export function useCancelPublicReservation(reservationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cancelPassword: string) => cancelPublicReservation(reservationId, cancelPassword),
    onSuccess: (reservation) => {
      queryClient.setQueryData(publicReservationKeys.detail(reservationId), reservation);
      queryClient.invalidateQueries({ queryKey: ['public', 'weekly-reservations'] });
    },
  });
}
