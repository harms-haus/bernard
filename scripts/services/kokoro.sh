#!/usr/bin/env bash
# Kokoro TTS service management script

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"

SERVICE_NAME="Kokoro"
PORT=8880

start_kokoro() {
    log "Starting Kokoro TTS server..."

    # Kill any existing processes on the port
    kill_port $PORT "$SERVICE_NAME" || exit 1

    # Start Kokoro in background
    cd "$SERVICES_DIR/kokoro/api"
    source "$SERVICES_DIR/kokoro/.venv/bin/activate"
    python -m src.main --host 127.0.0.1 --port $PORT &

    echo $! > "/tmp/kokoro.pid"

    # Wait for service to be ready
    wait_for_service "$SERVICE_NAME" $PORT "/health" 30
}

stop_kokoro() {
    log "Stopping Kokoro..."

    # Kill Kokoro processes
    pkill -f "kokoro.*main.py" || true
    pkill -f "src.main" || true

    # Kill by PID file if it exists
    if [ -f "/tmp/kokoro.pid" ]; then
        kill -9 $(cat "/tmp/kokoro.pid") 2>/dev/null || true
        rm -f "/tmp/kokoro.pid"
    fi

    success "Kokoro stopped"
}

restart_kokoro() {
    log "Restarting Kokoro..."
    stop_kokoro
    sleep 2
    start_kokoro
}

# Main command handling
case "${1:-start}" in
    start)
        start_kokoro
        ;;
    stop)
        stop_kokoro
        ;;
    restart)
        restart_kokoro
        ;;
    status)
        get_service_status "$SERVICE_NAME" $PORT "/health"
        ;;
    *)
        error "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
