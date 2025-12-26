#!/bin/bash

# Base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$BASE_DIR/.." && pwd)"
MODELS_DIR="$ROOT_DIR/models"
LOGS_DIR="$BASE_DIR/logs"

mkdir -p "$LOGS_DIR"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}Starting Bernard AI Services...${NC}"

# PIDs of started processes
PIDS=()

cleanup() {
    echo -e "\n${YELLOW}Shutting down AI services...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
        fi
    done
    wait
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 1. Start vLLM (Embeddings) - Port 8001
echo -e "${YELLOW}Starting vLLM (Embeddings) on port 8001...${NC}"
export HF_HOME="$MODELS_DIR/huggingface"
source "$BASE_DIR/vllm_venv/bin/activate"
python -m vllm.entrypoints.openai.api_server \
    --model nomic-ai/nomic-embed-text-v1.5 \
    --host 0.0.0.0 \
    --port 8001 \
    --trust-remote-code \
    --gpu-memory-utilization 0.3 \
    > "$LOGS_DIR/vllm.log" 2>&1 &
PIDS+=($!)
deactivate

# 2. Start Whisper Wrapper - Port 8002
echo -e "${YELLOW}Starting Whisper Wrapper on port 8002...${NC}"
source "$BASE_DIR/venv/bin/activate"
python "$BASE_DIR/services/whisper_server.py" > "$LOGS_DIR/whisper.log" 2>&1 &
PIDS+=($!)
deactivate

# 3. Start Kokoro TTS - Port 8003
echo -e "${YELLOW}Starting Kokoro TTS on port 8003...${NC}"
cd "$BASE_DIR/kokoro"
source "$BASE_DIR/kokoro/venv/bin/activate"
python main.py --host 0.0.0.0 --port 8003 > "$LOGS_DIR/kokoro.log" 2>&1 &
PIDS+=($!)
deactivate
cd "$BASE_DIR"

# 4. Start Main Proxy Router - Port 8000
echo -e "${YELLOW}Starting Main Proxy Router on port 8000...${NC}"
source "$BASE_DIR/venv/bin/activate"
python "$BASE_DIR/main.py" > "$LOGS_DIR/proxy.log" 2>&1 &
PIDS+=($!)
deactivate

echo -e "${GREEN}All AI services are running!${NC}"
echo -e "Proxy: http://localhost:8000"
echo -e "Logs are available in $LOGS_DIR"

# Wait for all processes
wait
