import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from '../env';
import { unauthorized } from '../lib/errors';
import type { UserClientFactory, UserSupabaseClient } from '../lib/supabase';

export interface AuthUser {
  id: string;
  email: string | null;
  role: 'authenticated';
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `app.authenticate`. Null on public routes. */
    user: AuthUser | null;
    /** User-scoped Supabase client (RLS applies). Null on public routes. */
    supabase: UserSupabaseClient | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export type TokenVerifier = (token: string) => Promise<AuthUser>;

/**
 * Verifies a Supabase access token. Asymmetric tokens (ES256/RS256) are checked against the
 * project's JWKS; legacy HS256 tokens (local CLI) against SUPABASE_JWT_SECRET when configured.
 */
export function createTokenVerifier(env: Env): TokenVerifier {
  const jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', env.SUPABASE_URL));
  const hsSecret = env.SUPABASE_JWT_SECRET
    ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
    : undefined;

  return async (token) => {
    let payload: JWTPayload;
    try {
      const { alg } = decodeProtectedHeader(token);
      const options = { audience: 'authenticated' };
      if (alg === 'HS256') {
        if (!hsSecret) throw new Error('HS256 token but no SUPABASE_JWT_SECRET configured');
        ({ payload } = await jwtVerify(token, hsSecret, { ...options, algorithms: ['HS256'] }));
      } else {
        ({ payload } = await jwtVerify(token, jwks, {
          ...options,
          algorithms: ['ES256', 'RS256'],
        }));
      }
    } catch {
      throw unauthorized();
    }
    if (payload.role !== 'authenticated' || typeof payload.sub !== 'string' || !payload.sub) {
      throw unauthorized();
    }
    return {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      role: 'authenticated',
    };
  };
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export interface AuthPluginOptions {
  verifyToken: TokenVerifier;
  createUserClient: UserClientFactory;
}

/** Decorates `app.authenticate`; protected route scopes add it as an onRequest hook. */
export const authPlugin = fp<AuthPluginOptions>(
  async (app, opts) => {
    app.decorateRequest('user', null);
    app.decorateRequest('supabase', null);
    app.decorate('authenticate', async (request: FastifyRequest) => {
      const token = bearerToken(request);
      if (!token) throw unauthorized();
      request.user = await opts.verifyToken(token);
      request.supabase = opts.createUserClient(token);
    });
  },
  { name: 'auth' },
);

/** For handlers in protected scopes: narrows the request to an authenticated one. */
export function requireAuth(request: FastifyRequest): {
  user: AuthUser;
  supabase: UserSupabaseClient;
} {
  if (!request.user || !request.supabase) throw unauthorized();
  return { user: request.user, supabase: request.supabase };
}
