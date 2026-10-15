"""Command-line entry point: `python -m embedder <command>`.

Phase 1 is a scaffold: every command validates its arguments, prints what it WILL do, and exits
with code 3 ("not implemented yet"). Implementations land in Phase 2 (owner: Member 2).

Heavy libraries (torch, open_clip, supabase) are imported lazily inside the commands so that
`--help`, CI lint and the unit tests run without a GPU stack installed.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass

NOT_IMPLEMENTED_EXIT = 3


@dataclass(frozen=True)
class Command:
    name: str
    help: str
    plan: tuple[str, ...]


COMMANDS: tuple[Command, ...] = (
    Command(
        "embed-products",
        "Embed catalog product images into products.embedding (halfvec 768).",
        (
            "select products where embedding is null (or --all), in_stock first",
            "download image_url, run Marqo-FashionSigLIP image encoder, L2-normalise",
            "upsert embedding (+ derived colour/formality tags) with the service-role key",
        ),
    ),
    Command(
        "embed-reference-looks",
        "Embed curated reference looks per archetype (images are never stored).",
        (
            "read a local manifest of reference images per archetype slug",
            "embed each image, insert reference_looks rows (source_brand, gender, embedding)",
            "discard the images after embedding",
        ),
    ),
    Command(
        "compute-centroids",
        "Average reference-look embeddings into archetypes.centroid.",
        (
            "for each archetype: mean of its reference_looks embeddings, then L2-normalise",
            "update archetypes.centroid",
        ),
    ),
    Command(
        "embed-wardrobe",
        "Embed users' wardrobe photos into wardrobe_items.embedding.",
        (
            "select wardrobe_items with image_path and null embedding (not archived)",
            "download from the private wardrobe-photos bucket via a short-lived signed URL",
            "embed, update wardrobe_items.embedding; never copy photos off the bucket",
        ),
    ),
    Command(
        "embed-venues",
        "Embed venue vibe descriptions into venues.vibe_embedding (text encoder).",
        (
            "build a vibe sentence per venue from vibe_tags + category",
            "run the SigLIP text encoder, update venues.vibe_embedding",
        ),
    ),
)


def _stub(command: Command) -> Callable[[argparse.Namespace], int]:
    def run(args: argparse.Namespace) -> int:
        scope = "all rows" if args.all else "rows with a missing embedding"
        limit = args.limit or "none"
        print(f"[{command.name}] scaffold only - not implemented yet (Phase 2).")
        print(f"  would process: {scope}, batch size {args.batch_size}, limit {limit}")
        for i, step in enumerate(command.plan, 1):
            print(f"  {i}. {step}")
        if args.dry_run:
            print("  (dry run: nothing would be written)")
        return NOT_IMPLEMENTED_EXIT

    return run


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="embedder",
        description="DaFitMatch offline batch embedder (Marqo-FashionSigLIP, 768-dim halfvec).",
    )
    sub = parser.add_subparsers(dest="command", required=True, metavar="<command>")
    for command in COMMANDS:
        p = sub.add_parser(command.name, help=command.help, description=command.help)
        p.add_argument("--limit", type=int, default=0, help="max rows to process (0 = no limit)")
        p.add_argument("--batch-size", type=int, default=64, help="images per model batch")
        p.add_argument("--all", action="store_true", help="re-embed rows that already have one")
        p.add_argument("--dry-run", action="store_true", help="compute but do not write")
        p.set_defaults(run=_stub(command))
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.limit < 0 or args.batch_size < 1:
        print("--limit must be >= 0 and --batch-size >= 1", file=sys.stderr)
        return 2
    return args.run(args)


if __name__ == "__main__":
    raise SystemExit(main())
