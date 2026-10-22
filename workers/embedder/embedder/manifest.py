"""Reference-look manifest: curated style references per archetype.

The images stay on disk (a local folder or the repo) and are **never** stored in the database:
only their embeddings are. Brand names are style references only ("inspired by <brand>"), never
catalog products and never a partnership.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

GENDERS = ("men", "women", "unisex")


class ManifestError(RuntimeError):
    """Raised when the manifest is malformed or points at missing images."""


@dataclass(frozen=True)
class ReferenceLook:
    """One curated look: an image to embed plus the archetype it represents."""

    slug: str
    image_path: Path
    source_brand: str
    source_url: str | None
    gender: str


def _read_looks(entry: dict[str, Any], root: Path) -> list[ReferenceLook]:
    looks: list[ReferenceLook] = []
    for raw in entry.get("looks", []):
        if not isinstance(raw, dict):
            raise ManifestError(f"look entries must be objects: {raw!r}")
        image = raw.get("image")
        if not image:
            raise ManifestError(f"look without an image path: {raw!r}")
        image_path = Path(image)
        if not image_path.is_absolute():
            image_path = (root / image_path).resolve()
        gender = str(raw.get("gender", "")).lower()
        if gender not in GENDERS:
            raise ManifestError(f"look for {image} needs a gender in {GENDERS}, got {gender!r}")
        brand = str(raw.get("source_brand", "")).strip()
        source_url = raw.get("source_url")
        looks.append(
            ReferenceLook(
                slug=entry["slug"],
                image_path=image_path,
                source_brand=brand,
                source_url=str(source_url) if source_url else None,
                gender=gender,
            )
        )
    return looks


def load_manifest(path: Path, *, require_images: bool = True) -> list[ReferenceLook]:
    """Read a manifest file and return its looks.

    The manifest is a JSON file::

        {
          "archetypes": [
            {
              "slug": "minimal-mono",
              "looks": [
                {
                  "image": "looks/minimal-mono/01.jpg",
                  "source_brand": "COS",
                  "source_url": "https://example.com/look/1",
                  "gender": "women"
                }
              ]
            }
          ]
        }
    """
    path = Path(path)
    if not path.exists():
        raise ManifestError(f"manifest not found: {path}")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ManifestError(f"manifest is not valid JSON: {exc}") from exc
    if not isinstance(raw, dict) or "archetypes" not in raw:
        raise ManifestError("manifest needs an 'archetypes' list")

    root = Path(raw.get("root", path.parent)).resolve()
    if not root.is_absolute():
        root = (path.parent / root).resolve()

    looks: list[ReferenceLook] = []
    for entry in raw["archetypes"]:
        if not isinstance(entry, dict) or "slug" not in entry:
            raise ManifestError(f"archetype entry needs a slug: {entry!r}")
        looks.extend(_read_looks(entry, root))

    if require_images:
        missing = [look.image_path for look in looks if not look.image_path.exists()]
        if missing:
            first = missing[0]
            raise ManifestError(f"{len(missing)} reference image(s) missing, e.g. {first}")
    return looks


def manifest_summary(looks: list[ReferenceLook]) -> dict[str, int]:
    """Count of looks per archetype slug (for logs and the catalog report)."""
    counts: dict[str, int] = {}
    for look in looks:
        counts[look.slug] = counts.get(look.slug, 0) + 1
    return counts
