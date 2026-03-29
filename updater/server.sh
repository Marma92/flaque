#!/usr/bin/env bash
# Minimal HTTP server for the flaque updater sidecar.
# Accepts one connection at a time via socat, dispatches to handler logic.

set -euo pipefail

PORT="${UPDATER_PORT:-9090}"
LOCK_FILE="/tmp/flaque-update.lock"
STATUS_FILE="/app/data/logs/update-status.json"

# ── HTTP helpers ──────────────────────────────────────────────────────

send_response() {
  local code="$1" body="$2" status_text="OK"
  case "$code" in
    200) status_text="OK" ;;
    202) status_text="Accepted" ;;
    403) status_text="Forbidden" ;;
    404) status_text="Not Found" ;;
    409) status_text="Conflict" ;;
    500) status_text="Internal Server Error" ;;
  esac
  printf "HTTP/1.1 %s %s\r\nContent-Type: application/json\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s" \
    "$code" "$status_text" "${#body}" "$body"
}

# ── Request handler (called by socat for each connection) ─────────────

handle_connection() {
  local method="" path="" content_length=0 body="" line

  read -r line
  method="$(echo "$line" | awk '{print $1}')"
  path="$(echo "$line" | awk '{print $2}')"

  while read -r line; do
    line="${line%%$'\r'}"
    [ -z "$line" ] && break
    if echo "$line" | grep -qi "^content-length:"; then
      content_length="$(echo "$line" | awk '{print $2}' | tr -d '\r\n')"
    fi
  done

  if [ "$content_length" -gt 0 ] 2>/dev/null; then
    body="$(head -c "$content_length")"
  fi

  if [ "$method" = "POST" ] && [ "$path" = "/update" ]; then
    local secret
    secret="$(echo "$body" | jq -r '.secret // empty' 2>/dev/null || true)"

    if [ -z "${UPDATE_SECRET:-}" ]; then
      send_response 500 '{"error":"UPDATE_SECRET not configured"}'
      return
    fi
    if [ "$secret" != "$UPDATE_SECRET" ]; then
      send_response 403 '{"error":"invalid secret"}'
      return
    fi
    if [ -f "$LOCK_FILE" ]; then
      send_response 409 '{"error":"update already in progress"}'
      return
    fi

    send_response 202 '{"status":"updating"}'

    nohup bash /app/update.sh >> /app/data/logs/updater.log 2>&1 &

  elif [ "$method" = "GET" ] && [ "$path" = "/status" ]; then
    if [ -f "$STATUS_FILE" ]; then
      send_response 200 "$(cat "$STATUS_FILE")"
    elif [ -f "$LOCK_FILE" ]; then
      send_response 200 '{"status":"updating"}'
    else
      send_response 200 '{"status":"idle"}'
    fi

  else
    send_response 404 '{"error":"not found"}'
  fi
}

# ── Entrypoint ────────────────────────────────────────────────────────

if [ "${1:-}" = "--handle" ]; then
  handle_connection
  exit 0
fi

echo "[updater] Listening on port ${PORT}"

# socat forks and calls this script with --handle for each connection
exec socat "TCP-LISTEN:${PORT},reuseaddr,fork" "EXEC:/app/server.sh --handle"
