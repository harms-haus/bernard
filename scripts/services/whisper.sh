#!/usr/bin/env bash
# Whisper transcription service management script

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

SERVICE_NAME="Whisper"
PORT=8002
LOG_FILE="$API_DIR/logs/whisper.log"

start_whisper() {
    log "Starting Whisper transcription server..."

    # Kill any existing processes on the port
    kill_port $PORT "$SERVICE_NAME" || exit 1

    # Ensure logs directory exists
    mkdir -p "$(dirname "$LOG_FILE")"

    # Start Whisper in background
    cd "$SERVER_DIR"
    nohup npm run dev:whisper \
        > "$LOG_FILE" 2>&1 &

    echo $! > "/tmp/whisper.pid"

    # Wait for service to be ready
    wait_for_service "$SERVICE_NAME" $PORT "/health" 30
}

stop_whisper() {
    log "Stopping Whisper..."

    # Kill Whisper processes
    pkill -f "whisper.*ts" || true

    # Kill by PID file if it exists
    if [ -f "/tmp/whisper.pid" ]; then
        kill -9 $(cat "/tmp/whisper.pid") 2>/dev/null || true
        rm -f "/tmp/whisper.pid"
    fi

    success "Whisper stopped"
}

restart_whisper() {
    log "Restarting Whisper..."
    stop_whisper
    sleep 2
    start_whisper
}

# Main command handling
case "${1:-start}" in
    start)
        start_whisper
        ;;
    stop)
        stop_whisper
        ;;
    restart)
        restart_whisper
        ;;
    status)
        get_service_status "$SERVICE_NAME" $PORT "/health"
        ;;
    *)
        error "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
