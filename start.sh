#!/usr/bin/env bash
set -euo pipefail

# Base directories
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BERNARD_DIR="$ROOT_DIR/bernard"
UI_DIR="$ROOT_DIR/bernard-ui"
SERVER_DIR="$ROOT_DIR/server"
MODELS_DIR="$ROOT_DIR/models"
API_DIR="$ROOT_DIR/api"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log() { echo -e "${BLUE}[SYSTEM]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

# 1. Build Checks (Fail Fast)
log "Starting build checks..."

# Type check
log "Type checking Bernard..."
if ! npm run type-check:src --prefix "$BERNARD_DIR"; then
    error "Bernard type check failed. See output above for details."
    exit 1
fi

log "Type checking Server..."
if ! npm run build --prefix "$SERVER_DIR"; then
    error "Server type check failed. See output above for details."
    exit 1
fi

# Lint
log "Linting Bernard..."
if ! npm run lint --prefix "$BERNARD_DIR"; then
    error "Bernard linting failed. See output above for details."
    exit 1
fi

# Build
log "Building Bernard..."
if ! npm run build --prefix "$BERNARD_DIR"; then
    error "Bernard build failed. See output above for details."
    exit 1
fi

success "Build checks passed!"

# 2. Cleanup and Process Management
PIDS=()
cleanup() {
    echo -e "\n${YELLOW}Shutting down all services...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    wait
    success "All services stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 3. Start Background Services
log "Starting backend models..."

# vLLM
export HF_HOME="$MODELS_DIR/huggingface"
(source "$API_DIR/vllm_venv/bin/activate" && \
 python -m vllm.entrypoints.openai.api_server \
    --model nomic-ai/nomic-embed-text-v1.5 \
    --host 0.0.0.0 --port 8001 --trust-remote-code \
    --gpu-memory-utilization 0.05 2>&1 | sed "s/^/${CYAN}[VLLM]${NC} /" ; if [ $? -ne 0 ]; then echo "VLLM failed to start, continuing..."; fi) &
PIDS+=($!)

# Kokoro
API_DIR="$ROOT_DIR/api" && (cd "$API_DIR/kokoro/api/src" && source "$API_DIR/kokoro/venv/bin/activate" && \
 PYTHONPATH="$API_DIR/kokoro/api/src" python main.py --host 0.0.0.0 --port 8003 2>&1 ; if [ $? -ne 0 ]; then echo "Kokoro failed to start, continuing..."; fi) &
PIDS+=($!)

# Whisper (TS)
(npm run dev:whisper --prefix "$SERVER_DIR" 2>&1 | sed "s/^/${YELLOW}[WHISPER]${NC} /") &
PIDS+=($!)

# 4. Start Application Servers
log "Starting application servers..."

# Next.js
(npm run dev --prefix "$BERNARD_DIR" -- --port 3000 2>&1 | sed "s/^/${BLUE}[NEXT]${NC} /") &
PIDS+=($!)

# Vite
(npm run dev --prefix "$UI_DIR" -- --port 4200 2>&1 | sed "s/^/${GREEN}[VITE]${NC} /") &
PIDS+=($!)

# Bernard Workers
(npm run queues:worker --prefix "$BERNARD_DIR" 2>&1 | sed "s/^/${CYAN}[QUEUE]${NC} /") &
PIDS+=($!)

(npm run tasks:worker --prefix "$BERNARD_DIR" 2>&1 | sed "s/^/${CYAN}[TASK]${NC} /") &
PIDS+=($!)

# Wait a moment for backends to initialize
sleep 5

# Unified Fastify Server (Foreground)
log "Starting Unified Server on port 3456..."
export PORT=3456
npm run dev --prefix "$SERVER_DIR"

