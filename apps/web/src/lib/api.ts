import { ApiError, endpoints, type EndpointName, type Endpoints } from '@dafitmatch/shared';
import type { z } from 'zod';
import { env } from './env';
import { supabase } from './supabase';

// ─── Types derived from the shared endpoint registry ─────────────────────────────────────
type Def<N extends EndpointName> = Endpoints[N];
type Part<N extends EndpointName, K extends 'params' | 'query' | 'body'> =
  Def<N> extends Record<K, infer S extends z.ZodType>
    ? { [P in K]: z.input<S> }
    : { [P in K]?: never };

/** What a call needs: exactly the params/query/body the contract declares (inputs pre-defaults). */
export type CallInput<N extends EndpointName> = Part<N, 'params'> &
  Part<N, 'query'> &
  Part<N, 'body'>;
/** What a call returns: the contract's response schema output (already validated). */
export type CallOutput<N extends EndpointName> = z.output<Def<N>['response']>;

// True when some part of the input is required (i.e. an empty input would not type-check).
type HasRequired<N extends EndpointName> =
  Partial<CallInput<N>> extends CallInput<N> ? false : true;
type CallArgs<N extends EndpointName> =
  HasRequired<N> extends true
    ? [input: CallInput<N>, init?: { signal?: AbortSignal }]
    : [input?: CallInput<N>, init?: { signal?: AbortSignal }];

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the current Supabase access token, or null when signed out. */
  getAccessToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}

function buildPath(template: string, params: Record<string, unknown> = {}): string {
  return template.replace(/:([A-Za-z]+)/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined || value === null) throw new Error(`Missing path param "${key}"`);
    return encodeURIComponent(String(value));
  });
}

function buildQuery(query: Record<string, unknown> = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== null) qs.set(k, String(v));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function createApiClient({
  baseUrl,
  getAccessToken,
  fetch: fetchFn = fetch,
}: ApiClientOptions) {
  return async function call<N extends EndpointName>(
    name: N,
    ...[input, init]: CallArgs<N>
  ): Promise<CallOutput<N>> {
    const def = endpoints[name];
    const { params, query, body } = (input ?? {}) as {
      params?: Record<string, unknown>;
      query?: Record<string, unknown>;
      body?: unknown;
    };

    const headers: Record<string, string> = { accept: 'application/json' };
    if (def.auth) {
      const token = await getAccessToken();
      if (!token) throw new ApiClientError(401, 'unauthorized', 'Not signed in');
      headers.authorization = `Bearer ${token}`;
    }
    if (body !== undefined) headers['content-type'] = 'application/json';

    const res = await fetchFn(`${baseUrl}${buildPath(def.path, params)}${buildQuery(query)}`, {
      method: def.method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: init?.signal,
    });

    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = ApiError.safeParse(json);
      if (err.success) {
        throw new ApiClientError(
          res.status,
          err.data.error.code,
          err.data.error.message,
          err.data.error.details,
        );
      }
      throw new ApiClientError(res.status, 'http_error', `Request failed with ${res.status}`);
    }

    // Never trust the wire: validate against the shared contract.
    const parsed = def.response.safeParse(json);
    if (!parsed.success) {
      throw new ApiClientError(
        res.status,
        'contract_mismatch',
        `Response for ${name} did not match its contract`,
        parsed.error.issues,
      );
    }
    return parsed.data as CallOutput<N>;
  };
}

/** App-wide client: attaches the signed-in user's Supabase access token. */
export const api = createApiClient({
  baseUrl: env.VITE_API_URL.replace(/\/$/, ''),
  getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
});
