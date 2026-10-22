/**
 * Feed latency bench CLI (offline, read-only).
 *
 *   pnpm --filter @dafitmatch/api bench:feed
 *   pnpm --filter @dafitmatch/api bench:feed -- --iterations 50 --user <uuid>
 *
 * Runs the same RPC the app calls, with the same JWT claims a signed-in user has, and reports
 * p50/p95 latency plus the query plan (the HNSW index must be used, not a seq scan).
 */
import pg from 'pg';
import { loadEnv } from '../../env';
import { runBench, type BenchOptions } from './index';

function parseArgs(argv: string[]): BenchOptions {
  const options: BenchOptions = {
    iterations: 20,
    userId: '',
    limit: 20,
    slot: null,
    gender: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = () => argv[++i] ?? '';
    if (arg === '--iterations' || arg === '-n') options.iterations = Number(next());
    else if (arg === '--user' || arg === '-u') options.userId = next();
    else if (arg === '--limit' || arg === '-l') options.limit = Number(next());
    else if (arg === '--slot') options.slot = next();
    else if (arg === '--gender') options.gender = next();
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.iterations < 1) throw new Error('--iterations must be >= 1');
  const env = loadEnv();
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
  try {
    const report = await runBench(pool, options);
    console.log(
      `feed bench: ${report.stats.count} runs - p50 ${report.stats.p50.toFixed(1)}ms - ` +
        `p95 ${report.stats.p95.toFixed(1)}ms - max ${report.stats.max.toFixed(1)}ms`,
    );
    console.log(`rows per page: ${report.rows}`);
    console.log(`vector index used: ${report.usesVectorIndex ? 'yes' : 'NO (check the plan)'}`);
    console.log('--- plan ---');
    console.log(report.plan);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
