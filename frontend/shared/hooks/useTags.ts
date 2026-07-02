import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTag, deleteTag, listTags, updateTag } from '../api/tags';
import type { TagFilters, TagPayload } from '../api/types';

export const tagKeys = {
  all: ['tags'] as const,
  list: (filters: TagFilters) => ['tags', 'list', filters] as const,
};

export function useTags(filters: TagFilters = {}) {
  return useQuery({
    queryKey: tagKeys.list(filters),
    queryFn: () => listTags(filters),
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tagId, payload }: { tagId: string; payload: TagPayload }) => updateTag(tagId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all });
      queryClient.invalidateQueries({ queryKey: ['recurrences'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all });
      queryClient.invalidateQueries({ queryKey: ['recurrences'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
  });
}
