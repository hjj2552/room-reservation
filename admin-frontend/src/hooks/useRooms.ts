import { useQuery } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createRoom,
  getRoom,
  listRooms,
  type RoomListFilters,
  updateRoom,
  updateRoomEnabled,
} from '../api/rooms';
import type { RoomPayload } from '../api/types';

export const roomKeys = {
  all: ['rooms'] as const,
  list: (filters: RoomListFilters) => ['rooms', 'list', filters] as const,
  detail: (id: string) => ['rooms', 'detail', id] as const,
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
