"""Command-line entry point: `python -m embedder <command>`.

Phase 2: the commands are implemented. They run **offline, in batches** - no model ever runs at
request time (ADR 0002). Heavy libraries (torch, open_clip, supabase) are imported lazily inside
the commands so that `--help`, lint and the unit tests run without a GPU stack installed.

Exit codes: 0 = success, 1 = runtime failure, 2 = bad arguments / missing configuration.
"""

from __future__ import annotations

import argparse
import sys
import tempfile
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from .catalog import Catalog, ProductRow
from .config import ConfigError, load_settings
from .images import ImageError, download_image, image_extension, open_image
from .manifest import ManifestError, ReferenceLook, load_manifest, manifest_summary
from .model import Encoder
from .prompts import vibe_sentence
from .vectors import from_pgvector, normalized_mean, to_pgvector

EXIT_OK = 0
EXIT_FAILURE = 1
EXIT_CONFIG = 2
NOT_IMPLEMENTED_EXIT = 3  # kept for backwards compatibility with the Phase 1 scaffold


@dataclass(frozen=True)
class Command:
    name: str
    help: str
    plan: tuple[str, ...]
    run: Callable[[argparse.Namespace], int]


def _log(message: str) -> None:
    print(message, flush=True)


def _encoder_for(args: argparse.Namespace, settings) -> Encoder:
    return Encoder(
        model_name=settings.model_name,
        device=settings.device,
        batch_size=args.batch_size or settings.batch_size,
    )


def _catalog_and_encoder(args: argparse.Namespace) -> tuple[Catalog, Encoder] | None:
    try:
        settings = load_settings()
    except ConfigError as exc:
        _log(str(exc))
        return None
    return Catalog.from_settings(settings), _encoder_for(args, settings)


# ── embed-products ────────────────────────────────────────────────────────────
def embed_products(
    catalog: Catalog,
    encoder: Encoder,
    *,
    limit: int = 0,
    dry_run: bool = False,
    only_in_stock: bool = True,
    reembed: bool = False,
) -> dict[str, int]:
    """Embed catalog product images into `products.embedding`."""
    rows: list[ProductRow] = catalog.products_without_embedding(
        limit=limit, only_in_stock=only_in_stock, only_missing=not reembed
    )
    stats = {"found": len(rows), "embedded": 0, "failed": 0}
    if not rows:
        return stats
    if dry_run:
        _log(f"[embed-products] would embed {len(rows)} product(s)")
        return stats

    batch = max(1, encoder.batch_size)
    with tempfile.TemporaryDirectory(prefix="dafitmatch-embed-") as tmp:
        workdir = Path(tmp)
        for start in range(0, len(rows), batch):
            chunk = rows[start : start + batch]
            images = []
            keep: list[ProductRow] = []
            for row in chunk:
                target = workdir / f"{row.id}{image_extension(row.image_url)}"
                try:
                    download_image(row.image_url, target)
                    images.append(open_image(target))
                    keep.append(row)
                except ImageError as exc:
                    stats["failed"] += 1
                    _log(f"[embed-products] skipped {row.id}: {exc}")
                finally:
                    target.unlink(missing_ok=True)
            if not images:
                continue
            vectors = encoder.encode_images(images)
            catalog.set_product_embeddings(
                [(row.id, to_pgvector(vec)) for row, vec in zip(keep, vectors, strict=True)]
            )
            stats["embedded"] += len(vectors)
            _log(f"[embed-products] {stats['embedded']}/{stats['found']} embedded")
    return stats


def _run_embed_products(args: argparse.Namespace) -> int:
    pair = _catalog_and_encoder(args)
    if pair is None:
        return EXIT_CONFIG
    catalog, encoder = pair
    stats = embed_products(
        catalog,
        encoder,
        limit=args.limit,
        dry_run=args.dry_run,
        only_in_stock=not args.include_out_of_stock,
        reembed=args.all,
    )
    _log(f"[embed-products] done: {stats}")
    return EXIT_OK


