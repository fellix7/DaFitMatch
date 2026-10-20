import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import pg from 'pg';
import type { Env } from './env';
import { errorBody, HttpError } from './lib/errors';
import {
  createAnonClient,
  createUserClient,
  type UserClientFactory,
  type UserSupabaseClient,
} from './lib/supabase';
import { authPlugin, createTokenVerifier, type TokenVerifier } from './plugins/auth';
import { securityPlugin } from './plugins/security';
import { archetypeRoutes } from './routes/archetypes';
import { healthRoutes, type DbCheck } from './routes/health';
import { meRoutes } from './routes/me';
import { outfitRoutes } from './routes/outfits';
import { roomRoutes } from './routes/rooms';
import { shopRoutes } from './routes/shop';
import { tasteRoutes } from './routes/taste';
import { tryonRoutes } from './routes/tryon';
import { venueRoutes } from './routes/venues';
import { wardrobeRoutes } from './routes/wardrobe';

/** Seams for tests; production uses the real implementations. */
export interface AppDeps {
  verifyToken?: TokenVerifier;
  createUserClient?: UserClientFactory;
  /** Client for public (signed-out) catalog reads. */
  anonClient?: () => UserSupabaseClient;
  checkDb?: DbCheck;
}

export async function buildApp(env: Env, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            ...(env.NODE_ENV === 'development' && {
              transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } },
            }),
          },
    // Render/Railway terminate TLS in front of us; needed for real client IPs in rate limiting.
    trustProxy: env.NODE_ENV === 'production',
    bodyLimit: 1_048_576,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((err: FastifyError, request, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send(errorBody(err.code, err.message, err.details));
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply
        .code(400)
        .send(errorBody('bad_request', 'Request validation failed', err.validation));
    }
    if (isResponseSerializationError(err)) {
      request.log.error({ err, issues: err.cause.issues }, 'response did not match contract');
      return reply.code(500).send(errorBody('internal', 'Internal server error'));
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send(errorBody(err.code ?? 'bad_request', err.message));
    }
    request.log.error({ err }, 'unhandled error');
    return reply.code(500).send(errorBody('internal', 'Internal server error'));
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(errorBody('not_found', `No route for ${request.method} ${request.url}`)),
  );

  let checkDb = deps.checkDb;
  if (!checkDb) {
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });
    app.addHook('onClose', () => pool.end());
    checkDb = async () => {
      await pool.query({ text: 'select 1', query_timeout: 2000 } as pg.QueryConfig);
      return true;
    };
  }

  await app.register(authPlugin, {
    verifyToken: deps.verifyToken ?? createTokenVerifier(env),
    createUserClient: deps.createUserClient ?? ((token) => createUserClient(env, token)),
  });
  await app.register(securityPlugin, { env });

  // Public
  await app.register(healthRoutes, { checkDb });
  let anon: UserSupabaseClient | undefined;
  await app.register(archetypeRoutes, {
    anonClient: deps.anonClient ?? (() => (anon ??= createAnonClient(env))),
  });

  // Protected: every route in this scope requires a valid Supabase JWT.
  await app.register(async (scope) => {
    scope.addHook('onRequest', scope.authenticate);
    await scope.register(meRoutes);
    await scope.register(tasteRoutes);
    await scope.register(outfitRoutes);
    await scope.register(wardrobeRoutes);
    await scope.register(roomRoutes);
    await scope.register(tryonRoutes);
    await scope.register(venueRoutes);
    await scope.register(shopRoutes);
  });

  return app;
}
