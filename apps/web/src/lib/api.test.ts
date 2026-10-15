import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, createApiClient } from './api';

const ID = '22222222-2222-4222-8222-222222222222';

const profile = {
  id: ID,
  display_name: 'Asha',
  gender_presentation: null,
  height_cm: null,
  city: 'Delhi NCR',
  default_budget_inr: null,
  is_adult: true,
  age_confirmed_at: '2026-10-15T10:00:00+00:00',
  created_at: '2026-10-15T10:00:00+00:00',
  updated_at: '2026-10-15T10:00:00+00:00',
};

function client(response: { status: number; body: unknown }, token: string | null = 'tok') {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      }),
  );
  const call = createApiClient({
    baseUrl: 'http://api.test',
    getAccessToken: async () => token,
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { call, fetchMock };
}

describe('api client', () => {
  it('attaches the bearer token and validates the response against the contract', async () => {
    const { call, fetchMock } = client({ status: 200, body: { profile, taste_profile: null } });
    const me = await call('me');
    expect(me.profile.display_name).toBe('Asha');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/me');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('fills path params and query strings', async () => {
    const { call, fetchMock } = client({ status: 200, body: { venues: [] } });
    await call('listVenues', { query: { limit: 3, occasion: 'rooftop' } });
    expect(fetchMock.mock.calls[0]![0]).toBe('http://api.test/venues?limit=3&occasion=rooftop');

    const pair = client({
      status: 501,
      body: { error: { code: 'not_implemented', message: 'x' } },
    });
    await expect(
      pair.call('votePair', { params: { id: ID, pairId: ID }, body: { vote: 'up' } }),
    ).rejects.toThrow();
    expect(pair.fetchMock.mock.calls[0]![0]).toBe(`http://api.test/rooms/${ID}/pairs/${ID}/vote`);
    expect(pair.fetchMock.mock.calls[0]![1]?.body).toBe('{"vote":"up"}');
  });

  it('refuses authenticated calls when signed out, without hitting the network', async () => {
    const { call, fetchMock } = client({ status: 200, body: {} }, null);
    await expect(call('me')).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps ApiError bodies to ApiClientError', async () => {
    const { call } = client({
      status: 409,
      body: { error: { code: 'age_already_confirmed', message: 'done' } },
    });
    const err = await call('confirmAge', { body: { birth_date: '1995-01-01' } }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ status: 409, code: 'age_already_confirmed' });
  });

  it('rejects responses that break the contract', async () => {
    const { call } = client({ status: 200, body: { profile: { id: 'nope' } } });
    await expect(call('me')).rejects.toMatchObject({ code: 'contract_mismatch' });
  });

  it('is typed from the shared registry', () => {
    const { call } = client({ status: 200, body: {} });
    // Compile-time only: these must be type errors.
    const typeChecks = () => {
      // @ts-expect-error confirmAge requires a body
      void call('confirmAge');
      // @ts-expect-error unknown endpoint
      void call('deleteEverything');
      // @ts-expect-error invalid enum value in body
      void call('votePair', { params: { id: ID, pairId: ID }, body: { vote: 'maybe' } });
      // @ts-expect-error me takes no body
      void call('me', { body: { x: 1 } });
    };
    expect(typeChecks).toBeTypeOf('function');
  });
});
