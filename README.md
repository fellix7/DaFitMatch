# DaFitMatch

Couples-first date outfits from real, buyable products (and clothes you already own), scored to both
partners' taste, with virtual try-on and a matching date spot in Delhi NCR.

**Start here:** [AGENTS.md](AGENTS.md) (rules, ownership, commands) and [docs/decisions](docs/decisions).

## Run it

Needs **Node 24**, **pnpm 12** (`npm i -g pnpm@12.8.2`) and either a Supabase project or Docker.

```bash
git clone https://github.com/suryansh24-coder/DaFitmatch.git && cd DaFitmatch
pnpm i
cp .env.example .env          # then fill it in (see below)
pnpm dev                      # web on http://localhost:5173, API on http://localhost:8787
```

### Option A — shared hosted dev project (no Docker)

Ask the team for the `dafitmatch-dev` values and put them in `.env`:
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` (session pooler) and the
matching `VITE_*` values. Set `VITE_DEV_PASSWORD_LOGIN=true` to sign in with the shared developer account.

### Option B — local Supabase (Docker)

```bash
pnpm supabase start           # prints local URL + keys; copy them into .env
pnpm db:reset                 # all migrations + seed (14 styles, 30 test products, 2 test users)
pnpm db:test                  # RLS / schema tests
```

Local test users (seed): `asha.test@example.com` and `bilal.test@example.com` (password in
`supabase/seed/03_test_users.sql`). Emails land in Mailpit at http://127.0.0.1:54324.

## Repo

```
apps/web            React + Vite SPA (Member 1)
apps/api            Fastify API + pg-boss worker (Member 3)
packages/shared     zod contracts, constants, generated DB types (everyone imports from here)
supabase/           migrations (only way the schema changes), seed, pgTAP tests
workers/embedder    Python batch embedder (Member 2)
docs/decisions      ADRs
```

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test
```

CI runs these plus migrations on a fresh database, the pgTAP RLS suites, a DB-types drift check and the
embedder's ruff + pytest.

> **Can't reach Supabase from your laptop?** Some Indian ISPs DNS-block `*.supabase.co`. Turn on
> DNS-over-HTTPS (Windows: Settings → Network → DNS server assignment → DNS over HTTPS). See ADR 0008.
