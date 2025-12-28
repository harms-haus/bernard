#!/bin/bash

SERVICE_NAME="VLLM-EMBEDDINGS"
COLOR="\033[0;34m"
NC="\033[0m"
PORT=8860

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
    log "Please ensure vllm is installed in services/vllm/.venv"
}

clean() {
    log "Cleaning $SERVICE_NAME (no-op)..."
}

check() {
    log "Running checks for $SERVICE_NAME..."
    local all_passed=true

    log "Checking venv initialization..."
    if [ -d "services/vllm/.venv" ]; then
        log "✓ Venv initialized"
    else
        log "✗ Venv not initialized"
        all_passed=false
    fi

    log "Checking vllm installation..."
    if ./services/vllm/.venv/bin/python -c "import vllm" 2>/dev/null; then
        log "✓ vllm installed"
    else
        log "✗ vllm not installed in venv"
        all_passed=false
    fi

    log "Checking nomic-embed-text model..."
    if [ -d "$HOME/.cache/huggingface/hub/models--nomic-ai--nomic-embed-text-v1.5" ]; then
        log "✓ nomic-embed-text model found"
    else
        log "✗ nomic-embed-text model not found in huggingface cache"
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

    local util="0.05"
    if command -v nvidia-smi >/dev/null 2>&1; then
        local total_mem_output=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -n 1 2>/dev/null)
        local total_mem_mib=$(echo "$total_mem_output" | tr -d '[:space:]')

        # Validate that total_mem_mib is a positive integer
        if [[ "$total_mem_mib" =~ ^[0-9]+$ ]] && [ "$total_mem_mib" -gt 0 ]; then
            util=$(awk "BEGIN {printf \"%.2f\", (0.3 * 1024) / $total_mem_mib}")
        else
            log "Warning: Invalid or zero GPU memory value from nvidia-smi ('$total_mem_output'), using default GPU utilization: $util"
        fi
    else
        log "nvidia-smi not available, using default GPU utilization: $util"
    fi

    log "Launching Nomic Embedding (2k Context, ${util} GPU fraction)..."

    export HF_HOME="$HOME/.cache/huggingface"

    mkdir -p logs

    ./services/vllm/.venv/bin/python -m vllm.entrypoints.openai.api_server \
        --model nomic-ai/nomic-embed-text-v1.5 \
        --host 127.0.0.1 --port $PORT --trust-remote-code \
        --gpu-memory-utilization "$util" \
        --max-model-len 2048 \
        2>&1 | tee logs/vllm-embedding.log &

    log "Waiting for $SERVICE_NAME to be reachable..."
    for i in {1..120}; do
        if curl -sf http://127.0.0.1:$PORT/health > /dev/null 2>&1; then
            log "$SERVICE_NAME is ready!"
            return 0
        fi
        sleep 1
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
