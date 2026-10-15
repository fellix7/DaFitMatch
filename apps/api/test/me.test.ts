import { describe, expect, it } from 'vitest';
import { ApiError, MeResponse } from '@dafitmatch/shared';
import { fakeUserClients, makeApp, profileRow, signToken, USER_ID } from './helpers';

describe('GET /me: auth', () => {
  const unauthorizedCases: [string, () => Promise<Record<string, string>>][] = [
    ['no Authorization header', async () => ({})],
    ['non-bearer scheme', async () => ({ authorization: `Basic ${btoa('a:b')}` })],
    ['garbage token', async () => ({ authorization: 'Bearer not.a.jwt' })],
    [
      'token signed with the wrong secret',
      async () => ({
        authorization: `Bearer ${await signToken({}, { secret: 'x'.repeat(40) })}`,
      }),
    ],
    [
      'expired token',
      async () => ({ authorization: `Bearer ${await signToken({}, { expiresIn: '-1m' })}` }),
    ],
    [
      'anon-role token',
      async () => ({ authorization: `Bearer ${await signToken({ role: 'anon' })}` }),
    ],
    [
      'wrong audience',
      async () => ({ authorization: `Bearer ${await signToken({ aud: 'something-else' })}` }),
    ],
  ];

  for (const [name, headers] of unauthorizedCases) {
    it(`401 for ${name}`, async () => {
      const { factory, tokens } = fakeUserClients({ profiles: profileRow });
      const app = await makeApp({ createUserClient: factory });
      const res = await app.inject({ method: 'GET', url: '/me', headers: await headers() });
      expect(res.statusCode).toBe(401);
      expect(ApiError.parse(res.json()).error.code).toBe('unauthorized');
      expect(tokens).toHaveLength(0); // no DB client is ever created for a rejected request
      await app.close();
    });
  }
});

describe('GET /me: data', () => {
  it('returns the caller profile through a user-scoped client', async () => {
    const token = await signToken();
    const { factory, tokens } = fakeUserClients({
      profiles: profileRow,
      taste_profiles: null,
    });
    const app = await makeApp({ createUserClient: factory });
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = MeResponse.parse(res.json());
    expect(body.profile.id).toBe(USER_ID);
    expect(body.taste_profile).toBeNull();
    expect(tokens).toEqual([token]); // the caller's own JWT, so RLS applies
    await app.close();
  });

  it('404 when the profile row is not visible', async () => {
    const { factory } = fakeUserClients({ profiles: null });
    const app = await makeApp({ createUserClient: factory });
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('never leaks the taste vector even if the row contains one', async () => {
    const { factory } = fakeUserClients({
      profiles: profileRow,
      taste_profiles: {
        user_id: USER_ID,
        archetype_weights: { minimal: 0.5 },
        colors_like: ['navy'],
        colors_avoid: [],
        never_wear: [],
        comfort_vs_statement: 3,
        fit_prefs: {},
        interaction_count: 4,
        version: 1,
        updated_at: '2026-10-15T10:00:00+00:00',
        taste_vector: '[0.1,0.2]',
      },
    });
    const app = await makeApp({ createUserClient: factory });
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('taste_vector');
    await app.close();
  });
});

describe('POST /me/age', () => {
  const post = async (factory: ReturnType<typeof fakeUserClients>['factory'], body: object) => {
    const app = await makeApp({ createUserClient: factory });
    const res = await app.inject({
      method: 'POST',
      url: '/me/age',
      payload: body,
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    await app.close();
    return res;
  };

  it('passes the birth date to confirm_age and returns only the boolean', async () => {
    const fake = fakeUserClients({}, { confirm_age: { data: true, error: null } });
    const res = await post(fake.factory, { birth_date: '1995-06-01' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ is_adult: true });
    expect(fake.rpcCalls).toEqual([{ fn: 'confirm_age', args: { birth_date: '1995-06-01' } }]);
  });

  it('409 when already confirmed', async () => {
    const fake = fakeUserClients(
      {},
      { confirm_age: { data: null, error: { code: 'P0001', message: 'age already confirmed' } } },
    );
    const res = await post(fake.factory, { birth_date: '1995-06-01' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'age_already_confirmed' } });
  });

  it('400 for a malformed date (never reaches the database)', async () => {
    const fake = fakeUserClients({});
    const res = await post(fake.factory, { birth_date: '01/06/1995' });
    expect(res.statusCode).toBe(400);
    expect(fake.rpcCalls).toHaveLength(0);
  });
});
