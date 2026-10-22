import { PRODUCT_TAGS_VERSION } from '@dafitmatch/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dafitmatch/shared/db';
import { TagBatchSchema, type TagInput, type TagItem, type TagModel } from './prompt';

export interface TaggingOptions {
  /** Products per LLM call. */
  batchSize?: number;
  /** Hard cap on products per run (0 = no limit). */
  maxRows?: number;
  /** Re-tag rows that already carry the current tags version. */
  retag?: boolean;
  /** Plan the run, write nothing. */
  dryRun?: boolean;
  /** Called after every batch (progress + errors). */
  onProgress?: (progress: TaggingProgress) => void;
}

export interface TaggingProgress {
  seen: number;
  tagged: number;
  skipped: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
}

export interface TaggingReport extends TaggingProgress {
  batches: number;
  /** Products whose slot the tagger changed. */
  slotChanges: number;
}

const PRODUCT_COLUMNS = 'id, title, brand, category, slot, price_inr, tags_version' as const;

/**
 * Tags catalog products with an LLM (offline batch, never at request time).
 *
 * The job is resumable: only rows whose `tags_version` is behind `PRODUCT_TAGS_VERSION` are
 * picked up, and each batch writes as it goes.
 */
export async function tagProducts(
  client: SupabaseClient<Database>,
  model: TagModel,
  options: TaggingOptions = {},
): Promise<TaggingReport> {
  const batchSize = Math.max(1, options.batchSize ?? 20);
  const maxRows = options.maxRows ?? 0;
  const report: TaggingReport = {
    seen: 0,
    tagged: 0,
    skipped: 0,
    failed: 0,
    inputTokens: 0,
    outputTokens: 0,
    batches: 0,
    slotChanges: 0,
  };

  const rows = await fetchUntagged(client, options.retag === true, maxRows);
  report.seen = rows.length;
  if (rows.length === 0) return report;
  if (options.dryRun) {
    report.batches = Math.ceil(rows.length / batchSize);
    return report;
  }

  for (let start = 0; start < rows.length; start += batchSize) {
    const chunk = rows.slice(start, start + batchSize);
    const batch: TagInput[] = chunk.map((row) => ({
      id: row.id,
      title: row.title,
      brand: row.brand,
      category: row.category,
      price_inr: row.price_inr,
    }));

    let items: TagItem[];
    try {
      const result = await model(batch);
      report.inputTokens += result.usage.inputTokens;
      report.outputTokens += result.usage.outputTokens;
      const parsed = TagBatchSchema.safeParse({ items: result.items });
      if (!parsed.success) {
        report.failed += batch.length;
        options.onProgress?.({ ...report });
        continue;
      }
      items = parsed.data.items;
    } catch {
      report.failed += batch.length;
      options.onProgress?.({ ...report });
      continue;
    }

    const byId = new Map(items.map((item) => [item.id, item]));
    for (const row of chunk) {
      const item = byId.get(row.id);
      if (!item) {
        report.skipped += 1;
        continue;
      }
      if (item.slot !== row.slot) report.slotChanges += 1;
      const { error } = await client
        .from('products')
        .update({
          slot: item.slot,
          formality: item.formality,
          colors: item.colors,
          occasions: item.occasions,
          tags_version: PRODUCT_TAGS_VERSION,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (error) report.skipped += 1;
      else report.tagged += 1;
    }

    report.batches += 1;
    options.onProgress?.({ ...report });
  }

  return report;
}

interface UntaggedRow {
  id: string;
  title: string;
  brand: string;
  category: string;
  slot: string;
  price_inr: number;
}

async function fetchUntagged(
  client: SupabaseClient<Database>,
  retag: boolean,
  maxRows: number,
): Promise<UntaggedRow[]> {
  let query = client
    .from('products')
    .select(PRODUCT_COLUMNS)
    .order('created_at', { ascending: true })
    .limit(maxRows > 0 ? maxRows : 1000);
  if (!retag) {
    query = query.lt('tags_version', PRODUCT_TAGS_VERSION);
  }
  const { data, error } = await query;
  if (error) throw new Error(`could not read products: ${error.message}`);
  return (data ?? []) as unknown as UntaggedRow[];
}
