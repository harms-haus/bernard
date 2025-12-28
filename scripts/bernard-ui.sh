#!/bin/bash

SERVICE_NAME="BERNARD-UI"
COLOR="\033[0;35m"
NC="\033[0m"
PORT=8810
DIR="services/bernard-ui"

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
    cd $DIR && npm install
}

clean() {
    log "Cleaning $SERVICE_NAME..."
    rm -rf $DIR/node_modules $DIR/dist
}

check() {
    log "Running checks for $SERVICE_NAME..."
    local all_passed=true

    log "Running type-check..."
    cd $DIR && npm run type-check > /tmp/bernard-ui-typecheck.log 2>&1
    if [ $? -eq 0 ]; then
        log "✓ Type-check passed"
    else
        log "✗ Type-check failed"
        cat /tmp/bernard-ui-typecheck.log
        all_passed=false
    fi

    log "Running lint..."
    cd $DIR && npm run lint > /tmp/bernard-ui-lint.log 2>&1
    if [ $? -eq 0 ]; then
        log "✓ Lint passed"
    else
        log "✗ Lint failed"
        cat /tmp/bernard-ui-lint.log
        all_passed=false
    fi

    log "Running build..."
    cd $DIR && npm run build > /tmp/bernard-ui-build.log 2>&1
    if [ $? -eq 0 ]; then
        log "✓ Build passed"
    else
        log "✗ Build failed"
        cat /tmp/bernard-ui-build.log
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

    # Ensure logs directory exists
    LOG_DIR="$(cd "$DIR" && cd ../.. && pwd)/logs"
    mkdir -p "$LOG_DIR"
    if [ $? -ne 0 ]; then
        log "Failed to create logs directory: $LOG_DIR"
        exit 1
    fi

    cd $DIR && npm run dev 2>&1 | tee ../../logs/bernard-ui.log &

    log "Waiting for $SERVICE_NAME to be reachable..."
    for i in {1..40}; do
        if curl -sf http://127.0.0.1:$PORT > /dev/null 2>&1; then
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
