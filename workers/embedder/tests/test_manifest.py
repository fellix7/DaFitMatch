import json

import pytest

from embedder.manifest import ManifestError, load_manifest, manifest_summary


def write_manifest(tmp_path, payload, name="manifest.json"):
    path = tmp_path / name
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_loads_looks_and_resolves_image_paths(tmp_path):
    (tmp_path / "looks").mkdir()
    (tmp_path / "looks" / "01.jpg").write_bytes(b"x")
    manifest = write_manifest(
        tmp_path,
        {
            "archetypes": [
                {
                    "slug": "minimal-mono",
                    "looks": [
                        {
                            "image": "looks/01.jpg",
                            "source_brand": "COS",
                            "source_url": "https://example.com/look/1",
                            "gender": "women",
                        }
                    ],
                }
            ]
        },
    )
    looks = load_manifest(manifest)
    assert len(looks) == 1
    look = looks[0]
    assert look.slug == "minimal-mono"
    assert look.source_brand == "COS"
    assert look.gender == "women"
    assert look.image_path.exists()


def test_missing_image_fails_the_manifest(tmp_path):
    manifest = write_manifest(
        tmp_path,
        {
            "archetypes": [
                {
                    "slug": "minimal-mono",
                    "looks": [{"image": "nope.jpg", "source_brand": "COS", "gender": "men"}],
                }
            ]
        },
    )
    with pytest.raises(ManifestError, match="missing"):
        load_manifest(manifest)


def test_missing_image_can_be_allowed(tmp_path):
    manifest = write_manifest(
        tmp_path,
        {
            "archetypes": [
                {
                    "slug": "minimal-mono",
                    "looks": [{"image": "nope.jpg", "source_brand": "COS", "gender": "men"}],
                }
            ]
        },
    )
    looks = load_manifest(manifest, require_images=False)
    assert len(looks) == 1
    assert not looks[0].image_path.exists()


def test_gender_must_be_known(tmp_path):
    manifest = write_manifest(
        tmp_path,
        {
            "archetypes": [
                {
                    "slug": "minimal-mono",
                    "looks": [{"image": "nope.jpg", "source_brand": "COS", "gender": "other"}],
                }
            ]
        },
    )
    with pytest.raises(ManifestError, match="gender"):
        load_manifest(manifest, require_images=False)


def test_manifest_needs_archetypes(tmp_path):
    manifest = write_manifest(tmp_path, {"looks": []})
    with pytest.raises(ManifestError, match="archetypes"):
        load_manifest(manifest)


def test_manifest_file_must_exist(tmp_path):
    with pytest.raises(ManifestError, match="not found"):
        load_manifest(tmp_path / "missing.json")


def test_summary_counts_looks_per_slug(tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    (tmp_path / "b.jpg").write_bytes(b"x")
    manifest = write_manifest(
        tmp_path,
        {
            "archetypes": [
                {
                    "slug": "minimal-mono",
                    "looks": [
                        {"image": "a.jpg", "source_brand": "COS", "gender": "women"},
                        {"image": "b.jpg", "source_brand": "COS", "gender": "women"},
                    ],
                }
            ]
        },
    )
    assert manifest_summary(load_manifest(manifest)) == {"minimal-mono": 2}
