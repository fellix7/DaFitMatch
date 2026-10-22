/**
 * Catalog quality report CLI (offline job).
 *
 *   pnpm --filter @dafitmatch/api catalog:report
 *   pnpm --filter @dafitmatch/api catalog:report -- --json report.json
 *
 * Read-only: it never writes to the database.
 */
import { writeFile } from 'node:fs/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dafitmatch/shared/db';
import { loadEnv } from '../../env';
import { createServiceClient } from '../../lib/supabase-admin';
import { buildCatalogReport, formatCatalogReport, type CatalogRow } from './index';

interface Args {
  json: string;
  limit: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { json: '', limit: 20000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = () => argv[++i] ?? '';
    if (arg === '--json') args.json = next();
    else if (arg === '--limit' || arg === '-l') args.limit = Number(next());
  }
  return args;
}

export async function loadCatalogRows(
  client: SupabaseClient<Database>,
  limit: number,
): Promise<CatalogRow[]> {
  const { data, error } = await client
    .from('products')
    .select(
      'id, source, external_id, brand, title, slot, gender, price_inr, in_stock, embedding, tags_version',
    )
    .limit(limit);
  if (error) throw new Error(`could not read products: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    source: row.source,
    external_id: row.external_id,
    brand: row.brand,
    title: row.title,
    slot: row.slot,
    gender: row.gender,
    price_inr: row.price_inr,
    in_stock: row.in_stock,
    has_embedding: row.embedding !== null && row.embedding !== undefined,
    tags_version: row.tags_version,
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const service = createServiceClient(env);

  const rows = await loadCatalogRows(service, args.limit);
  const report = buildCatalogReport(rows);
  console.log(formatCatalogReport(report));

  if (args.json) {
    await writeFile(args.json, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[catalog:report] written to ${args.json}`);
  }

  if (!report.exitCriteriaMet) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
