#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"
ENV_FILE="${ROOT_DIR}/.env.production"
COMPOSE_CMD=()

DEFAULT_STORAGE_DIR="${HOME}/flaque/storage"
DEFAULT_STATE_DIR="${HOME}/flaque/state"
DEFAULT_FRONTEND_PORT="8080"
DEFAULT_BACKEND_PORT="4000"
DEFAULT_ADMIN_USERNAME="admin"
DEFAULT_ADMIN_PASSWORD="change-me"
DEFAULT_SESSION_COOKIE_SECURE="no"
DEFAULT_HTTP_REQUEST_TIMEOUT_MS="0"
DEFAULT_HTTP_SOCKET_TIMEOUT_MS="0"

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
  if [[ "${#COMPOSE_CMD[@]}" -eq 0 ]]; then
    abort "Compose command is not initialized"
  fi

  "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@"
}

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    abort "Missing required command: ${command_name}"
  fi
}

trim_carriage_return() {
  local value="$1"
  printf "%s" "${value//$'\r'/}"
}

trim_whitespace() {
  local value
  value="$(trim_carriage_return "$1")"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf "%s" "${value}"
}

expand_home_path() {
  local value="$1"
  case "${value}" in
    "~")
      printf "%s" "${HOME}"
      ;;
    "~/"*)
      printf "%s/%s" "${HOME}" "${value#~/}"
      ;;
    *)
      printf "%s" "${value}"
      ;;
  esac
}

