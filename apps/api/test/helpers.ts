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

type Rows = Record<string, unknown>;
type RpcResult = { data: unknown; error: { code: string; message: string } | null };
export type Write = { table: string; op: 'update' | 'upsert'; values: unknown; filters: unknown[] };

/**
 * Minimal stand-in for a supabase-js client. rows[table] answers .maybeSingle();
 * lists[table] answers an awaited .select() list. Records tokens, writes and RPC calls so
 * tests can assert user scoping and exactly what would be persisted.
 */
export function fakeUserClients(
  rows: Rows,
  rpc: Record<string, RpcResult> = {},
  lists: Record<string, unknown[]> = {},
) {
  const tokens: string[] = [];
  const rpcCalls: { fn: string; args: unknown }[] = [];
  const writes: Write[] = [];

  const makeClient = () => {
    const from = (table: string) => {
      const filters: unknown[] = [];
      let write: Write | null = null;
      const chain = {
        select: () => chain,
        order: () => chain,
        eq: (col: string, val: unknown) => (filters.push([col, '=', val]), chain),
        in: (col: string, val: unknown) => (filters.push([col, 'in', val]), chain),
        update: (values: unknown) => ((write = { table, op: 'update', values, filters }), chain),
        upsert: (values: unknown) => ((write = { table, op: 'upsert', values, filters }), chain),
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => {
          if (write) writes.push(write);
          return Promise.resolve(
            resolve({ data: write ? null : (lists[table] ?? []), error: null }),
          );
        },
      };
      return chain;
    };
    return {
      from,
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return rpc[fn] ?? { data: null, error: { code: '42883', message: 'no such fn' } };
      },
    } as unknown as UserSupabaseClient;
  };

  const factory = (token: string) => {
    tokens.push(token);
    return makeClient();
  };
  return { factory, anon: makeClient, tokens, rpcCalls, writes };
}

export async function makeApp(deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = await buildApp(testEnv, { checkDb: async () => true, ...deps });
  await app.ready();
  return app;
}
