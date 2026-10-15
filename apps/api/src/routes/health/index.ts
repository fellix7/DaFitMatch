import { HealthResponse } from '@dafitmatch/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export type DbCheck = () => Promise<boolean>;

/** Public liveness + DB readiness. 503 when the database is unreachable. */
export const healthRoutes: FastifyPluginAsyncZod<{ checkDb: DbCheck }> = async (
  app,
  { checkDb },
) => {
  app.get(
    '/health',
    {
      schema: { response: { 200: HealthResponse, 503: HealthResponse } },
      config: { rateLimit: false },
    },
    async (_request, reply) => {
      const dbOk = await checkDb().catch(() => false);
      const body: HealthResponse = {
        status: dbOk ? 'ok' : 'degraded',
        api: 'ok',
        db: dbOk ? 'ok' : 'down',
        time: new Date().toISOString(),
      };
      return reply.code(dbOk ? 200 : 503).send(body);
    },
  );
};
