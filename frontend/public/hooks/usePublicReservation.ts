import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelPublicReservation,
  createPublicReservation,
  getPublicReservation,
  getPublicSettings,
  getPublicWeeklyReservations,
  listPublicRooms,
  updatePublicReservation,
  verifyPublicReservationForEdit,
} from '../api/public';
import type { PublicReservationUpdatePayload, PublicReservationPayload } from '../../shared/api/types';

import { publicReservationKeys } from '../../shared/hooks/publicReservationKeys';

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

export function useVerifyPublicReservationForEdit(reservationId: string) {
  return useMutation({
    mutationFn: (cancelPassword: string) => verifyPublicReservationForEdit(reservationId, cancelPassword),
  });
}

export function useUpdatePublicReservation(reservationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PublicReservationUpdatePayload) => updatePublicReservation(reservationId, payload),
    onSuccess: (reservation) => {
      queryClient.setQueryData(publicReservationKeys.detail(reservationId), reservation);
      queryClient.invalidateQueries({ queryKey: ['public', 'weekly-reservations'] });
    },
  });
}
