# AGENTS.md — rules for every coding agent (and human) working on DaFitMatch

> Read this file first. `knowledge.md` is an exact mirror for Freebuff/Codebuff; CI fails if they differ
> (edit `AGENTS.md`, then `cp AGENTS.md knowledge.md`).

## 1. What we are building

DaFitMatch is a couples-first web app that builds date outfits from **real, buyable products** (and
pieces the user already owns), scores them against each partner's taste profile, offers virtual try-on
on the user's own photo, and suggests a date spot in **Delhi NCR** whose vibe matches the look. A guest
lands on the landing page, builds a style profile without an account, and signs in (Google) only when
they press **Generate fit**; their answers are then saved to their profile.

### Locked decisions (do not change without a new ADR in `docs/decisions/`)

- **Retrieve, don't generate.** Outfits are composed from the indexed catalog. No garment image
  generation; image generation is used only for try-on. (ADR 0001)
- **Luxury brands are style references only** ("inspired by Ralph Lauren"), never the catalog, never
  implied partnerships.
- **One shared 768-dim embedding space** (Marqo-FashionSigLIP) for products, reference looks, archetype
  centroids, taste vectors, wardrobe items and venue vibes, stored as `halfvec(768)` with HNSW cosine
  indexes. (ADR 0002)
- **Taste profile** = vector + a few explicit fields, updated by every interaction (moving average).
  No model training.
- **Couples are core v1**: date room with two seats, one coordination mode
  (`matching` | `complementary` | `one_leads`), one shared palette.
- **Try-on**: paid API, on demand only, cached, capped per user per day, global kill switch. (ADR 0005)
- **Venues**: curated, vibe-tagged list per city, refreshed monthly. Launch city: Delhi NCR.
- **No embedding model runs at request time.** Live requests = database queries + at most one small LLM call.
- **Wardrobe reuse**: users can add clothes they own; the composer mixes them with products. (ADR 0006)
- **Guest-first onboarding, Google sign-in.** (ADR 0007)
- Web only (responsive). No native apps.

## 2. Stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm 12 workspaces + Turborepo 2 |
| Language | TypeScript 6 (strict) everywhere; Python 3.12 in `workers/embedder` |
| Web (`apps/web`) | React 19 + Vite 8 SPA, React Router 8, TanStack Query, Zustand, Tailwind 4 + shadcn/ui, react-hook-form + zod |
| API (`apps/api`) | Node 24 + Fastify 5, fastify-type-provider-zod, pino, helmet, CORS, rate limit |
| Jobs | pg-boss 12 on the same Postgres (`apps/api/src/worker.ts`) |
| DB / Auth / Storage | Supabase: Postgres 17 + pgvector 0.8, Auth (Google), Storage |
| Contracts | zod in `packages/shared` (single source of truth for every request/response) |
| LLM | Vercel AI SDK (`ai`) in the API only, `generateObject` with zod schemas |
| External | fal (try-on), Google Places (New), SerpApi — API only |
| Tests | Vitest, `fastify.inject`, pgTAP (`supabase test db`), Playwright later |

## 3. Commands

```bash
pnpm i                       # install everything
pnpm dev                     # web (5173) + api (8787) together via Turborepo
pnpm --filter @dafitmatch/api dev:worker   # pg-boss worker
pnpm test                    # all unit + API tests
pnpm lint                    # ESLint
pnpm typecheck               # tsc in every package
pnpm format                  # Prettier
pnpm supabase start          # local Supabase (needs Docker)
pnpm db:reset                # fresh local DB: all migrations + seed
pnpm db:test                 # pgTAP RLS/schema tests against the local DB
pnpm db:types                # regenerate packages/shared/src/db.types.ts from the local DB
pnpm --filter @dafitmatch/shared db:types:remote   # same, from the hosted dev project
```

## 4. Folder ownership

| Owner | Folders |
|---|---|
| **Member 1 — frontend** | `apps/web` |
| **Member 2 — data & catalog** | `workers/`, `supabase/seed`, `apps/api/src/jobs` (catalog ingest/refresh only) |
| **Member 3 — AI & backend** | `apps/api` (except ingest jobs), `supabase/migrations`, `packages/shared` schemas |

Touching someone else's folder: open the PR and request their review.

## 5. Security boundaries

- The **browser never** calls paid/external APIs, never holds the service-role/secret key, never imports
  `pg`, `pg-boss`, `ai`, `@fal-ai/*` (ESLint enforces this). All external and AI calls go through `apps/api`.
- API handlers query with the **user-scoped client** (`request.supabase`) so RLS applies. The service-role
  client (`apps/api/src/lib/supabase-admin.ts`) is for `src/jobs/**` and admin routes only (ESLint enforces).
- Only `VITE_*` env vars reach the browser. `VITE_DEV_PASSWORD_LOGIN` must stay `false` outside local dev.
- Every table has RLS. New table ⇒ RLS policies + pgTAP tests in the same PR.
- Private buckets (`user-photos`, `tryon-results`, `wardrobe-photos`) use `{user_id}/...` paths.

## 6. Working rules

1. **One task = one issue = one branch** (`feat/…`, `fix/…`, `chore/…`), conventional commit titles.
2. PRs stay under **~400 changed lines** (generated files and lockfiles excluded).
3. **Import types only from `packages/shared`** (`@dafitmatch/shared`, `@dafitmatch/shared/db`). New
   endpoint ⇒ add it to `endpoints` in `packages/shared/src/schemas/api.ts` first, then implement both sides.
4. **Schema changes only via new migration files** in `supabase/migrations`. Never edit an applied migration.
5. **Only one open PR may add a migration at a time.** After it merges: apply it, then `pnpm db:types`
   and commit the regenerated types.
6. Run `pnpm lint && pnpm typecheck && pnpm test` (and `pnpm db:test` for DB changes) before asking for review.
7. Scoring logic (palette rules, budget split, pair scoring) is **test-first**: implement against
   human-written test cases, never the other way round.

## 7. Never change without human review

- secrets and env files (`.env*`), API keys, `SUPABASE_SECRET_KEY` usage
- already-applied migrations, RLS policies, storage policies, SECURITY DEFINER functions
- anything handling user photos (upload, storage, retention, try-on inputs)
- cost limits (`app_settings`: `tryon_enabled`, `tryon_daily_cap`, `tryon_spend_limits`, `DAILY_TRYON_CAP`)
- the composer's LLM prompt
- auth flow (sign-in methods, `/auth/callback`, dev login flag)

## 8. Copy rules

- Say **"inspired by <brand>"**, never "by <brand>" or anything implying partnership. No brand logos.
- Every shop panel shows the affiliate disclosure (`AFFILIATE_DISCLOSURE` in `packages/shared`).
- Adults-only features (photos, try-on, date rooms) are labelled 18+.

## 9. Environment notes

- Hosted dev project: **`dafitmatch-dev`** (Supabase ref `ytmjvkhoacsmkgmwkffh`, `ap-south-1`).
- Some Indian ISPs (e.g. ACT Fibernet) DNS-block `*.supabase.co`. If sign-in or the API gets connection
  resets, enable DNS-over-HTTPS on your machine. Product-level fix is tracked in ADR 0008.
