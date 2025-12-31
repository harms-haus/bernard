#!/bin/bash

SERVICE_NAME="BERNARD-API"
COLOR="\033[0;33m"
NC="\033[0m"
PORT=8800
DIR="services/bernard-api"

source "$(dirname "$0")/logging.sh"

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
    cd $DIR && npm install --legacy-peer-deps
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
    cd $DIR && npm run dev 2>&1 | sed "s/\[BERNARD-API\]/[  BERNARD-API  ]/g" | tee "$LOG_DIR/bernard-api.log" &

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
