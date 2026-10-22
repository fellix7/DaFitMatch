/**
 * Quiz-card generation CLI (offline job).
 *
 *   pnpm --filter @dafitmatch/api quiz:cards -- --per-archetype 4
 *   pnpm --filter @dafitmatch/api quiz:cards -- --dry-run
 *
 * Needs embedded products and archetype centroids (run the Python embedder first).
 */
import { loadEnv } from '../../env';
import { createServiceClient } from '../../lib/supabase-admin';
import { generateQuizCards } from './index';

interface Args {
  perArchetype: number;
  itemsPerCard: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { perArchetype: 4, itemsPerCard: 3, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = () => argv[++i] ?? '';
    if (arg === '--per-archetype' || arg === '-p') args.perArchetype = Number(next());
    else if (arg === '--items' || arg === '-i') args.itemsPerCard = Number(next());
    else if (arg === '--dry-run') args.dryRun = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const service = createServiceClient(env);

  const report = await generateQuizCards(service, {
    cardsPerArchetype: args.perArchetype,
    itemsPerCard: args.itemsPerCard,
    dryRun: args.dryRun,
    onProgress: ({ archetype, cards }) =>
      console.log(`[quiz:cards] ${archetype}: ${cards} card(s)`),
  });

  console.log(
    `[quiz:cards] done: ${report.cards} card(s) for ${report.archetypes} archetype(s) ` +
      `(${report.items} items, ${report.skipped} skipped)`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
