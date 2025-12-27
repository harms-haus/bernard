#!/usr/bin/env bash
# Bernard API service management script

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"

SERVICE_NAME="Bernard API"
PORT=3000

start_bernard_api() {
    log "Starting Bernard API..."

    # Kill any existing processes on the port
    kill_port $PORT "$SERVICE_NAME" || exit 1

    # Kill existing Bernard API processes
    pkill -f "bernard-api.*dev" || true
    pkill -f "bernard-api.*start" || true

    # Give processes time to die gracefully
    sleep 2

    # Start Bernard API
    log "Starting Bernard API server..."
    cd "$BERNARD_API_DIR"
    PORT=3000 npm run dev &
    echo $! > "/tmp/bernard-api.pid"

    # Wait for service to be ready
    wait_for_service "$SERVICE_NAME" $PORT "/health" 60
}

stop_bernard_api() {
    log "Stopping Bernard API..."

    # Kill Bernard API processes
    pkill -f "bernard-api.*dev" || true
    pkill -f "bernard-api.*start" || true

    # Kill by PID file if it exists
    if [ -f "/tmp/bernard-api.pid" ]; then
        local pid=$(cat "/tmp/bernard-api.pid")
        if kill -0 "$pid" 2>/dev/null; then
            log "Sending SIGTERM to PID $pid..."
            kill -TERM "$pid" 2>/dev/null || true
            sleep 2
            if kill -0 "$pid" 2>/dev/null; then
                log "Force killing PID $pid..."
                kill -9 "$pid" 2>/dev/null || true
            fi
        fi
        rm -f "/tmp/bernard-api.pid"
    fi

    success "Bernard API stopped"
}

restart_bernard_api() {
    log "Restarting Bernard API..."
    stop_bernard_api
    sleep 2
    start_bernard_api
}

# Main command handling
case "${1:-start}" in
    start)
        start_bernard_api
        ;;
    stop)
        stop_bernard_api
        ;;
    restart)
        restart_bernard_api
        ;;
    status)
        get_service_status "$SERVICE_NAME" $PORT "/health"
        ;;
    *)
        error "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
