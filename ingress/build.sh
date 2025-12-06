#!/usr/bin/env bash
# Build a factory binary for arthur-ingress-01 using the ESPHome Docker image.
# Uses a RAM-backed cache (/dev/shm) by default to speed up builds.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
YAML_NAME="arthur-ingress-01.yaml"
NODE_NAME="arthur-ingress-01"

# Allow overriding the container tag; defaults to latest.
ESPHOME_IMAGE="${ESPHOME_IMAGE:-esphome/esphome:latest}"
# Allow overriding the user inside the container (use root to avoid SELinux/permission issues).
DOCKER_USER="${ESPHOME_DOCKER_USER:-0:0}"

# RAM-backed cache directory; override with ESPHOME_CACHE_DIR if desired.
CACHE_DIR="${ESPHOME_CACHE_DIR:-/dev/shm/esphome-cache}"
# Ensure the cache dir is writable by the current user inside the container.
install -d -m 1777 "${CACHE_DIR}"

# Ensure .esphome exists and is writable (needed for downloaded assets).
install -d -m 775 "${PROJECT_DIR}/.esphome"
install -d -m 775 "${PROJECT_DIR}/.esphome/media_player"
chown -R "$(id -u):$(id -g)" "${PROJECT_DIR}/.esphome"

# Where the factory image should be copied.
BIN_DIR="${PROJECT_DIR}/bin"
FACTORY_OUT="${BIN_DIR}/arthur-ingress-01.factory.bin"

BUILD_DIR="${PROJECT_DIR}/.esphome/build/${NODE_NAME}"
FACTORY_SRC="${BUILD_DIR}/.pioenvs/${NODE_NAME}/firmware.factory.bin"

# Secrets file handling (override with SECRETS_FILE=/path/to/secrets.yaml).
SECRETS_FILE="${SECRETS_FILE:-${PROJECT_DIR}/secrets.yaml}"
if [[ ! -f "${SECRETS_FILE}" ]]; then
  echo "ERROR: secrets file not found at ${SECRETS_FILE} (set SECRETS_FILE to override)" >&2
  exit 1
fi

echo "Using ESPHome image: ${ESPHOME_IMAGE}"
echo "Container user: ${DOCKER_USER}"
echo "Cache directory: ${CACHE_DIR}"
echo "Project directory: ${PROJECT_DIR}"

mkdir -p "${BIN_DIR}"

# Run the build inside Docker with a RAM-backed cache.
docker run --rm \
  --user "${DOCKER_USER}" \
  -v "${PROJECT_DIR}:/config:Z" \
  -v "${CACHE_DIR}:/cache:Z" \
  -v "${SECRETS_FILE}:/config/secrets.yaml:ro,Z" \
  -e ESPHOME_CACHE_DIR=/cache \
  "${ESPHOME_IMAGE}" \
  compile "${YAML_NAME}"

# Ensure outputs are owned by the host user.
chown -R "$(id -u):$(id -g)" "${PROJECT_DIR}/.esphome" "${BIN_DIR}"

# Copy the produced factory binary to bin/.
if [[ -f "${FACTORY_SRC}" ]]; then
  cp "${FACTORY_SRC}" "${FACTORY_OUT}"
  echo "Factory image written to: ${FACTORY_OUT}"
else
  echo "ERROR: Factory binary not found at ${FACTORY_SRC}" >&2
  exit 1
fi

