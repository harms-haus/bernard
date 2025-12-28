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

start() {
    stop
    log "Starting $SERVICE_NAME..."
    cd $DIR && npm run dev > ../../logs/bernard-ui.log 2>&1 &
    
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
    *) echo "Usage: $0 {start|stop|init|clean}" ;;
esac
