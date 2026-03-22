#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_WRAPPER="${ROOT_DIR}/scripts/compose-production.sh"

if [[ ! -x "${COMPOSE_WRAPPER}" ]]; then
  printf "Missing compose wrapper: %s\n" "${COMPOSE_WRAPPER}" >&2
  exit 1
fi

printf "This will delete and recreate the auth database (users + sessions).\n"
read -r -p "Type 'reset-auth-db' to continue: " CONFIRM

if [[ "${CONFIRM}" != "reset-auth-db" ]]; then
  printf "Aborted.\n"
  exit 1
fi

bash "${COMPOSE_WRAPPER}" run --rm \
  backend node backend/dist/scripts/resetAuthDatabase.js

printf "Auth database reset completed.\n"
