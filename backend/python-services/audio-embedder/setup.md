# audio-embedder sidecar

Local-only HTTP service that produces 512-dim audio embeddings using
CLAP (`laion/clap-htsat-fused`, Apache-2.0). Lives next to the Node backend
because nothing else is going to call it — same machine, same lifecycle.

## Status

**Phase 2 — real model.** Returns CLAP's 512-dim joint-space embedding for
the audio at the requested path. Loaded once at startup; subsequent requests
share the resident model. Not yet wired into production embedding code
(`computeAndSaveEmbedding` still uses the in-process MFCC pipeline). Phase 3
swaps the production call site.

## System requirements

- Python ≥ 3.10 (tested on 3.12).
- ~1.2 GB disk for the venv (torch CPU + transformers + librosa).
- ~600 MB disk for CLAP weights (cached under `~/.cache/huggingface/`).
- ~1 GB resident RAM while running.
- ffmpeg installed at the OS level (librosa pulls it in for non-WAV formats).

## Run it

```
./start.sh
```

First run creates a `.venv/` here and installs the pinned deps from
`requirements.txt`. Subsequent runs reuse the venv and start in seconds,
plus the ~10 s CLAP load (logged as "warming up model" then "model warm").

Override host/port via env vars: `EMBEDDER_HOST`, `EMBEDDER_PORT`.
Defaults to `127.0.0.1:7001`. The Node backend reads
`AUDIO_EMBEDDER_URL` (default `http://127.0.0.1:7001`).

Set `EMBEDDER_WARMUP=0` to skip the eager model load (first POST pays it
instead) — useful for unit testing the HTTP surface without sitting through
the warmup.

## Endpoints

### `GET /healthz`

```
$ curl -s http://127.0.0.1:7001/healthz
{"ok": true, "model": "laion/clap-htsat-fused"}
```

### `POST /embed`

```
$ curl -s -X POST http://127.0.0.1:7001/embed \
    -H 'Content-Type: application/json' \
    -d '{"absolutePath": "/abs/path/to/track.mp3"}'
{"vec": [0.0123, ...], "dim": 512, "model": "laion/clap-htsat-fused"}
```

For tracks longer than 10 s, the model receives three evenly-spaced 10 s
windows; the resulting embeddings are mean-pooled and L2-normalised so
cosine similarity remains a meaningful comparator. Tracks shorter than 10 s
are zero-padded.

Errors:

| Status | Body                                       | Meaning                          |
|--------|--------------------------------------------|----------------------------------|
| 400    | `{ error: "missing_absolutePath" }`        | Body missing or wrong type       |
| 400    | `{ error: "invalid_json" }`                | Body not valid JSON              |
| 404    | `{ error: "file_not_found" }`              | Path doesn't resolve to a file   |
| 500    | `{ error: "embed_failed", detail: "..." }` | Decode or inference failure      |

## Tests

```
./.venv/bin/python -m unittest discover -s tests -v
```

Covers windowing math, path-reachability helper, contract validation. Does
*not* load the CLAP model — that's reserved for the sanity check below.

## Sanity check (manual, phase 2 acceptance)

The eval bar for phase 2 is: pick ~10 track pairs and confirm cosine
ordering matches musical intuition. There is no automated scorer for this;
the operator hears the result and makes the call.

Suggested procedure:

1. Start the sidecar (`./start.sh`); wait for "model warm".
2. From the backend root, run `npm run embed:probe -- /abs/path/track.mp3`
   for ~10 tracks. Copy each returned vector into a scratch file.
3. Compute cosine similarity between selected pairs (a small ad-hoc Python
   REPL is fine). Sanity expectations:
   - Two tracks by the same artist from the same album: high (≥ 0.6).
   - Same genre, different artists: moderate (~0.3–0.6).
   - Wildly different styles (e.g. classical vs. extreme metal): low
     (< 0.2).
4. If ordering disagrees with a human listener in obvious ways, log the
   counterexamples and discuss before proceeding to phase 3.

## Memory-leak smoke test

CLAP allocates lazily during the first few inferences. After ~10 warm-up
calls, RSS should stabilise. To verify:

```
pid=$(pgrep -f python-services/audio-embedder/server.py)
ps -o rss= -p "$pid"          # before
for i in $(seq 1 100); do
  npm run --silent embed:probe -- /abs/path/to/some/track.mp3 > /dev/null
done
ps -o rss= -p "$pid"          # after
```

A small bump on the first ~10 calls is expected; sustained growth past
that indicates a leak (file an issue with the request pattern that
triggered it).
