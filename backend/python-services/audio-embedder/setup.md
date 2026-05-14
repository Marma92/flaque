# audio-embedder sidecar

Local-only HTTP service that produces audio embeddings on request. Lives next
to the Node backend because nothing else is going to call it — same machine,
same lifecycle.

## Status

**Phase 1 — stub.** Returns a deterministic 512-dim vector derived from a
hash of the requested path. No audio is decoded, no model is loaded. The
purpose is to validate the wire protocol between Node and Python before we
pull in torch / transformers in phase 2.

## Run it

```
./start.sh
```

Listens on `http://127.0.0.1:7001` by default. Override with `EMBEDDER_HOST`
and `EMBEDDER_PORT` env vars.

Requires Python ≥ 3.10. No `pip install` needed in phase 1 — stdlib only.

## Endpoints

### `GET /healthz`

```
$ curl -s http://127.0.0.1:7001/healthz
{"ok": true, "model": "stub-deterministic-v1"}
```

### `POST /embed`

```
$ curl -s -X POST http://127.0.0.1:7001/embed \
    -H 'Content-Type: application/json' \
    -d '{"absolutePath": "/path/to/some/track.mp3"}'
{"vec": [0.0123, ...], "dim": 512, "model": "stub-deterministic-v1"}
```

The path must exist on disk. The stub does not actually read the file — it
only checks reachability so phase-1 behaviour matches what phase 2 will
require (CLAP needs to read the audio).

Errors:

| Status | Body                                       | Meaning                          |
|--------|--------------------------------------------|----------------------------------|
| 400    | `{ error: "missing_absolutePath" }`        | Body missing or wrong type       |
| 400    | `{ error: "invalid_json" }`                | Body not valid JSON              |
| 404    | `{ error: "file_not_found" }`              | Path doesn't resolve to a file   |
| 500    | `{ error: "embed_failed", detail: "..." }` | Anything raised inside the model |

## What changes in phase 2

- `requirements.txt` gains torch, torchaudio, transformers, soundfile.
- `model.py` swaps the deterministic stub for `laion/clap-htsat-fused`.
- `start.sh` creates and activates a venv, installs deps on first run.
- This doc gets a real "system requirements" section (RAM, cold-start time).
