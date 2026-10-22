import json
import sys

import pytest

from embedder import cli
from embedder.catalog import ArchetypeRow, ProductRow, VenueRow
from embedder.config import EMBEDDING_DIM, ConfigError, load_settings

EXPECTED = {
    "embed-products",
    "embed-reference-looks",
    "compute-centroids",
    "embed-wardrobe",
    "embed-venues",
}


class FakeEncoder:
    """Duck-typed stand-in for the real SigLIP encoder (no torch needed)."""

    def __init__(self, dim: int = EMBEDDING_DIM, batch_size: int = 64) -> None:
        self.dim = dim
        self.batch_size = batch_size
        self.calls = 0

    def _vector(self, seed: int) -> list[float]:
        vec = [0.0] * self.dim
        vec[seed % self.dim] = 1.0
        return vec

    def encode_images(self, images):
        self.calls += 1
        return [self._vector(i) for i, _ in enumerate(images)]

    def encode_image_paths(self, paths):
        self.calls += 1
        return [self._vector(i) for i, _ in enumerate(paths)]

    def encode_texts(self, texts):
        self.calls += 1
        return [self._vector(i) for i, _ in enumerate(texts)]


class FakeCatalog:
    def __init__(self, products=None, archetypes=None, venues=None, looks=None):
        self.products = products or []
        self._archetypes = archetypes or []
        self._venues = venues or []
        self.looks = looks or {}
        self.written_products: list[tuple[str, str]] = []
        self.written_centroids: list[tuple[str, str]] = []
        self.written_venues: list[tuple[str, str]] = []
        self.inserted_looks: list[dict] = []

    def products_without_embedding(self, limit=0, only_in_stock=True, only_missing=True):
        rows = self.products
        if only_missing:
            rows = [r for r in rows if not getattr(r, "embedded", False)]
        return rows[:limit] if limit else rows

    def set_product_embeddings(self, updates):
        self.written_products.extend(updates)

    def archetypes(self):
        return self._archetypes

    def reference_look_vectors(self, archetype_id):
        return self.looks.get(archetype_id, [])

    def set_archetype_centroid(self, archetype_id, vector):
        self.written_centroids.append((archetype_id, vector))

    def insert_reference_look(self, archetype_id, source_brand, source_url, gender, vector):
        self.inserted_looks.append(
            {
                "archetype_id": archetype_id,
                "source_brand": source_brand,
                "source_url": source_url,
                "gender": gender,
                "embedding": vector,
            }
        )

    def venues(self):
        return self._venues

    def set_venue_vibe_embedding(self, venue_id, vector):
        self.written_venues.append((venue_id, vector))


def test_all_commands_are_registered():
    assert {c.name for c in cli.COMMANDS} == EXPECTED


def test_rejects_bad_arguments(capsys):
    assert cli.main(["embed-products", "--batch-size", "-1"]) == cli.EXIT_CONFIG


def test_requires_a_command():
    with pytest.raises(SystemExit):
        cli.main([])


def test_cli_does_not_import_heavy_libraries():
    # --help and CI must work without torch / open_clip / supabase installed.
    for heavy in ("torch", "open_clip", "supabase"):
        assert heavy not in sys.modules


def test_embedding_dim_matches_schema():
    assert EMBEDDING_DIM == 768


def test_settings_require_secret_key():
    with pytest.raises(ConfigError, match="SUPABASE_SECRET_KEY"):
        load_settings({"SUPABASE_URL": "https://x.supabase.co"})
    s = load_settings({"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SECRET_KEY": "k"})
    assert s.batch_size == 64


def test_commands_without_config_exit_with_config_code(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    assert cli.main(["embed-products", "--dry-run"]) == cli.EXIT_CONFIG
    assert cli.main(["compute-centroids"]) == cli.EXIT_CONFIG


def test_embed_products_dry_run_writes_nothing(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "k")
    catalog = FakeCatalog(
        products=[
            ProductRow("p1", "Shirt", "Roadster", "Shirts", "top", "men", "https://x/i.jpg", 999)
        ]
    )
    stats = cli.embed_products(catalog, FakeEncoder(), dry_run=True)
    assert stats == {"found": 1, "embedded": 0, "failed": 0}
    assert catalog.written_products == []


def test_compute_centroids_uses_reference_look_mean():
    catalog = FakeCatalog(
        archetypes=[ArchetypeRow("a1", "minimal-mono", "Minimal")],
        looks={"a1": ["[1,0]", "[0,1]"]},
    )
    stats = cli.compute_centroids(catalog)
    assert stats["centroids"] == 1
    centroid = catalog.written_centroids[0][1]
    # Mean of [1,0] and [0,1] is [0.5,0.5], normalised to [0.7071,0.7071].
    assert centroid.startswith("[0.70710")
    assert centroid.endswith("]")


def test_compute_centroids_skips_archetypes_without_looks():
    catalog = FakeCatalog(archetypes=[ArchetypeRow("a1", "minimal-mono", "Minimal")], looks={})
    stats = cli.compute_centroids(catalog)
    assert stats["skipped"] == 1
    assert catalog.written_centroids == []


def test_embed_venues_writes_one_vector_per_venue():
    catalog = FakeCatalog(
        venues=[VenueRow("v1", "Cafe Mondegar", "Delhi", "cafe", ["cozy", "quiet"])],
    )
    stats = cli.embed_venues(catalog, FakeEncoder())
    assert stats["embedded"] == 1
    assert len(catalog.written_venues) == 1


def test_embed_reference_looks_skips_unknown_slugs(tmp_path):
    image = tmp_path / "look.jpg"
    image.write_bytes(b"not-a-real-image")
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "archetypes": [
                    {
                        "slug": "unknown-slug",
                        "looks": [{"image": "look.jpg", "source_brand": "COS", "gender": "women"}],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    from embedder.manifest import load_manifest

    looks = load_manifest(manifest, require_images=False)
    catalog = FakeCatalog(archetypes=[ArchetypeRow("a1", "minimal-mono", "Minimal")])
    stats = cli.embed_reference_looks(catalog, FakeEncoder(), looks, dry_run=True)
    assert stats["skipped"] == 1
    assert catalog.inserted_looks == []
