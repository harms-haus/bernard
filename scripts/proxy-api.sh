#!/bin/bash

SERVICE_NAME="PROXY-API"
COLOR="\033[0;36m"
NC="\033[0m"
PORT=3456
DIR="proxy-api"

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
    cd "$DIR" || { log "Failed to cd to $DIR"; return 1; } && npm install
}

clean() {
    log "Cleaning $SERVICE_NAME..."
    rm -rf $DIR/node_modules $DIR/dist
}

check() {
    log "Running checks for $SERVICE_NAME..."
    local all_passed=true

    log "Running type-check..."
    cd "$DIR" || { log "✗ Failed to cd to $DIR"; all_passed=false; return 1; } && npm run type-check > /tmp/proxy-api-typecheck.log 2>&1
    if [ $? -eq 0 ]; then
        log "✓ Type-check passed"
    else
        log "✗ Type-check failed"
        cat /tmp/proxy-api-typecheck.log
        all_passed=false
    fi

    log "Running lint..."
    cd "$DIR" || { log "✗ Failed to cd to $DIR"; all_passed=false; return 1; } && npm run lint > /tmp/proxy-api-lint.log 2>&1
    if [ $? -eq 0 ]; then
        log "✓ Lint passed"
    else
        log "✗ Lint failed"
        cat /tmp/proxy-api-lint.log
        all_passed=false
    fi

    log "Running build..."
    cd "$DIR" || { log "✗ Failed to cd to $DIR"; all_passed=false; return 1; } && npm run build > /tmp/proxy-api-build.log 2>&1
    if [ $? -eq 0 ]; then
        log "✓ Build passed"
    else
        log "✗ Build failed"
        cat /tmp/proxy-api-build.log
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
    mkdir -p "../logs"
    cd "$DIR" && npm run dev 2>&1 | tee "../logs/proxy.log" &

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
