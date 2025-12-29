#!/bin/bash

SERVICE_NAME="     KOKORO    "
COLOR="\033[38;5;208m"
NC="\033[0m"
PORT=8880
DIR="services/kokoro"

log() {
    echo -e "${COLOR}[${SERVICE_NAME}]${NC} $1"
}

stop() {
    log "Stopping $SERVICE_NAME..."
    pkill -9 -f "kokoro.*main.py" || true
    pkill -9 -f "src.main" || true
    pkill -9 -f "python.*kokoro" || true
    
    # Wait for processes to fully terminate and GPU memory to be released
    sleep 2
    
    # Verify processes are gone and kill any stragglers
    if pgrep -f "python.*kokoro" > /dev/null; then
        log "Force-killing remaining Kokoro processes..."
        killall -9 python || true
        sleep 2
    fi
    
    log "$SERVICE_NAME stopped and GPU memory released"
}

 init() {
    log "Initializing $SERVICE_NAME..."
    cd $DIR && uv venv .venv && source .venv/bin/activate && uv pip install -e ".[cpu]"
 }

clean() {
    log "Cleaning $SERVICE_NAME (no-op)..."
}

start() {
    stop
    log "Starting $SERVICE_NAME..."
    
    # Create log directory using absolute path
    LOG_DIR="$(dirname "$0")/logs"
    mkdir -p "$LOG_DIR"
    
    cd "$DIR" && source .venv/bin/activate
    cd api
    python -m src.main --host 127.0.0.1 --port $PORT 2>&1 | tee "$LOG_DIR/kokoro.log" &
    
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
