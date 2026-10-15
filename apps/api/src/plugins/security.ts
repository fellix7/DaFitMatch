import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { allowedOrigins, type Env } from '../env';
import { errorBody } from '../lib/errors';

export const securityPlugin = fp<{ env: Env }>(
  async (app, { env }) => {
    // JSON API only: no HTML is served, so a strict CSP costs nothing.
    await app.register(helmet, {
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    });

    const origins = allowedOrigins(env);
    await app.register(cors, {
      origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    });

    // Runs after auth (preHandler) so signed-in users are limited per user, others per IP.
    await app.register(rateLimit, {
      global: true,
      max: 120,
      timeWindow: '1 minute',
      hook: 'preHandler',
      keyGenerator: (request) => request.user?.id ?? request.ip,
      errorResponseBuilder: (_request, context) => ({
        statusCode: 429,
        ...errorBody('rate_limited', `Too many requests. Retry in ${context.after}.`),
      }),
    });
  },
  { name: 'security', dependencies: ['auth'] },
);
