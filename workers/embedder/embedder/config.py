"""Settings for batch jobs, read from the environment (repo-root .env when run locally)."""

from __future__ import annotations

import os
from dataclasses import dataclass

# Must match EMBEDDING_DIM in packages/shared/src/constants.ts and halfvec(768) in the schema.
EMBEDDING_DIM = 768
MODEL_NAME = "hf-hub:Marqo/marqo-fashionSigLIP"


class ConfigError(RuntimeError):
    """Raised when a required environment variable is missing."""


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    # Service-role / secret key: batch jobs write catalog embeddings (RLS: service role only).
    # Never commit it; never ship it to a browser.
    supabase_secret_key: str
    model_name: str = MODEL_NAME
    batch_size: int = 64
    device: str = "auto"  # "cuda" | "cpu" | "mps" | "auto"


def load_settings(env: dict[str, str] | None = None) -> Settings:
    env = dict(os.environ if env is None else env)
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SECRET_KEY") if not env.get(k)]
    if missing:
        raise ConfigError(f"Missing required environment variables: {', '.join(missing)}")
    return Settings(
        supabase_url=env["SUPABASE_URL"],
        supabase_secret_key=env["SUPABASE_SECRET_KEY"],
        model_name=env.get("EMBEDDER_MODEL", MODEL_NAME),
        batch_size=int(env.get("EMBEDDER_BATCH_SIZE", "64")),
        device=env.get("EMBEDDER_DEVICE", "auto"),
    )
