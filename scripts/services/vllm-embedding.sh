#!/usr/bin/env bash
# vLLM Embedding service management script

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

SERVICE_NAME="vLLM-Embedding"
PORT=8001
LOG_FILE="$API_DIR/logs/vllm-embedding.log"
PID_FILE="/tmp/vllm-embedding.pid"

# Calculate utilization fraction based on target GB and total GPU memory
get_gpu_utilization() {
    local target_gb=$1
    if command -v nvidia-smi >/dev/null 2>&1; then
        local total_mem_mib=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -n 1)
        local util=$(awk "BEGIN {printf \"%.2f\", ($target_gb * 1024) / $total_mem_mib}")
        echo "$util"
    else
        echo "0.05"
    fi
}

start() {
    log "Starting $SERVICE_NAME..."
    kill_port $PORT "$SERVICE_NAME" || exit 1
    mkdir -p "$(dirname "$LOG_FILE")"

    # 0.3GB is plenty for Nomic + 2k context
    local util=$(get_gpu_utilization 0.3)
    export HF_HOME="$MODELS_DIR/huggingface"
    
    log "Launching Nomic Embedding (2k Context, ${util} GPU fraction)..."
    nohup "$API_DIR/vllm_venv/bin/python" -m vllm.entrypoints.openai.api_server \
        --model nomic-ai/nomic-embed-text-v1.5 \
        --host 127.0.0.1 --port $PORT --trust-remote-code \
        --gpu-memory-utilization "$util" \
        --max-model-len 2048 \
        > "$LOG_FILE" 2>&1 &
    
    echo $! > "$PID_FILE"
    wait_for_service "$SERVICE_NAME" $PORT "/health" 90
}

stop() {
    log "Stopping $SERVICE_NAME..."
    if [ -f "$PID_FILE" ]; then
        kill -9 $(cat "$PID_FILE") 2>/dev/null || true
        rm -f "$PID_FILE"
    fi
    pkill -9 -f "vllm.entrypoints.openai.api_server.*--port $PORT" || true
    pkill -9 -f "VLLM::EngineCore" || true
    success "$SERVICE_NAME stopped"
}

case "${1:-start}" in
    start) start ;;
    stop) stop ;;
    restart) stop; sleep 2; start ;;
    status) get_service_status "$SERVICE_NAME" $PORT "/health" ;;
    *) echo "Usage: $0 {start|stop|restart|status}"; exit 1 ;;
esac
