import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createRoom,
  deleteRoom,
  getRoom,
  getRoomDeletionCheck,
  getRoomOrder,
  listRooms,
  saveRoomOrder,
  type RoomListFilters,
  updateRoom,
  updateRoomEnabled,
} from '../api/rooms';
import type { RoomOrderPayload, RoomPayload } from '../api/types';
import { publicReservationKeys } from './usePublicReservation';
import { recurrenceKeys } from './useRecurrences';
import { reservationKeys } from './useReservations';

export const roomKeys = {
  all: ['rooms'] as const,
  list: (filters: RoomListFilters) => ['rooms', 'list', filters] as const,
  detail: (id: string) => ['rooms', 'detail', id] as const,
  deletionCheck: (id: string) => ['rooms', 'deletion-check', id] as const,
  order: () => ['rooms', 'order'] as const,
};

function invalidateRoomLists(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: roomKeys.all });
  queryClient.invalidateQueries({ queryKey: publicReservationKeys.rooms });
}

function invalidateRoomReferences(queryClient: QueryClient, roomId: string) {
  invalidateRoomLists(queryClient);
  for (const queryKey of [reservationKeys.lists, reservationKeys.details, reservationKeys.timetables,
    recurrenceKeys.all, publicReservationKeys.weeklyRoom(roomId), publicReservationKeys.details]) {
    queryClient.invalidateQueries({ queryKey });
  }
}

export function useRooms(filters: RoomListFilters = { enabled: true, includeDeleted: false, size: 100 }) {
  return useQuery({
    queryKey: roomKeys.list(filters),
    queryFn: () => listRooms(filters),
  });
}

export function useRoom(id?: string) {
  return useQuery({
    queryKey: roomKeys.detail(id || ''),
    queryFn: () => getRoom(id || ''),
    enabled: Boolean(id),
  });
}

export function useRoomOrder(
  options: { enabled?: boolean; refetchOnMount?: boolean | 'always' } = {},
) {
  return useQuery({
    queryKey: roomKeys.order(),
    queryFn: getRoomOrder,
    enabled: options.enabled ?? true,
    refetchOnMount: options.refetchOnMount,
  });
}

export function useRoomOptions(options: { includeDisabled?: boolean } = {}) {
  return useQuery({
    queryKey: roomKeys.order(),
    queryFn: getRoomOrder,
    select: (response) => options.includeDisabled
      ? response.items
      : response.items.filter((room) => room.enabled),
  });
}

export function useRoomDeletionCheck(id?: string) {
  return useQuery({
    queryKey: roomKeys.deletionCheck(id || ''),
    queryFn: () => getRoomDeletionCheck(id || ''),
    enabled: Boolean(id),
  });
}

export function useCreateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRoom,
    onSuccess: () => {
      invalidateRoomLists(queryClient);
    },
  });
}

export function useUpdateRoom(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RoomPayload) => updateRoom(id, payload),
    onSuccess: (room) => {
      invalidateRoomReferences(queryClient, id);
      queryClient.setQueryData(roomKeys.detail(id), room);
    },
  });
}

export function useUpdateRoomEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, enabled }: { roomId: string; enabled: boolean }) =>
      updateRoomEnabled(roomId, enabled),
    onSuccess: (room) => {
      invalidateRoomLists(queryClient);
      queryClient.invalidateQueries({ queryKey: publicReservationKeys.weeklyRoom(room.id) });
      queryClient.setQueryData(roomKeys.detail(room.id), room);
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRoom,
    onSuccess: (_result, roomId) => {
      invalidateRoomReferences(queryClient, roomId);
    },
  });
}

export function useSaveRoomOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RoomOrderPayload) => saveRoomOrder(payload),
    onSuccess: (response) => {
      queryClient.setQueryData(roomKeys.order(), response);
      invalidateRoomLists(queryClient);
    },
  });
}
