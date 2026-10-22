import math

from embedder.vectors import (
    cosine_similarity,
    from_pgvector,
    l2_normalize,
    mean_vector,
    normalized_mean,
    to_pgvector,
)


def test_l2_normalize_gives_unit_length():
    vec = l2_normalize([3.0, 4.0])
    assert math.isclose(math.sqrt(sum(v * v for v in vec)), 1.0, rel_tol=1e-9)


def test_l2_normalize_keeps_zero_vector():
    assert l2_normalize([0.0, 0.0]) == [0.0, 0.0]


def test_mean_vector_is_element_wise():
    assert mean_vector([[1.0, 2.0], [3.0, 4.0]]) == [2.0, 3.0]


def test_mean_vector_of_nothing_is_empty():
    assert mean_vector([]) == []


def test_normalized_mean_is_unit_length():
    vec = normalized_mean([[1.0, 0.0], [0.0, 1.0]])
    assert math.isclose(vec[0], vec[1], rel_tol=1e-9)
    assert math.isclose(math.sqrt(sum(v * v for v in vec)), 1.0, rel_tol=1e-9)


def test_pgvector_round_trip():
    text = to_pgvector([0.1, -0.25, 0.5])
    assert text.startswith("[") and text.endswith("]")
    assert from_pgvector(text) == [0.1, -0.25, 0.5]


def test_pgvector_has_no_spaces():
    assert " " not in to_pgvector([0.1, 0.2])


def test_cosine_similarity_of_unit_vectors():
    assert math.isclose(cosine_similarity([1.0, 0.0], [1.0, 0.0]), 1.0)
    assert math.isclose(cosine_similarity([1.0, 0.0], [0.0, 1.0]), 0.0)


def test_cosine_similarity_of_different_lengths_is_zero():
    assert cosine_similarity([1.0], [1.0, 0.0]) == 0.0
