import { FeedProductRow } from '@dafitmatch/shared';
import { normaliseFeedRow } from './normalize';
import { balanceBySlot, dedupeRows, upsertProducts, type CatalogWriter } from './upsert';
import type { FeedAdapter, IngestOptions, IngestReport, RejectedRow } from './types';

export * from './types';
export * from './slots';
export * from './normalize';
export * from './upsert';
export { CsvFeedAdapter, parseCsv, toRecords } from './csv';
export { CuelinksCsvAdapter, CuelinksJsonAdapter } from './cuelinks';
export { buildAmazonLinks, extractAsin } from './amazon';

/**
 * Runs one catalog ingest: read the feed, normalise it, drop what we cannot map, and upsert the
 * rest in batches. Re-running the same feed is a no-op (upsert on (source, external_id)).
 */
export async function runIngest(
  adapter: FeedAdapter,
  writer: CatalogWriter,
  options: IngestOptions = {},
): Promise<IngestReport> {
  const { batchSize, limit = 0, balance = true, dryRun = false } = options;
  const fetchedRows = await adapter.fetch();

  const rejects: RejectedRow[] = [];
  const normalised = [];
  let unmappable = 0;

  for (const row of fetchedRows) {
    const result = normaliseFeedRow(row);
    if (result.ok) {
      normalised.push(result.row);
      continue;
    }
    if (result.reason === 'unmappable_slot') unmappable += 1;
    rejects.push({
      reason: result.reason,
      detail: result.detail,
      row: { external_id: row.external_id, title: row.title, category_raw: row.category_raw },
    });
  }

  const { unique, duplicates } = dedupeRows(normalised);
  let selected = unique;
  if (balance) selected = balanceBySlot(selected, limit > 0 ? limit : selected.length);
  if (limit > 0) selected = selected.slice(0, limit);

  const written = dryRun ? 0 : await upsertProducts(writer, selected, { batchSize });

  return {
    adapter: adapter.name,
    fetched: fetchedRows.length,
    unmappable,
    rejected: rejects.length,
    written,
    duplicates,
    rejects: rejects.slice(0, 50),
  };
}

/** Human-readable summary of an ingest run (also used by the CLI). */
export function formatIngestReport(report: IngestReport): string {
  const lines = [
    `adapter            ${report.adapter}`,
    `rows fetched       ${report.fetched}`,
    `rows written       ${report.written}`,
    `unmappable slots   ${report.unmappable}`,
    `duplicates dropped ${report.duplicates}`,
    `other rejects      ${report.rejected}`,
  ];
  if (report.rejects.length > 0) {
    lines.push('first rejects:');
    for (const reject of report.rejects.slice(0, 10)) {
      lines.push(`  - [${reject.reason}] ${reject.detail} (${reject.row.title ?? ''})`);
    }
  }
  return lines.join('\n');
}

/** Builds a feed row from raw parts (used by the adapters and by tests). */
export function buildFeedRow(raw: Record<string, unknown>): FeedProductRow | null {
  const parsed = FeedProductRow.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
