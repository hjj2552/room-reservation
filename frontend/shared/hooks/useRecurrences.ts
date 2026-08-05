import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRecurrence,
  deleteRecurrence,
  getRecurrence,
  listRecurrences,
  previewRecurrence,
} from '../api/recurrences';
import type { RecurrenceFilters } from '../api/types';

export const recurrenceKeys = {
  all: ['recurrences'] as const,
  list: (filters: RecurrenceFilters) => ['recurrences', 'list', filters] as const,
  detail: (id: string) => ['recurrences', 'detail', id] as const,
};

export function useRecurrences(
  filters: RecurrenceFilters = {},
  options: { keepPreviousData?: boolean } = {},
) {
  return useQuery({
    queryKey: recurrenceKeys.list(filters),
    queryFn: () => listRecurrences(filters),
    placeholderData: options.keepPreviousData ? keepPreviousData : undefined,
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

export function useDeleteRecurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recurrenceId, memo }: { recurrenceId: string; memo?: string }) =>
      deleteRecurrence(recurrenceId, memo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recurrenceKeys.all });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
