#!/bin/bash

SERVICE_NAME="KOKORO"
COLOR="\033[38;5;208m"
NC="\033[0m"
PORT=8880
DIR="services/kokoro"

source "$(dirname "$0")/logging.sh"

stop() {
    log "Stopping $SERVICE_NAME..."
    pkill -9 -f "src.main" || true
    sleep 1
    log "$SERVICE_NAME stopped"
}

 init() {
      log "Initializing $SERVICE_NAME..."

      if [ ! -f "$DIR/pyproject.toml" ]; then
          log "Removing incomplete Kokoro installation..."
          rm -rf "$DIR"
          log "Cloning Kokoro-FastAPI repository..."
          git clone https://github.com/remsky/Kokoro-FastAPI.git "$DIR"
      fi

      cd $DIR && git pull

      uv venv
      source .venv/bin/activate
      uv pip install -e . torch --upgrade

      log "Downloading Kokoro model..."
      python docker/scripts/download_model.py --output api/src/models/v1_0
  }

clean() {
    log "Cleaning $SERVICE_NAME (no-op)..."
}

start() {
    stop
    log "Starting $SERVICE_NAME..."

    LOG_DIR="$(dirname "$0")/logs"
    mkdir -p "$LOG_DIR"

    cd "$DIR"
    export PYTHONPATH="$DIR:$DIR/api"

    # Use absolute paths to avoid path resolution issues
    export MODEL_DIR="/home/blake/Documents/software/bernard/services/kokoro/api/src/models"
    export VOICES_DIR="/home/blake/Documents/software/bernard/services/kokoro/api/src/voices/v1_0"
    export ESPEAK_DATA_PATH="/usr/lib/x86_64-linux-gnu/espeak-ng-data"

    source .venv/bin/activate
    uvicorn api.src.main:app --host 127.0.0.1 --port $PORT 2>&1 | tee "$LOG_DIR/kokoro.log" &

    log "Waiting for $SERVICE_NAME to be reachable..."
    for i in {1..60}; do
        if curl -sf http://127.0.0.1:$PORT/health > /dev/null 2>&1; then
            log "$SERVICE_NAME is ready!"
            return 0
        fi
        sleep 0.5
    done
    log "Timeout waiting for $SERVICE_NAME"
    return 1
}

check() {
    log "Checking $SERVICE_NAME health..."

    return 0
}

case "$1" in
    start) start ;;
    stop) stop ;;
    init) init ;;
    clean) clean ;;
    check) check ;;
    *) echo "Usage: $0 {start|stop|init|clean|check}" ;;
esac
