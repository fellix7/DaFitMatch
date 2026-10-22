import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dafitmatch/shared/db';
import { buildCards, generateQuizCards } from '../src/jobs/quizcards';
import { buildCatalogReport, formatCatalogReport, type CatalogRow } from '../src/jobs/report';

type Row = { id: string; slot: string; image_url: string; similarity: number };

function fakeServiceClient(
  archetypes: { id: string; slug: string; centroid: string | null }[],
  products: Row[],
) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];

  const chain = {
    select: () => chain,
    order: () => chain,
    update: (values: unknown) => {
      updates.push(values);
      return chain;
    },
    insert: (values: unknown) => {
      inserts.push(values);
      return chain;
    },
    eq: () => chain,
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolve({ data: archetypes, error: null })),
  };

  const rpcChain = {
    then: (resolve: (v: unknown) => unknown) => {
      const slot = (rpcChain as unknown as { slot: string }).slot;
      const data = products.filter((p) => p.slot === slot);
      return Promise.resolve(resolve({ data, error: null }));
    },
  };

  const client = {
    from: () => chain,
    rpc: (_fn: string, args: { p_slot: string }) => {
      (rpcChain as unknown as { slot: string }).slot = args.p_slot;
      return rpcChain;
    },
  } as unknown as SupabaseClient<Database>;

  return { client, inserts, updates };
}

describe('quiz card builder', () => {
  it('pairs the closest items of each slot', () => {
    const candidates = new Map<string, Row[]>([
      ['top', [{ id: 't1', slot: 'top', image_url: 'a', similarity: 0.9 }]],
      ['bottom', [{ id: 'b1', slot: 'bottom', image_url: 'b', similarity: 0.8 }]],
      ['footwear', [{ id: 'f1', slot: 'footwear', image_url: 'c', similarity: 0.7 }]],
    ]);
    const cards = buildCards(candidates as never, 2, 3);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.itemIds).toEqual(['t1', 'b1', 'f1']);
    expect(cards[0]?.imageUrls).toEqual(['a', 'b', 'c']);
  });

  it('never builds a card with fewer than two items', () => {
    const candidates = new Map<string, Row[]>([
      ['top', [{ id: 't1', slot: 'top', image_url: 'a', similarity: 0.9 }]],
    ]);
    expect(buildCards(candidates as never, 4, 3)).toEqual([]);
  });

  it('respects the item limit', () => {
    const candidates = new Map<string, Row[]>([
      ['full', [{ id: 'f', slot: 'full', image_url: 'a', similarity: 0.9 }]],
      ['top', [{ id: 't1', slot: 'top', image_url: 'b', similarity: 0.8 }]],
      ['bottom', [{ id: 'b1', slot: 'bottom', image_url: 'c', similarity: 0.7 }]],
      ['footwear', [{ id: 's1', slot: 'footwear', image_url: 'd', similarity: 0.6 }]],
    ]);
    const cards = buildCards(candidates as never, 1, 2);
    expect(cards[0]?.itemIds).toHaveLength(2);
  });
});

describe('quiz card generator', () => {
  it('builds cards for every archetype with a centroid', async () => {
    const { client, inserts } = fakeServiceClient(
      [
        { id: 'a1', slug: 'minimal', centroid: '[0.1]' },
        { id: 'a2', slug: 'empty', centroid: null },
      ],
      [
        { id: 't1', slot: 'top', image_url: 'a', similarity: 0.9 },
        { id: 'b1', slot: 'bottom', image_url: 'b', similarity: 0.8 },
      ],
    );

    const report = await generateQuizCards(client, { cardsPerArchetype: 2, genders: ['women'] });

    expect(report.archetypes).toBe(2);
    expect(report.skipped).toBe(1);
    expect(report.cards).toBe(1);
    expect(inserts).toHaveLength(1);
  });

  it('writes nothing on a dry run', async () => {
    const { client, inserts } = fakeServiceClient(
      [{ id: 'a1', slug: 'minimal', centroid: '[0.1]' }],
      [
        { id: 't1', slot: 'top', image_url: 'a', similarity: 0.9 },
        { id: 'b1', slot: 'bottom', image_url: 'b', similarity: 0.8 },
      ],
    );

    const report = await generateQuizCards(client, { genders: ['women'], dryRun: true });

    expect(report.cards).toBe(1);
    expect(inserts).toHaveLength(0);
  });
});

describe('catalog report', () => {
  const row = (overrides: Partial<CatalogRow>): CatalogRow => ({
    id: 'p1',
    source: 'myntra',
    external_id: 'x1',
    brand: 'Roadster',
    title: 'Navy Shirt',
    slot: 'top',
    gender: 'men',
    price_inr: 1299,
    in_stock: true,
    has_embedding: true,
    tags_version: 1,
    ...overrides,
  });

  it('counts embeddings, tags and the slot mix', () => {
    const report = buildCatalogReport([
      row({}),
      row({ id: 'p2', slot: 'bottom', has_embedding: false, tags_version: 0 }),
      row({ id: 'p3', slot: 'footwear' }),
    ]);
    expect(report.products).toBe(3);
    expect(report.embedded).toBe(2);
    expect(report.tagged).toBe(2);
    expect(report.ready).toBe(2);
    expect(report.bySlot.top).toBe(1);
    expect(report.slotMix.find((s) => s.slot === 'top')?.actualShare).toBeCloseTo(1 / 3);
  });

  it('lists the gaps against the exit criteria', () => {
    const report = buildCatalogReport([row({})]);
    expect(report.exitCriteriaMet).toBe(false);
    expect(report.gaps.join(' ')).toContain('men: 1 products (need 5000)');
  });

  it('reports duplicate titles', () => {
    const report = buildCatalogReport([row({}), row({ id: 'p2' })]);
    expect(report.duplicates[0]?.count).toBe(2);
  });

  it('renders a readable summary', () => {
    const text = formatCatalogReport(buildCatalogReport([row({})]));
    expect(text).toContain('DaFitMatch catalog report');
    expect(text).toContain('exit criteria: NOT met');
  });
});
