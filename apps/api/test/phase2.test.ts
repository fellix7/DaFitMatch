import { describe, expect, it } from 'vitest';
import {
  ListFeedProductsResponse,
  ListQuizCardsResponse,
  QUIZ_CARD_COUNT,
  RecordInteractionResponse,
  SubmitQuizResponse,
} from '@dafitmatch/shared';
import { fakeUserClients, makeApp, profileRow, signToken, USER_ID } from './helpers';

const CARD_ID = '22222222-2222-4222-8222-222222222222';
const ARCH_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';

const card = (n: number) => ({
  id: `22222222-2222-4222-8222-2222222200${String(n).padStart(2, '0')}`,
  archetype_id: ARCH_ID,
  item_ids: [PRODUCT_ID],
  image_urls: ['https://x.test/a.jpg'],
});

const productRow = (n: number, similarity: number, colors: string[] = ['navy']) => ({
  id: `44444444-4444-4444-8444-4444444400${String(n).padStart(2, '0')}`,
  source: 'other',
  external_id: `SKU-${n}`,
  brand: 'Acme',
  title: `Item ${n}`,
  category: 'shirt',
  slot: 'top',
  gender: 'women',
  colors,
  formality: 2,
  occasions: ['dinner'],
  price_inr: 1999,
  image_url: 'https://x.test/a.jpg',
  affiliate_url: 'https://x.test/buy',
  in_stock: true,
  last_seen_at: '2026-10-15T10:00:00+00:00',
  similarity,
});

const tasteRow = {
  user_id: USER_ID,
  archetype_weights: { 'soft-romantic': 0.667, minimal: 0.333 },
  colors_like: ['navy'],
  colors_avoid: [],
  never_wear: ['heels'],
  comfort_vs_statement: 3,
  fit_prefs: { preference: 'regular' },
  interaction_count: QUIZ_CARD_COUNT,
  version: 1,
  updated_at: '2026-10-15T10:00:00.123456+00:00',
};

const submission = {
  basics: { catalog: 'both', city: 'Delhi NCR', budget_band: '2000-5000' },
  swipes: Array.from({ length: QUIZ_CARD_COUNT }, () => ({ card_id: CARD_ID, action: 'like' })),
  hard_rules: {
    colors_like: ['navy'],
    colors_avoid: [],
    never_wear: [],
    comfort_vs_statement: 50,
  },
};

