// Background worker: a separate long-running process (pg-boss on the same Postgres, no Redis).
// Jobs may use the service-role client (src/lib/supabase-admin.ts); HTTP routes may not.
import { PgBoss } from 'pg-boss';
import pino from 'pino';
import { loadEnv } from './env';
import { registerJobs } from './jobs';
import { QUEUES } from './jobs/queues';

const env = loadEnv();
const log = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
});

// Use a direct (or session-pooled) connection: pg-boss needs session features.
const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
  application_name: 'dafitmatch-worker',
});
boss.on('error', (err) => log.error({ err }, 'pg-boss error'));

await boss.start();
await registerJobs(boss, log);
log.info('worker started');

// Smoke signal on boot: one no-op job proves send -> work -> complete on this database.
const jobId = await boss.send(QUEUES.noop, { sentAt: new Date().toISOString() });
log.info({ jobId }, 'enqueued boot noop job');

const shutdown = async (signal: string) => {
  log.info({ signal }, 'worker shutting down');
  await boss.stop({ graceful: true });
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
