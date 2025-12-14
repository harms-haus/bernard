#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BERNARD_PORT="${BERNARD_PORT:-3000}"
UI_PORT="${UI_PORT:-4200}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
export NG_CLI_ANALYTICS="${NG_CLI_ANALYTICS:-false}"
export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"

cleaned=0
cleanup() {
  if [[ "${cleaned}" -eq 1 ]]; then
    return
  fi
  cleaned=1
  echo "Stopping services..."
  for pid in "${BERNARD_PID:-}" "${UI_PID:-}" "${WORKER_PID:-}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  if [[ -n "${REDIS_CONTAINER:-}" ]]; then
    docker stop -t 1 "${REDIS_CONTAINER}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

ping_redis() {
  printf "PING\r\n" | nc -w1 "${REDIS_HOST}" "${REDIS_PORT}" 2>/dev/null | grep -q "+PONG"
}

ensure_redis() {
  echo "Ensuring redis on ${REDIS_HOST}:${REDIS_PORT}..."
  if ping_redis; then
    echo "Redis already running."
    REDIS_CONTAINER="bernard-redis"
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required to start redis automatically but was not found." >&2
    exit 1
  fi

  local container_name="bernard-redis"
  local volume_name="bernard-redis-data"
  local redis_image="${REDIS_IMAGE:-redis/redis-stack-server:7.4.0-v0}"

  if docker ps -a --format '{{.Names}}' | grep -Fxq "${container_name}"; then
    local current_image
    current_image="$(docker inspect -f '{{.Config.Image}}' "${container_name}" 2>/dev/null || true)"
    if [[ "${current_image}" == "${redis_image}" ]]; then
      echo "Starting existing redis container ${container_name}..."
      docker start "${container_name}" >/dev/null
      return
    fi

    echo "Replacing redis container ${container_name} with image ${redis_image}..."
    docker rm -f "${container_name}" >/dev/null || true
  fi

  echo "Creating redis container ${container_name} with volume ${volume_name}..."
  docker run -d \
    --name "${container_name}" \
    -p "${REDIS_PORT}:6379" \
    -v "${volume_name}:/data" \
    -e REDIS_ARGS="--save 60 1 --appendonly yes" \
    "${redis_image}" >/dev/null

  REDIS_CONTAINER="${container_name}"
  echo "Redis container ready: ${REDIS_CONTAINER}"

  retries=40
  until ping_redis; do
    retries=$((retries - 1))
    if [[ "${retries}" -le 0 ]]; then
      echo "Redis did not become ready in time." >&2
      exit 1
    fi
    sleep 0.25
  done
  echo "Redis is ready."
}

ensure_redis
export REDIS_URL="redis://${REDIS_HOST}:${REDIS_PORT}"

echo "Starting bernard dev server on port ${BERNARD_PORT}..."
npm run dev --prefix "${ROOT_DIR}/bernard" -- --port "${BERNARD_PORT}" --hostname 0.0.0.0 &
BERNARD_PID=$!

echo "Starting conversation task worker..."
npm run queues:worker --prefix "${ROOT_DIR}/bernard" &
WORKER_PID=$!

echo "Starting bernard-ui on port ${UI_PORT}..."
npm run dev --prefix "${ROOT_DIR}/bernard-ui" &
UI_PID=$!

status=0
wait -n "${BERNARD_PID}" "${UI_PID}" "${WORKER_PID}" || status=$?
cleanup
exit "${status}"

