"""
Manual sanity check for embedder output.

Calls the running sidecar (POST /embed) for a set of tracks supplied on the
CLI, then prints a cosine-similarity matrix. Operator inspects the matrix
and decides whether the ordering matches musical intuition.

This script is intentionally minimal — no scoring, no thresholds, no
pass/fail return code. The phase-2 acceptance gate from setup.md asks for
a human judgement, and this is the scaffolding that makes that judgement
easy to make.

Usage:
    .venv/bin/python sanity_check.py \\
        pf_a=/abs/path/to/floyd/track1.flac \\
        pf_b=/abs/path/to/floyd/track2.flac \\
        metal=/abs/path/to/architects/track.flac

Each argument is `label=path`. Labels appear in the matrix axes; keep them
short (≤ 5 chars renders cleanest). If you omit the `label=` prefix, the
filename stem is used.

Reads AUDIO_EMBEDDER_URL from the environment (default http://127.0.0.1:7001),
same as the Node client.
"""

from __future__ import annotations

import json
import math
import os
import sys
import urllib.request
from pathlib import Path

EMBEDDER_URL = os.environ.get("AUDIO_EMBEDDER_URL", "http://127.0.0.1:7001")


def embed(absolute_path: str) -> list[float]:
    body = json.dumps({"absolutePath": absolute_path}).encode("utf-8")
    req = urllib.request.Request(
        f"{EMBEDDER_URL}/embed",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read())
    return payload["vec"]


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na > 0 and nb > 0 else 0.0


def parse_spec(spec: str) -> tuple[str, str]:
    if "=" in spec:
        label, path = spec.split("=", 1)
    else:
        path = spec
        label = Path(spec).stem[:8]
    return label, path


def main(specs: list[str]) -> int:
    if not specs:
        sys.stderr.write(__doc__ or "")
        return 1

    pairs = [parse_spec(s) for s in specs]
    print(f"[sanity] embedding {len(pairs)} tracks via {EMBEDDER_URL} ...")

    vectors: dict[str, list[float]] = {}
    for label, path in pairs:
        if not os.path.isfile(path):
            print(f"  ! skip {label}: file missing ({path})")
            continue
        try:
            vec = embed(path)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! fail {label}: {exc}")
            continue
        vectors[label] = vec
        print(f"  ok {label} (norm={math.sqrt(sum(v * v for v in vec)):.4f})")

    if len(vectors) < 2:
        print("[sanity] need ≥ 2 successful embeddings to compare")
        return 2

    labels = list(vectors.keys())
    width = max(len(l) for l in labels)
    print()
    print(" " * (width + 2) + "  ".join(f"{l:>5.5}" for l in labels))
    for a in labels:
        row = [f"{cosine(vectors[a], vectors[b]):+.2f}" for b in labels]
        print(f"{a:<{width}}  " + "  ".join(f"{v:>5}" for v in row))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
