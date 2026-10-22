/**
 * Catalog ingest CLI (offline job).
 *
 *   pnpm --filter @dafitmatch/api ingest -- --file feed.csv --adapter csv
 *   pnpm --filter @dafitmatch/api ingest -- --file cuelinks.json --adapter cuelinks-json --dry-run
 *
 * Uses the service-role client: catalog writes are not user-scoped (RLS stays on for the app).
 */
import type { Database } from '@dafitmatch/shared/db';
import { loadEnv } from '../../env';
import { createServiceClient } from '../../lib/supabase-admin';
import { CsvFeedAdapter } from './csv';
import { CuelinksCsvAdapter, CuelinksJsonAdapter } from './cuelinks';
import { formatIngestReport, runIngest, type CatalogWriter, type FeedAdapter } from './index';

type ProductInsert = Database['public']['Tables']['products']['Insert'];

interface Args {
  file?: string;
  adapter: string;
  limit: number;
  batchSize: number;
  dryRun: boolean;
  balance: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    adapter: 'csv',
    limit: 0,
    batchSize: 500,
    dryRun: false,
    balance: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = () => argv[++i] ?? '';
    if (arg === '--file' || arg === '-f') args.file = next();
    else if (arg === '--adapter' || arg === '-a') args.adapter = next();
    else if (arg === '--limit' || arg === '-l') args.limit = Number(next());
    else if (arg === '--batch-size' || arg === '-b') args.batchSize = Number(next());
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--no-balance') args.balance = false;
  }
  return args;
}

function buildAdapter(args: Args): FeedAdapter {
  if (!args.file) throw new Error('--file <path> is required');
  switch (args.adapter) {
    case 'csv':
      return new CsvFeedAdapter({ file: args.file });
    case 'cuelinks':
      return new CuelinksCsvAdapter({ file: args.file });
    case 'cuelinks-json':
      return new CuelinksJsonAdapter({ file: args.file });
    default:
      throw new Error(`Unknown adapter "${args.adapter}" (csv | cuelinks | cuelinks-json)`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const service = createServiceClient(env);

  const writer: CatalogWriter = {
    from: (table) => ({
      upsert: async (values, options) => {
        const { error } = await service
          .from(table)
          .upsert(values as ProductInsert[], { onConflict: options.onConflict });
        return { error: error ? { message: error.message } : null };
      },
    }),
  };

  const adapter = buildAdapter(args);
  const report = await runIngest(adapter, writer, {
    limit: args.limit,
    batchSize: args.batchSize,
    dryRun: args.dryRun,
    balance: args.balance,
  });
  console.log(formatIngestReport(report));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
