"""
Audio-embedder HTTP sidecar.

Phase 1: stdlib http.server only — no FastAPI / uvicorn dependency until we
actually need them in phase 2 (real CLAP needs torch + transformers, at which
point a real ASGI server is justified). For now the surface area is tiny:

    GET  /healthz       → { ok: true, model: "..." }
    POST /embed         → { vec: [...], dim: 512, model: "..." }
                          body: { absolutePath: "/abs/path/to/file" }

Bind: 127.0.0.1:7001 by default (loopback only). Override with EMBEDDER_HOST
and EMBEDDER_PORT env vars.
"""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

# Allow `python server.py` from the package dir and from the repo root.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from model import MODEL_NAME, embed_path, path_is_reachable, warmup

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 7001
MAX_BODY_BYTES = 64 * 1024


class EmbedderHandler(BaseHTTPRequestHandler):
    server_version = "FlaqueEmbedder/0.1"

    def _send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt: str, *args) -> None:
        # Quieter default logging; the parent process can capture stdout.
        sys.stderr.write("[embedder] " + (fmt % args) + "\n")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/healthz":
            self._send_json(200, {"ok": True, "model": MODEL_NAME})
            return
        self._send_json(404, {"error": "not_found", "path": parsed.path})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/embed":
            self._send_json(404, {"error": "not_found", "path": parsed.path})
            return

        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            self._send_json(400, {"error": "invalid_content_length"})
            return

        if length <= 0 or length > MAX_BODY_BYTES:
            self._send_json(400, {"error": "invalid_body_size", "length": length})
            return

        try:
            raw = self.rfile.read(length)
            body = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            self._send_json(400, {"error": "invalid_json", "detail": str(exc)})
            return

        absolute_path = body.get("absolutePath") if isinstance(body, dict) else None
        if not isinstance(absolute_path, str) or not absolute_path:
            self._send_json(400, {"error": "missing_absolutePath"})
            return

        if not path_is_reachable(absolute_path):
            self._send_json(404, {"error": "file_not_found", "absolutePath": absolute_path})
            return

        try:
            result = embed_path(absolute_path)
        except Exception as exc:
            self._send_json(500, {"error": "embed_failed", "detail": str(exc)})
            return

        self._send_json(200, {"vec": result.vec, "dim": result.dim, "model": result.model})


def main() -> None:
    host = os.environ.get("EMBEDDER_HOST", DEFAULT_HOST)
    try:
        port = int(os.environ.get("EMBEDDER_PORT", str(DEFAULT_PORT)))
    except ValueError:
        sys.stderr.write(f"[embedder] invalid EMBEDDER_PORT, falling back to {DEFAULT_PORT}\n")
        port = DEFAULT_PORT

    if os.environ.get("EMBEDDER_WARMUP", "1") not in ("0", "false", "no", ""):
        sys.stderr.write("[embedder] warming up model (this can take ~10 s)\n")
        try:
            warmup()
            sys.stderr.write("[embedder] model warm\n")
        except Exception as exc:  # noqa: BLE001 — surface any startup error
            sys.stderr.write(f"[embedder] warmup failed: {exc}\n")
            sys.exit(2)

    server = ThreadingHTTPServer((host, port), EmbedderHandler)
    sys.stderr.write(f"[embedder] listening on http://{host}:{port} (model={MODEL_NAME})\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.stderr.write("[embedder] shutting down\n")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
