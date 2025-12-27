#!/usr/bin/env bash
# vLLM service management script

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

SERVICE_NAME="vLLM"
PORT=8001
LOG_FILE="$API_DIR/logs/vllm.log"

start_vllm() {
    log "Starting vLLM embedding server..."

    # Kill any existing processes on the port
    kill_port $PORT "$SERVICE_NAME" || exit 1

    # Ensure logs directory exists
    mkdir -p "$(dirname "$LOG_FILE")"

    # Check GPU memory before starting
    check_gpu_memory

    # Start vLLM in background
    export HF_HOME="$MODELS_DIR/huggingface"
    nohup "$API_DIR/vllm_venv/bin/python" -m vllm.entrypoints.openai.api_server \
        --model nomic-ai/nomic-embed-text-v1.5 \
        --host 127.0.0.1 --port $PORT --trust-remote-code \
        --gpu-memory-utilization 0.05 \
        > "$LOG_FILE" 2>&1 &

    echo $! > "/tmp/vllm.pid"

    # Wait for service to be ready
    wait_for_service "$SERVICE_NAME" $PORT "/health" 60
}

check_gpu_memory() {
    if command -v nvidia-smi >/dev/null 2>&1; then
        local free_mem=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits)
        local total_mem=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits)

        if [ "$free_mem" -lt 1000 ]; then  # Less than 1GB free
            warning "Low GPU memory: ${free_mem}MiB free out of ${total_mem}MiB"
            warning "vLLM may fail to start. Consider killing other GPU processes."
            return 1
        else
            log "GPU memory: ${free_mem}MiB free out of ${total_mem}MiB"
            return 0
        fi
    else
        log "No NVIDIA GPU detected, vLLM may not work optimally"
        return 0
    fi
}

stop_vllm() {
    log "Stopping vLLM..."

    # Kill vLLM processes
    pkill -f "vllm.entrypoints.openai.api_server" || true
    pkill -f "VLLM" || true

    # Kill by PID file if it exists
    if [ -f "/tmp/vllm.pid" ]; then
        kill -9 $(cat "/tmp/vllm.pid") 2>/dev/null || true
        rm -f "/tmp/vllm.pid"
    fi

    # Give processes time to die gracefully
    sleep 2

    # Force kill any remaining processes
    pgrep -f "vllm" | xargs kill -9 2>/dev/null || true

    success "vLLM stopped"
}

restart_vllm() {
    log "Restarting vLLM..."
    stop_vllm
    sleep 2
    start_vllm
}

# Main command handling
case "${1:-start}" in
    start)
        start_vllm
        ;;
    stop)
        stop_vllm
        ;;
    restart)
        restart_vllm
        ;;
    status)
        get_service_status "$SERVICE_NAME" $PORT "/health"
        ;;
    *)
        error "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
