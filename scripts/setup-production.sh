#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
ENV_FILE="${ROOT_DIR}/.env.production"

COLOR_RESET="\033[0m"
COLOR_TITLE="\033[1;36m"
COLOR_STEP="\033[1;34m"
COLOR_OK="\033[1;32m"
COLOR_WARN="\033[1;33m"

print_title() {
  printf "${COLOR_TITLE}%s${COLOR_RESET}\n" "$1"
}

print_step() {
  printf "${COLOR_STEP}→ %s${COLOR_RESET}\n" "$1"
}

print_ok() {
  printf "${COLOR_OK}✓ %s${COLOR_RESET}\n" "$1"
}

print_warn() {
  printf "${COLOR_WARN}! %s${COLOR_RESET}\n" "$1"
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf "Missing required command: %s\n" "$command_name" >&2
    exit 1
  fi
}

prompt_with_default() {
  local prompt_label="$1"
  local default_value="$2"
  local result

  read -r -p "${prompt_label} [${default_value}]: " result
  if [[ -z "$result" ]]; then
    result="$default_value"
  fi

  printf "%s" "$result"
}

prompt_secret() {
  local prompt_label="$1"
  local secret
  local confirm

  while true; do
    read -r -s -p "${prompt_label}: " secret
    printf "\n"
    read -r -s -p "Confirm ${prompt_label}: " confirm
    printf "\n"

    if [[ -z "$secret" ]]; then
      print_warn "Value cannot be empty."
      continue
    fi

    if [[ "$secret" != "$confirm" ]]; then
      print_warn "Values do not match. Please retry."
      continue
    fi

    printf "%s" "$secret"
    return
  done
}

quote_env_literal() {
  local value="$1"
  value="${value//\'/\\\'}"
  printf "'%s'" "$value"
}

print_title "Flaque Production Setup"
printf "This script configures env vars, creates mount folders, builds images, initializes DB, and starts containers.\n\n"

print_step "Checking required tooling"
require_command docker
if ! docker compose version >/dev/null 2>&1; then
  printf "Docker Compose plugin is required (docker compose).\n" >&2
  exit 1
fi
print_ok "Docker + Compose detected"

print_step "Collecting deployment values"
DEFAULT_STORAGE_DIR="${HOME}/flaque/storage"
DEFAULT_STATE_DIR="${HOME}/flaque/state"
DEFAULT_FRONTEND_PORT="8080"
DEFAULT_BACKEND_PORT="4000"

STORAGE_DIR="$(prompt_with_default "Storage mount path (host -> /app/data/storage)" "${DEFAULT_STORAGE_DIR}")"
STATE_DIR="$(prompt_with_default "State mount root (host -> /app/data/{config,index,cache})" "${DEFAULT_STATE_DIR}")"
FRONTEND_PORT="$(prompt_with_default "Public frontend port" "${DEFAULT_FRONTEND_PORT}")"
BACKEND_PORT="$(prompt_with_default "Public backend port" "${DEFAULT_BACKEND_PORT}")"

DEFAULT_CORS_ORIGIN="http://localhost:${FRONTEND_PORT}"
CORS_ORIGIN="$(prompt_with_default "CORS origin for frontend" "${DEFAULT_CORS_ORIGIN}")"
ADMIN_USERNAME="$(prompt_with_default "Bootstrap admin username" "admin")"
ADMIN_PASSWORD="$(prompt_secret "Bootstrap admin password")"

if [[ -f "$ENV_FILE" ]]; then
  print_warn ".env.production already exists: ${ENV_FILE}"
  OVERWRITE="$(prompt_with_default "Overwrite existing .env.production? (yes/no)" "no")"
  if [[ "$OVERWRITE" != "yes" ]]; then
    printf "Aborted by user.\n"
    exit 1
  fi
fi

print_step "Creating host mount directories"
mkdir -p \
  "${STORAGE_DIR}" \
  "${STATE_DIR}/config" \
  "${STATE_DIR}/index" \
  "${STATE_DIR}/cache/covers" \
  "${STATE_DIR}/cache/transcodes" \
  "${STATE_DIR}/cache/tmp-uploads"
print_ok "Mount folders are ready"

print_step "Writing ${ENV_FILE}"
ADMIN_PASSWORD_LITERAL="$(quote_env_literal "${ADMIN_PASSWORD}")"
cat >"${ENV_FILE}" <<EOF
PORT=4000
CORS_ORIGIN=${CORS_ORIGIN}
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD_LITERAL}
SESSION_TTL_HOURS=168

FLAQUE_STORAGE_DIR=${STORAGE_DIR}
FLAQUE_STATE_DIR=${STATE_DIR}
FLAQUE_FRONTEND_PORT=${FRONTEND_PORT}
FLAQUE_BACKEND_PORT=${BACKEND_PORT}
EOF
print_ok "Environment file generated"

print_step "Building production containers"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" build
print_ok "Images built"

print_step "Initializing database and base runtime files"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" run --rm backend node backend/dist/scripts/initSystem.js
print_ok "Initialization complete"

print_step "Starting production stack"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d
print_ok "Stack is running"

printf "\n"
print_title "Deployment summary"
printf "Frontend: http://localhost:%s\n" "$FRONTEND_PORT"
printf "Backend : http://localhost:%s\n" "$BACKEND_PORT"
printf "Storage : %s\n" "$STORAGE_DIR"
printf "State   : %s\n" "$STATE_DIR"
