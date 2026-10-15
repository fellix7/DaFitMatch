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
