import type { FeedProductRow, ProductGender, ProductSource, Slot } from '@dafitmatch/shared';

/**
 * A catalog feed the ingest job can read.
 *
 * Adapters are pure readers: they turn a vendor file (CSV/JSON export) into validated
 * {@link FeedProductRow}s and never touch the database. The ingest job owns normalisation,
 * de-duplication and the upsert, so a new feed only needs a new adapter.
 */
export interface FeedAdapter {
  /** Stable id used in logs and in `--adapter` on the CLI. */
  readonly name: string;
  /** Reads the feed. Rows that cannot be parsed are skipped, not fatal. */
  fetch(): Promise<FeedProductRow[]>;
}

/** A feed row after normalisation: everything the `products` table needs. */
export interface CatalogRow {
  source: ProductSource;
  external_id: string;
  brand: string;
  title: string;
  category: string;
  slot: Slot;
  gender: ProductGender;
  /** Colours detected in the title; the LLM tagger overwrites these later. */
  colors: string[];
  /** Provisional formality (1–5) until the offline tagger runs. */
  formality: number;
  /** Always empty on ingest: occasions are assigned by the offline tagger. */
  occasions: string[];
  price_inr: number;
  image_url: string;
  affiliate_url: string;
  in_stock: boolean;
}

/** Why a feed row never made it into the catalog. */
export interface RejectedRow {
  reason: 'invalid' | 'unmappable_slot' | 'bad_price' | 'duplicate';
  detail: string;
  /** The raw row, trimmed, for the reject log. */
  row: Record<string, unknown>;
}

/** What one ingest run did. */
export interface IngestReport {
  adapter: string;
  fetched: number;
  /** Rows that passed the shared schema but could not be mapped to a slot. */
  unmappable: number;
  rejected: number;
  /** Rows written (upserted) in this run. */
  written: number;
  /** Rows dropped as in-batch duplicates of the same (source, external_id). */
  duplicates: number;
  rejects: RejectedRow[];
}

export interface IngestOptions {
  /** Rows per upsert batch. */
  batchSize?: number;
  /** Cap on the rows kept per run (0 = no cap). */
  limit?: number;
  /** Keep the catalog close to CATALOG_SLOT_SHARE by dropping the surplus. */
  balance?: boolean;
  /** Report what would happen without writing anything. */
  dryRun?: boolean;
  /** Only write rows whose (source, external_id) is not in the catalog yet. */
  onlyNew?: boolean;
}
