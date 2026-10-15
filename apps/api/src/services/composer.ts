/**
 * Outfit composer (Phase 3, owner: Member 3).
 * Retrieve, don't generate: pick in-stock products per slot via `match_products` (and the user's
 * own pieces via `match_wardrobe` when wardrobe_mode != 'off'), score against the taste profile,
 * then at most ONE small LLM call (Vercel AI SDK `generateObject`) for rationale + styling tip.
 * Scoring rules (palette, budget split, pair score) are written test-first from human test cases.
 * The LLM prompt is human-reviewed.
 */
export {};
