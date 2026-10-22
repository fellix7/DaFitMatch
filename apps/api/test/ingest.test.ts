import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { CATALOG_SLOT_SHARE, QUIZ_CARD_COUNT } from '@dafitmatch/shared';
import { CsvFeedAdapter, parseCsv, toRecords } from '../src/jobs/ingest/csv';
import { CuelinksCsvAdapter, CuelinksJsonAdapter } from '../src/jobs/ingest/cuelinks';
import { extractAsin, buildAmazonLinks } from '../src/jobs/ingest/amazon';
import { extractColors, normaliseFeedRow, parsePriceInr } from '../src/jobs/ingest/normalize';
import { mapCategoryToSlot } from '../src/jobs/ingest/slots';
import { balanceBySlot, chunk, dedupeRows, upsertProducts } from '../src/jobs/ingest/upsert';
import { runIngest } from '../src/jobs/ingest/index';
import type { CatalogRow, FeedAdapter } from '../src/jobs/ingest/types';

const csv = `id,brand,name,category,gender,price,image_url,product_link,in_stock,site
SKU-1,Roadster,"Navy Slim Fit Shirt, Men",Shirts,Men,"₹1,299",https://img.test/1.jpg,https://shop.test/1,true,myntra
SKU-2,Levis,501 Blue Jeans,Jeans,Men,Rs. 2499,https://img.test/2.jpg,https://shop.test/2,true,ajio
SKU-3,Nike,Air Running Shoes,Sneakers,Unisex,2999,https://img.test/3.jpg,https://shop.test/3,false,amazon
SKU-4,Anouk,Saree,"Ethnic Wear > Sarees",Women,4499,https://img.test/4.jpg,https://shop.test/4,true,flipkart
`;

describe('slot rules', () => {
  it('maps vendor categories onto slots', () => {
    expect(mapCategoryToSlot('Shirts')).toBe('top');
    expect(mapCategoryToSlot('T-Shirts')).toBe('top');
    expect(mapCategoryToSlot('Jeans')).toBe('bottom');
    expect(mapCategoryToSlot('Sneakers')).toBe('footwear');
    expect(mapCategoryToSlot('Jackets')).toBe('layer');
    expect(mapCategoryToSlot('Belts')).toBe('accessory');
    expect(mapCategoryToSlot('Ethnic Wear > Sarees')).toBe('full');
    expect(mapCategoryToSlot('Kurta Sets')).toBe('full');
    expect(mapCategoryToSlot('Kurtas')).toBe('full');
    expect(mapCategoryToSlot('Footwear')).toBe('footwear');
    expect(mapCategoryToSlot('Juttis')).toBe('footwear');
  });

  it('does not guess an unknown category', () => {
    expect(mapCategoryToSlot('Home Decor > Cushion Covers')).toBeNull();
    expect(mapCategoryToSlot('')).toBeNull();
  });

  it('keeps a dress shirt out of the "full" bucket', () => {
    expect(mapCategoryToSlot('Formal Shirts')).toBe('top');
    expect(mapCategoryToSlot('Dress Shirt')).toBe('top');
  });
});

describe('normalisation', () => {
  it('cleans prices into whole rupees', () => {
    expect(parsePriceInr('₹1,299')).toBe(1299);
    expect(parsePriceInr('Rs. 2499.00')).toBe(2499);
    expect(parsePriceInr(1500)).toBe(1500);
    expect(parsePriceInr('free')).toBeNull();
    expect(parsePriceInr(undefined)).toBeNull();
  });

  it('finds colours from the fixed vocabulary', () => {
    expect(extractColors('Navy Blue Slim Fit Shirt')).toEqual(
      expect.arrayContaining(['navy', 'blue']),
    );
    expect(extractColors('Sky Blue Dress')).toEqual(['sky blue']);
    expect(extractColors('Nothing here')).toEqual([]);
  });

  it('rejects a row whose category cannot be mapped', () => {
    const result = normaliseFeedRow({
      source: 'other',
      external_id: 'X1',
      brand: 'B',
      title: 'Cushion Cover',
      category_raw: 'Home Decor',
      gender: 'women',
      price_inr: 999,
      image_url: 'https://img.test/x.jpg',
      affiliate_url: 'https://shop.test/x',
      in_stock: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unmappable_slot');
  });
});

describe('csv reader', () => {
  it('handles quotes, commas and newlines inside fields', () => {
    const rows = parseCsv('a,b\n"x,1","line\nbreak"\n');
    expect(rows[0]).toEqual(['a', 'b']);
    expect(rows[1]).toEqual(['x,1', 'line\nbreak']);
  });

  it('turns rows into records keyed by the header', () => {
    const records = toRecords(parseCsv('a,b\n1,2\n'));
    expect(records[0]).toEqual({ a: '1', b: '2' });
  });
});

describe('csv feed adapter', () => {
  it('maps a catalogue export onto feed rows', () => {
    const adapter = new CsvFeedAdapter({ file: 'unused.csv' });
    const rows = adapter.parse(csv);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      source: 'myntra',
      external_id: 'SKU-1',
      brand: 'Roadster',
      title: 'Navy Slim Fit Shirt, Men',
      category_raw: 'Shirts',
      gender: 'men',
      price_inr: 1299,
      in_stock: true,
    });
    expect(rows[2]).toMatchObject({ source: 'amazon', gender: 'unisex', in_stock: false });
  });

  it('skips rows that cannot satisfy the shared contract', () => {
    const adapter = new CsvFeedAdapter({ file: 'unused.csv' });
    const rows = adapter.parse(
      'id,brand,name,category,gender,price,image_url,product_link\nX1,,,Shirts,Men,10,not-a-url,\n',
    );
    expect(rows).toHaveLength(0);
  });
});

