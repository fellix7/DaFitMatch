import type { Occasion, Slot } from './enums';

/** Dimension of the single shared Marqo-FashionSigLIP embedding space (stored as halfvec). */
export const EMBEDDING_DIM = 768;

/** Max try-on generations per user per calendar day (Asia/Kolkata). Also enforced in SQL. */
export const DAILY_TRYON_CAP = 3;

export const LAUNCH_CITY = 'Delhi NCR';

export const OCCASIONS = [
  'brunch',
  'dinner',
  'gallery',
  'rooftop',
  'movie',
  'festive',
] as const satisfies readonly Occasion[];

/**
 * Default share of an outfit budget per slot. The separates slots sum to 1.
 * A `full` piece (dress, kurta set, jumpsuit) replaces top + bottom and takes their combined share.
 * Product decision: change only with human review.
 */
export const DEFAULT_BUDGET_SPLIT = {
  top: 0.3,
  bottom: 0.25,
  footwear: 0.25,
  layer: 0.1,
  accessory: 0.1,
  full: 0.55,
} as const satisfies Record<Slot, number>;

/** Slots that make up a separates outfit (a `full` outfit swaps top + bottom for `full`). */
export const SEPARATES_SLOTS = [
  'top',
  'bottom',
  'footwear',
  'layer',
  'accessory',
] as const satisfies readonly Slot[];

export const STORAGE_BUCKETS = {
  userPhotos: 'user-photos',
  tryonResults: 'tryon-results',
  wardrobePhotos: 'wardrobe-photos',
} as const;

/** Unsaved try-on input photos (user-photos bucket) are deleted after this many days (cleanup job lands in Phase 6). */
export const PHOTO_RETENTION_DAYS = 30;

/** Shown on every shop panel. */
export const AFFILIATE_DISCLOSURE =
  'We may earn a commission when you buy through these links. Brands mentioned as style inspiration are not affiliated with DaFitMatch.';

/** Upper bound on wardrobe items per user (abuse guard; enforced in SQL). */
export const MAX_WARDROBE_ITEMS = 300;

// ════════════════════════════════════════════════════════════════════════════════════════
// Phase 2 — onboarding quiz, catalog tagging, taste profile
// ════════════════════════════════════════════════════════════════════════════════════════

/** Budget bands offered in the onboarding quiz. `max_inr` is inclusive. */
export const BUDGET_BAND_IDS = [
  'under-2000',
  '2000-5000',
  '5000-10000',
  '10000-20000',
  'above-20000',
] as const;
export type BudgetBandId = (typeof BUDGET_BAND_IDS)[number];

/**
 * Budget bands offered in the onboarding quiz. `max_inr` is the band's inclusive ceiling;
 * `default_inr` is the representative spend shown on the profile when the user picks the band.
 * The same figures are mirrored by `private.budget_from_band` in the phase-2 migration.
 */
export const BUDGET_BANDS: readonly {
  id: BudgetBandId;
  label: string;
  min_inr: number;
  max_inr: number;
  default_inr: number;
}[] = [
  { id: 'under-2000', label: 'Under ₹2,000', min_inr: 0, max_inr: 2000, default_inr: 2000 },
  { id: '2000-5000', label: '₹2,000 – ₹5,000', min_inr: 2001, max_inr: 5000, default_inr: 5000 },
  { id: '5000-10000', label: '₹5,000 – ₹10,000', min_inr: 5001, max_inr: 10000, default_inr: 8000 },
  {
    id: '10000-20000',
    label: '₹10,000 – ₹20,000',
    min_inr: 10001,
    max_inr: 20000,
    default_inr: 15000,
  },
  {
    id: 'above-20000',
    label: 'Above ₹20,000',
    min_inr: 20001,
    max_inr: 200000,
    default_inr: 30000,
  },
];

/** Representative budget (INR) for a band: used when no explicit budget is set. */
export function budgetFromBand(id: BudgetBandId): number {
  return BUDGET_BANDS.find((b) => b.id === id)?.default_inr ?? 6000;
}

/**
 * The fixed colour vocabulary for quiz chips and catalog tagging. Product `colors` may contain
 * other lowercase names (from raw feeds), but LLM tagging and the quiz only ever use these.
 */
export const COLOR_VOCAB = [
  'black',
  'white',
  'ivory',
  'cream',
  'beige',
  'camel',
  'brown',
  'tan',
  'grey',
  'navy',
  'blue',
  'sky blue',
  'green',
  'olive',
  'emerald',
  'red',
  'maroon',
  'pink',
  'lilac',
  'yellow',
  'mustard',
  'orange',
  'rust',
  'gold',
  'silver',
  'neon',
] as const;

/** Chip options for the quiz "never wear" step. */
export const NEVER_WEAR_OPTIONS = [
  'crop tops',
  'shorts',
  'mini skirts',
  'sleeveless',
  'bodycon',
  'heels',
  'sneakers',
  'graphic tees',
  'ripped jeans',
  'sheer fabrics',
  'loud prints',
  'florals',
] as const;

/**
 * Words that mark a product as a "never wear" item. Mirrored by
 * `private.never_wear_matches` in the phase-2 feed-rules migration; keep the two in sync.
 * Matching is case-insensitive and substring-based on the product title + category.
 */
export const NEVER_WEAR_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  'crop tops': ['crop top', 'cropped top', 'crop tee'],
  shorts: ['shorts', 'short'],
  'mini skirts': ['mini skirt', 'mini dress'],
  sleeveless: ['sleeveless', 'tank top', 'tanktop'],
  bodycon: ['bodycon', 'body con', 'body-hugging', 'body hugging'],
  heels: ['heel', 'heels', 'stiletto', 'pumps'],
  sneakers: ['sneaker', 'sneakers'],
  'graphic tees': ['graphic tee', 'graphic t-shirt', 'printed tee', 'graphic tshirt'],
  'ripped jeans': ['ripped', 'distressed', 'torn jean'],
  'sheer fabrics': ['sheer', 'transparent'],
  'loud prints': ['loud print', 'statement print', 'all-over print', 'bold print'],
  florals: ['floral', 'flower print', 'botanical print'],
};

/** Fit preference options offered in the quiz (single choice, optional). */
export const FIT_PREF_OPTIONS = ['slim', 'regular', 'relaxed', 'oversized', 'mixed'] as const;
export type FitPrefOption = (typeof FIT_PREF_OPTIONS)[number];

/** Number of swipe cards served per quiz and required in a submission. */
export const QUIZ_CARD_COUNT = 24;

/** Taste-vector weights: a "love" counts double a "like"; a "skip" pulls away gently. */
export const LOVE_WEIGHT = 2;
export const SKIP_WEIGHT = 0.3;

/** Exponential-moving-average factor applied to the taste vector on every interaction. */
export const TASTE_EMA_ALPHA = 0.1;

/** Bump `taste_profiles.version` every this many interactions (full rebuild cadence). */
export const TASTE_REBUILD_EVERY = 10;

/**
 * Target mix of the shopping catalog, by slot. The ingest job keeps the catalog close to this
 * split so no slot dominates the feed (tops 25%, bottoms 20%, footwear 20%, layers 15%,
 * one-pieces 10%, accessories 10%).
 */
export const CATALOG_SLOT_SHARE: Readonly<Record<Slot, number>> = {
  top: 0.25,
  bottom: 0.2,
  footwear: 0.2,
  layer: 0.15,
  full: 0.1,
  accessory: 0.1,
};

/** Rows written per upsert batch by the catalog ingest job. */
export const INGEST_BATCH_SIZE = 500;
