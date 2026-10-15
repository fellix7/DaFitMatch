import type { StyleQuizAnswers } from '@dafitmatch/shared';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiClientError } from './api';
import { useSession } from './session';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Do not hammer the API on auth/validation failures.
      retry: (count, err) =>
        !(err instanceof ApiClientError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export const queryKeys = {
  me: (userId: string | undefined) => ['me', userId] as const,
  archetypes: ['archetypes'] as const,
};

/** The caller's profile + taste profile from GET /me (enabled only when signed in). */
export function useMe() {
  const userId = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: queryKeys.me(userId),
    queryFn: ({ signal }) => api('me', {}, { signal }),
    enabled: Boolean(userId),
  });
}

/** Public list of style archetypes for the guest style builder. */
export function useArchetypes() {
  return useQuery({
    queryKey: queryKeys.archetypes,
    queryFn: ({ signal }) => api('listArchetypes', {}, { signal }),
    staleTime: 5 * 60_000,
  });
}

export function useSaveTaste() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: StyleQuizAnswers) => api('saveTaste', { body: answers }),
    onSuccess: (me) => qc.setQueryData(queryKeys.me(me.profile.id), me),
  });
}

export function useConfirmAge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (birth_date: string) => api('confirmAge', { body: { birth_date } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}
