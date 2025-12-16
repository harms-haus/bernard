#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BERNARD_PORT="${BERNARD_PORT:-3000}"
UI_PORT="${UI_PORT:-4200}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
export NG_CLI_ANALYTICS="${NG_CLI_ANALYTICS:-false}"
export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"

# Disable job control to ensure signals are handled properly
set +m

cleaned=0
cleanup() {
  if [[ "${cleaned}" -eq 1 ]]; then
    return
  fi
  cleaned=1
  echo "Stopping services..."
  
  # Send SIGTERM to all processes first for graceful shutdown
  for pid in "${BERNARD_PID:-}" "${UI_PID:-}" "${WORKER_PID:-}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      echo "Sending SIGTERM to process ${pid}..."
      kill -TERM "${pid}" 2>/dev/null || true
    fi
  done
  
  # Wait up to 5 seconds for graceful shutdown
  local count=0
  local max_wait=20  # 5 seconds at 0.25s intervals
  while [[ ${count} -lt ${max_wait} ]]; do
    local running=0
    for pid in "${BERNARD_PID:-}" "${UI_PID:-}" "${WORKER_PID:-}"; do
      if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
        running=1
        break
      fi
    done
    if [[ ${running} -eq 0 ]]; then
      break
    fi
    sleep 0.25
    count=$((count + 1))
  done
  
  # Force kill any remaining processes
  for pid in "${BERNARD_PID:-}" "${UI_PID:-}" "${WORKER_PID:-}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      echo "Force killing process ${pid}..."
      kill -KILL "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  
  if [[ -n "${REDIS_CONTAINER:-}" ]]; then
    echo "Stopping Redis container..."
    docker stop -t 1 "${REDIS_CONTAINER}" >/dev/null 2>&1 || true
  fi
  
  echo "Cleanup complete."
}
trap cleanup EXIT INT TERM

ping_redis() {
  printf "PING\r\n" | nc -w1 "${REDIS_HOST}" "${REDIS_PORT}" 2>/dev/null | grep -q "+PONG"
}

get_port_pid() {
  local port="$1"
  # Try lsof first, then netstat as fallback
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti ":${port}" 2>/dev/null || true
  elif command -v netstat >/dev/null 2>&1; then
    netstat -tlnp 2>/dev/null | grep ":${port} " | awk '{print $7}' | cut -d'/' -f1 || true
  else
    echo "Warning: Neither lsof nor netstat available to check port ${port}" >&2
  fi
}

kill_port_processes() {
  local port="$1"
  local pids
  pids="$(get_port_pid "${port}")"
  if [[ -n "${pids}" ]]; then
    echo "Killing existing processes on port ${port}..."
    echo "${pids}" | xargs kill -9 2>/dev/null || true
    sleep 1  # Give processes time to terminate
  fi
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
kill_port_processes "${BERNARD_PORT}"

# Wait for port to actually be free
echo "Waiting for port ${BERNARD_PORT} to be available..."
while get_port_pid "${BERNARD_PORT}" | grep -q .; do
  sleep 0.5
done

npm run dev --prefix "${ROOT_DIR}/bernard" -- --port "${BERNARD_PORT}" --hostname 0.0.0.0 &
BERNARD_PID=$!

echo "Starting conversation task worker..."
npm run queues:worker --prefix "${ROOT_DIR}/bernard" &
WORKER_PID=$!

echo "Starting bernard-ui on port ${UI_PORT}..."
kill_port_processes "${UI_PORT}"

# Wait for port to actually be free
echo "Waiting for port ${UI_PORT} to be available..."
while get_port_pid "${UI_PORT}" | grep -q .; do
  sleep 0.5
done

PORT="${UI_PORT}" npm run dev --prefix "${ROOT_DIR}/bernard-ui" &
UI_PID=$!

# Wait for any of the background processes to exit
# This properly handles signals and ensures cleanup runs
status=0
wait "${BERNARD_PID}" "${UI_PID}" "${WORKER_PID}" || status=$?

# Cleanup will be called automatically via the EXIT trap
exit "${status}"