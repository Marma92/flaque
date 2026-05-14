"""
CLAP-based audio embedder.

Wraps `laion/clap-htsat-fused` (Apache-2.0) from HuggingFace transformers
into a small, stateful module. The model is loaded once on first call and
kept resident for the lifetime of the process.

Output:
    - 512-dim L2-normalised vector.
    - Same vector space as CLAP's text encoder (RoBERTa side), so a future
      text-to-audio search feature works without re-embedding the library.

For tracks longer than the model's native 10 s window, we encode three
windows (start, middle, end), mean-pool the resulting embeddings, then
re-normalise. For shorter tracks, we zero-pad to 10 s. This is the standard
"global track representation" recipe in the CLAP literature.
"""

from __future__ import annotations

import logging
import math
import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from transformers import ClapModel, ClapProcessor

MODEL_NAME = "laion/clap-htsat-fused"
EMBEDDING_DIM = 512
SAMPLE_RATE = 48_000
WINDOW_SECONDS = 10
WINDOW_SAMPLES = SAMPLE_RATE * WINDOW_SECONDS
NUM_WINDOWS = 3

# Pin a single thread for inference — CLAP is small enough that multi-thread
# matmul overhead exceeds the gain on most laptop CPUs, and we'd rather leave
# cores free for the Node backend.
torch.set_num_threads(int(os.environ.get("EMBEDDER_TORCH_THREADS", "1")))

log = logging.getLogger("embedder.model")

_model: ClapModel | None = None
_processor: ClapProcessor | None = None


@dataclass
class EmbedResult:
    vec: list[float]
    dim: int
    model: str


def _load() -> tuple[ClapModel, ClapProcessor]:
    """
    Load model + processor lazily on first call. After this returns once,
    subsequent calls are a constant-time getter.
    """
    global _model, _processor
    if _model is None or _processor is None:
        log.info("Loading CLAP model: %s", MODEL_NAME)
        _processor = ClapProcessor.from_pretrained(MODEL_NAME)
        model = ClapModel.from_pretrained(MODEL_NAME)
        model.eval()
        _model = model
        log.info("CLAP model loaded")
    return _model, _processor


def _load_audio(absolute_path: str) -> np.ndarray:
    """
    Decode audio to mono 48 kHz float32 via librosa. Librosa pulls in soundfile
    + audioread; we import it lazily so phase-1 stub callers don't pay the cost.
    """
    import librosa

    audio, _ = librosa.load(absolute_path, sr=SAMPLE_RATE, mono=True)
    return audio.astype(np.float32, copy=False)


def _select_windows(audio: np.ndarray) -> list[np.ndarray]:
    """
    Slice the audio into NUM_WINDOWS fixed-length clips. Padding tracks
    shorter than WINDOW_SAMPLES is delegated to numpy; the processor would
    also pad, but doing it here makes the batch shape deterministic.
    """
    if audio.size == 0:
        raise ValueError("audio is empty after decoding")
    if audio.size <= WINDOW_SAMPLES:
        padded = np.zeros(WINDOW_SAMPLES, dtype=np.float32)
        padded[: audio.size] = audio
        return [padded]
    # NUM_WINDOWS evenly-spaced start indices, including 0 and (len - window).
    last_start = audio.size - WINDOW_SAMPLES
    starts = np.linspace(0, last_start, NUM_WINDOWS, dtype=np.int64)
    return [audio[s : s + WINDOW_SAMPLES] for s in starts]


def _encode_windows(windows: list[np.ndarray]) -> np.ndarray:
    """
    Batch-encode windows through CLAP's audio tower. Returns a (N, 512)
    float32 array.
    """
    model, processor = _load()
    inputs = processor(
        audios=windows,
        sampling_rate=SAMPLE_RATE,
        return_tensors="pt",
    )
    with torch.no_grad():
        features = model.get_audio_features(**inputs)
    return features.detach().cpu().numpy().astype(np.float32, copy=False)


def embed_path(absolute_path: str) -> EmbedResult:
    """
    Produce a single 512-dim embedding for the audio at `absolute_path`.
    Pure function from caller's view; mutates only the module-level model
    cache on first call.
    """
    if not absolute_path:
        raise ValueError("absolute_path must be a non-empty string")

    audio = _load_audio(absolute_path)
    windows = _select_windows(audio)
    per_window = _encode_windows(windows)

    pooled = per_window.mean(axis=0)
    norm = float(np.linalg.norm(pooled))
    if norm < 1e-12:
        raise RuntimeError("degenerate embedding (norm ≈ 0); CLAP returned zero vector?")
    vec = (pooled / norm).tolist()
    if len(vec) != EMBEDDING_DIM:
        raise RuntimeError(
            f"unexpected embedding dimension: got {len(vec)}, want {EMBEDDING_DIM}"
        )
    # math.isfinite guard: defensively reject NaN/Inf so we never persist a
    # corrupt vector. Should be unreachable after the norm check above.
    for v in vec:
        if not math.isfinite(v):
            raise RuntimeError("embedding contains non-finite values")
    return EmbedResult(vec=vec, dim=EMBEDDING_DIM, model=MODEL_NAME)


def path_is_reachable(absolute_path: str) -> bool:
    try:
        return Path(absolute_path).is_file()
    except OSError:
        return False


def warmup() -> None:
    """
    Optional pre-load. Lets the launcher pay the model-load cost (~10 s)
    before accepting requests, instead of on the first POST.
    """
    _load()
