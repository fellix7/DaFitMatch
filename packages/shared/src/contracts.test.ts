import { describe, expect, it } from 'vitest';
import {
  ComposeOutfitsRequest,
  DEFAULT_BUDGET_SPLIT,
  DateRoom,
  EMBEDDING_DIM,
  Id,
  InviteCode,
  ListVenuesQuery,
  OCCASIONS,
  Occasion,
  Product,
  SEPARATES_SLOTS,
  TryOnRequest,
  endpoints,
} from './index';

const uid = '11111111-1111-1111-1111-111111111111';

describe('constants', () => {
  it('embedding dim matches Marqo-FashionSigLIP', () => {
    expect(EMBEDDING_DIM).toBe(768);
  });

  it('occasion list matches the Occasion enum', () => {
    expect([...OCCASIONS].sort()).toEqual([...Occasion.options].sort());
  });

  it('separates budget split sums to 1 and full = top + bottom', () => {
    const sum = SEPARATES_SLOTS.reduce((acc, s) => acc + DEFAULT_BUDGET_SPLIT[s], 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(DEFAULT_BUDGET_SPLIT.full).toBeCloseTo(
      DEFAULT_BUDGET_SPLIT.top + DEFAULT_BUDGET_SPLIT.bottom,
      10,
    );
  });
});

describe('schemas', () => {
  it('accepts seed-style ids and Postgres timestamps', () => {
    expect(Id.safeParse('00000000-0000-0000-0000-000000000001').success).toBe(true);
    const room = DateRoom.parse({
      id: uid,
      user_a: uid,
      user_b: null,
      invite_code: 'AB12CD34',
      coordination_mode: 'complementary',
      occasion: 'rooftop',
      budget_a_inr: 6000,
      budget_b_inr: null,
      status: 'open',
      created_at: '2026-10-15T10:00:00.123456+00:00',
      updated_at: '2026-10-15T10:00:00+00:00',
    });
    expect(room.status).toBe('open');
  });

  it('rejects malformed invite codes', () => {
    expect(InviteCode.safeParse('ab12cd34').success).toBe(false);
    expect(InviteCode.safeParse('AB12CD3').success).toBe(false);
  });

  it('product formality is bounded 1..5 and colours are normalised', () => {
    const base = {
      id: uid,
      source: 'myntra',
      external_id: 'x1',
      brand: 'Test',
      title: 'Test tee',
      category: 'tshirt',
      slot: 'top',
      gender: 'unisex',
      colors: ['  Navy '],
      formality: 2,
      occasions: ['brunch'],
      price_inr: 999,
      image_url: 'https://example.com/a.jpg',
      affiliate_url: 'https://example.com/a',
      in_stock: true,
      last_seen_at: null,
    };
    expect(Product.parse(base).colors).toEqual(['navy']);
    expect(Product.safeParse({ ...base, formality: 6 }).success).toBe(false);
    expect(Product.safeParse({ ...base, image_url: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('compose request applies defaults', () => {
    const req = ComposeOutfitsRequest.parse({
      occasion: 'dinner',
      budget_inr: 5000,
      gender: 'men',
    });
    expect(req.count).toBe(3);
  });

  it('try-on photo path must be namespaced by a user id', () => {
    expect(TryOnRequest.safeParse({ product_id: uid, photo_path: `${uid}/me.jpg` }).success).toBe(
      true,
    );
    expect(TryOnRequest.safeParse({ product_id: uid, photo_path: '../etc/passwd' }).success).toBe(
      false,
    );
  });

  it('venue query coerces string numbers from the URL', () => {
    expect(ListVenuesQuery.parse({ limit: '7' }).limit).toBe(7);
  });

  it('every endpoint path is unique per method', () => {
    const keys = Object.values(endpoints).map((e) => `${e.method} ${e.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
