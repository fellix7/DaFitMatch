# 0006 — Reuse the user's own wardrobe

- **Status:** Accepted (2026-10-15), requested by the product owner during Phase 1.

## Context

Users already own clothes. Outfits that reuse them are cheaper, more sustainable and more realistic.

## Decision

- New table `wardrobe_items` (slot, category, title, colours, formality, occasions, tags, photo path,
  `halfvec(768)` embedding, archived flag), owner-only RLS, max 300 items per user.
- `outfits.wardrobe_item_ids` sits next to `item_ids`; an outfit needs at least one item across both, and
  may only reference its owner's wardrobe (trigger-enforced). `total_price_inr` counts catalog items only;
  shop panels list only what is left to buy.
- `ComposeOutfitsRequest.wardrobe_mode`: `off` | `mix` (default) | `only`.
- `match_wardrobe(query_vec, slot, k)` searches the caller's own embedded items.
- Photos in the private `wardrobe-photos` bucket (ADR 0004). Embeddings come from the batch embedder
  (`embed-wardrobe`); until then, items match by tags.
- Endpoints `/wardrobe` (list/add/update/delete) are contract-complete stubs; UI in Phase 3.

## Consequences

- A partner sees a wardrobe item only while it is used in an outfit shown in a shared room.
- Optional later: one small vision-LLM call to auto-tag an uploaded garment (allowed by the
  "at most one small LLM call" rule).
