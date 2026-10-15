# 0002 — One embedding space, stored as halfvec(768)

- **Status:** Accepted (2026-10-15)

## Context

Products, reference looks, archetypes, user taste, wardrobe items and venue vibes all need to be compared
with each other ("does this venue fit this look?", "is this product close to her taste?").

## Decision

- Use **one model, Marqo-FashionSigLIP (768-dim)**, for every vector, so all of them live in one space.
- Store vectors as **`halfvec(768)`** (pgvector ≥ 0.7): half the storage of `vector`, enough precision for
  ranking. HNSW indexes with `halfvec_cosine_ops` on `products.embedding`, `reference_looks.embedding`,
  `archetypes.centroid`, `venues.vibe_embedding`. Wardrobe search is filtered per user, so no HNSW there.
- Vectors are produced **offline in batches** by `workers/embedder` (laptop or free Colab/Kaggle GPU).
  **No embedding model runs at request time**; live requests only query stored vectors.
- `match_products` sets `hnsw.iterative_scan = relaxed_order` (pgvector 0.8) so filters (slot, gender,
  price, stock) don't starve results.

## Consequences

- Changing the model means re-embedding **everything** and needs a new ADR.
- New rows (e.g. a just-added wardrobe item) are searchable by vector only after the next batch run;
  until then they are matched by tags.
- Vectors never leave the database: API shapes exclude them.
