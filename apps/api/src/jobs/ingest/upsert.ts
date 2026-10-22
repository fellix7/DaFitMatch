import { CATALOG_SLOT_SHARE, INGEST_BATCH_SIZE, type Slot } from '@dafitmatch/shared';
import type { CatalogRow } from './types';

/** The slice of the Supabase client the ingest job needs (narrow, so tests can fake it). */
export interface ProductTable {
  upsert(
    values: readonly unknown[],
    options: { onConflict: string },
  ): Promise<{ error: { message: string } | null }>;
}

export interface CatalogWriter {
  from(table: 'products'): ProductTable;
}

/** Splits an array into chunks of at most `size` items. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Keeps the catalog close to CATALOG_SLOT_SHARE.
 *
 * Surplus rows are dropped from the slots that are over-represented (never from a slot that is
 * under it), and the original order is preserved so a re-run is stable.
 */
export function balanceBySlot(rows: readonly CatalogRow[], maxTotal: number): CatalogRow[] {
  if (maxTotal <= 0 || rows.length <= maxTotal) return [...rows];

  const pools = new Map<Slot, CatalogRow[]>();
  for (const row of rows) {
    const pool = pools.get(row.slot) ?? [];
    pool.push(row);
    pools.set(row.slot, pool);
  }

  const slots = Object.keys(CATALOG_SLOT_SHARE) as Slot[];
  const quota = new Map<Slot, number>();
  let assigned = 0;
  for (const slot of slots) {
    const size = Math.floor(maxTotal * CATALOG_SLOT_SHARE[slot]);
    quota.set(slot, size);
    assigned += size;
  }
  // Hand the rounding remainder to the slots that still have rows, biggest pool first.
  const order = [...slots].sort(
    (a, b) => (pools.get(b)?.length ?? 0) - (pools.get(a)?.length ?? 0),
  );
  let cursor = 0;
  while (assigned < maxTotal && order.length > 0) {
    const slot = order[cursor % order.length]!;
    const pool = pools.get(slot) ?? [];
    if (quota.get(slot)! < pool.length) {
      quota.set(slot, quota.get(slot)! + 1);
      assigned += 1;
    }
    cursor += 1;
    if (cursor > order.length * 4) break;
  }

  const keep = new Set<string>();
  for (const [slot, pool] of pools) {
    const allowed = quota.get(slot) ?? 0;
    for (const row of pool.slice(0, allowed)) keep.add(`${row.source}:${row.external_id}`);
  }
  return rows.filter((row) => keep.has(`${row.source}:${row.external_id}`));
}

/**
 * Upserts catalog rows in batches. Idempotent: the (source, external_id) unique constraint makes
 * a re-run update the existing row instead of inserting a duplicate.
 */
export async function upsertProducts(
  writer: CatalogWriter,
  rows: readonly CatalogRow[],
  { batchSize = INGEST_BATCH_SIZE }: { batchSize?: number } = {},
): Promise<number> {
  let written = 0;
  for (const batch of chunk(rows, batchSize)) {
    const { error } = await writer.from('products').upsert(batch, {
      onConflict: 'source,external_id',
    });
    if (error) throw new Error(`products upsert failed: ${error.message}`);
    written += batch.length;
  }
  return written;
}

/** Removes in-batch duplicates, keeping the last occurrence (the freshest feed row). */
export function dedupeRows(rows: readonly CatalogRow[]): {
  unique: CatalogRow[];
  duplicates: number;
} {
  const last = new Map<string, CatalogRow>();
  for (const row of rows) last.set(`${row.source}:${row.external_id}`, row);
  const unique = [...last.values()];
  return { unique, duplicates: rows.length - unique.length };
}
