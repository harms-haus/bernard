#!/bin/bash

SERVICE_NAME="WHISPER"
COLOR="\033[0;37m"
NC="\033[0m"
PORT=8870
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="$SCRIPT_DIR/../../services/whisper.cpp"
MODEL="$SCRIPT_DIR/../models/whisper/ggml-small.bin"

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
    
    if [ ! -f "$DIR/CMakeLists.txt" ]; then
        log "Removing incomplete whisper.cpp installation..."
        rm -rf "$DIR"
        log "Cloning whisper.cpp repository..."
        git clone https://github.com/ggerganov/whisper.cpp.git "$DIR"
    fi
    
    cd "$DIR" && mkdir -p build && cd build && cmake -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=ON .. && make -j whisper-server
    
    # Download whisper model
    log "Downloading whisper model..."
    mkdir -p "$SCRIPT_DIR/../models/whisper"
    chmod +x "$DIR/models/download-ggml-model.sh"
    "$DIR/models/download-ggml-model.sh small" "$SCRIPT_DIR/../models/whisper"
}

clean() {
    log "Cleaning $SERVICE_NAME..."
    rm -rf $DIR/build
}

check() {
    log "Running checks for $SERVICE_NAME..."
    local all_passed=true

    log "Checking whisper server binary..."
    if [ -f "$DIR/build/bin/whisper-server" ]; then
        success "Whisper server binary found"
    else
        error "Whisper server binary not found at $DIR/build/bin/whisper-server"
        all_passed=false
    fi

    log "Checking whisper model..."
    if [ -f "$MODEL" ]; then
        success "Whisper model found at $MODEL"
    else
        error "Whisper model not found at $MODEL"
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
    mkdir -p "$SCRIPT_DIR/logs"
    export LD_LIBRARY_PATH="$DIR/build/src:$DIR/build/ggml/src:$DIR/build/ggml/src/ggml-cuda:$LD_LIBRARY_PATH"
    $DIR/build/bin/whisper-server --host 127.0.0.1 --port $PORT -m $MODEL --convert 2>&1 | tee "$SCRIPT_DIR/logs/whisper.log" &

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
