import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '../api/settings';
import { publicReservationKeys } from './usePublicReservation';

export const settingsKeys = {
  current: ['settings', 'current'] as const,
};

export function useSettings(options: { refetchOnMount?: boolean | 'always' } = {}) {
  return useQuery({
    queryKey: settingsKeys.current,
    queryFn: ({ signal }) => getSettings(signal),
    refetchOnMount: options.refetchOnMount,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsKeys.current, settings);
      queryClient.invalidateQueries({ queryKey: settingsKeys.current });
      queryClient.invalidateQueries({ queryKey: publicReservationKeys.settings });
    },
  });
}
