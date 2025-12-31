#!/bin/bash

SERVICE_NAME="PROXY-API"
COLOR="\033[0;36m"
NC="\033[0m"
PORT=3456
DIR="proxy-api"

source "$(dirname "$0")/logging.sh"

stop() {
    log "Stopping $SERVICE_NAME..."

    # Find all processes related to proxy-api by matching the command
    # This avoids killing other tsx watch processes from other services
    local pids=$(pgrep -f "tsx.*proxy-api" 2>/dev/null)

    if [ -z "$pids" ]; then
        # Fallback: find by port
        pids=$(lsof -t -i:$PORT 2>/dev/null)
    fi

    if [ ! -z "$pids" ]; then
        for pid in $pids; do
            log "Stopping $SERVICE_NAME (PID: $pid)..."
            kill -TERM $pid 2>/dev/null

            # Wait for graceful shutdown
            for i in {1..10}; do
                if ! kill -0 $pid 2>/dev/null; then
                    log "Stopped $SERVICE_NAME (PID: $pid)"
                    break
                fi
                sleep 0.5
            done

            # Force kill if still running
            if kill -0 $pid 2>/dev/null; then
                kill -9 $pid 2>/dev/null
                sleep 0.2
                log "Force killed $SERVICE_NAME (PID: $pid)"
            fi
        done
    else
        log "$SERVICE_NAME not running on port $PORT"
    fi
}

init() {
    log "Initializing $SERVICE_NAME..."
    cd "$DIR" || { log "Failed to cd to $DIR"; return 1; } && npm install --legacy-peer-deps
}

clean() {
    log "Cleaning $SERVICE_NAME..."
    rm -rf $DIR/node_modules $DIR/dist
}

check() {
    # Source shared utilities
    source "$(dirname "$0")/check-utils.sh"

    log "Running checks for $SERVICE_NAME..."

    # Create log directory and files
    LOG_DIR="$(cd "$(dirname "$0")/.." && pwd)/logs"
    mkdir -p "$LOG_DIR"
    LOG_FILE="$LOG_DIR/${SERVICE_NAME,,}-check.log"
    STATUS_FILE="$LOG_DIR/${SERVICE_NAME,,}-check.status"

    # Clear previous status
    > "$STATUS_FILE"

    # Run check steps synchronously (don't exit on failure)
    run_check_step "type-check" "npm run type-check" "$LOG_FILE" "$SERVICE_NAME" "$DIR"
    local typecheck_result=$?
    track_result "$SERVICE_NAME" "$STATUS_FILE" "typecheck" "$typecheck_result"

    run_check_step "lint" "npm run lint" "$LOG_FILE" "$SERVICE_NAME" "$DIR"
    local lint_result=$?
    track_result "$SERVICE_NAME" "$STATUS_FILE" "lint" "$lint_result"

    run_check_step "build" "npm run build" "$LOG_FILE" "$SERVICE_NAME" "$DIR"
    local build_result=$?
    track_result "$SERVICE_NAME" "$STATUS_FILE" "build" "$build_result"

    # Finalize status
    finalize_status "$SERVICE_NAME" "$STATUS_FILE"

    # Return overall status
    if grep -q "overall=pass" "$STATUS_FILE"; then
        log "All checks passed!"
        return 0
    else
        log "Some checks failed."
        return 1
    fi
}

start() {
    stop
    log "Starting $SERVICE_NAME..."
    LOG_DIR="$(cd "$(dirname "$0")/.." && pwd)/logs"
    mkdir -p "$LOG_DIR"
    cd "$DIR" && npm run dev 2>&1 | sed "s/\[PROXY-API\]/[   PROXY-API  ]/g" | tee "$LOG_DIR/proxy.log" &

    log "Waiting for $SERVICE_NAME to be reachable..."
    for i in {1..40}; do
        if curl -sf http://127.0.0.1:$PORT/health > /dev/null 2>&1; then
            log "$SERVICE_NAME is ready!"
            return 0
        fi
        sleep 0.5
    done
    log "Timeout waiting for $SERVICE_NAME"
    return 1
}

case "$1" in
    start) start ;;
    stop) stop ;;
    init) init ;;
    clean) clean ;;
    check) check ;;
    *) echo "Usage: $0 {start|stop|init|clean|check}" ;;
esac
