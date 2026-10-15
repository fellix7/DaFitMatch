import type { PgBoss } from 'pg-boss';
import type { Logger } from 'pino';
import { noopHandler, type NoopData } from './noop';
import { QUEUES } from './queues';

/** Creates queues and registers every worker. Add new jobs here. */
export async function registerJobs(boss: PgBoss, log: Logger): Promise<void> {
  await boss.createQueue(QUEUES.noop);
  await boss.work<NoopData>(QUEUES.noop, noopHandler(log));
}
