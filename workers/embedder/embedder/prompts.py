"""Text prompts used by the offline embedder (venue vibes, look descriptions)."""

from __future__ import annotations

from collections.abc import Sequence


def vibe_sentence(name: str, city: str, category: str, vibe_tags: Sequence[str]) -> str:
    """One sentence describing a venue's vibe, embedded into the same space as the clothing."""
    parts = [part.strip() for part in [category, name, city] if part and part.strip()]
    tags = [tag.strip() for tag in vibe_tags if tag and tag.strip()]
    sentence = ", ".join(parts)
    if tags:
        sentence = f"{sentence}, {', '.join(tags)}" if sentence else ", ".join(tags)
    return f"a {sentence} place" if sentence else "a restaurant"


def look_description(brand: str, category: str, colors: Sequence[str]) -> str:
    """Short text description of a reference look (used for logging and fallbacks)."""
    bits = [bit for bit in [category, ", ".join(colors)] if bit]
    if brand:
        bits.insert(0, f"inspired by {brand}")
    return ", ".join(bits)
