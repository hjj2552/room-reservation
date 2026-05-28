import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/http';
import {
  approveReservation,
  cancelReservation,
  createReservation,
  deleteReservation,
  getReservation,
  getReservationHistories,
  listReservations,
  updateReservation,
} from '../api/reservations';
import type { ReservationFilters, ReservationPayload } from '../api/types';

export const reservationKeys = {
  all: ['reservations'] as const,
  list: (filters: ReservationFilters) => ['reservations', 'list', filters] as const,
  detail: (id: string) => ['reservations', 'detail', id] as const,
  histories: (id: string) => ['reservations', 'histories', id] as const,
};

export function useReservations(filters: ReservationFilters, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: reservationKeys.list(filters),
    queryFn: () => listReservations(filters),
    enabled: options.enabled ?? true,
  });
}

export function useReservation(id?: string) {
  return useQuery({
    queryKey: reservationKeys.detail(id || ''),
    queryFn: () => getReservation(id || ''),
    enabled: Boolean(id),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 2;
    },
  });
}

export function useReservationHistories(id?: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: reservationKeys.histories(id || ''),
    queryFn: () => getReservationHistories(id || ''),
    enabled: Boolean(id) && (options.enabled ?? true),
  });
}

export function useCreateReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createReservation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reservationKeys.all });
    },
  });
}

export function useUpdateReservation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReservationPayload) => updateReservation(id, payload),
    onSuccess: (reservation) => {
      queryClient.invalidateQueries({ queryKey: reservationKeys.all });
      queryClient.setQueryData(reservationKeys.detail(id), reservation);
      queryClient.invalidateQueries({ queryKey: reservationKeys.histories(id) });
    },
  });
}

export function useReservationAction(id: string, action: 'approve' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memo?: string) =>
      action === 'approve' ? approveReservation(id, memo) : cancelReservation(id, memo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reservationKeys.all });
      queryClient.invalidateQueries({ queryKey: reservationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: reservationKeys.histories(id) });
    },
  });
}

export function useDeleteReservation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memo?: string) => deleteReservation(id, memo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reservationKeys.all });
      queryClient.invalidateQueries({ queryKey: reservationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: reservationKeys.histories(id) });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