describe('GET /quiz/cards', () => {
  it('requires sign-in', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/quiz/cards' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns a shuffled run capped at QUIZ_CARD_COUNT', async () => {
    const cards = Array.from({ length: 30 }, (_, i) => card(i + 1));
    const fake = fakeUserClients({}, {}, { quiz_cards: cards });
    const app = await makeApp({ createUserClient: fake.factory });
    const res = await app.inject({
      method: 'GET',
      url: '/quiz/cards',
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = ListQuizCardsResponse.parse(res.json());
    expect(body.cards).toHaveLength(QUIZ_CARD_COUNT);
    await app.close();
  });
});

describe('POST /quiz/submit', () => {
  it('requires sign-in', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/quiz/submit', payload: submission });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('saves via the RPC and returns the profile summary + top styles', async () => {
    const fake = fakeUserClients(
      { profiles: { ...profileRow, default_budget_inr: 8000 }, taste_profiles: null },
      { submit_quiz: { data: tasteRow, error: null } },
      {
        archetypes: [
          {
            slug: 'soft-romantic',
            name: 'Soft Romantic',
            description: 'Flowing, pretty.',
            benchmark_brands: ['Ralph Lauren'],
          },
          {
            slug: 'minimal',
            name: 'Minimal',
            description: 'Clean lines.',
            benchmark_brands: ['COS'],
          },
        ],
      },
    );
    const app = await makeApp({ createUserClient: fake.factory });
    const res = await app.inject({
      method: 'POST',
      url: '/quiz/submit',
      payload: submission,
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = SubmitQuizResponse.parse(res.json());
    expect(body.budget_inr).toBe(8000);
    expect(body.top_archetypes.map((a) => a.slug)).toEqual(['soft-romantic', 'minimal']);
    expect(body.taste_profile.interaction_count).toBe(QUIZ_CARD_COUNT);

    const call = fake.rpcCalls.find((c) => c.fn === 'submit_quiz');
    expect(call?.args).toMatchObject({ p_submission: { basics: { budget_band: '2000-5000' } } });
    await app.close();
  });

  it('400 when the RPC rejects an unknown card', async () => {
    const fake = fakeUserClients(
      {},
      { submit_quiz: { data: null, error: { code: '22023', message: 'unknown quiz card' } } },
    );
    const app = await makeApp({ createUserClient: fake.factory });
    const res = await app.inject({
      method: 'POST',
      url: '/quiz/submit',
      payload: submission,
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'bad_request' } });
    await app.close();
  });
});

describe('GET /feed/products', () => {
  it('requires sign-in', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/feed/products' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('ranks products and explains each with reason tags', async () => {
    const fake = fakeUserClients(
      { taste_profiles: { colors_like: ['navy'] } },
      { rank_products: { data: [productRow(1, 0.8), productRow(2, 0.1, ['red'])], error: null } },
    );
    const app = await makeApp({ createUserClient: fake.factory });
    const res = await app.inject({
      method: 'GET',
      url: '/feed/products',
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = ListFeedProductsResponse.parse(res.json());
    expect(body.products).toHaveLength(2);
    expect(body.products[0]!.score).toBe(0.8);
    expect(body.products[0]!.reason_tags).toContain('in your palette');
    expect(body.products[0]!.reason_tags).toContain('matches your saved styles');
    expect(body.next_cursor).toBeNull();

    const ranked = fake.rpcCalls.find((c) => c.fn === 'rank_products');
    expect(ranked?.args).toMatchObject({ k: 20 });
    await app.close();
  });

  it('emits a keyset cursor when a full page is returned', async () => {
    const fake = fakeUserClients(
      { taste_profiles: { colors_like: [] } },
      { rank_products: { data: [productRow(1, 0.8), productRow(2, 0.5)], error: null } },
    );
    const app = await makeApp({ createUserClient: fake.factory });
    const res = await app.inject({
      method: 'GET',
      url: '/feed/products?limit=2',
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = ListFeedProductsResponse.parse(res.json());
    expect(body.next_cursor).toBe(`${(0.5).toFixed(9)}|${body.products[1]!.product.id}`);

    const ranked = fake.rpcCalls.find((c) => c.fn === 'rank_products');
    expect(ranked?.args).toMatchObject({ k: 2 });
    await app.close();
  });

  it('decodes the cursor into the RPC args', async () => {
    const fake = fakeUserClients(
      { taste_profiles: { colors_like: [] } },
      { rank_products: { data: [], error: null } },
    );
    const app = await makeApp({ createUserClient: fake.factory });
    const res = await app.inject({
      method: 'GET',
      url: `/feed/products?cursor=${encodeURIComponent(`0.400000000|${PRODUCT_ID}`)}`,
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const ranked = fake.rpcCalls.find((c) => c.fn === 'rank_products');
    expect(ranked?.args).toMatchObject({ p_cursor_similarity: 0.4, p_cursor_id: PRODUCT_ID });
    await app.close();
  });

  it('rejects an out-of-range limit', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/feed/products?limit=99',
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /interactions', () => {
  it('requires sign-in', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/interactions',
      payload: { target_type: 'product', target_id: PRODUCT_ID, action: 'like' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('records the interaction and returns the updated counters', async () => {
    const fake = fakeUserClients(
      {},
      {
        record_interaction: {
          data: {
            interaction: {
              id: '55555555-5555-4555-8555-555555555555',
              user_id: USER_ID,
              target_type: 'product',
              target_id: PRODUCT_ID,
              action: 'like',
              created_at: '2026-10-15T10:00:00.123456+00:00',
            },
            taste: { interaction_count: 5, version: 2 },
          },
          error: null,
        },
      },
    );
    const app = await makeApp({ createUserClient: fake.factory });
    const res = await app.inject({
      method: 'POST',
      url: '/interactions',
      payload: { target_type: 'product', target_id: PRODUCT_ID, action: 'like' },
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = RecordInteractionResponse.parse(res.json());
    expect(body.taste).toEqual({ interaction_count: 5, version: 2 });

    const call = fake.rpcCalls.find((c) => c.fn === 'record_interaction');
    expect(call?.args).toMatchObject({
      p_target_type: 'product',
      p_target_id: PRODUCT_ID,
      p_action: 'like',
    });
    await app.close();
  });
});
