#!/usr/bin/env bash
# Unified Fastify server service management script

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

SERVICE_NAME="Server"
PORT=3456
LOG_FILE="$API_DIR/logs/proxy.log"

start_server() {
    log "Starting Unified Fastify Server..."

    # Kill any existing processes on the port
    kill_port $PORT "$SERVICE_NAME" || exit 1

    # Ensure logs directory exists
    mkdir -p "$(dirname "$LOG_FILE")"

    # Start the server
    cd "$SERVER_DIR"
    nohup npm run dev \
        > "$LOG_FILE" 2>&1 &

    echo $! > "/tmp/bernard-server.pid"

    # Wait for service to be ready
    wait_for_service "$SERVICE_NAME" $PORT "/health" 30
}

stop_server() {
    log "Stopping Unified Server..."

    # Kill server processes
    pkill -f "bernard-unified-server" || true

    # Kill by PID file if it exists
    if [ -f "/tmp/bernard-server.pid" ]; then
        kill -9 $(cat "/tmp/bernard-server.pid") 2>/dev/null || true
        rm -f "/tmp/bernard-server.pid"
    fi

    success "Server stopped"
}

restart_server() {
    log "Restarting Unified Server..."
    stop_server
    sleep 2
    start_server
}

# Main command handling
case "${1:-start}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server
        ;;
    status)
        get_service_status "$SERVICE_NAME" $PORT "/health"
        ;;
    *)
        error "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
