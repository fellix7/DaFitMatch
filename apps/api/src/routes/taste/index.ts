import {
  ListFeedProductsResponse,
  ListQuizCardsResponse,
  QUIZ_CARD_COUNT,
  RecordInteractionResponse,
  SubmitQuizResponse,
  TasteProfile,
  type ArchetypeMatch,
  type ListFeedProductsQuery,
  type ListQuizCardsQuery,
  type QuizCard,
  type QuizSubmission,
  type RecordInteractionRequest,
} from '@dafitmatch/shared';
import type { Database } from '@dafitmatch/shared/db';
import type { FastifyBaseLogger } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HttpError } from '../../lib/errors';
import type { UserSupabaseClient } from '../../lib/supabase';
import { requireAuth } from '../../plugins/auth';
import { schemaFor } from '../register';

const QUIZ_CARD_COLUMNS = 'id, archetype_id, item_ids, image_urls';
// taste_vector is deliberately never selected: vectors stay in the database.
const FEED_TASTE_COLUMNS = 'colors_like';

type FeedRow = Database['public']['Functions']['rank_products']['Returns'][number];
type RpcError = { code?: string; message: string };

const dbFailure = (log: FastifyBaseLogger, err: unknown, what: string) => {
  log.error({ err }, `${what} failed`);
  return new HttpError(500, 'internal', `Could not ${what}`);
};

/** Fisher–Yates (unbiased) shuffle of a copy; the quiz shows a random QUIZ_CARD_COUNT card run. */
function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Why a product was shown, derived from the caller's taste and the request filters. */
function reasonTags(row: FeedRow, colorsLike: readonly string[], maxPrice?: number): string[] {
  const tags: string[] = [];
  const palette = new Set(colorsLike);
  if (row.colors.some((c) => palette.has(c))) tags.push('in your palette');
  if (row.similarity >= 0.3) tags.push('matches your saved styles');
  if (row.formality >= 4) tags.push('dressed up');
  if (maxPrice !== undefined && row.price_inr <= maxPrice) tags.push('within budget');
  return tags;
}

function toProduct(row: FeedRow) {
  return {
    id: row.id,
    source: row.source,
    external_id: row.external_id,
    brand: row.brand,
    title: row.title,
    category: row.category,
    slot: row.slot,
    gender: row.gender,
    colors: row.colors,
    formality: row.formality,
    occasions: row.occasions,
    price_inr: row.price_inr,
    image_url: row.image_url,
    affiliate_url: row.affiliate_url,
    in_stock: row.in_stock,
    last_seen_at: row.last_seen_at,
  };
}

/** Loads the top archetypes (by stored weight) for the quiz result screen, most-liked first. */
async function topArchetypes(
  supabase: UserSupabaseClient,
  taste: TasteProfile,
  log: FastifyBaseLogger,
): Promise<ArchetypeMatch[]> {
  const slugs = Object.keys(taste.archetype_weights);
  if (slugs.length === 0) return [];
  const res = await supabase
    .from('archetypes')
    .select('slug, name, description, benchmark_brands')
    .in('slug', slugs);
  if (res.error) throw dbFailure(log, res.error, 'load styles');
  return (res.data ?? [])
    .map((a) => ({
      slug: a.slug,
      name: a.name,
      description: a.description,
      benchmark_brands: a.benchmark_brands,
      weight: taste.archetype_weights[a.slug] ?? 0,
    }))
    .filter((a) => a.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.slug.localeCompare(b.slug))
    .slice(0, 3);
}

