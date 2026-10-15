import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Exact web origin allowed by CORS. Comma-separate to allow several (e.g. Vercel previews). */
  WEB_ORIGIN: z.string().min(1),

  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  /** Service-role / secret key. Jobs and admin routes only. */
  SUPABASE_SECRET_KEY: z.string().min(1),
  /** Legacy HS256 secret (local CLI). If unset, tokens are verified against the project JWKS only. */
  SUPABASE_JWT_SECRET: optional,
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL'),

  // External services: optional until the phase that uses them.
  FAL_KEY: optional,
  GOOGLE_PLACES_API_KEY: optional,
  SERPAPI_API_KEY: optional,
  OPENAI_API_KEY: optional,
  ANTHROPIC_API_KEY: optional,
  LLM_MODEL: optional,
  SENTRY_DSN: optional,
});

export type Env = z.infer<typeof EnvSchema>;

/** Parse and validate env. Throws (refusing to boot) with every missing/invalid var listed. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment. Refusing to start.\n${issues}`);
  }
  return result.data;
}

/** Loads the repo-root .env in development (no-op if absent), then validates process.env. */
export function loadEnv(): Env {
  const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (process.env.NODE_ENV !== 'production' && existsSync(rootEnv)) {
    process.loadEnvFile(rootEnv);
  }
  return parseEnv(process.env);
}

export function allowedOrigins(env: Env): string[] {
  return env.WEB_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
