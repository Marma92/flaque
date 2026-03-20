#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
ENV_FILE="${ROOT_DIR}/.env.production"

if [[ ! -f "${ENV_FILE}" ]]; then
  printf "Missing env file: %s\n" "${ENV_FILE}" >&2
  exit 1
fi

printf "This will delete and recreate the auth database (users + sessions).\n"
read -r -p "Type 'reset-auth-db' to continue: " CONFIRM

if [[ "${CONFIRM}" != "reset-auth-db" ]]; then
  printf "Aborted.\n"
  exit 1
fi

docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" run --rm \
  backend node backend/dist/scripts/resetAuthDatabase.js

printf "Auth database reset completed.\n"
