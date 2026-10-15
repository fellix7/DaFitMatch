import { describe, expect, it } from 'vitest';
import { ListArchetypesResponse, MeResponse } from '@dafitmatch/shared';
import { fakeUserClients, makeApp, profileRow, signToken, USER_ID } from './helpers';

const answers = {
  gender_presentation: 'feminine',
  shop_gender: 'women',
  occasion: 'rooftop',
  budget_inr: 6000,
  height_cm: 165,
  archetypes: ['soft-romantic', 'minimal'],
  colors_like: ['ivory', 'green'],
  colors_avoid: ['neon'],
  never_wear: ['crop tops'],
  comfort_vs_statement: 4,
  fit_prefs: { bottom: 'wide' },
  wardrobe_mode: 'mix',
};

const knownArchetypes = [{ slug: 'minimal' }, { slug: 'soft-romantic' }];

describe('PUT /me/taste (save guest answers after sign-in)', () => {
  it('requires sign-in', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'PUT', url: '/me/taste', payload: answers });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('saves profile + taste fields with the user-scoped client and returns /me', async () => {
    const fake = fakeUserClients(
      { profiles: profileRow, taste_profiles: null },
      {},
      { archetypes: knownArchetypes },
    );
    const app = await makeApp({ createUserClient: fake.factory });
    const res = await app.inject({
      method: 'PUT',
      url: '/me/taste',
      payload: answers,
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(200);
    MeResponse.parse(res.json());

    expect(fake.writes.find((w) => w.table === 'profiles')).toMatchObject({
      op: 'update',
      values: { gender_presentation: 'feminine', default_budget_inr: 6000, height_cm: 165 },
      filters: [['id', '=', USER_ID]],
    });
    const tasteWrite = fake.writes.find((w) => w.table === 'taste_profiles');
    expect(tasteWrite).toMatchObject({
      op: 'upsert',
      values: {
        user_id: USER_ID,
        archetype_weights: { 'soft-romantic': 0.667, minimal: 0.333 },
        colors_like: ['ivory', 'green'],
        colors_avoid: ['neon'],
        never_wear: ['crop tops'],
        comfort_vs_statement: 4,
        fit_prefs: { bottom: 'wide' },
        version: 1,
      },
    });
    // The learned vector and interaction history are never overwritten by quiz answers.
    expect(tasteWrite!.values).not.toHaveProperty('taste_vector');
    expect(tasteWrite!.values).not.toHaveProperty('interaction_count');
    await app.close();
  });

  it('rejects unknown archetypes without writing anything', async () => {
    const fake = fakeUserClients(
      { profiles: profileRow },
      {},
      { archetypes: [{ slug: 'minimal' }] },
    );
    const app = await makeApp({ createUserClient: fake.factory });
    const res = await app.inject({
      method: 'PUT',
      url: '/me/taste',
      payload: { ...answers, archetypes: ['minimal', 'made-up'] },
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { details: { unknown: ['made-up'] } } });
    expect(fake.writes).toHaveLength(0);
    await app.close();
  });

  it('400 for invalid answers (e.g. no archetype picked)', async () => {
    const fake = fakeUserClients({});
    const app = await makeApp({ createUserClient: fake.factory });
    const res = await app.inject({
      method: 'PUT',
      url: '/me/taste',
      payload: { ...answers, archetypes: [] },
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(400);
    expect(fake.writes).toHaveLength(0);
    await app.close();
  });
});

describe('GET /archetypes', () => {
  it('is public and returns the catalog of styles', async () => {
    const fake = fakeUserClients(
      {},
      {},
      {
        archetypes: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            slug: 'minimal',
            name: 'Minimal',
            benchmark_brands: ['COS'],
            description: 'Clean lines.',
          },
        ],
      },
    );
    const app = await makeApp({ anonClient: fake.anon });
    const res = await app.inject({ method: 'GET', url: '/archetypes' });
    expect(res.statusCode).toBe(200);
    expect(ListArchetypesResponse.parse(res.json()).archetypes[0]!.slug).toBe('minimal');
    expect(res.headers['cache-control']).toContain('max-age');
    await app.close();
  });
});
