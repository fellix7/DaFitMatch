import { z } from 'zod';
import { ProductGender, ProductSource } from '../enums';
import { HttpUrl, Inr } from './common';
import { Product } from './catalog';

/**
 * Raw, normalised row emitted by every catalog feed adapter, before category→slot mapping
 * and money/stock clean-up. This is the exact shape a CSV/JSON affiliate export must decode to,
 * so adapters stay independent of the database (see `apps/api/src/jobs/ingest`).
 */
export const FeedProductRow = z.object({
  source: ProductSource,
  external_id: z.string().min(1).max(120),
  brand: z.string().min(1).max(120),
  title: z.string().min(1).max(300),
  /** Vendor category as-is; mapped to a `slot` by the rules table (unknown → skipped + logged). */
  category_raw: z.string().min(1).max(120),
  gender: ProductGender,
  price_inr: Inr,
  image_url: HttpUrl,
  affiliate_url: HttpUrl,
  in_stock: z.boolean(),
});
export type FeedProductRow = z.infer<typeof FeedProductRow>;

/** A catalog product returned by the taste-ranked feed, with its score and why it was shown. */
export const RankedProduct = z.object({
  product: Product,
  /** Cosine similarity in [-1, 1] to the caller's 0.7·taste_vector + 0.3·top-archetype blend. */
  score: z.number().min(-1).max(1),
  /** Human-readable reasons (e.g. "matches your saved styles", "in your palette"). */
  reason_tags: z.array(z.string()),
});
export type RankedProduct = z.infer<typeof RankedProduct>;

export const FEED_PAGE_SIZE = 20;
export const FEED_MAX_PAGE_SIZE = 48;

/** Cursor is opaque to the client: `<score>|<uuid>` of the last item on the previous page. */
export const FeedCursor = z
  .string()
  .regex(/^-?\d+(\.\d+)?\|[0-9a-fA-F-]{36}$/, 'Expected "<score>|<uuid>"');
export type FeedCursor = z.infer<typeof FeedCursor>;
