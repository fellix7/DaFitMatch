# DaFitMatch embedder (offline batch)

Turns images and text into **768-dim vectors** in one shared space (Marqo-FashionSigLIP) and writes
them into Postgres (`halfvec(768)` columns). It runs **offline, in batches**, never per request: live
requests only query the vectors this job has already stored (see ADR 0002).

Owner: **Member 2** (data & catalog). Status: **scaffold** (commands exist, implementations land in Phase 2).

## What it fills

| Command | Reads | Writes |
|---|---|---|
| `embed-products` | `products.image_url` | `products.embedding` |
| `embed-reference-looks` | local manifest of reference images per archetype (images are **not** stored) | `reference_looks` rows |
| `compute-centroids` | `reference_looks.embedding` | `archetypes.centroid` |
| `embed-wardrobe` | `wardrobe_items.image_path` (private bucket, signed URLs) | `wardrobe_items.embedding` |
| `embed-venues` | `venues.vibe_tags`, `category` | `venues.vibe_embedding` |

Until `embed-wardrobe` runs, a newly added wardrobe piece is matched by its tags only.

## Where to run it

- **Laptop**: fine for the 30 seed products or a few hundred rows (CPU works, just slower).
- **Free GPU**: Google Colab or Kaggle notebooks for the full catalog. Clone the repo, `cd workers/embedder`,
  install, set the two env vars in the notebook's secrets, run the command.

> **India ISP note:** some providers (e.g. ACT Fibernet) DNS-block `*.supabase.co`. If writes fail with
> connection resets on your laptop, enable DNS-over-HTTPS (Windows: Settings → Network → DNS server
> assignment → DNS over HTTPS) or run from Colab/Kaggle.

## Setup (Python 3.12)

```bash
cd workers/embedder
python3.12 -m venv .venv
. .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
```

Environment (reads the repo-root `.env` or the notebook's env):

| Var | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | project URL |
| `SUPABASE_SECRET_KEY` | yes | **service-role key**: catalog writes are service-role only. Never commit, never put in a notebook cell, use the notebook's secret store |
| `EMBEDDER_BATCH_SIZE` | no | default 64 |
| `EMBEDDER_DEVICE` | no | `auto` \| `cuda` \| `cpu` \| `mps` |

## Usage

```bash
python -m embedder --help
python -m embedder embed-products --dry-run --limit 30
python -m embedder compute-centroids
```

Every command supports `--limit`, `--batch-size`, `--all` (re-embed rows that already have a vector) and
`--dry-run`. Scaffold commands print their plan and exit with code **3**.

## Rules

- Vectors are L2-normalised before writing (cosine HNSW indexes).
- Write `halfvec` values as the pgvector text form `"[0.12,-0.03,...]"` with exactly 768 numbers.
- Never store reference-look images; never copy user photos out of their private bucket.
- Pin the model revision when implementing; changing the model means re-embedding **everything**
  (one shared space) and needs an ADR.

## Dev checks

```bash
ruff check . && ruff format --check . && pytest
```
