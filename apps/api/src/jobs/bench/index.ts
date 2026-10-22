/**
 * Feed latency bench (read-only). Pure helpers live here so they can be unit tested; `feed.ts`
 * is the CLI entry point.
 */
import type pg from 'pg';

export interface LatencyStats {
  count: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

/** p50/p95 over the measured samples (milliseconds). */
export function summarize(samples: number[]): LatencyStats {
  if (samples.length === 0) {
    return { count: 0, min: 0, p50: 0, p95: 0, max: 0, mean: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return {
    count: sorted.length,
    min: sorted[0]!,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1]!,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  };
}

export interface BenchOptions {
  iterations: number;
  userId: string;
  limit: number;
  slot: string | null;
  gender: string | null;
}

export interface BenchReport {
  stats: LatencyStats;
  plan: string;
  usesVectorIndex: boolean;
  rows: number;
}

const FEED_SQL = `select * from public.rank_products($1::public.slot, $2::public.product_gender, null, null::real, null::uuid, $3)`;

export async function runBench(pool: pg.Pool, options: BenchOptions): Promise<BenchReport> {
  const client = await pool.connect();
  try {
    // Same shape as a signed-in request: the RPC reads auth.uid() and the caller's taste row.
    await client.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: options.userId, role: 'authenticated' }),
    ]);
    await client.query('set role authenticated');

    const explain = await client.query(`explain (analyze, buffers, format text) ${FEED_SQL}`, [
      options.slot,
      options.gender,
      options.limit,
    ]);
    const plan = explain.rows.map((row) => Object.values(row)[0]).join('\n');

    const samples: number[] = [];
    let rows = 0;
    for (let i = 0; i < options.iterations; i += 1) {
      const started = process.hrtime.bigint();
      const result = await client.query(FEED_SQL, [options.slot, options.gender, options.limit]);
      samples.push(Number(process.hrtime.bigint() - started) / 1e6);
      rows = result.rowCount ?? rows;
    }

    return {
      stats: summarize(samples),
      plan,
      usesVectorIndex: /Index Scan using .*embedding.*hnsw/i.test(plan),
      rows,
    };
  } finally {
    await client.query('reset role').catch(() => undefined);
    client.release();
  }
}
