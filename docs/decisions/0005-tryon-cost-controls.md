# 0005 — Try-on cost controls

- **Status:** Accepted (2026-10-15). Values need product-owner sign-off before launch.

## Context

Virtual try-on uses a paid API (fal). Unbounded use could create a large bill.

## Decision

Layered controls, all enforced in the database so no client path can bypass them:

1. **Kill switch:** `app_settings.tryon_enabled` (ships `false`). Service role only.
2. **Per-user daily cap:** `DAILY_TRYON_CAP = 3` (`app_settings.tryon_daily_cap`), counted per calendar
   day in Asia/Kolkata in `usage_limits`.
3. **Global spend limits:** `app_settings.tryon_spend_limits` = `{ daily_usd: 5, monthly_usd: 50 }`,
   checked against `sum(tryons.cost_usd)`.
4. `consume_tryon_quota()` checks all of the above atomically and reserves one slot; the worker refunds
   the slot if the provider call fails.
5. **On demand only** (never pre-generated) and **cached** by `(input_hash, product_id)`.
6. Adults only. The API enqueues; only the worker calls the provider (keys never leave the API host).

## Consequences

- Changing limits is a data change (no deploy) but requires human review.
- Users see a clear "limit reached" state; product decides whether paid tiers raise the cap later.