to_absolute_path() {
  local value
  value="$(expand_home_path "$1")"
  if [[ "${value}" == /* ]]; then
    printf "%s" "${value}"
    return
  fi

  printf "%s/%s" "${ROOT_DIR}" "${value}"
}

read_prompt_value() {
  local prompt_label="$1"
  local secret_input="$2"
  local result=""

  if [[ "${secret_input}" == "yes" && -t 0 ]]; then
    read -r -s -p "${prompt_label}" result
    printf "\n"
  else
    read -r -p "${prompt_label}" result
  fi

  trim_carriage_return "${result}"
}

prompt_with_default() {
  local prompt_label="$1"
  local default_value="$2"
  local trim_mode="${3:-trim}"
  local result

  result="$(read_prompt_value "${prompt_label} [${default_value}]: " "no")"
  if [[ "${trim_mode}" == "trim" ]]; then
    result="$(trim_whitespace "${result}")"
  fi

  if [[ -z "${result}" ]]; then
    result="${default_value}"
  fi

  printf "%s" "${result}"
}

prompt_yes_no() {
  local prompt_label="$1"
  local default_value="$2"
  local result

  while true; do
    result="$(prompt_with_default "${prompt_label}" "${default_value}" "trim")"
    case "${result,,}" in
      yes|y)
        printf "yes"
        return
        ;;
      no|n)
        printf "no"
        return
        ;;
      *)
        print_warn "Please answer yes or no."
        ;;
    esac
  done
}

is_valid_port() {
  local value="$1"
  [[ "${value}" =~ ^[0-9]+$ ]] || return 1
  (( value >= 1 && value <= 65535 )) || return 1
  return 0
}

prompt_port() {
  local prompt_label="$1"
  local default_value="$2"
  local value

  while true; do
    value="$(prompt_with_default "${prompt_label}" "${default_value}" "trim")"
    if is_valid_port "${value}"; then
      printf "%s" "${value}"
      return
    fi
    print_warn "Port must be an integer between 1 and 65535."
  done
}

is_valid_username() {
  local value="$1"
  [[ "${value}" =~ ^[a-zA-Z0-9._-]{3,32}$ ]]
}

prompt_admin_username() {
  local value
  while true; do
    value="$(prompt_with_default "Bootstrap admin username" "${DEFAULT_ADMIN_USERNAME}" "trim")"
    if is_valid_username "${value}"; then
      printf "%s" "${value}"
      return
    fi
    print_warn "Username must be 3-32 chars and contain only letters, numbers, ., _, -."
  done
}

normalize_secret_value() {
  local value="$1"
  value="$(trim_carriage_return "${value}")"
  value="${value//$'\n'/}"
  value="$(trim_whitespace "${value}")"
  printf "%s" "${value}"
}

is_valid_password() {
  local value="$1"
  local length="${#value}"
  (( length >= 1 && length <= 256 ))
}

prompt_secret_with_default() {
  local prompt_label="$1"
  local default_value="$2"
  local secret
  local confirm
  local normalized_default

  normalized_default="$(normalize_secret_value "${default_value}")"
  if ! is_valid_password "${normalized_default}"; then
    abort "Default password for ${prompt_label} is invalid (must be 1-256 characters)."
  fi

  while true; do
    secret="$(read_prompt_value "${prompt_label} [press Enter for default]: " "yes")"
    secret="$(normalize_secret_value "${secret}")"

    if [[ -z "${secret}" ]]; then
      printf "%s" "${normalized_default}"
      return
    fi

    confirm="$(read_prompt_value "Confirm ${prompt_label}: " "yes")"
    confirm="$(normalize_secret_value "${confirm}")"

    if [[ "${secret}" != "${confirm}" ]]; then
      print_warn "Values do not match. Please retry."
      continue
    fi

    if ! is_valid_password "${secret}"; then
      print_warn "Password must be between 1 and 256 characters."
      continue
    fi

    printf "%s" "${secret}"
    return
  done
}

normalize_cors_origin_list() {
  local raw_value="$1"
  local part
  local normalized_parts=()

  IFS=',' read -r -a parts <<< "${raw_value}"
  for part in "${parts[@]}"; do
    part="$(trim_whitespace "${part}")"
    if [[ -n "${part}" ]]; then
      normalized_parts+=("${part}")
    fi
  done

  local joined=""
  local index
  for index in "${!normalized_parts[@]}"; do
    if (( index > 0 )); then
      joined+=","
    fi
    joined+="${normalized_parts[index]}"
  done

  printf "%s" "${joined}"
}

is_valid_cors_origin_list() {
  local raw_value="$1"
  local part
  local has_origin="no"

  IFS=',' read -r -a parts <<< "${raw_value}"
  for part in "${parts[@]}"; do
    part="$(trim_whitespace "${part}")"
    if [[ -z "${part}" ]]; then
      continue
    fi

    has_origin="yes"
    if [[ ! "${part}" =~ ^https?://[^[:space:]]+$ ]]; then
      return 1
    fi
  done

  [[ "${has_origin}" == "yes" ]]
}

prompt_cors_origin_list() {
  local default_value="$1"
  local value

  while true; do
    value="$(prompt_with_default "CORS origin(s), comma-separated" "${default_value}" "trim")"
    value="$(normalize_cors_origin_list "${value}")"

    if is_valid_cors_origin_list "${value}"; then
      printf "%s" "${value}"
      return
    fi

    print_warn "Each CORS origin must start with http:// or https:// and be comma-separated without spaces only between items."
  done
}

ensure_writable_directory() {
  local dir_path="$1"
  mkdir -p "${dir_path}"

  local probe_file="${dir_path}/.flaque-write-check-$$"
  if ! : > "${probe_file}" 2>/dev/null; then
    abort "Cannot write to directory: ${dir_path}"
  fi
  rm -f "${probe_file}"
}

quote_env_literal() {
  local value="$1"
  value="$(trim_carriage_return "${value}")"
  value="${value//\'/\\\'}"
  printf "'%s'" "${value}"
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\t'/\\t}"
  value="${value//$'\r'/}"
  printf "%s" "${value}"
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

verify_admin_login() {
  local backend_port="$1"
  local admin_username="$2"
  local admin_password="$3"
  local payload
  local response_file
  local status_code

  payload="$(printf '{"username":"%s","password":"%s"}' "$(json_escape "${admin_username}")" "$(json_escape "${admin_password}")")"
  response_file="$(mktemp)"

  status_code="$(curl -sS -o "${response_file}" -w "%{http_code}" -H "Content-Type: application/json" --data "${payload}" "http://localhost:${backend_port}/api/auth/login" || true)"
  if [[ "${status_code}" != "200" ]]; then
    print_warn "Admin login verification failed with HTTP ${status_code}."
    print_warn "Backend response: $(cat "${response_file}")"
    rm -f "${response_file}"
    abort "Bootstrap admin account verification failed"
  fi

  rm -f "${response_file}"
  print_ok "Bootstrap admin login verified"
}

verify_frontend_auth_flow() {
  local frontend_port="$1"
  local admin_username="$2"
  local admin_password="$3"
  local payload
  local cookie_file
  local login_response_file
  local me_response_file
  local login_status
  local me_status
  local upload_probe_file
  local upload_probe_response_file
  local upload_probe_status

  payload="$(printf '{"username":"%s","password":"%s"}' "$(json_escape "${admin_username}")" "$(json_escape "${admin_password}")")"
  cookie_file="$(mktemp)"
  login_response_file="$(mktemp)"
  me_response_file="$(mktemp)"
  upload_probe_response_file="$(mktemp)"
  upload_probe_file="$(mktemp "/tmp/flaque-upload-probe-XXXXXX.bin")"

  if ! dd if=/dev/zero of="${upload_probe_file}" bs=1M count=2 status=none; then
    rm -f "${cookie_file}" "${login_response_file}" "${me_response_file}" "${upload_probe_response_file}" "${upload_probe_file}"
    abort "Failed to create upload probe file"
  fi

  login_status="$(curl -sS -o "${login_response_file}" -w "%{http_code}" -c "${cookie_file}" -H "Content-Type: application/json" --data "${payload}" "http://localhost:${frontend_port}/api/auth/login" || true)"
  if [[ "${login_status}" != "200" ]]; then
    print_warn "Frontend /api/auth/login failed with HTTP ${login_status}."
    print_warn "Frontend login response: $(cat "${login_response_file}")"
    rm -f "${cookie_file}" "${login_response_file}" "${me_response_file}" "${upload_probe_response_file}" "${upload_probe_file}"
    abort "Frontend auth flow verification failed"
  fi

  me_status="$(curl -sS -o "${me_response_file}" -w "%{http_code}" -b "${cookie_file}" "http://localhost:${frontend_port}/api/auth/me" || true)"
  if [[ "${me_status}" != "200" ]]; then
    print_warn "Frontend /api/auth/me failed with HTTP ${me_status}."
    print_warn "Frontend me response: $(cat "${me_response_file}")"
    rm -f "${cookie_file}" "${login_response_file}" "${me_response_file}" "${upload_probe_response_file}" "${upload_probe_file}"
    abort "Frontend auth session verification failed"
  fi

  upload_probe_status="$(curl -sS -o "${upload_probe_response_file}" -w "%{http_code}" -b "${cookie_file}" -F "files=@${upload_probe_file};filename=upload-probe.bin;type=application/octet-stream" "http://localhost:${frontend_port}/api/upload" || true)"
  if [[ "${upload_probe_status}" == "413" ]]; then
    print_warn "Frontend upload probe returned HTTP 413 (Request Entity Too Large)."
    print_warn "Ensure nginx has client_max_body_size configured (expected 100M)."
    rm -f "${cookie_file}" "${login_response_file}" "${me_response_file}" "${upload_probe_response_file}" "${upload_probe_file}"
    abort "Frontend upload body-size verification failed"
  fi

  if [[ "${upload_probe_status}" != "400" && "${upload_probe_status}" != "201" ]]; then
    print_warn "Frontend upload probe returned unexpected HTTP ${upload_probe_status}."
    print_warn "Frontend upload probe response: $(cat "${upload_probe_response_file}")"
    rm -f "${cookie_file}" "${login_response_file}" "${me_response_file}" "${upload_probe_response_file}" "${upload_probe_file}"
    abort "Frontend upload path verification failed"
  fi

  rm -f "${cookie_file}" "${login_response_file}" "${me_response_file}" "${upload_probe_response_file}" "${upload_probe_file}"
  print_ok "Frontend auth flow verified"
  print_ok "Frontend upload body-size probe verified (status ${upload_probe_status})"
}

show_compose_diagnostics() {
  print_warn "Docker compose status:"
  compose ps || true
  print_warn "Recent service logs:"
  compose logs --no-color --tail=120 || true
}

validate_single_line_value() {
  local name="$1"
  local value="$2"

  if [[ -z "$value" ]]; then
    printf "Invalid %s: value cannot be empty.\n" "$name" >&2
    exit 1
  fi

  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    printf "Invalid %s: multiline values are not supported in .env.production.\n" "$name" >&2
    exit 1
  fi
}

print_title "Flaque Production Setup"
printf "This script configures env vars, creates mount folders, builds images, initializes runtime data, and starts containers.\n\n"

[[ -f "${COMPOSE_FILE}" ]] || abort "Missing compose file: ${COMPOSE_FILE}"

print_step "Checking required tooling"
require_command docker
require_command curl

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

print_step "Collecting deployment values"
storage_input="$(prompt_with_default "Storage mount path (host -> /app/data/storage)" "${DEFAULT_STORAGE_DIR}" "trim")"
state_input="$(prompt_with_default "State mount root (host -> /app/data/{config,index,cache})" "${DEFAULT_STATE_DIR}" "trim")"

STORAGE_DIR="$(to_absolute_path "${storage_input}")"
STATE_DIR="$(to_absolute_path "${state_input}")"

FRONTEND_PORT="$(prompt_port "Public frontend port" "${DEFAULT_FRONTEND_PORT}")"
while true; do
  BACKEND_PORT="$(prompt_port "Public backend port" "${DEFAULT_BACKEND_PORT}")"
  if [[ "${BACKEND_PORT}" == "${FRONTEND_PORT}" ]]; then
    print_warn "Frontend and backend ports must be different."
    continue
  fi
  break
done

DEFAULT_CORS_ORIGIN="http://localhost:${FRONTEND_PORT}"
CORS_ORIGIN="$(prompt_cors_origin_list "${DEFAULT_CORS_ORIGIN}")"
ADMIN_USERNAME="$(prompt_admin_username)"
ADMIN_PASSWORD="$(prompt_secret_with_default "Bootstrap admin password" "${DEFAULT_ADMIN_PASSWORD}")"
SESSION_COOKIE_SECURE_PROMPT="$(prompt_yes_no "Use secure session cookie (requires HTTPS URL in browser)?" "${DEFAULT_SESSION_COOKIE_SECURE}")"
if [[ "${SESSION_COOKIE_SECURE_PROMPT}" == "yes" ]]; then
  SESSION_COOKIE_SECURE="true"
else
  SESSION_COOKIE_SECURE="false"
fi

HTTP_REQUEST_TIMEOUT_MS="${DEFAULT_HTTP_REQUEST_TIMEOUT_MS}"
HTTP_SOCKET_TIMEOUT_MS="${DEFAULT_HTTP_SOCKET_TIMEOUT_MS}"

validate_single_line_value "ADMIN_USERNAME" "${ADMIN_USERNAME}"
validate_single_line_value "ADMIN_PASSWORD" "${ADMIN_PASSWORD}"

if [[ -f "${ENV_FILE}" ]]; then
  print_warn ".env.production already exists at ${ENV_FILE}"
  OVERWRITE="$(prompt_yes_no "Overwrite existing .env.production?" "no")"
  if [[ "${OVERWRITE}" != "yes" ]]; then
    abort "Aborted by user"
  fi
fi

print_step "Creating host mount directories"
ensure_writable_directory "${STORAGE_DIR}"
ensure_writable_directory "${STATE_DIR}/config"
ensure_writable_directory "${STATE_DIR}/index"
ensure_writable_directory "${STATE_DIR}/cache/covers"
ensure_writable_directory "${STATE_DIR}/cache/transcodes"
ensure_writable_directory "${STATE_DIR}/cache/tmp-uploads"
print_ok "Mount folders are ready"

print_step "Writing ${ENV_FILE}"
ADMIN_PASSWORD_LITERAL="$(quote_env_literal "${ADMIN_PASSWORD}")"

umask 077
cat > "${ENV_FILE}" <<EOF
PORT=4000
CORS_ORIGIN=${CORS_ORIGIN}
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD_LITERAL}
SESSION_TTL_HOURS=168
SESSION_COOKIE_SECURE=${SESSION_COOKIE_SECURE}
HTTP_REQUEST_TIMEOUT_MS=${HTTP_REQUEST_TIMEOUT_MS}
HTTP_SOCKET_TIMEOUT_MS=${HTTP_SOCKET_TIMEOUT_MS}

FLAQUE_STORAGE_DIR=${STORAGE_DIR}
FLAQUE_STATE_DIR=${STATE_DIR}
FLAQUE_FRONTEND_PORT=${FRONTEND_PORT}
FLAQUE_BACKEND_PORT=${BACKEND_PORT}
EOF
chmod 600 "${ENV_FILE}"
print_ok "Environment file generated"

print_step "Building production containers"
compose build --pull
print_ok "Images built"

print_step "Stopping existing production stack (if running)"
compose down --remove-orphans >/dev/null 2>&1 || true

print_step "Initializing database and base runtime files"
if ! compose run --rm --no-deps -e BOOTSTRAP_SYNC_ADMIN_PASSWORD=true backend node backend/dist/scripts/initSystem.js; then
  show_compose_diagnostics
  abort "Initialization failed"
fi
print_ok "Initialization complete"

print_step "Starting production stack"
if ! compose up -d --remove-orphans; then
  show_compose_diagnostics
  abort "Failed to start production stack"
fi
print_ok "Stack is running"

print_step "Running post-deploy checks"
wait_for_http_ok "http://localhost:${BACKEND_PORT}/health" "Backend health endpoint"
wait_for_http_ok "http://localhost:${FRONTEND_PORT}" "Frontend endpoint"
verify_admin_login "${BACKEND_PORT}" "${ADMIN_USERNAME}" "${ADMIN_PASSWORD}"
verify_frontend_auth_flow "${FRONTEND_PORT}" "${ADMIN_USERNAME}" "${ADMIN_PASSWORD}"

printf "\n"
print_title "Deployment summary"
printf "Frontend: http://localhost:%s\n" "${FRONTEND_PORT}"
printf "Backend : http://localhost:%s\n" "${BACKEND_PORT}"
printf "Storage : %s\n" "${STORAGE_DIR}"
printf "State   : %s\n" "${STATE_DIR}"
printf "Env file: %s\n" "${ENV_FILE}"
printf "Admin   : %s\n" "${ADMIN_USERNAME}"
printf "Password: '%s'\n" "${ADMIN_PASSWORD}"
printf "Cookie secure: %s\n" "${SESSION_COOKIE_SECURE}"
