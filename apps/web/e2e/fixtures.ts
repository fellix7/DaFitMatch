import type { Page, Route } from '@playwright/test';

/**
 * E2E fixtures: the web app runs against a mocked API and a faked Supabase session, so the
 * browser flow can be tested without a live project. The request/response shapes are copies of
 * the shared contract (packages/shared/src/schemas) — the app validates every response.
 */
export const API_URL = 'http://api.e2e.test';
export const SUPABASE_URL = 'http://127.0.0.1:54321';
export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const CARD_COUNT = 24;

/** supabase-js keys the session by `sb-<first host label>-auth-token`. */
export const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type,accept',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

/** 1x1 transparent PNG, so product images never 404 in the report. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export const meResponse = {
  profile: {
    id: USER_ID,
    display_name: 'Asha',
    gender_presentation: 'feminine',
    height_cm: 165,
    city: 'Delhi NCR',
    default_budget_inr: 6000,
    is_adult: true,
    age_confirmed_at: '2026-10-15T10:00:00+00:00',
    created_at: '2026-10-15T10:00:00+00:00',
    updated_at: '2026-10-15T10:00:00+00:00',
  },
  taste_profile: null,
};

export const archetypesResponse = {
  archetypes: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      slug: 'soft-romantic',
      name: 'Soft Romantic',
      benchmark_brands: ['Ralph Lauren'],
      description: 'Airy florals, soft tailoring, warm neutrals.',
    },
    {
      id: '33333333-3333-4333-8333-333333333334',
      slug: 'modern-minimal',
      name: 'Modern Minimal',
      benchmark_brands: ['COS'],
      description: 'Clean lines, monochrome, quiet structure.',
    },
  ],
};

export const quizCards = Array.from({ length: CARD_COUNT }, (_, i) => ({
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

export const submitResponse = {
  taste_profile: {
    user_id: USER_ID,
    archetype_weights: { 'soft-romantic': 1 },
    colors_like: ['navy'],
    colors_avoid: [],
    never_wear: [],
    comfort_vs_statement: 3,
    fit_prefs: {},
    interaction_count: CARD_COUNT,
    version: 1,
    updated_at: '2026-10-15T10:00:00+00:00',
  },
  top_archetypes: [
    {
      slug: 'soft-romantic',
      name: 'Soft Romantic',
      weight: 1,
      description: 'Airy florals, soft tailoring, warm neutrals.',
      benchmark_brands: ['Ralph Lauren'],
    },
  ],
  budget_inr: 6000,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  });
}

/** Intercepts the API (and Supabase auth) calls the web app makes. */
export async function mockApi(page: Page): Promise<void> {
  await page.route(`${API_URL}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    const { pathname } = new URL(request.url());
    if (pathname === '/me') return json(route, meResponse);
    if (pathname === '/archetypes') return json(route, archetypesResponse);
    if (pathname === '/quiz/cards') return json(route, { cards: quizCards });
    if (pathname === '/quiz/submit') return json(route, submitResponse);
    if (pathname === '/feed/products') return json(route, feedResponse);
    if (pathname === '/interactions') return json(route, interactionResponse);
    return json(route, { error: { code: 'not_found', message: pathname } }, 404);
  });

  // The auth server is never reached in e2e; answer anyway so a stray call cannot hang the run.
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: USER_ID }),
    }),
  );

  await page.route('**/*.{jpg,jpeg,png,webp}', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  );
}

/** Puts a valid Supabase session in localStorage before the app boots. */
export async function seedSession(page: Page): Promise<void> {
  const session = {
    access_token: 'e2e-access-token',
    refresh_token: 'e2e-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'e2e@example.com',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-15T10:00:00+00:00',
    },
  };
  await page.addInitScript(
    ({ key, session, user }: { key: string; session: unknown; user: unknown }) => {
      window.localStorage.setItem(key, JSON.stringify(session));
      window.localStorage.setItem(`${key}-user`, JSON.stringify({ user }));
    },
    { key: STORAGE_KEY, session, user: session.user },
  );
}
