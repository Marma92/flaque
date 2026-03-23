#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
ENV_FILE="${ROOT_DIR}/.env.production"
COMPOSE_CMD=()

COLOR_RESET="\033[0m"
COLOR_TITLE="\033[1;36m"
COLOR_STEP="\033[1;34m"
COLOR_OK="\033[1;32m"
COLOR_WARN="\033[1;33m"

print_title() {
  printf "${COLOR_TITLE}%s${COLOR_RESET}\n" "$1"
}

print_step() {
  printf "${COLOR_STEP}-> %s${COLOR_RESET}\n" "$1"
}

print_ok() {
  printf "${COLOR_OK}OK %s${COLOR_RESET}\n" "$1"
}

print_warn() {
  printf "${COLOR_WARN}WARN %s${COLOR_RESET}\n" "$1" >&2
}

abort() {
  printf "Error: %s\n" "$1" >&2
  exit 1
}

compose() {
  "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@"
}

wait_for_http_ok() {
  local url="$1"
  local label="$2"
  local retries="${3:-40}"
  local wait_seconds="${4:-2}"
  local attempt

  for ((attempt = 1; attempt <= retries; attempt += 1)); do
    if curl -fsS --max-time 3 "${url}" >/dev/null 2>&1; then
      print_ok "${label} reachable"
      return
    fi
    sleep "${wait_seconds}"
  done

  abort "${label} did not become reachable: ${url}"
}

show_compose_diagnostics() {
  print_warn "Docker compose status:"
  compose ps || true
  print_warn "Recent service logs:"
  compose logs --no-color --tail=120 || true
}

# ── Pre-flight checks ─────────────────────────────────────────────────

print_title "Flaque Production Update"
printf "This script rebuilds container images and restarts the stack.\n"
printf "Storage, database and configuration are preserved.\n\n"

[[ -f "${COMPOSE_FILE}" ]] || abort "Missing compose file: ${COMPOSE_FILE}"
[[ -f "${ENV_FILE}" ]] || abort "Missing env file: ${ENV_FILE}. Run 'npm run prod:setup' first."

print_step "Checking required tooling"

if ! command -v docker >/dev/null 2>&1; then
  abort "Missing required command: docker"
fi

if ! command -v curl >/dev/null 2>&1; then
  abort "Missing required command: curl"
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  abort "Docker Compose is required (docker compose or docker-compose)"
fi

if ! docker info >/dev/null 2>&1; then
  abort "Docker daemon is not reachable. Check docker service/context and retry."
fi

print_ok "Docker + Compose detected (${COMPOSE_CMD[*]})"

# ── Read ports from env file for health checks ────────────────────────

BACKEND_PORT="$(grep -E '^FLAQUE_BACKEND_PORT=' "${ENV_FILE}" | cut -d= -f2- || true)"
FRONTEND_PORT="$(grep -E '^FLAQUE_FRONTEND_PORT=' "${ENV_FILE}" | cut -d= -f2- || true)"
BACKEND_PORT="${BACKEND_PORT:-4000}"
FRONTEND_PORT="${FRONTEND_PORT:-8080}"

# ── Rebuild images ────────────────────────────────────────────────────

print_step "Rebuilding production container images"
compose build --pull
print_ok "Images rebuilt"

# ── Restart stack ─────────────────────────────────────────────────────

print_step "Stopping current stack"
compose down --remove-orphans
print_ok "Stack stopped"

print_step "Starting updated stack"
if ! compose up -d --remove-orphans; then
  show_compose_diagnostics
  abort "Failed to start production stack"
fi
print_ok "Stack is running"

# ── Health checks ─────────────────────────────────────────────────────

print_step "Running post-update health checks"
wait_for_http_ok "http://localhost:${BACKEND_PORT}/health" "Backend health endpoint"
wait_for_http_ok "http://localhost:${FRONTEND_PORT}" "Frontend endpoint"

printf "\n"
print_title "Update complete"
printf "Frontend: http://localhost:%s\n" "${FRONTEND_PORT}"
printf "Backend : http://localhost:%s\n" "${BACKEND_PORT}"
printf "Storage and database were not modified.\n"
