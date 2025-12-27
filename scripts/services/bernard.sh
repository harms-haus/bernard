#!/usr/bin/env bash
# Bernard main application service management script

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

SERVICE_NAME="Bernard"
PORT=3000

start_bernard() {
    log "Starting Bernard application..."

    # Kill any existing processes on the port
    kill_port $PORT "$SERVICE_NAME" || exit 1

    # Kill existing Bernard processes
    pkill -f "bernard.*dev" || true
    pkill -f "bernard.*worker" || true

    # Give processes time to die gracefully
    sleep 2

    # Cleanup function for this startup
    cleanup_workers() {
        log "Cleaning up Bernard workers..."
        for pid_file in "/tmp/bernard-queue.pid" "/tmp/bernard-task.pid"; do
            if [ -f "$pid_file" ]; then
                local pid=$(cat "$pid_file")
                if kill -0 "$pid" 2>/dev/null; then
                    log "Terminating worker PID $pid..."
                    kill -TERM "$pid" 2>/dev/null || true
                    sleep 1
                    if kill -0 "$pid" 2>/dev/null; then
                        kill -9 "$pid" 2>/dev/null || true
                    fi
                fi
                rm -f "$pid_file"
            fi
        done
    }

    # Set trap to cleanup workers if this script is interrupted
    trap cleanup_workers SIGINT SIGTERM EXIT

    # Start Bernard workers first
    log "Starting Bernard queue worker..."
    cd "$BERNARD_DIR"
    npm run queues:worker &
    echo $! > "/tmp/bernard-queue.pid"

    log "Starting Bernard task worker..."
    npm run tasks:worker &
    echo $! > "/tmp/bernard-task.pid"

    # Start Next.js
    log "Starting Next.js server..."
    npm run dev -- --port $PORT &
    echo $! > "/tmp/bernard-nextjs.pid"

    # Give workers a moment to connect to Redis
    sleep 2

    # Wait for Next.js to be ready
    wait_for_service "$SERVICE_NAME" $PORT "/" 60

    # Remove the trap since startup completed successfully
    trap - SIGINT SIGTERM EXIT
}

stop_bernard() {
    log "Stopping Bernard..."

    # Kill Bernard processes more aggressively
    pkill -f "bernard.*dev" || true
    pkill -f "bernard.*worker" || true

    # Kill by PID files if they exist (try SIGTERM first, then SIGKILL)
    for pid_file in "/tmp/bernard-queue.pid" "/tmp/bernard-task.pid" "/tmp/bernard-nextjs.pid"; do
        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file")
            if kill -0 "$pid" 2>/dev/null; then
                log "Sending SIGTERM to PID $pid..."
                kill -TERM "$pid" 2>/dev/null || true
                # Wait a moment for graceful shutdown
                sleep 2
                if kill -0 "$pid" 2>/dev/null; then
                    log "Force killing PID $pid..."
                    kill -9 "$pid" 2>/dev/null || true
                fi
            fi
            rm -f "$pid_file"
        fi
    done

    # Final cleanup - kill any remaining Bernard processes
    pkill -9 -f "bernard.*dev" || true
    pkill -9 -f "bernard.*worker" || true

    success "Bernard stopped"
}

restart_bernard() {
    log "Restarting Bernard..."
    stop_bernard
    sleep 2
    start_bernard
}

# Main command handling
case "${1:-start}" in
    start)
        start_bernard
        ;;
    stop)
        stop_bernard
        ;;
    restart)
        restart_bernard
        ;;
    status)
        get_service_status "$SERVICE_NAME" $PORT "/"
        ;;
    *)
        error "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