# ── embed-reference-looks ─────────────────────────────────────────────────────
def embed_reference_looks(
    catalog: Catalog,
    encoder: Encoder,
    looks: Sequence[ReferenceLook],
    *,
    dry_run: bool = False,
) -> dict[str, int]:
    """Embed curated reference looks into `reference_looks` (the images are never stored)."""
    archetypes = {archetype.slug: archetype.id for archetype in catalog.archetypes()}
    stats = {"found": len(looks), "embedded": 0, "skipped": 0}

    for look in looks:
        archetype_id = archetypes.get(look.slug)
        if archetype_id is None:
            stats["skipped"] += 1
            _log(f"[embed-reference-looks] unknown archetype slug '{look.slug}', skipped")
            continue
        if dry_run:
            _log(f"[embed-reference-looks] would embed {look.image_path} for {look.slug}")
            continue
        try:
            vector = encoder.encode_image_paths([look.image_path])[0]
        except (ImageError, IndexError) as exc:
            stats["skipped"] += 1
            _log(f"[embed-reference-looks] skipped {look.image_path}: {exc}")
            continue
        catalog.insert_reference_look(
            archetype_id,
            look.source_brand,
            look.source_url,
            look.gender,
            to_pgvector(vector),
        )
        stats["embedded"] += 1

    if not dry_run:
        _log(f"[embed-reference-looks] {manifest_summary(list(looks))}")
    return stats


def _run_embed_reference_looks(args: argparse.Namespace) -> int:
    manifest = Path(args.manifest)
    try:
        looks = load_manifest(manifest, require_images=not args.allow_missing_images)
    except ManifestError as exc:
        _log(str(exc))
        return EXIT_CONFIG
    if args.allow_missing_images:
        looks = [look for look in looks if look.image_path.exists()]
    pair = _catalog_and_encoder(args)
    if pair is None:
        return EXIT_CONFIG
    catalog, encoder = pair
    stats = embed_reference_looks(catalog, encoder, looks, dry_run=args.dry_run)
    _log(f"[embed-reference-looks] done: {stats}")
    return EXIT_OK


# ── compute-centroids ────────────────────────────────────────────────────────
def compute_centroids(catalog: Catalog, *, dry_run: bool = False) -> dict[str, int]:
    """Average each archetype's reference-look vectors into `archetypes.centroid`."""
    stats = {"archetypes": 0, "centroids": 0, "skipped": 0}
    for archetype in catalog.archetypes():
        stats["archetypes"] += 1
        vectors = [
            vec
            for vec in (from_pgvector(raw) for raw in catalog.reference_look_vectors(archetype.id))
            if vec
        ]
        if not vectors:
            stats["skipped"] += 1
            _log(f"[compute-centroids] {archetype.slug}: no reference looks, skipped")
            continue
        centroid = normalized_mean(vectors)
        if dry_run:
            _log(
                f"[compute-centroids] would write centroid for {archetype.slug} "
                f"({len(vectors)} looks)"
            )
            continue
        catalog.set_archetype_centroid(archetype.id, to_pgvector(centroid))
        stats["centroids"] += 1
    return stats


def _run_compute_centroids(args: argparse.Namespace) -> int:
    pair = _catalog_and_encoder(args)
    if pair is None:
        return EXIT_CONFIG
    catalog, _ = pair
    stats = compute_centroids(catalog, dry_run=args.dry_run)
    _log(f"[compute-centroids] done: {stats}")
    return EXIT_OK


# ── embed-wardrobe ───────────────────────────────────────────────────────────
def embed_wardrobe(
    catalog: Catalog,
    encoder: Encoder,
    *,
    limit: int = 0,
    dry_run: bool = False,
) -> dict[str, int]:
    """Embed users' wardrobe photos into `wardrobe_items.embedding`."""
    rows = catalog.wardrobe_items_without_embedding(limit=limit)
    stats = {"found": len(rows), "embedded": 0, "failed": 0}
    if dry_run:
        _log(f"[embed-wardrobe] would embed {len(rows)} wardrobe item(s)")
        return stats
    with tempfile.TemporaryDirectory(prefix="dafitmatch-wardrobe-") as tmp:
        workdir = Path(tmp)
        for row in rows:
            target = workdir / f"{row.id}.jpg"
            try:
                signed = catalog.signed_url("wardrobe-photos", row.image_path, expires=120)
                download_image(signed, target)
                vector = encoder.encode_images([open_image(target)])[0]
            except (ImageError, IndexError, RuntimeError) as exc:
                stats["failed"] += 1
                _log(f"[embed-wardrobe] skipped {row.id}: {exc}")
                continue
            finally:
                target.unlink(missing_ok=True)
            catalog.set_wardrobe_embedding(row.id, to_pgvector(vector))
            stats["embedded"] += 1
    return stats


def _run_embed_wardrobe(args: argparse.Namespace) -> int:
    pair = _catalog_and_encoder(args)
    if pair is None:
        return EXIT_CONFIG
    catalog, encoder = pair
    stats = embed_wardrobe(catalog, encoder, limit=args.limit, dry_run=args.dry_run)
    _log(f"[embed-wardrobe] done: {stats}")
    return EXIT_OK


