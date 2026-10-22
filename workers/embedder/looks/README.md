# Reference looks (style references only)

Each archetype needs a handful of **reference images**: what the archetype looks like, in the same
768-dim space as the catalog. The images are embedded and **never stored in the database** - only
the vectors are (ADR 0002).

## Rules

- Style references only: a brand name in the manifest is a *reference* ("inspired by Ralph Lauren"),
  never a catalog product and never a partnership.
- Use images that show the **whole look** (top + bottom + shoes) when possible; the centroid is the
  average of the looks, so mixed framing pollutes it.
- Keep at least **3 looks per archetype**; 1 look is better than none but gives a thin centroid.
- The images stay out of git (they are large and belong to the brand that shot them). Put them in
  `workers/embedder/looks/images/<archetype-slug>/NN.jpg` and keep the folder out of version control.
- `source_url` is optional: leave it empty when the image was not taken from a public page.

## Usage

1. Copy `manifest.example.json` to `manifest.json` and adjust the looks you actually collected.
2. Put the images under `looks/images/<archetype-slug>/`.
3. Run:

```bash
python -m embedder embed-reference-looks --manifest looks/manifest.json
python -m embedder compute-centroids
```

`embed-reference-looks` fails when an image in the manifest is missing (use
`--allow-missing-images` to skip instead). `compute-centroids` averages the embedded looks of each
archetype into `archetypes.centroid` and skips archetypes without looks.

## Archetype slugs

The slugs must match `public.archetypes.slug` (see `supabase/seed/01_archetypes.sql`):

`quiet-luxury`, `streetwear`, `minimal`, `preppy`, `edgy`, `boho`, `athleisure`, `indo-western`,
`festive`, `smart-casual`, `soft-romantic`, `y2k`, `resort-coastal`, `utility-techwear`
