"""Image download and decode helpers.

Product images are fetched from the merchant CDN into a temp folder, embedded and discarded.
User photos are never copied here: the wardrobe job streams them from a signed URL.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

MAX_IMAGE_BYTES = 12 * 1024 * 1024
USER_AGENT = "dafitmatch-embedder/1.0"


class ImageError(RuntimeError):
    """Raised when an image cannot be downloaded or decoded."""


def download_image(
    url: str,
    dest: Path,
    *,
    timeout: float = 20.0,
    max_bytes: int = MAX_IMAGE_BYTES,
) -> Path:
    """Download an image to ``dest``. Raises ImageError when it is missing or too large."""
    import httpx

    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        with httpx.stream(
            "GET",
            url,
            timeout=timeout,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
        ) as response:
            response.raise_for_status()
            total = 0
            with dest.open("wb") as handle:
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > max_bytes:
                        raise ImageError(f"image exceeds {max_bytes} bytes: {url}")
                    handle.write(chunk)
    except httpx.HTTPError as exc:  # network error, bad status, timeout
        raise ImageError(f"could not download {url}: {exc}") from exc
    return dest


def open_image(path: Path) -> Any:
    """Open an image file and convert it to RGB (Pillow is imported lazily)."""
    from PIL import Image

    try:
        with Image.open(path) as image:
            return image.convert("RGB")
    except OSError as exc:
        raise ImageError(f"could not decode {path}: {exc}") from exc


def image_extension(url: str) -> str:
    """Guess a file extension from a URL, defaulting to ``.jpg``."""
    tail = url.split("?")[0].rsplit("/", 1)[-1]
    for ext in (".jpg", ".jpeg", ".png", ".webp", ".avif"):
        if tail.lower().endswith(ext):
            return ext
    return ".jpg"
