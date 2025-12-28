#!/bin/bash

SERVICE_NAME="REDIS"
COLOR="\033[0;31m"
NC="\033[0m"
PORT=6379

log() {
    echo -e "${COLOR}[${SERVICE_NAME}]${NC} $1"
}

stop() {
    log "Stopping Redis..."
    PID=$(lsof -t -i:$PORT)
    if [ ! -z "$PID" ]; then
        kill -9 $PID
        log "Stopped Redis (PID: $PID)"
    else
        log "Redis not running on port $PORT"
    fi
}

init() {
    log "Initializing Redis (no-op)..."
}

clean() {
    log "Cleaning Redis (no-op)..."
}

start() {
    stop
    log "Starting Redis on port $PORT..."
    redis-server --port $PORT --daemonize yes
    
    # Wait for reachable
    log "Waiting for Redis to be reachable..."
    for i in {1..20}; do
        if redis-cli -p $PORT ping > /dev/null 2>&1; then
            log "Redis is ready!"
            return 0
        fi
        sleep 0.5
    done
    log "Timeout waiting for Redis"
    return 1
}

case "$1" in
    start) start ;;
    stop) stop ;;
    init) init ;;
    clean) clean ;;
    *) echo "Usage: $0 {start|stop|init|clean}" ;;
esac
