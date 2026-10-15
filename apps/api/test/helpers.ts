import { SignJWT } from 'jose';
import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from '../src/app';
import { parseEnv, type Env } from '../src/env';
import type { UserSupabaseClient } from '../src/lib/supabase';

export const JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-characters';
export const USER_ID = '11111111-1111-4111-8111-111111111111';

export const testEnv: Env = parseEnv({
  NODE_ENV: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY: 'test-publishable',
  SUPABASE_SECRET_KEY: 'test-secret',
  SUPABASE_JWT_SECRET: JWT_SECRET,
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

export async function signToken(
  claims: Record<string, unknown> = {},
  { secret = JWT_SECRET, expiresIn = '1h' }: { secret?: string; expiresIn?: string } = {},
): Promise<string> {
  return new SignJWT({ role: 'authenticated', email: 'a@example.com', ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject((claims.sub as string | undefined) ?? USER_ID)
    .setAudience((claims.aud as string | undefined) ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

export const profileRow = {
  id: USER_ID,
  display_name: 'Asha',
  gender_presentation: 'feminine',
  height_cm: 165,
  city: 'Delhi NCR',
  default_budget_inr: 6000,
  is_adult: true,
  age_confirmed_at: '2026-10-15T10:00:00+00:00',
  created_at: '2026-10-15T10:00:00.123456+00:00',
  updated_at: '2026-10-15T10:00:00.123456+00:00',
};

type Rows = Record<string, Record<string, unknown> | null>;
type RpcResult = { data: unknown; error: { code: string; message: string } | null };

/**
 * Minimal stand-in for a user-scoped supabase-js client: `.from(t).select().eq().maybeSingle()`.
 * Records which access tokens it was created with so tests can assert user scoping.
 */
export function fakeUserClients(rows: Rows, rpc: Record<string, RpcResult> = {}) {
  const tokens: string[] = [];
  const rpcCalls: { fn: string; args: unknown }[] = [];
  const factory = (token: string) => {
    tokens.push(token);
    const query = (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return chain;
    };
    return {
      from: query,
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return rpc[fn] ?? { data: null, error: { code: '42883', message: 'no such fn' } };
      },
    } as unknown as UserSupabaseClient;
  };
  return { factory, tokens, rpcCalls };
}

export async function makeApp(deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = await buildApp(testEnv, { checkDb: async () => true, ...deps });
  await app.ready();
  return app;
}
