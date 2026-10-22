import { http, HttpResponse, type HttpHandler } from 'msw';
import { QUIZ_CARD_COUNT } from '@dafitmatch/shared';

/** Base URL the web app talks to in tests (see vite.config.ts). */
export const API_URL = 'http://api.test';

export const USER_ID = '11111111-1111-4111-8111-111111111111';

export const meResponse = {
  profile: {
    id: USER_ID,
    display_name: 'Asha',
    gender_presentation: null,
    height_cm: null,
    city: 'Delhi NCR',
    default_budget_inr: 6000,
    is_adult: true,
    age_confirmed_at: '2026-10-15T10:00:00+00:00',
    created_at: '2026-10-15T10:00:00+00:00',
    updated_at: '2026-10-15T10:00:00+00:00',
  },
  taste_profile: null,
};

export const quizCards = Array.from({ length: QUIZ_CARD_COUNT }, (_, i) => ({
  id: `22222222-2222-4222-8222-2222222200${String(i).padStart(2, '0')}`,
  archetype_id: '33333333-3333-4333-8333-333333333333',
  item_ids: ['44444444-4444-4444-8444-444444444444'],
  image_urls: ['https://x.test/card.jpg'],
}));

export const feedProduct = (n: number) => ({
  id: `44444444-4444-4444-8444-4444444400${String(n).padStart(2, '0')}`,
  source: 'other',
  external_id: `SKU-${n}`,
  brand: 'Acme',
  title: `Item ${n}`,
  category: 'shirt',
  slot: 'top',
  gender: 'women',
  colors: ['navy'],
  formality: 2,
  occasions: ['dinner'],
  price_inr: 1999,
  image_url: 'https://x.test/a.jpg',
  affiliate_url: 'https://x.test/buy',
  in_stock: true,
  last_seen_at: '2026-10-15T10:00:00+00:00',
});

export const feedResponse = {
  products: [
    { product: feedProduct(1), score: 0.8, reason_tags: ['in your palette'] },
    { product: feedProduct(2), score: 0.6, reason_tags: [] },
  ],
  next_cursor: null,
};

/** The shape POST /interactions answers with (the shared contract). */
export const interactionResponse = {
  interaction: {
    id: '55555555-5555-4555-8555-555555555555',
    user_id: USER_ID,
    target_type: 'product',
    target_id: feedProduct(1).id,
    action: 'love',
    created_at: '2026-10-15T10:00:00+00:00',
  },
  taste: { interaction_count: 1, version: 1 },
};

/** Default handlers: the API surface the web app uses in the first-party flows. */
export const handlers: HttpHandler[] = [
  http.get(`${API_URL}/me`, () => HttpResponse.json(meResponse)),
  http.get(`${API_URL}/quiz/cards`, () => HttpResponse.json({ cards: quizCards })),
  http.post(`${API_URL}/quiz/submit`, () =>
    HttpResponse.json({
      taste_profile: {
        user_id: USER_ID,
        archetype_weights: { 'soft-romantic': 1 },
        colors_like: ['navy'],
        colors_avoid: [],
        never_wear: [],
        comfort_vs_statement: 3,
        fit_prefs: {},
        interaction_count: QUIZ_CARD_COUNT,
        version: 1,
        updated_at: '2026-10-15T10:00:00+00:00',
      },
      top_archetypes: [],
      budget_inr: 6000,
    }),
  ),
  http.get(`${API_URL}/feed/products`, () => HttpResponse.json(feedResponse)),
  http.post(`${API_URL}/interactions`, () => HttpResponse.json(interactionResponse)),
];
