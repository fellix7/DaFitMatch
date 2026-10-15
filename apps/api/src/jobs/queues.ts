/** pg-boss queue names. Producers (API routes) and consumers (worker) import from here. */
export const QUEUES = {
  /** Phase 1: proves the queue end to end. */
  noop: 'noop',
  /** Phase 5: call the try-on provider for a reserved quota slot. */
  tryonGenerate: 'tryon.generate',
  /** Phase 2 (Member 2): nightly catalog refresh (prices, stock, last_seen_at). */
  catalogRefresh: 'catalog.refresh',
  /** Phase 6: delete unsaved user photos older than PHOTO_RETENTION_DAYS. */
  photosCleanup: 'photos.cleanup',
} as const;
