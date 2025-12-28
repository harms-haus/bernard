#!/bin/bash

SERVICE_NAME="WHISPER"
COLOR="\033[0;37m"
NC="\033[0m"
PORT=8870
DIR="services/whisper.cpp"
MODEL="models/whisper/ggml-small.bin"

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
    cd $DIR && mkdir -p build && cd build && cmake .. && make -j server
}

clean() {
    log "Cleaning $SERVICE_NAME..."
    rm -rf $DIR/build
}

start() {
    stop
    log "Starting $SERVICE_NAME..."
    ./$DIR/build/bin/server --host 127.0.0.1 --port $PORT -m $MODEL > logs/whisper.log 2>&1 &
    
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
    *) echo "Usage: $0 {start|stop|init|clean}" ;;
esac
