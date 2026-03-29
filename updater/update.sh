#!/usr/bin/env bash
# Flaque self-update script.
# Pulls latest code, rebuilds app containers, restarts them, and health-checks.
# Runs inside the updater sidecar container.

set -uo pipefail

REPO_DIR="${REPO_DIR:-/app/repo}"
LOCK_FILE="/tmp/flaque-update.lock"
STATUS_FILE="/app/data/logs/update-status.json"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-}"
HEALTH_URL="http://backend:4000/health"
HEALTH_RETRIES=40
HEALTH_WAIT=3

log() {
  printf "[%s] %s\n" "$(date -Iseconds)" "$1"
}

write_status() {
  local status="$1" message="${2:-}"
  printf '{"status":"%s","message":"%s","timestamp":"%s"}\n' \
    "$status" "$message" "$(date -Iseconds)" > "$STATUS_FILE"
}

cleanup() {
  rm -f "$LOCK_FILE"
}

compose() {
  if [ -n "$COMPOSE_PROJECT" ]; then
    docker compose -p "$COMPOSE_PROJECT" -f "${REPO_DIR}/docker-compose.prod.yml" --env-file "${REPO_DIR}/.env.production" "$@"
  else
    docker compose -f "${REPO_DIR}/docker-compose.prod.yml" --env-file "${REPO_DIR}/.env.production" "$@"
  fi
}

# ── Guard ─────────────────────────────────────────────────────────────

if [ -f "$LOCK_FILE" ]; then
  log "Update already in progress, aborting"
  exit 1
fi

touch "$LOCK_FILE"
trap cleanup EXIT

write_status "updating" "Starting update"
log "=== Flaque update started ==="

# ── 1. Pull latest code ──────────────────────────────────────────────

log "Pulling latest code from origin"
cd "$REPO_DIR"

if ! git fetch origin 2>&1; then
  log "ERROR: git fetch failed"
  write_status "failed" "git fetch failed"
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BEFORE_SHA="$(git rev-parse --short HEAD)"

if ! git reset --hard "origin/${CURRENT_BRANCH}" 2>&1; then
  log "ERROR: git reset failed"
  write_status "failed" "git reset failed"
  exit 1
fi

AFTER_SHA="$(git rev-parse --short HEAD)"
log "Code updated: ${BEFORE_SHA} -> ${AFTER_SHA} (branch: ${CURRENT_BRANCH})"

# ── 2. Tag current images for rollback ───────────────────────────────

log "Tagging current images for rollback"
docker tag flaque-backend:latest flaque-backend:rollback 2>/dev/null || true
docker tag flaque-frontend:latest flaque-frontend:rollback 2>/dev/null || true

# ── 3. Rebuild app images ────────────────────────────────────────────

log "Rebuilding backend and frontend images"
write_status "updating" "Building new images"

if ! compose build --pull backend frontend 2>&1; then
  log "ERROR: Image build failed"
  write_status "failed" "Image build failed"
  exit 1
fi

log "Images rebuilt successfully"

# ── 4. Recreate app containers ───────────────────────────────────────

log "Recreating backend and frontend containers"
write_status "updating" "Restarting services"

if ! compose up -d --no-deps --force-recreate backend frontend 2>&1; then
  log "ERROR: Failed to recreate containers"
  write_status "failed" "Container restart failed"
  exit 1
fi

log "Containers recreated"

# ── 5. Health check ──────────────────────────────────────────────────

log "Waiting for backend health check"
write_status "updating" "Waiting for health check"

healthy=false
for attempt in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    log "Backend healthy (attempt ${attempt}/${HEALTH_RETRIES})"
    healthy=true
    break
  fi
  sleep "$HEALTH_WAIT"
done

if [ "$healthy" = false ]; then
  log "ERROR: Backend failed health check after ${HEALTH_RETRIES} attempts"
  log "Rolling back to previous images"

  docker tag flaque-backend:rollback flaque-backend:latest 2>/dev/null || true
  docker tag flaque-frontend:rollback flaque-frontend:latest 2>/dev/null || true
  compose up -d --no-deps --force-recreate backend frontend 2>&1 || true

  write_status "failed" "Health check failed - rolled back to previous version"
  exit 1
fi

# ── 6. Done ──────────────────────────────────────────────────────────

log "=== Update complete: ${BEFORE_SHA} -> ${AFTER_SHA} ==="
write_status "complete" "Updated from ${BEFORE_SHA} to ${AFTER_SHA}"
