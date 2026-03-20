#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
ENV_FILE="${ROOT_DIR}/.env.production"

if [[ ! -f "${ENV_FILE}" ]]; then
  printf "Missing env file: %s\n" "${ENV_FILE}" >&2
  exit 1
fi

USERNAME="${1:-${ADMIN_USERNAME:-admin}}"

if [[ -z "${USERNAME}" ]]; then
  printf "Username cannot be empty.\n" >&2
  exit 1
fi

read -r -s -p "New password for '${USERNAME}': " PASSWORD
printf "\n"
read -r -s -p "Confirm password: " CONFIRM
printf "\n"

if [[ -z "${PASSWORD}" ]]; then
  printf "Password cannot be empty.\n" >&2
  exit 1
fi

if [[ "${PASSWORD}" != "${CONFIRM}" ]]; then
  printf "Passwords do not match.\n" >&2
  exit 1
fi

docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" run --rm \
  -e NEW_ADMIN_PASSWORD="${PASSWORD}" \
  backend node backend/dist/scripts/resetAdminPassword.js --username "${USERNAME}"

printf "Admin password reset completed for '%s'.\n" "${USERNAME}"
