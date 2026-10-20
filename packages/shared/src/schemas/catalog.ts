import { z } from 'zod';
import { Occasion, ProductGender, ProductSource, Slot } from '../enums';
import { ColorName, ColorVocab, HttpUrl, Id, Inr, Timestamp } from './common';

export const Archetype = z.object({
  id: Id,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  /** Style references only, rendered as "inspired by <brand>". Never a partnership claim. */
  benchmark_brands: z.array(z.string()),
  description: z.string(),
});
export type Archetype = z.infer<typeof Archetype>;

/** API shape of a product. `embedding` never leaves the database. */
export const Product = z.object({
  id: Id,
  source: ProductSource,
  external_id: z.string(),
  brand: z.string(),
  title: z.string(),
  category: z.string(),
  slot: Slot,
  gender: ProductGender,
  colors: z.array(ColorName),
  /** 1 = very casual, 5 = black tie / heavy festive. */
  formality: z.number().int().min(1).max(5),
  occasions: z.array(z.string()),
  price_inr: Inr,
  image_url: HttpUrl,
  affiliate_url: HttpUrl,
  in_stock: z.boolean(),
  last_seen_at: Timestamp.nullable(),
});
export type Product = z.infer<typeof Product>;

/**
 * Bump when the tagging prompt/schema changes so rows can be re-tagged selectively.
 * Stored in `products.tags_version` (catalog ingest is a batch job; see ADR 0001/0002).
 */
export const PRODUCT_TAGS_VERSION = 1;

/**
 * Structured tags produced by the offline LLM tagging job for one product.
 * `colors` is restricted to the fixed COLOR_VOCAB; `occasions` to the Occasion enum.
 */
export const ProductTags = z.object({
  slot: Slot,
  formality: z.number().int().min(1).max(5),
  colors: z.array(ColorVocab).max(8),
  occasions: z.array(Occasion).max(6),
});
export type ProductTags = z.infer<typeof ProductTags>;

/** API shape of a venue. `vibe_embedding` never leaves the database. */
export const Venue = z.object({
  id: Id,
  city: z.string(),
  name: z.string(),
  place_id: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  category: z.string(),
  /** Google Places price level 0–4. */
  price_level: z.number().int().min(0).max(4).nullable(),
  vibe_tags: z.array(z.string()),
  /** archetype slug -> affinity in [0, 1]. */
  archetype_affinity: z.record(z.string(), z.number().min(0).max(1)),
  maps_url: HttpUrl.nullable(),
  is_open: z.boolean(),
  refreshed_at: Timestamp.nullable(),
});
export type Venue = z.infer<typeof Venue>;
