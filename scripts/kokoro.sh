#!/bin/bash

SERVICE_NAME="KOKORO"
COLOR="\033[38;5;208m"
NC="\033[0m"
PORT=8880
DIR="services/kokoro"

log() {
    echo -e "${COLOR}[${SERVICE_NAME}]${NC} $1"
}

stop() {
    log "Stopping $SERVICE_NAME..."
    PID=$(lsof -t -i:$PORT)
    if [ ! -z "$PID" ]; then
        kill -9 $PID
        log "Stopped $SERVICE_NAME (PID: $PID)"
    else
        log "$SERVICE_NAME not running on port $PORT"
    fi
}

init() {
    log "Initializing $SERVICE_NAME..."
    cd $DIR && uv pip install -e ".[cpu]"
}

clean() {
    log "Cleaning $SERVICE_NAME (no-op)..."
}

start() {
    stop
    log "Starting $SERVICE_NAME..."
    export PYTHONPATH=$DIR:$DIR/api
    mkdir -p "$(dirname "$DIR/../../logs/kokoro.log")" && cd $DIR && uv run --no-sync uvicorn api.src.main:app --host 127.0.0.1 --port $PORT 2>&1 | tee ../../logs/kokoro.log &
    
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
    if curl -sf http://127.0.0.1:$PORT/health > /dev/null 2>&1; then
        log "$SERVICE_NAME is healthy!"
        return 0
    else
        log "$SERVICE_NAME is not responding on port $PORT"
        return 1
    fi
}

case "$1" in
    start) start ;;
    stop) stop ;;
    init) init ;;
    clean) clean ;;
    check) check ;;
    *) echo "Usage: $0 {start|stop|init|clean|check}" ;;
esac
