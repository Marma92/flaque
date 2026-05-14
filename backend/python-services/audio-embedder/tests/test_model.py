"""
Python-side unit tests for the stub model.

Run with: python3 -m unittest discover -s tests
(from the audio-embedder/ directory)
"""

from __future__ import annotations

import math
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from model import EMBEDDING_DIM, MODEL_NAME, embed_path  # noqa: E402


class StubModelTests(unittest.TestCase):
    def test_deterministic_for_same_path(self) -> None:
        a = embed_path("/tmp/example/track.mp3")
        b = embed_path("/tmp/example/track.mp3")
        self.assertEqual(a.vec, b.vec)
        self.assertEqual(a.model, MODEL_NAME)

    def test_different_paths_yield_different_vectors(self) -> None:
        a = embed_path("/tmp/a.mp3").vec
        b = embed_path("/tmp/b.mp3").vec
        self.assertNotEqual(a, b)

    def test_dimension_matches_constant(self) -> None:
        result = embed_path("/tmp/dim-check.mp3")
        self.assertEqual(result.dim, EMBEDDING_DIM)
        self.assertEqual(len(result.vec), EMBEDDING_DIM)

    def test_l2_normalised(self) -> None:
        vec = embed_path("/tmp/norm-check.mp3").vec
        norm = math.sqrt(sum(v * v for v in vec))
        self.assertAlmostEqual(norm, 1.0, places=6)

    def test_empty_path_rejected(self) -> None:
        with self.assertRaises(ValueError):
            embed_path("")


if __name__ == "__main__":
    unittest.main()
