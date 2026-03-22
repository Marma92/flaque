#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_WRAPPER="${ROOT_DIR}/scripts/compose-production.sh"

if [[ ! -x "${COMPOSE_WRAPPER}" ]]; then
  printf "Missing compose wrapper: %s\n" "${COMPOSE_WRAPPER}" >&2
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

bash "${COMPOSE_WRAPPER}" run --rm \
  -e NEW_ADMIN_PASSWORD="${PASSWORD}" \
  backend node backend/dist/scripts/resetAdminPassword.js --username "${USERNAME}"

printf "Admin password reset completed for '%s'.\n" "${USERNAME}"
