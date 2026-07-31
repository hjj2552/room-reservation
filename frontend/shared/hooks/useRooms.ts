import { useQuery } from '@tanstack/react-query';
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

export const roomKeys = {
  all: ['rooms'] as const,
  list: (filters: RoomListFilters) => ['rooms', 'list', filters] as const,
  detail: (id: string) => ['rooms', 'detail', id] as const,
  deletionCheck: (id: string) => ['rooms', 'deletion-check', id] as const,
  order: () => ['rooms', 'order'] as const,
};

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

export function useRoomOrder(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: roomKeys.order(),
    queryFn: getRoomOrder,
    enabled: options.enabled ?? true,
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
      queryClient.invalidateQueries({ queryKey: roomKeys.all });
    },
  });
}

export function useUpdateRoom(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RoomPayload) => updateRoom(id, payload),
    onSuccess: (room) => {
      queryClient.invalidateQueries({ queryKey: roomKeys.all });
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
      queryClient.invalidateQueries({ queryKey: roomKeys.all });
      queryClient.setQueryData(roomKeys.detail(room.id), room);
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRoom,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roomKeys.all });
    },
  });
}

export function useSaveRoomOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RoomOrderPayload) => saveRoomOrder(payload),
    onSuccess: (response) => {
      queryClient.setQueryData(roomKeys.order(), response);
      queryClient.invalidateQueries({ queryKey: roomKeys.all });
    },
  });
}
