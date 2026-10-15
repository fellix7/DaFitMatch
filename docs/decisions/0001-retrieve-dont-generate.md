# 0001 — Retrieve, don't generate

- **Status:** Accepted (2026-10-15)
- **Deciders:** product owner, tech lead

## Context

Users must be able to buy what we show them. Generated garment images look plausible but do not exist,
cannot be bought, and invite brand/IP problems.

## Decision

Outfits are **composed from an indexed catalog of real products** (Myntra, Ajio, Flipkart, Amazon, …)
plus the user's own wardrobe items. The composer retrieves candidates per slot with vector search
(`match_products`, `match_wardrobe`), scores them, and uses at most one small LLM call for the rationale
and styling tip. Image generation is used **only** for virtual try-on of a real product on the user's photo.

Luxury brands appear only as **style references** ("inspired by …") attached to archetypes, never as
catalog items or implied partners.

## Consequences

- Every outfit has buy links and a real total price; shop panels carry the affiliate disclosure.
- Catalog freshness matters: nightly refresh job (stock, price, `last_seen_at`).
- Quality is bounded by catalog coverage, so ingest is a Phase 2 priority.
