"""
Unit tests for the audio-embedder model helpers.

Phase 2 model.py imports torch + transformers at module load time, so these
tests must run from inside the venv populated by start.sh / requirements.txt.
The tests themselves intentionally avoid loading CLAP: that's an integration
concern with a ~10 s cold start and a ~600 MB weight download, neither of
which belongs in a unit-test loop.

Run with:
    ./.venv/bin/python -m unittest discover -s tests
(from backend/python-services/audio-embedder/)
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import numpy as np
    from model import (  # noqa: E402
        EMBEDDING_DIM,
        MODEL_NAME,
        NUM_WINDOWS,
        WINDOW_SAMPLES,
        _select_windows,
        embed_path,
        path_is_reachable,
    )

    DEPS_AVAILABLE = True
except ImportError as exc:
    DEPS_AVAILABLE = False
    _import_error = exc


@unittest.skipUnless(DEPS_AVAILABLE, "phase-2 deps not installed; activate the venv first")
class WindowingTests(unittest.TestCase):
    def test_short_audio_pads_to_one_window(self) -> None:
        audio = np.linspace(-1.0, 1.0, WINDOW_SAMPLES // 2, dtype=np.float32)
        windows = _select_windows(audio)
        self.assertEqual(len(windows), 1)
        self.assertEqual(windows[0].shape[0], WINDOW_SAMPLES)
        # First half should preserve the input; second half should be zero.
        np.testing.assert_array_equal(windows[0][: audio.size], audio)
        self.assertTrue(np.all(windows[0][audio.size :] == 0.0))

    def test_window_sized_audio_yields_one_window(self) -> None:
        audio = np.ones(WINDOW_SAMPLES, dtype=np.float32)
        windows = _select_windows(audio)
        self.assertEqual(len(windows), 1)
        np.testing.assert_array_equal(windows[0], audio)

    def test_long_audio_yields_num_windows(self) -> None:
        # 30 s synthetic noise → three 10 s windows.
        audio = np.random.RandomState(0).randn(WINDOW_SAMPLES * 3).astype(np.float32)
        windows = _select_windows(audio)
        self.assertEqual(len(windows), NUM_WINDOWS)
        for w in windows:
            self.assertEqual(w.shape[0], WINDOW_SAMPLES)
        # First window starts at 0, last window ends at the last sample.
        np.testing.assert_array_equal(windows[0], audio[:WINDOW_SAMPLES])
        np.testing.assert_array_equal(windows[-1], audio[-WINDOW_SAMPLES:])

    def test_empty_audio_raises(self) -> None:
        with self.assertRaises(ValueError):
            _select_windows(np.zeros(0, dtype=np.float32))


@unittest.skipUnless(DEPS_AVAILABLE, "phase-2 deps not installed; activate the venv first")
class PathHelperTests(unittest.TestCase):
    def test_existing_file_is_reachable(self) -> None:
        with tempfile.NamedTemporaryFile() as tmp:
            self.assertTrue(path_is_reachable(tmp.name))

    def test_missing_file_is_not_reachable(self) -> None:
        self.assertFalse(path_is_reachable("/nonexistent/at/all.mp3"))

    def test_empty_string_is_not_reachable(self) -> None:
        self.assertFalse(path_is_reachable(""))


@unittest.skipUnless(DEPS_AVAILABLE, "phase-2 deps not installed; activate the venv first")
class EmbedPathContractTests(unittest.TestCase):
    """
    Contract checks that don't require loading the actual CLAP model. These
    cover the validation branches before _load() is ever called.
    """

    def test_empty_path_rejected(self) -> None:
        with self.assertRaises(ValueError):
            embed_path("")

    def test_module_constants(self) -> None:
        self.assertEqual(EMBEDDING_DIM, 512)
        self.assertEqual(MODEL_NAME, "laion/clap-htsat-fused")


if __name__ == "__main__":
    if not DEPS_AVAILABLE:
        sys.stderr.write(
            f"phase-2 deps not importable ({_import_error}). "
            "Run start.sh once to create the venv, then re-run with "
            "./.venv/bin/python -m unittest discover -s tests\n"
        )
        sys.exit(1)
    unittest.main()
