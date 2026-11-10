import { describe, expect, it } from 'vitest';
import {
  ApiError,
  ListWardrobeResponse,
  STORAGE_BUCKETS,
  WardrobeItemResponse,
} from '@dafitmatch/shared';
import type { UserSupabaseClient } from '../src/lib/supabase';
import { WARDROBE_URL_TTL_SECONDS } from '../src/routes/wardrobe';
import { makeApp, signToken, USER_ID } from './helpers';

const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_USER = '44444444-4444-4444-8444-444444444444';

const row = (over: Record<string, unknown> = {}) => ({
  id: ITEM_ID,
  user_id: USER_ID,
  slot: 'top',
  category: 'shirt',
  title: 'White linen shirt',
  colors: ['white'],
  formality: 3,
  occasions: ['brunch'],
  tags: ['linen'],
  image_path: `${USER_ID}/shirt.jpg`,
  is_archived: false,
  created_at: '2026-11-01T10:00:00+00:00',
  updated_at: '2026-11-01T10:00:00+00:00',
  ...over,
});

type Call = { table: string; op: string; values?: unknown; filters: unknown[] };
type Err = { code?: string; message: string; name?: string } | null;

/**
 * Fake supabase-js client for the wardrobe routes. `result` answers every row query (list,
 * single, maybeSingle); `embeddedIds` answers the "which rows have an embedding" query.
 */
function fakeWardrobe(opts: {
  result?: unknown;
  error?: Err;
  embeddedIds?: string[];
  signError?: Err;
  removeError?: Err;
}) {
  const calls: Call[] = [];
  const storage: { bucket: string; op: string; arg: unknown; ttl?: number }[] = [];

  const client = {
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [] };
      calls.push(call);
      let embeddedQuery = false;
      const answer = () => {
        if (embeddedQuery) {
          return { data: (opts.embeddedIds ?? []).map((id) => ({ id })), error: null };
        }
        return { data: opts.result ?? null, error: opts.error ?? null };
      };
      const chain = {
        select: () => chain,
        insert: (values: unknown) => ((call.op = 'insert'), (call.values = values), chain),
        update: (values: unknown) => ((call.op = 'update'), (call.values = values), chain),
        delete: () => ((call.op = 'delete'), chain),
        eq: (c: string, v: unknown) => (call.filters.push([c, '=', v]), chain),
        in: (c: string, v: unknown) => (call.filters.push([c, 'in', v]), chain),
        not: (c: string, o: string, v: unknown) => {
          call.filters.push([c, `not ${o}`, v]);
          embeddedQuery = true;
          return chain;
        },
        order: () => chain,
        single: async () => answer(),
        maybeSingle: async () => answer(),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(answer())),
      };
      return chain;
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[], ttl: number) => {
          storage.push({ bucket, op: 'sign', arg: paths, ttl });
          if (opts.signError) return { data: null, error: opts.signError };
          return {
            data: paths.map((p) => ({ path: p, signedUrl: `https://signed.example/${p}` })),
            error: null,
          };
        },
        remove: async (paths: string[]) => {
          storage.push({ bucket, op: 'remove', arg: paths });
          return { data: null, error: opts.removeError ?? null };
        },
      }),
    },
  } as unknown as UserSupabaseClient;

  const tokens: string[] = [];
  const factory = (t: string) => (tokens.push(t), client);
  return { factory, calls, storage, tokens };
}

async function call(
  fake: ReturnType<typeof fakeWardrobe>,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  const app = await makeApp({ createUserClient: fake.factory });
  const token = await signToken();
  const res = await app.inject({
    method,
    url,
    payload,
    headers: { authorization: `Bearer ${token}` },
  });
  await app.close();
  return { res, token };
}

describe('GET /wardrobe', () => {
  it('lists only the caller’s items with signed URLs and no vectors', async () => {
    const fake = fakeWardrobe({
      result: [row(), row({ id: OTHER_USER, image_path: null })],
      embeddedIds: [ITEM_ID],
    });
    const { res, token } = await call(fake, 'GET', '/wardrobe');
    expect(res.statusCode).toBe(200);
    const { items } = ListWardrobeResponse.parse(res.json());

    expect(fake.tokens).toEqual([token]); // user-scoped client, so RLS applies
    expect(fake.calls[0]!.filters).toContainEqual(['user_id', '=', USER_ID]);
    expect(items[0]!.image_url).toBe(`https://signed.example/${USER_ID}/shirt.jpg`);
    expect(items[0]!.is_embedded).toBe(true);
    expect(items[1]!.image_url).toBeNull();
    expect(items[1]!.is_embedded).toBe(false);
    expect(fake.storage).toEqual([
      {
        bucket: STORAGE_BUCKETS.wardrobePhotos,
        op: 'sign',
        arg: [`${USER_ID}/shirt.jpg`],
        ttl: WARDROBE_URL_TTL_SECONDS,
      },
    ]);
    expect(JSON.stringify(res.json())).not.toMatch(/embedding|image_path/);
  });

  it('still returns items when photo signing fails', async () => {
    const fake = fakeWardrobe({ result: [row()], signError: { name: 'x', message: 'x' } });
    const { res } = await call(fake, 'GET', '/wardrobe');
    expect(res.statusCode).toBe(200);
    expect(ListWardrobeResponse.parse(res.json()).items[0]!.image_url).toBeNull();
  });

  it('500 without leaking the DB error', async () => {
    const fake = fakeWardrobe({ error: { code: 'XX000', message: 'secret detail' } });
    const { res } = await call(fake, 'GET', '/wardrobe');
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret detail');
  });
});

