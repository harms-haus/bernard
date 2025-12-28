#!/bin/bash

SERVICE_NAME="VLLM-EMBEDDINGS"
COLOR="\033[0;34m"
NC="\033[0m"
PORT=8860

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
    log "Please ensure vllm is installed in your python environment."
    # Optional: pip install vllm
}

clean() {
    log "Cleaning $SERVICE_NAME (no-op)..."
}

start() {
    stop
    log "Starting $SERVICE_NAME..."
    vllm serve nomic-ai/nomic-embed-text-v1.5 --host 127.0.0.1 --port $PORT --task embed > logs/vllm-embedding.log 2>&1 &
    
    log "Waiting for $SERVICE_NAME to be reachable..."
    for i in {1..120}; do
        if curl -sf http://127.0.0.1:$PORT/health > /dev/null 2>&1; then
            log "$SERVICE_NAME is ready!"
            return 0
        fi
        sleep 1
    done
    log "Timeout waiting for $SERVICE_NAME"
    return 1
}

case "$1" in
    start) start ;;
    stop) stop ;;
    init) init ;;
    clean) clean ;;
    *) echo "Usage: $0 {start|stop|init|clean}" ;;
esac