export const tasteRoutes: FastifyPluginAsyncZod = async (app) => {
  /** GET /quiz/cards: a shuffled run of active onboarding cards for the caller's catalog section. */
  app.get('/quiz/cards', { schema: schemaFor('listQuizCards') }, async (request) => {
    const { supabase } = requireAuth(request);
    const { gender } = request.query as ListQuizCardsQuery;

    let query = supabase.from('quiz_cards').select(QUIZ_CARD_COLUMNS).eq('active', true);
    if (gender) query = query.eq('gender', gender);
    const { data, error } = await query;
    if (error) throw dbFailure(request.log, error, 'load quiz cards');

    const cards = shuffle((data ?? []) as QuizCard[]).slice(0, QUIZ_CARD_COUNT);
    return ListQuizCardsResponse.parse({ cards });
  });

  /**
   * POST /quiz/submit: saves the completed quiz (explicit fields + swipe-derived taste) through the
   * submit_quiz RPC, then returns the profile summary and the caller's top styles for the result screen.
   */
  app.post('/quiz/submit', { schema: schemaFor('submitQuiz') }, async (request) => {
    const { user, supabase } = requireAuth(request);
    const submission = request.body as QuizSubmission;

    const { data, error } = await supabase.rpc('submit_quiz', { p_submission: submission });
    if (error) {
      const err = error as RpcError;
      if (err.code === '22023') throw new HttpError(400, 'bad_request', 'Unknown quiz card');
      if (err.code === '28000')
        throw new HttpError(401, 'unauthorized', 'Sign in to save your quiz');
      throw dbFailure(request.log, err, 'save quiz');
    }
    const taste = TasteProfile.parse(data);

    const [archetypes, profile] = await Promise.all([
      topArchetypes(supabase, taste, request.log),
      supabase.from('profiles').select('default_budget_inr').eq('id', user.id).maybeSingle(),
    ]);
    if (profile.error) throw dbFailure(request.log, profile.error, 'load profile');

    return SubmitQuizResponse.parse({
      taste_profile: taste,
      top_archetypes: archetypes,
      budget_inr: profile.data?.default_budget_inr ?? 6000,
    });
  });

  /**
   * GET /feed/products: the taste-ranked catalog. rank_products blends the caller's taste vector with
   * their top archetype centroid; the cursor is keyset on the returned score.
   */
  app.get('/feed/products', { schema: schemaFor('listFeedProducts') }, async (request) => {
    const { user, supabase } = requireAuth(request);
    const q = request.query as ListFeedProductsQuery;

    let cursorSimilarity: number | undefined;
    let cursorId: string | undefined;
    if (q.cursor) {
      const [score, id] = q.cursor.split('|');
      cursorSimilarity = Number(score);
      cursorId = id;
    }

    const [ranked, taste] = await Promise.all([
      supabase.rpc('rank_products', {
        p_slot: q.slot,
        p_gender: q.gender,
        p_max_price: q.max_price,
        p_cursor_similarity: cursorSimilarity,
        p_cursor_id: cursorId,
        k: q.limit,
      }),
      supabase
        .from('taste_profiles')
        .select(FEED_TASTE_COLUMNS)
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    if (ranked.error) throw dbFailure(request.log, ranked.error, 'rank products');
    if (taste.error) throw dbFailure(request.log, taste.error, 'load taste profile');

    const colorsLike = taste.data?.colors_like ?? [];
    const rows = ranked.data ?? [];
    const products = rows.map((row) => ({
      product: toProduct(row),
      score: row.similarity,
      reason_tags: reasonTags(row, colorsLike, q.max_price),
    }));
    const last = rows[rows.length - 1];
    const next_cursor =
      rows.length === q.limit && last ? `${last.similarity.toFixed(9)}|${last.id}` : null;

    return ListFeedProductsResponse.parse({ products, next_cursor });
  });

  /** POST /interactions: logs a like/skip/save/etc. and nudges the caller's taste vector. */
  app.post('/interactions', { schema: schemaFor('recordInteraction') }, async (request) => {
    const { supabase } = requireAuth(request);
    const body = request.body as RecordInteractionRequest;

    const { data, error } = await supabase.rpc('record_interaction', {
      p_target_type: body.target_type,
      p_target_id: body.target_id,
      p_action: body.action,
    });
    if (error) {
      const err = error as RpcError;
      if (err.code === '28000') throw new HttpError(401, 'unauthorized', 'Sign in to record');
      throw dbFailure(request.log, err, 'record interaction');
    }
    return RecordInteractionResponse.parse(data);
  });
};
