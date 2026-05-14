#!/usr/bin/env bash
# Launch the audio-embedder sidecar.
#
# On first run, creates a .venv next to this script, installs the pinned
# requirements (torch CPU + transformers + librosa, ~1.2 GB on disk + ~600 MB
# for CLAP weights in ~/.cache/huggingface/ on first model load).
#
# Subsequent runs reuse the venv and start in a couple of seconds, plus the
# ~10 s CLAP load itself.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
venv="$here/.venv"
req="$here/requirements.txt"

if [[ ! -x "$venv/bin/python" ]]; then
  echo "[embedder] no venv at $venv — creating it" >&2
  python3 -m venv "$venv"
fi

# Install / refresh deps if the requirements have changed since the last run.
# Cheap idempotency: hash the requirements file and compare against a marker.
req_hash="$(sha256sum "$req" | cut -d' ' -f1)"
marker="$venv/.requirements.sha256"
if [[ ! -f "$marker" || "$(cat "$marker")" != "$req_hash" ]]; then
  echo "[embedder] installing pinned deps from $req" >&2
  "$venv/bin/pip" install --upgrade pip >/dev/null
  "$venv/bin/pip" install -r "$req"
  echo "$req_hash" > "$marker"
fi

exec "$venv/bin/python" "$here/server.py" "$@"
