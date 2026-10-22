import { readFile } from 'node:fs/promises';
import { FeedProductRow, type ProductGender, type ProductSource } from '@dafitmatch/shared';
import { normalizeGender, parsePriceInr } from './normalize';
import type { FeedAdapter } from './types';

/**
 * Minimal RFC 4180 CSV reader: handles quoted fields, escaped quotes and newlines inside
 * quotes. Feeds are small enough (tens of thousands of rows) that a streaming parser is not
 * worth the dependency.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const src = text.replace(/^\uFEFF/, '');

  while (i < src.length) {
    const char = src[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\r') {
      i += 1;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '');
}

/** First row = header. Every following row becomes a record keyed by the header names. */
export function toRecords(rows: string[][]): Record<string, string>[] {
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((cells) => {
    const record: Record<string, string> = {};
    keys.forEach((key, index) => {
      record[key] = (cells[index] ?? '').trim();
    });
    return record;
  });
}

/** Column name candidates per field. Headers are compared loosely (case, spaces, underscores). */
export interface ColumnMap {
  externalId: readonly string[];
  brand: readonly string[];
  title: readonly string[];
  category: readonly string[];
  gender: readonly string[];
  price: readonly string[];
  image: readonly string[];
  url: readonly string[];
  inStock: readonly string[];
  source: readonly string[];
}

/** The generic map, used for feeds exported by hand from any merchant's catalogue. */
export const DEFAULT_COLUMN_MAP: ColumnMap = {
  externalId: ['id', 'product_id', 'productid', 'sku', 'item_id', 'itemid', 'pid'],
  brand: ['brand', 'brand_name', 'brandname', 'manufacturer'],
  title: ['name', 'product_name', 'productname', 'title', 'product_title'],
  category: ['category', 'category_name', 'product_category', 'sub_category', 'subcategory'],
  gender: ['gender', 'audience', 'target_gender', 'for'],
  price: ['price', 'sale_price', 'selling_price', 'discounted_price', 'current_price', 'mrp'],
  image: ['image_url', 'image', 'imageurl', 'product_image', 'image_link'],
  url: ['link', 'product_link', 'product_url', 'url', 'affiliate_link', 'tracking_url'],
  inStock: ['in_stock', 'availability', 'stock', 'is_available', 'available'],
  source: ['source', 'site', 'merchant', 'retailer', 'platform', 'network'],
};

const loose = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export function buildHeaderIndex(headers: string[], map: ColumnMap) {
  const index = new Map<string, string>();
  headers.forEach((header) => index.set(loose(header), header));
  const pick = (candidates: readonly string[]): string | undefined => {
    for (const candidate of candidates) {
      const hit = index.get(loose(candidate));
      if (hit) return hit;
    }
    return undefined;
  };
  return {
    externalId: pick(map.externalId),
    brand: pick(map.brand),
    title: pick(map.title),
    category: pick(map.category),
    gender: pick(map.gender),
    price: pick(map.price),
    image: pick(map.image),
    url: pick(map.url),
    inStock: pick(map.inStock),
    source: pick(map.source),
  };
}

/** Retailer name → catalog source. Unknown retailers land on "other". */
export function mapSource(raw: string | undefined): ProductSource {
  const value = (raw ?? '').toLowerCase();
  if (value.includes('myntra')) return 'myntra';
  if (value.includes('ajio')) return 'ajio';
  if (value.includes('flipkart')) return 'flipkart';
  if (value.includes('amazon')) return 'amazon';
  return 'other';
}

const TRUTHY = new Set(['1', 'true', 'yes', 'y', 'in stock', 'instock', 'available', 'in_stock']);
const FALSY = new Set(['0', 'false', 'no', 'n', 'out of stock', 'outofstock', 'unavailable']);

/** Stock flag from a vendor cell. Unknown values are treated as in stock (feeds often omit it). */
export function parseInStock(raw: string | undefined): boolean {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return true;
  if (TRUTHY.has(value)) return true;
  if (FALSY.has(value)) return false;
  return !value.includes('out') && !value.includes('unavailable');
}

export interface CsvAdapterOptions {
  /** Path to the exported feed file. */
  file: string;
  /** Adapter id used in logs. */
  name?: string;
  /** Fallback source when the feed has no retailer column. */
  source?: ProductSource;
  /** Column candidates; defaults to DEFAULT_COLUMN_MAP. */
  columns?: ColumnMap;
}

/**
 * Generic CSV feed adapter: reads a catalogue export from disk and maps it to feed rows.
 * Rows that do not satisfy the shared schema are skipped (the ingest job logs them).
 */
export class CsvFeedAdapter implements FeedAdapter {
  readonly name: string;

  constructor(private readonly options: CsvAdapterOptions) {
    this.name = options.name ?? 'csv';
  }

  async fetch(): Promise<FeedProductRow[]> {
    const text = await readFile(this.options.file, 'utf8');
    return this.parse(text);
  }

  /** Parses CSV text into feed rows (exposed for tests and for other file-based adapters). */
  parse(text: string): FeedProductRow[] {
    const records = toRecords(parseCsv(text));
    if (records.length === 0) return [];
    const headers = Object.keys(records[0]!);
    const index = buildHeaderIndex(headers, this.options.columns ?? DEFAULT_COLUMN_MAP);
    const rows: FeedProductRow[] = [];

    for (const record of records) {
      const raw: Record<string, unknown> = {
        source: mapSource(index.source ? record[index.source] : this.options.source),
        external_id: index.externalId ? record[index.externalId] : '',
        brand: index.brand ? record[index.brand] : '',
        title: index.title ? record[index.title] : '',
        category_raw: index.category ? record[index.category] : '',
        gender: normalizeGender(index.gender ? record[index.gender] : '', record['title'] ?? ''),
        price_inr: parsePriceInr(index.price ? record[index.price] : undefined) ?? -1,
        image_url: index.image ? record[index.image] : '',
        affiliate_url: index.url ? record[index.url] : '',
        in_stock: parseInStock(index.inStock ? record[index.inStock] : undefined),
      };
      const parsed = FeedProductRow.safeParse(raw);
      if (parsed.success) rows.push(parsed.data);
    }
    return rows;
  }
}

/** Gender values a feed may use, for adapters that need to map them explicitly. */
export const GENDER_ALIASES: Record<string, ProductGender> = {
  m: 'men',
  male: 'men',
  men: 'men',
  mens: 'men',
  w: 'women',
  female: 'women',
  women: 'women',
  womens: 'women',
  u: 'unisex',
  unisex: 'unisex',
};
