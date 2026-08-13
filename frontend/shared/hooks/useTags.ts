import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTag, deleteTag, listAllTags, listTags, updateTag } from '../api/tags';
import type { TagFilters, TagPayload } from '../api/types';

export const tagKeys = {
  all: ['tags'] as const,
  list: (filters: TagFilters) => ['tags', 'list', filters] as const,
  allOptions: () => ['tags', 'all-options'] as const,
};

export function useTags(filters: TagFilters = {}) {
  return useQuery({
    queryKey: tagKeys.list(filters),
    queryFn: () => listTags(filters),
  });
}

export function useAllTags() {
  return useQuery({
    queryKey: tagKeys.allOptions(),
    queryFn: listAllTags,
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
