# 0003 — React + Vite SPA, Fastify API, on Supabase

- **Status:** Accepted (2026-10-15)

## Context

Three developers working in parallel need clear boundaries, one source of truth for request/response
shapes, and a place to keep paid API keys away from the browser. We need background jobs (try-on queue,
catalog refresh, photo cleanup) without running Redis.

## Decision

- **Web:** React + Vite SPA (static, Vercel, preview per PR). The browser uses supabase-js **only for auth**
  (and, later, direct uploads into the user's own storage folder). All data goes through the API.
- **API:** long-running Node + Fastify (Render/Railway). It verifies the Supabase JWT on every request
  (JWKS for ES256/RS256; HS256 secret only for the local CLI) and queries with a **user-scoped client**
  so RLS still applies. The service-role client is restricted to jobs/admin (lint-enforced).
- **Jobs:** pg-boss on the same Postgres, separate process (`src/worker.ts`).
- **Contracts:** zod schemas + an endpoint registry in `packages/shared`, used by Fastify for validation
  and by the web client for typed calls and response validation.
- **Security in depth:** RLS on every table, column-level grants for sensitive columns, SECURITY DEFINER
  RPCs for cross-row actions (join/leave room, votes, quota, age gate), all with `search_path = ''`.

## Consequences

- Two deployables (web, api+worker) instead of one. Worth it for key isolation and jobs.
- pg-boss creates its own `pgboss` schema at runtime (not via our migrations) and needs a session-capable
  connection (direct or session pooler, not transaction pooler).
- Supabase's advisor flags the SECURITY DEFINER RPCs as callable by signed-in users. That is intentional:
  each checks `auth.uid()` and membership, proven by pgTAP tests.
