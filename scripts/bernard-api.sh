#!/bin/bash

SERVICE_NAME="BERNARD-API"
COLOR="\033[0;33m"
NC="\033[0m"
API_PORT=8800
AGENT_PORT=2024
DIR="services/bernard-api"

source "$(dirname "$0")/logging.sh"

stop() {
    log "Stopping $SERVICE_NAME..."
    # Stop API
    PID=$(lsof -t -i:$API_PORT 2>/dev/null)
    if [ ! -z "$PID" ]; then
        kill -9 $PID 2>/dev/null
        log "Stopped API (PID: $PID)"
    else
        log "$SERVICE_NAME API not running on port $API_PORT"
    fi
    # Stop agent
    PID=$(lsof -t -i:$AGENT_PORT 2>/dev/null)
    if [ ! -z "$PID" ]; then
        kill -9 $PID 2>/dev/null
        log "Stopped agent (PID: $PID)"
    else
        log "$SERVICE_NAME agent not running on port $AGENT_PORT"
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

    # Clear previous status and log
    > "$STATUS_FILE"
    > "$LOG_FILE"

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
    # Export TZ if set in environment (must be done before starting Node.js)
    [ -n "$TZ" ] && export TZ

    stop
    log "Starting $SERVICE_NAME..."

    LOG_DIR="$(cd "$(dirname "$0")/.." && pwd)/logs"
    mkdir -p "$LOG_DIR"

    # Start API server in background
    cd $DIR
    nohup tsx watch src/index.ts > "$LOG_DIR/bernard-api.log" 2>&1 &
    API_PID=$!

    # Start agent (langgraph-cli) in background, binding to IPv4
    nohup npx @langchain/langgraph-cli dev --port $AGENT_PORT --host 127.0.0.1 > "$LOG_DIR/bernard-agent.log" 2>&1 &
    AGENT_PID=$!

    log "Waiting for API to be reachable on port $API_PORT..."
    for i in {1..40}; do
        if curl -sf http://127.0.0.1:$API_PORT/health > /dev/null 2>&1; then
            log "$SERVICE_NAME API is ready!"
            break
        fi
        sleep 0.5
    done

    log "Waiting for agent to be reachable on port $AGENT_PORT..."
    for i in {1..40}; do
        # Try both IPv4 and IPv6 since langgraph-cli may bind to either
        if curl -sf http://127.0.0.1:$AGENT_PORT/info > /dev/null 2>&1 || curl -sf "http://[::1]:$AGENT_PORT/info" > /dev/null 2>&1; then
            log "$SERVICE_NAME agent is ready!"
            return 0
        fi
        sleep 0.5
    done

    log "Timeout waiting for services"
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