describe('cuelinks adapter', () => {
  it('reads the retailer column as the catalog source', () => {
    const adapter = new CuelinksCsvAdapter({ file: 'unused.csv' });
    const rows = adapter.parse(csv);
    expect(rows.map((r) => r.source)).toEqual(['myntra', 'ajio', 'amazon', 'flipkart']);
  });

  it('reads a json export', () => {
    const adapter = new CuelinksJsonAdapter({ file: 'unused.json' });
    const rows = adapter.parse(
      JSON.stringify({
        products: [
          {
            product_id: 'C-9',
            brand: 'Fabindia',
            product_name: 'Block Print Kurta Set',
            sub_category: 'Kurta Sets',
            price: '2999',
            image_url: 'https://img.test/9.jpg',
            product_link: 'https://shop.test/9',
            gender: 'Women',
            merchant: 'Myntra',
          },
        ],
      }),
    );
    expect(rows[0]).toMatchObject({
      source: 'myntra',
      external_id: 'C-9',
      title: 'Block Print Kurta Set',
      price_inr: 2999,
      gender: 'women',
    });
  });
});

describe('amazon links', () => {
  it('extracts an ASIN from a product url', () => {
    expect(extractAsin('https://www.amazon.in/dp/B0BXYZ1234/ref=sr_1_1')).toBe('B0BXYZ1234');
    expect(extractAsin('B0BXYZ1234')).toBe('B0BXYZ1234');
    expect(extractAsin('https://example.com/nope')).toBeNull();
  });

  it('builds tagged links and refuses a bad tag', () => {
    const { links, skipped } = buildAmazonLinks(
      [{ asin: 'B0BXYZ1234', title: 'Shirt' }, { url: 'https://example.com/x' }],
      { tag: 'dafitmatch-21' },
    );
    expect(links[0]?.url).toBe('https://www.amazon.in/dp/B0BXYZ1234?tag=dafitmatch-21');
    expect(skipped).toHaveLength(1);
    expect(() => buildAmazonLinks([], { tag: 'x' })).toThrow();
  });
});

const row = (n: number, slot: CatalogRow['slot']): CatalogRow => ({
  source: 'other',
  external_id: `E-${n}`,
  brand: 'B',
  title: `Item ${n}`,
  category: 'shirt',
  slot,
  gender: 'men',
  colors: [],
  formality: 3,
  occasions: [],
  price_inr: 1000 + n,
  image_url: `https://img.test/${n}.jpg`,
  affiliate_url: `https://shop.test/${n}`,
  in_stock: true,
});

