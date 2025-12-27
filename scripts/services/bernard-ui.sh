#!/usr/bin/env bash
# Bernard UI frontend service management script

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

SERVICE_NAME="Bernard-UI"
PORT=4200

start_bernard_ui() {
    log "Starting Bernard UI frontend..."

    # Kill any existing processes on the port
    kill_port $PORT "$SERVICE_NAME" || exit 1

    # Kill existing Vite processes
    pkill -f "vite.*4200" || true

    # Give processes time to die gracefully
    sleep 2

    # Start Vite
    cd "$UI_DIR"
    npm run dev -- --port $PORT &

    echo $! > "/tmp/bernard-ui.pid"

    # Wait for service to be ready
    wait_for_service "$SERVICE_NAME" $PORT "/" 30
}

stop_bernard_ui() {
    log "Stopping Bernard UI..."

    # Kill Vite processes
    pkill -f "vite.*4200" || true

    # Kill by PID file if it exists
    if [ -f "/tmp/bernard-ui.pid" ]; then
        kill -9 $(cat "/tmp/bernard-ui.pid") 2>/dev/null || true
        rm -f "/tmp/bernard-ui.pid"
    fi

    success "Bernard UI stopped"
}

restart_bernard_ui() {
    log "Restarting Bernard UI..."
    stop_bernard_ui
    sleep 2
    start_bernard_ui
}

# Main command handling
case "${1:-start}" in
    start)
        start_bernard_ui
        ;;
    stop)
        stop_bernard_ui
        ;;
    restart)
        restart_bernard_ui
        ;;
    status)
        get_service_status "$SERVICE_NAME" $PORT "/"
        ;;
    *)
        error "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
