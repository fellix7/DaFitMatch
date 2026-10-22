"""Marqo-FashionSigLIP encoder.

One shared 768-dim space for product images, reference looks, archetypes, wardrobe items and
venue vibes (ADR 0002). torch / open_clip are imported lazily so that `--help`, lint and the
unit tests work without the GPU stack installed.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any

from .config import MODEL_NAME
from .vectors import l2_normalize


class Encoder:
    """Thin wrapper around open_clip's FashionSigLIP checkpoint."""

    def __init__(
        self,
        model_name: str = MODEL_NAME,
        device: str = "auto",
        batch_size: int = 64,
    ) -> None:
        self.model_name = model_name
        self.device = device
        self.batch_size = max(1, batch_size)
        self._model: Any = None
        self._preprocess: Any = None
        self._tokenizer: Any = None
        self._torch: Any = None
        self._resolved_device: str | None = None

    # ── model loading ───────────────────────────────────────────────────────
    def resolve_device(self) -> str:
        """`auto` picks cuda, then mps, then cpu."""
        if self.device != "auto":
            return self.device
        if self._resolved_device:
            return self._resolved_device
        import torch

        if torch.cuda.is_available():
            self._resolved_device = "cuda"
        elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            self._resolved_device = "mps"
        else:
            self._resolved_device = "cpu"
        return self._resolved_device

    def load(self) -> None:
        """Load the checkpoint (idempotent)."""
        if self._model is not None:
            return
        import open_clip
        import torch

        model, _, preprocess = open_clip.create_model_and_transforms(self.model_name)
        model.eval()
        model = model.to(self.resolve_device())
        self._model = model
        self._preprocess = preprocess
        self._tokenizer = open_clip.get_tokenizer(self.model_name)
        self._torch = torch

    # ── encoding ────────────────────────────────────────────────────────────
    def encode_images(self, images: Sequence[Any]) -> list[list[float]]:
        """Embed already-decoded PIL images (one vector per image)."""
        if not images:
            return []
        self.load()
        assert self._model is not None
        assert self._preprocess is not None

        out: list[list[float]] = []
        for start in range(0, len(images), self.batch_size):
            chunk = images[start : start + self.batch_size]
            tensor = self._torch.stack([self._preprocess(image) for image in chunk])
            tensor = tensor.to(self.resolve_device())
            with self._torch.no_grad():
                features = self._model.encode_image(tensor, normalize=True)
            out.extend(l2_normalize(v) for v in features.float().cpu().tolist())
        return out

    def encode_image_paths(self, paths: Sequence[Path]) -> list[list[float]]:
        """Decode and embed image files from disk."""
        from .images import open_image

        return self.encode_images([open_image(Path(path)) for path in paths])

    def encode_texts(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed text prompts (venue vibes, look descriptions)."""
        if not texts:
            return []
        self.load()
        assert self._model is not None
        assert self._tokenizer is not None

        tokens = self._tokenizer(list(texts)).to(self.resolve_device())
        with self._torch.no_grad():
            features = self._model.encode_text(tokens, normalize=True)
        return [l2_normalize(v) for v in features.float().cpu().tolist()]
