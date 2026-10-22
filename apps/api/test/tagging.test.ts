import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dafitmatch/shared/db';
import { PRODUCT_TAGS_VERSION } from '@dafitmatch/shared';
import { tagProducts } from '../src/jobs/tagging';
import { buildTaggingPrompt, TagBatchSchema, type TagModel } from '../src/jobs/tagging/prompt';

interface ProductRow {
  id: string;
  title: string;
  brand: string;
  category: string;
  slot: string;
  price_inr: number;
  tags_version: number;
}

function fakeServiceClient(rows: ProductRow[]) {
  const writes: { id: string; values: Record<string, unknown> }[] = [];
  const filters: Array<[string, unknown]> = [];

  const chain = {
    select: () => chain,
    order: () => chain,
    limit: () => chain,
    lt: (col: string, val: unknown) => (filters.push([col, val]), chain),
    eq: (col: string, val: unknown) => (filters.push([col, val]), chain),
    update: (values: Record<string, unknown>) => {
      const filter = filters.find((f) => f[0] === 'id');
      const id = filter ? String(filter[1]) : '';
      writes.push({ id, values });
      return chain;
    },
    then: (resolve: (v: unknown) => unknown) => {
      const lt = filters.find((f) => f[0] === 'tags_version');
      const data = lt ? rows.filter((r) => r.tags_version < Number(lt[1])) : rows;
      return Promise.resolve(resolve({ data, error: null }));
    },
  };

  const client = {
    from: () => chain,
  } as unknown as SupabaseClient<Database>;

  return { client, writes };
}

function product(id: string, overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id,
    title: 'Navy Cotton Shirt',
    brand: 'Roadster',
    category: 'Shirts',
    slot: 'top',
    price_inr: 1299,
    tags_version: 0,
    ...overrides,
  };
}

describe('product tagging job', () => {
  it('tags products in batches and stamps the tags version', async () => {
    const rows = [product('p1'), product('p2'), product('p3')];
    const { client, writes } = fakeServiceClient(rows);
    const batches: number[] = [];

    const model: TagModel = async (batch) => {
      batches.push(batch.length);
      return {
        items: batch.map((item) => ({
          id: item.id,
          slot: 'top' as const,
          formality: 2,
          colors: ['navy'],
          occasions: ['dinner' as const],
        })),
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    };

    const report = await tagProducts(client, model, { batchSize: 2 });

    expect(batches).toEqual([2, 1]);
    expect(report.tagged).toBe(3);
    expect(report.batches).toBe(2);
    expect(report.inputTokens).toBe(200);
    expect(writes).toHaveLength(3);
    expect(writes[0]?.values).toMatchObject({
      slot: 'top',
      formality: 2,
      colors: ['navy'],
      occasions: ['dinner'],
      tags_version: PRODUCT_TAGS_VERSION,
    });
  });

  it('skips products the model did not answer for', async () => {
    const { client, writes } = fakeServiceClient([product('p1'), product('p2')]);
    const model: TagModel = async (batch) => ({
      items: [{ id: batch[0]!.id, slot: 'top' as const, formality: 3, colors: [], occasions: [] }],
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const report = await tagProducts(client, model);

    expect(report.tagged).toBe(1);
    expect(report.skipped).toBe(1);
    expect(writes).toHaveLength(1);
  });

  it('counts a failed batch without writing anything', async () => {
    const { client, writes } = fakeServiceClient([product('p1'), product('p2')]);
    const model: TagModel = async () => {
      throw new Error('rate limited');
    };

    const report = await tagProducts(client, model);

    expect(report.failed).toBe(2);
    expect(report.tagged).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it('rejects an answer that does not match the schema', async () => {
    const { client, writes } = fakeServiceClient([product('p1')]);
    const model: TagModel = async (batch) => ({
      items: [
        { id: batch[0]!.id, slot: 'spacesuit' as never, formality: 9, colors: [], occasions: [] },
      ],
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const report = await tagProducts(client, model);

    expect(report.failed).toBe(1);
    expect(writes).toHaveLength(0);
  });

  it('writes nothing on a dry run', async () => {
    const { client, writes } = fakeServiceClient([product('p1')]);
    const model: TagModel = async (batch) => ({
      items: [{ id: batch[0]!.id, slot: 'top' as const, formality: 2, colors: [], occasions: [] }],
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const report = await tagProducts(client, model, { dryRun: true });

    expect(report.seen).toBe(1);
    expect(report.tagged).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it('counts slot changes', async () => {
    const { client } = fakeServiceClient([product('p1')]);
    const model: TagModel = async (batch) => ({
      items: [{ id: batch[0]!.id, slot: 'full' as const, formality: 4, colors: [], occasions: [] }],
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const report = await tagProducts(client, model);
    expect(report.slotChanges).toBe(1);
  });
});

describe('tagging prompt', () => {
  it('lists every product with its id and constrains the vocabulary', () => {
    const prompt = buildTaggingPrompt([
      { id: 'p1', title: 'Navy Shirt', brand: 'Roadster', category: 'Shirts', price_inr: 1299 },
    ]);
    expect(prompt).toContain('"id":"p1"');
    expect(prompt).toContain('navy');
    expect(prompt).toContain('dinner');
  });

  it('never leaks a price as a decimal', () => {
    const prompt = buildTaggingPrompt([
      { id: 'p1', title: 'Shirt', brand: 'B', category: 'C', price_inr: 1000 },
    ]);
    expect(prompt).toContain('"price_inr":1000');
  });
});

describe('tag batch schema', () => {
  it('accepts a well-formed batch', () => {
    const parsed = TagBatchSchema.safeParse({
      items: [{ id: 'p1', slot: 'top', formality: 2, colors: ['navy'], occasions: ['dinner'] }],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a colour outside the vocabulary', () => {
    const parsed = TagBatchSchema.safeParse({
      items: [{ id: 'p1', slot: 'top', formality: 2, colors: ['ultraviolet'], occasions: [] }],
    });
    expect(parsed.success).toBe(false);
  });
});
