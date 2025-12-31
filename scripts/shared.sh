#!/bin/bash

SERVICE_NAME="SHARED"
COLOR="\033[1;36m"
NC="\033[0m"
DIR="lib/shared"

source "$(dirname "$0")/logging.sh"

stop() {
    log "Stopping $SERVICE_NAME... (no-op for shared library)"
}

init() {
    log "Initializing $SERVICE_NAME..."
    cd "$DIR" && npm install --legacy-peer-deps
}

clean() {
    log "Cleaning $SERVICE_NAME... (no-op for shared library)"
}

check() {
    log "Checking $SERVICE_NAME... (no-op for shared library)"
    return 0
}

start() {
    log "Building $SERVICE_NAME..."
    cd "$DIR" && npm install --legacy-peer-deps
    log "$SERVICE_NAME built successfully"
}

case "$1" in
    start) start ;;
    stop) stop ;;
    init) init ;;
    clean) clean ;;
    check) check ;;
    *) echo "Usage: $0 {start|stop|init|clean|check}" ;;
esac
