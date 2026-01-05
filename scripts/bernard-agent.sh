#!/bin/bash

SERVICE_NAME="BERNARD-AGENT"
COLOR="\033[0;32m"
NC="\033[0m"
PORT=2024
DIR="services/bernard-agent"

source "$(dirname "$0")/logging.sh"

stop() {
    log "Stopping $SERVICE_NAME..."
    # Also kill any remaining langgraph-cli processes
    pkill -f "langgraph-cli" 2>/dev/null
    PID=$(lsof -t -i:$PORT 2>/dev/null)
    if [ ! -z "$PID" ]; then
        kill -9 $PID 2>/dev/null
        log "Stopped $SERVICE_NAME (PID: $PID)"
    else
        log "$SERVICE_NAME not running on port $PORT"
    fi
}

init() {
    log "Initializing $SERVICE_NAME..."
    cd "$DIR" && npm install
}

clean() {
    log "Cleaning $SERVICE_NAME..."
    rm -rf "$DIR/node_modules" "$DIR/dist"
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
    
    # Start in background with proper process group
    cd "$DIR"
    nohup npx @langchain/langgraph-cli dev --port $PORT --host 127.0.0.1 > "$LOG_DIR/bernard-agent.log" 2>&1 &
    BGPID=$!
    
    # Give the server a moment to start
    sleep 2
    
    log "Waiting for $SERVICE_NAME to be reachable..."
    for i in {1..60}; do
        # Try both IPv4 (127.0.0.1) and IPv6 (::1) since langgraph-cli may bind to either
        # Use /info endpoint (returns 200) instead of /health (returns 404)
        if curl -sf http://127.0.0.1:$PORT/info > /dev/null 2>&1 || curl -sf "http://[::1]:$PORT/info" > /dev/null 2>&1; then
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
