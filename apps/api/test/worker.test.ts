import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { fromPglite, PgBoss } from 'pg-boss';
import pino from 'pino';
import { registerJobs } from '../src/jobs';
import { QUEUES } from '../src/jobs/queues';

// Runs pg-boss against in-process Postgres (PGlite) so the queue is proven without Docker.
describe('pg-boss worker', () => {
  it('processes the noop job end to end', async () => {
    const pglite = await PGlite.create();
    const boss = new PgBoss({ db: fromPglite(pglite), supervise: false, schedule: false });
    await boss.start();

    const processed: string[] = [];
    const log = pino({ level: 'silent' });
    log.info = ((obj: { jobId?: string }) => {
      if (obj?.jobId) processed.push(obj.jobId);
    }) as typeof log.info;

    await registerJobs(boss, log);
    const jobId = await boss.send(QUEUES.noop, { sentAt: new Date().toISOString() });
    expect(jobId).toBeTruthy();

    const deadline = Date.now() + 15_000;
    let state: string | undefined;
    while (Date.now() < deadline) {
      state = (await boss.getJobById(QUEUES.noop, jobId!))?.state;
      if (state === 'completed') break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(state).toBe('completed');
    expect(processed).toContain(jobId);

    await boss.stop({ graceful: false });
    await pglite.close();
  }, 30_000);
});
