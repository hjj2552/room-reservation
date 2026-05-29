import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAdminSession, loginAdmin, logoutAdmin } from '../api/auth';
import { ApiError } from '../api/http';

export const authKeys = {
  session: ['auth', 'session'] as const,
};

export function useAdminSession() {
  return useQuery({
    queryKey: authKeys.session,
    queryFn: getAdminSession,
    retry: false,
    throwOnError: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: loginAdmin,
    onSuccess: (session) => {
      queryClient.setQueryData(authKeys.session, session);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logoutAdmin,
    onSettled: () => {
      queryClient.clear();
    },
  });
}

export function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}
