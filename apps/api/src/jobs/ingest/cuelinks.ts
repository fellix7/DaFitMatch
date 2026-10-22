import { readFile } from 'node:fs/promises';
import { FeedProductRow, type ProductSource } from '@dafitmatch/shared';
import { normalizeGender, parsePriceInr } from './normalize';
import {
  buildHeaderIndex,
  mapSource,
  parseCsv,
  parseInStock,
  toRecords,
  type ColumnMap,
} from './csv';
import type { FeedAdapter } from './types';

/**
 * Column names used by the Cuelinks / EarnKaro product exports. Both networks ship a CSV and a
 * JSON variant of the same catalogue, with retailer-specific headers, so the candidates below
 * are the union of what the two networks have shipped so far.
 */
export const CUELINKS_COLUMN_MAP: ColumnMap = {
  externalId: ['id', 'product_id', 'productid', 'sku', 'item_id', 'mid', 'model'],
  brand: ['brand', 'brand_name', 'brandname'],
  title: ['name', 'product_name', 'productname', 'title', 'product_title', 'display_name'],
  category: [
    'category',
    'category_name',
    'product_category',
    'sub_category',
    'subcategory',
    'category_path',
    'product_type',
  ],
  gender: ['gender', 'audience', 'target_gender', 'for_gender'],
  price: [
    'price',
    'sale_price',
    'selling_price',
    'discounted_price',
    'current_price',
    'offer_price',
    'price_inr',
  ],
  image: ['image_url', 'image', 'imageurl', 'product_image', 'image_link', 'image_src'],
  url: ['link', 'product_link', 'product_url', 'url', 'affiliate_link', 'tracking_url'],
  inStock: ['in_stock', 'availability', 'stock', 'is_available', 'available', 'stock_status'],
  source: ['source', 'site', 'merchant', 'retailer', 'platform', 'network', 'store'],
};

export interface CuelinksAdapterOptions {
  file: string;
  name?: string;
  /** Fallback source when the feed has no retailer column. */
  source?: ProductSource;
}

/**
 * Cuelinks / EarnKaro CSV export adapter.
 *
 * These networks aggregate many retailers, so the retailer (and therefore the catalog source)
 * comes from the feed's own retailer column. No retailer site is ever scraped: the adapter only
 * reads the file the network hands us.
 */
export class CuelinksCsvAdapter implements FeedAdapter {
  readonly name: string;

  constructor(private readonly options: CuelinksAdapterOptions) {
    this.name = options.name ?? 'cuelinks';
  }

  async fetch(): Promise<FeedProductRow[]> {
    const text = await readFile(this.options.file, 'utf8');
    return this.parse(text);
  }

  parse(text: string): FeedProductRow[] {
    const records = toRecords(parseCsv(text));
    if (records.length === 0) return [];
    const index = buildHeaderIndex(Object.keys(records[0]!), CUELINKS_COLUMN_MAP);
    const rows: FeedProductRow[] = [];

    for (const record of records) {
      const raw: Record<string, unknown> = {
        source: mapSource(index.source ? record[index.source] : this.options.source),
        external_id: index.externalId ? record[index.externalId] : '',
        brand: index.brand ? record[index.brand] : '',
        title: index.title ? record[index.title] : '',
        category_raw: index.category ? record[index.category] : '',
        gender: normalizeGender(index.gender ? record[index.gender] : '', record['name'] ?? ''),
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

/**
 * Cuelinks / EarnKaro JSON export adapter. The file is either a bare array of product objects or
 * an object with a `products` / `data` array.
 */
export class CuelinksJsonAdapter implements FeedAdapter {
  readonly name: string;

  constructor(private readonly options: CuelinksAdapterOptions) {
    this.name = options.name ?? 'cuelinks-json';
  }

  async fetch(): Promise<FeedProductRow[]> {
    const text = await readFile(this.options.file, 'utf8');
    return this.parse(text);
  }

  parse(text: string): FeedProductRow[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return [];
    }
    const items = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null
        ? (((parsed as Record<string, unknown>).products as unknown) ??
          ((parsed as Record<string, unknown>).data as unknown) ??
          [])
        : [];
    if (!Array.isArray(items)) return [];

    const keys = new Set<string>();
    for (const item of items) {
      if (item && typeof item === 'object') Object.keys(item).forEach((k) => keys.add(k));
    }
    const index = buildHeaderIndex([...keys], CUELINKS_COLUMN_MAP);
    const rows: FeedProductRow[] = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const pick = (column: string | undefined): string =>
        column === undefined ? '' : String(record[column] ?? '').trim();
      const raw: Record<string, unknown> = {
        source: mapSource(index.source ? pick(index.source) : this.options.source),
        external_id: pick(index.externalId),
        brand: pick(index.brand),
        title: pick(index.title),
        category_raw: pick(index.category),
        gender: normalizeGender(index.gender ? pick(index.gender) : '', pick(index.title)),
        price_inr: parsePriceInr(index.price ? pick(index.price) : undefined) ?? -1,
        image_url: pick(index.image),
        affiliate_url: pick(index.url),
        in_stock: parseInStock(index.inStock ? pick(index.inStock) : undefined),
      };
      const result = FeedProductRow.safeParse(raw);
      if (result.success) rows.push(result.data);
    }
    return rows;
  }
}
