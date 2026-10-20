import type {
  ProductGender,
  QuizSubmission,
  RecordInteractionRequest,
  Slot,
  StyleQuizAnswers,
} from '@dafitmatch/shared';
import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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
  quizCards: (gender: ProductGender | 'all') => ['quiz-cards', gender] as const,
  feed: (filters: FeedFilters) => ['feed', filters] as const,
};

/** Catalog filters for the taste-ranked feed. All optional; budget defaults to the profile's. */
export interface FeedFilters {
  slot?: Slot;
  gender?: ProductGender;
  max_price?: number;
}

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

/** Shuffled onboarding quiz cards for the chosen catalog section (cached per section). */
export function useQuizCards(gender?: ProductGender) {
  return useQuery({
    queryKey: queryKeys.quizCards(gender ?? 'all'),
    queryFn: ({ signal }) => api('listQuizCards', { query: gender ? { gender } : {} }, { signal }),
    staleTime: 5 * 60_000,
  });
}

/** Saves the completed quiz and refreshes the profile (the quiz sets fields + taste vector). */
export function useSubmitQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: QuizSubmission) => api('submitQuiz', { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

/** Taste-ranked product feed, paged with the contract's keyset cursor. */
export function useFeedProducts(filters: FeedFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.feed(filters),
    queryFn: ({ pageParam, signal }) =>
      api(
        'listFeedProducts',
        { query: { ...filters, cursor: pageParam ?? undefined } },
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
}

/** Logs a like/skip/love/save so the taste vector keeps learning from real use. */
export function useRecordInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordInteractionRequest) => api('recordInteraction', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}
