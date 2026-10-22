import type {
  InteractionAction,
  ListFeedProductsResponse,
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
  type InfiniteData,
} from '@tanstack/react-query';
import { track } from './analytics';
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
    onSuccess: (_data, body) => {
      track('quiz_completed', { swipes: body.swipes.length, catalog: body.basics.catalog });
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

/** One page of the feed, plus the actions the user already took (optimistic). */
export interface FeedPage extends ListFeedProductsResponse {
  /** Product id → the action the user just took. */
  reacted?: Record<string, InteractionAction>;
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
      ) as Promise<FeedPage>,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
}

/**
 * Logs a like/skip/love/save so the taste vector keeps learning from real use.
 *
 * The feed updates optimistically: the card shows the action straight away and the previous
 * state is restored if the API rejects it.
 */
export function useRecordInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordInteractionRequest) => api('recordInteraction', { body }),
    onMutate: async (body) => {
      if (body.target_type !== 'product') return;
      await qc.cancelQueries({ queryKey: ['feed'] });
      const previous = qc.getQueriesData<InfiniteData<FeedPage>>({ queryKey: ['feed'] });
      qc.setQueriesData<InfiniteData<FeedPage>>({ queryKey: ['feed'] }, (data) => {
        if (!data) return data;
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            reacted: { ...page.reacted, [body.target_id]: body.action },
          })),
        };
      });
      return { previous };
    },
    onError: (_error, _body, context) => {
      for (const [key, value] of context?.previous ?? []) qc.setQueryData(key, value);
    },
    onSuccess: (_data, body) => {
      if (body.target_type === 'product') {
        track('product_action', { action: body.action, product_id: body.target_id });
      }
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
