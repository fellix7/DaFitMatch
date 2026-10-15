import sys

import pytest

from embedder import cli
from embedder.config import EMBEDDING_DIM, ConfigError, load_settings

EXPECTED = {
    "embed-products",
    "embed-reference-looks",
    "compute-centroids",
    "embed-wardrobe",
    "embed-venues",
}


def test_all_commands_are_registered():
    assert {c.name for c in cli.COMMANDS} == EXPECTED


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_stub_commands_report_not_implemented(name, capsys):
    assert cli.main([name, "--dry-run", "--limit", "5"]) == cli.NOT_IMPLEMENTED_EXIT
    out = capsys.readouterr().out
    assert "not implemented yet" in out
    assert "limit 5" in out


def test_rejects_bad_arguments(capsys):
    assert cli.main(["embed-products", "--batch-size", "0"]) == 2


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