describe('batching and balance', () => {
  it('chunks rows', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('keeps the catalog close to the target slot mix', () => {
    const rows = [
      ...Array.from({ length: 90 }, (_, i) => row(i, 'top')),
      ...Array.from({ length: 10 }, (_, i) => row(100 + i, 'bottom')),
      ...Array.from({ length: 10 }, (_, i) => row(200 + i, 'footwear')),
      ...Array.from({ length: 10 }, (_, i) => row(300 + i, 'layer')),
      ...Array.from({ length: 10 }, (_, i) => row(400 + i, 'accessory')),
    ];
    const balanced = balanceBySlot(rows, 100);
    const counts = new Map<string, number>();
    for (const r of balanced) counts.set(r.slot, (counts.get(r.slot) ?? 0) + 1);
    // The surplus tops are dropped; the under-filled slots keep everything they have.
    expect(counts.get('top')).toBe(Math.floor(100 * CATALOG_SLOT_SHARE.top));
    expect(counts.get('bottom')).toBe(10);
    expect(counts.get('footwear')).toBe(10);
    expect(balanced).toHaveLength(65);
  });

  it('never drops a slot that is under its share', () => {
    const rows = [...Array.from({ length: 90 }, (_, i) => row(i, 'top')), row(999, 'bottom')];
    const balanced = balanceBySlot(rows, 100);
    expect(balanced.some((r) => r.slot === 'bottom')).toBe(true);
  });

  it('removes in-batch duplicates, keeping the last one', () => {
    const { unique, duplicates } = dedupeRows([row(1, 'top'), row(1, 'top'), row(2, 'top')]);
    expect(unique).toHaveLength(2);
    expect(duplicates).toBe(1);
  });
});

describe('upsert', () => {
  it('writes in batches of 500 with the unique key', async () => {
    const calls: { size: number; onConflict: string }[] = [];
    const writer = {
      from: () => ({
        upsert: async (values: readonly unknown[], options: { onConflict: string }) => {
          calls.push({ size: values.length, onConflict: options.onConflict });
          return { error: null };
        },
      }),
    };
    const rows = Array.from({ length: 1200 }, (_, i) => row(i, 'top'));
    const written = await upsertProducts(writer, rows);
    expect(written).toBe(1200);
    expect(calls.map((c) => c.size)).toEqual([500, 500, 200]);
    expect(calls[0]?.onConflict).toBe('source,external_id');
  });
});

describe('runIngest', () => {
  it('normalises, dedupes and writes the feed', async () => {
    const adapter: FeedAdapter = {
      name: 'fake',
      fetch: async () => [
        {
          source: 'myntra',
          external_id: 'A',
          brand: 'B',
          title: 'Blue Shirt',
          category_raw: 'Shirts',
          gender: 'men',
          price_inr: 1000,
          image_url: 'https://img.test/a.jpg',
          affiliate_url: 'https://shop.test/a',
          in_stock: true,
        },
        {
          source: 'myntra',
          external_id: 'A',
          brand: 'B',
          title: 'Blue Shirt v2',
          category_raw: 'Shirts',
          gender: 'men',
          price_inr: 1100,
          image_url: 'https://img.test/a.jpg',
          affiliate_url: 'https://shop.test/a',
          in_stock: true,
        },
        {
          source: 'myntra',
          external_id: 'B',
          brand: 'B',
          title: 'Cushion Cover',
          category_raw: 'Home Decor',
          gender: 'women',
          price_inr: 500,
          image_url: 'https://img.test/b.jpg',
          affiliate_url: 'https://shop.test/b',
          in_stock: true,
        },
      ],
    };
    const written: unknown[][] = [];
    const writer = {
      from: () => ({
        upsert: async (values: readonly unknown[]) => {
          written.push([...values]);
          return { error: null };
        },
      }),
    };

    const report = await runIngest(adapter, writer);
    expect(report.fetched).toBe(3);
    expect(report.duplicates).toBe(1);
    expect(report.unmappable).toBe(1);
    expect(report.written).toBe(1);
    expect(written[0]?.[0]).toMatchObject({ slot: 'top', price_inr: 1100 });
  });

  it('writes nothing on a dry run', async () => {
    const adapter: FeedAdapter = {
      name: 'fake',
      fetch: async () => [
        {
          source: 'other',
          external_id: 'A',
          brand: 'B',
          title: 'Shirt',
          category_raw: 'Shirts',
          gender: 'men',
          price_inr: 1000,
          image_url: 'https://img.test/a.jpg',
          affiliate_url: 'https://shop.test/a',
          in_stock: true,
        },
      ],
    };
    const writer = {
      from: () => ({
        upsert: async () => {
          throw new Error('should not write');
        },
      }),
    };
    const report = await runIngest(adapter, writer, { dryRun: true });
    expect(report.written).toBe(0);
  });
});

describe('sample feed fixture', () => {
  const fixture = new URL('../src/jobs/ingest/fixtures/sample-products.csv', import.meta.url);

  it('maps every fixture row onto a slot and a price', async () => {
    const adapter = new CsvFeedAdapter({ file: fileURLToPath(fixture) });
    const rows = await adapter.fetch();
    expect(rows).toHaveLength(30);
    for (const row of rows) {
      expect(mapCategoryToSlot(row.category_raw, row.title)).not.toBeNull();
      expect(row.price_inr).toBeGreaterThan(0);
    }
  });

  it('covers every slot the quiz needs', async () => {
    const adapter = new CsvFeedAdapter({ file: fileURLToPath(fixture) });
    const rows = await adapter.fetch();
    const slots = new Set(rows.map((row) => mapCategoryToSlot(row.category_raw, row.title)));
    expect([...slots].sort()).toEqual(['accessory', 'bottom', 'footwear', 'full', 'layer', 'top']);
  });
});

describe('quiz deck expectations', () => {
  it('needs 24 cards per gender to cover the archetypes', () => {
    expect(QUIZ_CARD_COUNT).toBe(24);
  });
});
