#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BERNARD_PORT="${BERNARD_PORT:-3000}"
ADMIN_PORT="${ADMIN_PORT:-4200}"
export NG_CLI_ANALYTICS="${NG_CLI_ANALYTICS:-false}"
export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"

cleaned=0
cleanup() {
  if [[ "${cleaned}" -eq 1 ]]; then
    return
  fi
  cleaned=1
  echo "Stopping services..."
  for pid in "${BERNARD_PID:-}" "${ADMIN_PID:-}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT INT TERM

echo "Starting bernard dev server on port ${BERNARD_PORT}..."
npm run dev --prefix "${ROOT_DIR}/bernard" -- --port "${BERNARD_PORT}" &
BERNARD_PID=$!

echo "Starting admin panel on port ${ADMIN_PORT}..."
npm start --prefix "${ROOT_DIR}/admin" -- --port "${ADMIN_PORT}" &
ADMIN_PID=$!

status=0
wait -n "${BERNARD_PID}" "${ADMIN_PID}" || status=$?
cleanup
exit "${status}"

