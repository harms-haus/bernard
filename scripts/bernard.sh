#!/bin/bash

SERVICE_NAME="BERNARD"
COLOR="\033[0;32m"
NC="\033[0m"
PORT=8850
DIR="services/bernard"

log() {
    echo -e "${COLOR}[${SERVICE_NAME}]${NC} $1"
}

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
    cd "$DIR" && npm install
}

clean() {
    log "Cleaning $SERVICE_NAME..."
    rm -rf "$DIR/node_modules" "$DIR/dist"
}

check() {
    log "Running checks for $SERVICE_NAME..."
    local all_passed=true

    # Create secure temporary files
    local typecheck_log=$(mktemp)
    local lint_log=$(mktemp)
    local build_log=$(mktemp)

    # Set up cleanup trap
    trap "rm -f '$typecheck_log' '$lint_log' '$build_log'" EXIT

    log "Running type-check..."
    cd "$DIR" && npm run type-check > "$typecheck_log" 2>&1
    if [ $? -eq 0 ]; then
        log "✓ Type-check passed"
    else
        log "✗ Type-check failed"
        cat "$typecheck_log"
        all_passed=false
    fi

    log "Running lint..."
    cd "$DIR" && npm run lint > "$lint_log" 2>&1
    if [ $? -eq 0 ]; then
        log "✓ Lint passed"
    else
        log "✗ Lint failed"
        cat "$lint_log"
        all_passed=false
    fi

    log "Running build..."
    cd "$DIR" && npm run build > "$build_log" 2>&1
    if [ $? -eq 0 ]; then
        log "✓ Build passed"
    else
        log "✗ Build failed"
        cat "$build_log"
        all_passed=false
    fi

    if [ "$all_passed" = false ]; then
        log "Some checks failed. Halting."
        return 1
    fi

    log "All checks passed!"
    return 0
}

start() {
    stop
    log "Starting $SERVICE_NAME..."
    mkdir -p logs
    cd "$DIR" && npm run dev 2>&1 | tee ../../logs/bernard.log &

    log "Waiting for $SERVICE_NAME to be reachable..."
    for i in {1..60}; do
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
