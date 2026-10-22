"""Vector helpers: L2 normalisation, averaging and the pgvector text format.

Everything here is pure Python so it can be unit tested without torch, a GPU or a database.
"""

from __future__ import annotations

from collections.abc import Sequence


def l2_normalize(vec: Sequence[float]) -> list[float]:
    """Scale a vector to unit length. A zero vector is returned unchanged."""
    norm = sum(float(v) * float(v) for v in vec) ** 0.5
    if norm <= 0.0:
        return [float(v) for v in vec]
    return [float(v) / norm for v in vec]


def mean_vector(vectors: Sequence[Sequence[float]]) -> list[float]:
    """Element-wise mean of equally sized vectors. An empty input gives an empty vector."""
    if not vectors:
        return []
    dim = len(vectors[0])
    totals = [0.0] * dim
    for vec in vectors:
        for index in range(dim):
            totals[index] += float(vec[index])
    count = float(len(vectors))
    return [total / count for total in totals]


def normalized_mean(vectors: Sequence[Sequence[float]]) -> list[float]:
    """Mean of the vectors, L2-normalised (used for archetype centroids)."""
    return l2_normalize(mean_vector(vectors))


def to_pgvector(vec: Sequence[float]) -> str:
    """pgvector text form: ``"[0.1,-0.2,0.3]"`` (the form Postgres casts to halfvec)."""
    return "[" + ",".join(f"{float(v):.6g}" for v in vec) + "]"


def from_pgvector(text: str) -> list[float]:
    """Parse the text form Postgres returns for vector/halfvec columns."""
    body = text.strip().strip("[]")
    if not body:
        return []
    return [float(part) for part in body.split(",") if part.strip()]


def cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    """Cosine similarity of two vectors (assumed unit length, so this is the dot product)."""
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(float(x) * float(y) for x, y in zip(a, b, strict=True))