describe('POST /wardrobe', () => {
  it('inserts for the caller, applying contract defaults', async () => {
    const fake = fakeWardrobe({ result: row({ image_path: null, title: null }) });
    const { res } = await call(fake, 'POST', '/wardrobe', { slot: 'top', category: 'shirt' });
    expect(res.statusCode).toBe(200);
    WardrobeItemResponse.parse(res.json());
    const insert = fake.calls.find((c) => c.op === 'insert')!;
    expect(insert.values).toEqual({
      slot: 'top',
      category: 'shirt',
      colors: [],
      occasions: [],
      tags: [],
      user_id: USER_ID,
    });
  });

  it('ignores a user_id in the body (always the caller)', async () => {
    const fake = fakeWardrobe({ result: row() });
    await call(fake, 'POST', '/wardrobe', { slot: 'top', category: 'shirt', user_id: OTHER_USER });
    const insert = fake.calls.find((c) => c.op === 'insert')!;
    expect((insert.values as { user_id: string }).user_id).toBe(USER_ID);
  });

  it('400 for a photo outside the caller’s folder, before touching the DB', async () => {
    const fake = fakeWardrobe({ result: row() });
    const { res } = await call(fake, 'POST', '/wardrobe', {
      slot: 'top',
      category: 'shirt',
      image_path: `${OTHER_USER}/x.jpg`,
    });
    expect(res.statusCode).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });

  it('409 when the wardrobe limit is reached', async () => {
    const fake = fakeWardrobe({
      error: { code: 'P0001', message: 'wardrobe limit reached (300 items)' },
    });
    const { res } = await call(fake, 'POST', '/wardrobe', { slot: 'top', category: 'shirt' });
    expect(res.statusCode).toBe(409);
    expect(ApiError.parse(res.json()).error.code).toBe('wardrobe_full');
  });

  it('400 for an invalid slot (contract validation)', async () => {
    const fake = fakeWardrobe({});
    const { res } = await call(fake, 'POST', '/wardrobe', { slot: 'hat', category: 'cap' });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /wardrobe/:id', () => {
  it('updates only the caller’s row', async () => {
    const fake = fakeWardrobe({ result: row({ title: 'Linen shirt' }) });
    const { res } = await call(fake, 'PATCH', `/wardrobe/${ITEM_ID}`, { title: 'Linen shirt' });
    expect(res.statusCode).toBe(200);
    const update = fake.calls.find((c) => c.op === 'update')!;
    expect(update.filters).toEqual([
      ['id', '=', ITEM_ID],
      ['user_id', '=', USER_ID],
    ]);
    expect(update.values).toMatchObject({ title: 'Linen shirt' });
  });

  it('404 when the item is not the caller’s (or does not exist)', async () => {
    const fake = fakeWardrobe({ result: null });
    const { res } = await call(fake, 'PATCH', `/wardrobe/${ITEM_ID}`, { is_archived: true });
    expect(res.statusCode).toBe(404);
  });

  it('400 for an empty update', async () => {
    const fake = fakeWardrobe({ result: row() });
    const { res } = await call(fake, 'PATCH', `/wardrobe/${ITEM_ID}`, {});
    expect(res.statusCode).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('DELETE /wardrobe/:id', () => {
  it('deletes the row and its photo', async () => {
    const fake = fakeWardrobe({ result: { image_path: `${USER_ID}/shirt.jpg` } });
    const { res } = await call(fake, 'DELETE', `/wardrobe/${ITEM_ID}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(fake.calls[0]!.filters).toEqual([
      ['id', '=', ITEM_ID],
      ['user_id', '=', USER_ID],
    ]);
    expect(fake.storage).toEqual([
      { bucket: STORAGE_BUCKETS.wardrobePhotos, op: 'remove', arg: [`${USER_ID}/shirt.jpg`] },
    ]);
  });

  it('succeeds even if the photo delete fails (row is already gone)', async () => {
    const fake = fakeWardrobe({
      result: { image_path: `${USER_ID}/shirt.jpg` },
      removeError: { name: 'x', message: 'x' },
    });
    const { res } = await call(fake, 'DELETE', `/wardrobe/${ITEM_ID}`);
    expect(res.statusCode).toBe(200);
  });

  it('404 when nothing was deleted', async () => {
    const fake = fakeWardrobe({ result: null });
    const { res } = await call(fake, 'DELETE', `/wardrobe/${ITEM_ID}`);
    expect(res.statusCode).toBe(404);
    expect(fake.storage).toHaveLength(0);
  });
});
