import type { Job } from 'pg-boss';
import type { Logger } from 'pino';

export interface NoopData {
  sentAt: string;
}

/** No-op job: logs and completes. Proves send -> fetch -> complete works on this database. */
export function noopHandler(log: Logger) {
  return async (jobs: Job<NoopData>[]) => {
    for (const job of jobs) {
      log.info({ jobId: job.id, sentAt: job.data.sentAt }, 'noop job processed');
    }
  };
}
