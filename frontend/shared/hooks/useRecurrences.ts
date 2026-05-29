import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelRecurrence,
  createRecurrence,
  getRecurrence,
  listRecurrences,
  previewRecurrence,
} from '../api/recurrences';

export const recurrenceKeys = {
  all: ['recurrences'] as const,
  list: (includeDeleted: boolean) => ['recurrences', 'list', includeDeleted] as const,
  detail: (id: string) => ['recurrences', 'detail', id] as const,
};

export function useRecurrences(includeDeleted: boolean) {
  return useQuery({
    queryKey: recurrenceKeys.list(includeDeleted),
    queryFn: () => listRecurrences(includeDeleted),
  });
}

export function useRecurrence(id?: string) {
  return useQuery({
    queryKey: recurrenceKeys.detail(id || ''),
    queryFn: () => getRecurrence(id || ''),
    enabled: Boolean(id),
  });
}

export function usePreviewRecurrence() {
  return useMutation({
    mutationFn: previewRecurrence,
  });
}

export function useCreateRecurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRecurrence,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recurrenceKeys.all });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
  });
}

export function useCancelRecurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recurrenceId, memo }: { recurrenceId: string; memo?: string }) =>
      cancelRecurrence(recurrenceId, memo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recurrenceKeys.all });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
  });
}
