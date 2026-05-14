"""
Phase-1 stub embedder.

Returns a deterministic 512-dim L2-normalised vector derived from a hash of
the input path. Lets us exercise the wire protocol end-to-end before pulling
in torch / transformers / CLAP weights in phase 2.

Shape and dimension match the planned CLAP output so the Node client and
on-disk sidecar format won't need to change when the model is swapped in.
"""

from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass
from pathlib import Path

EMBEDDING_DIM = 512
MODEL_NAME = "stub-deterministic-v1"


@dataclass
class EmbedResult:
    vec: list[float]
    dim: int
    model: str


def embed_path(absolute_path: str) -> EmbedResult:
    """
    Deterministic stub: same path in → same vector out. Does not read the file.
    Phase 2 swaps this for an actual CLAP forward pass.
    """
    if not absolute_path:
        raise ValueError("absolute_path must be a non-empty string")

    seed_int = int.from_bytes(
        hashlib.sha256(absolute_path.encode("utf-8")).digest()[:8],
        byteorder="big",
        signed=False,
    )
    rng = random.Random(seed_int)
    raw = [rng.gauss(0.0, 1.0) for _ in range(EMBEDDING_DIM)]
    norm = math.sqrt(sum(v * v for v in raw))
    if norm < 1e-12:
        raise RuntimeError("degenerate vector (norm ≈ 0); should be statistically impossible")
    vec = [v / norm for v in raw]
    return EmbedResult(vec=vec, dim=EMBEDDING_DIM, model=MODEL_NAME)


def path_is_reachable(absolute_path: str) -> bool:
    """
    Sanity-check helper used by the server before running the model. The stub
    doesn't actually read the file, but we still want to reject obviously bad
    inputs so phase-2 behaviour matches (CLAP *will* need to read the file).
    """
    try:
        return Path(absolute_path).is_file()
    except OSError:
        return False
