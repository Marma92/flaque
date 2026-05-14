#!/usr/bin/env bash
# Launch the audio-embedder sidecar.
#
# Phase 1: stdlib-only, no virtualenv required. Phase 2 will add a venv +
# requirements.txt installation step here.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$here/server.py" "$@"