# ── embed-venues ─────────────────────────────────────────────────────────────
def embed_venues(catalog: Catalog, encoder: Encoder, *, dry_run: bool = False) -> dict[str, int]:
    """Embed venue vibe descriptions into `venues.vibe_embedding`."""
    venues = catalog.venues()
    stats = {"found": len(venues), "embedded": 0}
    if not venues:
        return stats
    sentences = [vibe_sentence(v.name, v.city, v.category, v.vibe_tags) for v in venues]
    if dry_run:
        for venue, sentence in zip(venues, sentences, strict=True):
            _log(f"[embed-venues] would embed '{sentence}' for {venue.name}")
        return stats
    vectors = encoder.encode_texts(sentences)
    for venue, vector in zip(venues, vectors, strict=True):
        catalog.set_venue_vibe_embedding(venue.id, to_pgvector(vector))
        stats["embedded"] += 1
    return stats


def _run_embed_venues(args: argparse.Namespace) -> int:
    pair = _catalog_and_encoder(args)
    if pair is None:
        return EXIT_CONFIG
    catalog, encoder = pair
    stats = embed_venues(catalog, encoder, dry_run=args.dry_run)
    _log(f"[embed-venues] done: {stats}")
    return EXIT_OK


COMMANDS: tuple[Command, ...] = (
    Command(
        "embed-products",
        "Embed catalog product images into products.embedding (halfvec 768).",
        (
            "select products where embedding is null (or --all), in_stock first",
            "download image_url, run Marqo-FashionSigLIP image encoder, L2-normalise",
            "upsert embedding (+ derived colour/formality tags) with the service-role key",
        ),
        _run_embed_products,
    ),
    Command(
        "embed-reference-looks",
        "Embed curated reference looks per archetype (images are never stored).",
        (
            "read a local manifest of reference images per archetype slug",
            "embed each image, insert reference_looks rows (source_brand, gender, embedding)",
            "discard the images after embedding",
        ),
        _run_embed_reference_looks,
    ),
    Command(
        "compute-centroids",
        "Average reference-look embeddings into archetypes.centroid.",
        (
            "for each archetype: mean of its reference_looks embeddings, then L2-normalise",
            "update archetypes.centroid",
        ),
        _run_compute_centroids,
    ),
    Command(
        "embed-wardrobe",
        "Embed users' wardrobe photos into wardrobe_items.embedding.",
        (
            "select wardrobe_items with image_path and null embedding (not archived)",
            "download from the private wardrobe-photos bucket via a short-lived signed URL",
            "embed, update wardrobe_items.embedding; never copy photos off the bucket",
        ),
        _run_embed_wardrobe,
    ),
    Command(
        "embed-venues",
        "Embed venue vibe descriptions into venues.vibe_embedding (text encoder).",
        (
            "build a vibe sentence per venue from vibe_tags + category",
            "run the SigLIP text encoder, update venues.vibe_embedding",
        ),
        _run_embed_venues,
    ),
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="embedder",
        description="DaFitMatch offline batch embedder (Marqo-FashionSigLIP, 768-dim halfvec).",
    )
    sub = parser.add_subparsers(dest="command", required=True, metavar="<command>")
    for command in COMMANDS:
        p = sub.add_parser(command.name, help=command.help, description=command.help)
        p.add_argument("--limit", type=int, default=0, help="max rows to process (0 = no limit)")
        p.add_argument("--batch-size", type=int, default=0, help="images per model batch (0 = env)")
        p.add_argument("--all", action="store_true", help="re-embed rows that already have one")
        p.add_argument("--dry-run", action="store_true", help="compute but do not write")
        if command.name == "embed-products":
            p.add_argument(
                "--include-out-of-stock",
                action="store_true",
                help="also embed products that are currently out of stock",
            )
        if command.name == "embed-reference-looks":
            p.add_argument("--manifest", required=True, help="path to the reference-look manifest")
            p.add_argument(
                "--allow-missing-images",
                action="store_true",
                help="skip looks whose image file is missing instead of failing",
            )
        p.set_defaults(run=command.run)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.limit < 0 or args.batch_size < 0:
        print("--limit must be >= 0 and --batch-size >= 0", file=sys.stderr)
        return EXIT_CONFIG
    try:
        return int(args.run(args))
    except KeyboardInterrupt:  # pragma: no cover - interactive only
        print("interrupted", file=sys.stderr)
        return EXIT_FAILURE
    except (ConfigError, ManifestError) as exc:
        print(str(exc), file=sys.stderr)
        return EXIT_CONFIG
    except Exception as exc:  # noqa: BLE001 - batch job: report and fail loudly
        print(f"failed: {exc}", file=sys.stderr)
        return EXIT_FAILURE


if __name__ == "__main__":
    raise SystemExit(main())
