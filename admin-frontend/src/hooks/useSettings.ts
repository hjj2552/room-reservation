import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '../api/settings';

export const settingsKeys = {
  current: ['settings', 'current'] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.current,
    queryFn: getSettings,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsKeys.current, settings);
      queryClient.invalidateQueries({ queryKey: settingsKeys.current });
    },
  });
}
