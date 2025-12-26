#!/usr/bin/env bash
# Don't exit on individual service failures - let them fail gracefully
set -uo pipefail

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
warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Allow function to be sourced independently
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Script is being executed directly
    set -uo pipefail
else
    # Script is being sourced
    set +u
fi

# Check GPU memory availability
check_gpu_memory() {
    if command -v nvidia-smi >/dev/null 2>&1; then
        local free_mem=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits)
        local total_mem=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits)

        if [ "$free_mem" -lt 1000 ]; then  # Less than 1GB free
            warning "Low GPU memory: ${free_mem}MiB free out of ${total_mem}MiB"
            warning "GPU-intensive services may fail. Consider killing other GPU processes."
            return 1
        else
            log "GPU memory: ${free_mem}MiB free out of ${total_mem}MiB"
            return 0
        fi
    else
        log "No NVIDIA GPU detected, skipping GPU memory check"
        return 0
    fi
}

# Redis Docker container management
wait_for_redis() {
    echo "Waiting for Redis to be ready..."
    local retries=30
    local count=0
    while [ $count -lt $retries ]; do
        if docker exec bernard-redis redis-cli ping >/dev/null 2>&1; then
            echo "SUCCESS: Redis with RediSearch is ready!"
            return 0
        fi
        count=$((count + 1))
        sleep 1
    done
    echo "ERROR: Redis failed to start properly"
    return 1
}

manage_redis_container() {
    echo "Setting up Redis with RediSearch..."

    # Check if Docker is available
    if ! command -v docker >/dev/null 2>&1; then
        echo "ERROR: Docker is not available. Redis with RediSearch is required for conversation indexing."
        return 1
    fi

    # Check if container is already running
    if docker ps --format 'table {{.Names}}' | grep -q "^bernard-redis$"; then
        echo "Redis container is already running"
        wait_for_redis
        return $?
    fi

    echo "Checking for existing bernard-redis container..."
    # Start any existing bernard-redis container (but don't remove it)
    if docker ps -a --format 'table {{.Names}}' | grep -q "^bernard-redis$"; then
        echo "Starting existing bernard-redis container..."
        if docker start bernard-redis; then
            wait_for_redis
            return $?
        else
            echo "ERROR: Failed to start existing Redis container"
            return 1
        fi
    fi

    # Start the Redis Stack container with RediSearch
    echo "Starting new Redis with RediSearch container..."
    if docker run -d --name bernard-redis \
        -p 6379:6379 \
        --restart unless-stopped \
        -v bernard-redis-data:/data \
        docker.io/redis/redis-stack-server:7.4.0-v0; then

        wait_for_redis
        return $?
    else
        echo "ERROR: Failed to start Redis Docker container"
        return 1
    fi
}

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

# Pre-startup cleanup - kill any existing Bernard processes
cleanup_existing() {
    log "Cleaning up existing Bernard processes..."

    # Kill existing GPU/memory intensive processes
    pkill -f "llama-server" || true
    pkill -f "vllm.entrypoints.openai.api_server" || true
    pkill -f "VLLM" || true

    # Kill existing Bernard processes
    pkill -f "bernard.*dev" || true
    pkill -f "bernard.*worker" || true
    pkill -f "vite.*4200" || true
    pkill -f "next.*3000" || true

    # Kill Kokoro processes
    pkill -f "kokoro.*main.py" || true
    pkill -f "src.main" || true

    # Kill Whisper processes
    pkill -f "whisper.*ts" || true

    # Kill local Redis server to avoid conflicts with Docker Redis
    pkill -f "redis-server" || true

    # Give processes time to die gracefully
    sleep 2

    # Force kill any remaining GPU processes
    pgrep -f "llama-server" | xargs kill -9 2>/dev/null || true
    pgrep -f "vllm" | xargs kill -9 2>/dev/null || true

    success "Existing processes cleaned up."
}

# Run pre-startup cleanup
cleanup_existing

PIDS=()
cleanup() {
    echo -e "\n${YELLOW}Shutting down all services...${NC}"

    # Kill tracked PIDs first
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "Killing PID $pid..."
            kill "$pid" 2>/dev/null || true
        fi
    done

    # Kill any remaining Bernard processes
    pkill -f "bernard.*dev" || true
    pkill -f "bernard.*worker" || true
    pkill -f "vite.*4200" || true
    pkill -f "next.*3000" || true
    pkill -f "llama-server" || true
    pkill -f "vllm" || true
    pkill -f "kokoro" || true
    pkill -f "src.main" || true
    pkill -f "whisper.*ts" || true

    # Stop Docker containers
    docker stop bernard-redis >/dev/null 2>&1 || true

    # Wait for processes to terminate
    wait 2>/dev/null || true

    success "All services stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 3. Setup Infrastructure
log "Setting up infrastructure..."

# Setup Redis with RediSearch
if ! manage_redis_container; then
    error "Failed to setup Redis. Conversation indexing will not work."
    warning "Continuing startup anyway..."
fi

# 5. Start Background Services
log "Starting backend models..."

# Helper for waiting for a service to be ready
wait_for_service() {
    local name=$1
    local port=$2
    local retries=${3:-60}
    log "Waiting for $name to be ready on port $port..."
    local count=0
    while [ $count -lt $retries ]; do
        # Use simple TCP check as a fallback for all services
        if (echo > /dev/tcp/localhost/$port) >/dev/null 2>&1; then
            success "$name is ready!"
            return 0
        fi
        count=$((count + 1))
        sleep 1
    done
    warning "$name failed to become ready in time, continuing anyway..."
    return 1
}

# Check GPU memory before starting GPU services
if check_gpu_memory; then
    # vLLM
    export HF_HOME="$MODELS_DIR/huggingface"
    (source "$API_DIR/vllm_venv/bin/activate" && \
     python -m vllm.entrypoints.openai.api_server \
        --model nomic-ai/nomic-embed-text-v1.5 \
        --host 0.0.0.0 --port 8001 --trust-remote-code \
        --gpu-memory-utilization 0.05 2>&1 | sed "s/^/${CYAN}[VLLM]${NC} /" ; if [ $? -ne 0 ]; then echo "VLLM failed to start, continuing..."; fi) &
    PIDS+=($!)
    # Wait a moment for vLLM to initialize its port
    sleep 2
else
    warning "Skipping VLLM due to low GPU memory"
fi

# Kokoro (TTS Service)
API_DIR="$ROOT_DIR/api" && (cd "$API_DIR/kokoro/api" && source "$API_DIR/kokoro/venv/bin/activate" && \
 PYTHONPATH="." python -m src.main --host 0.0.0.0 --port 8880 2>&1 | sed "s/^/${MAGENTA}[KOKORO]${NC} /" ; if [ $? -ne 0 ]; then echo "Kokoro failed to start, continuing..."; fi) &
PIDS+=($!)

# Whisper (TS)
(npm run dev:whisper --prefix "$SERVER_DIR" 2>&1 | sed "s/^/${YELLOW}[WHISPER]${NC} /" ; if [ $? -ne 0 ]; then echo "Whisper failed to start, continuing..."; fi) &
PIDS+=($!)

# Wait for essential backends to be ready
wait_for_service "Whisper" 8002 30
wait_for_service "Kokoro" 8880 30

# 6. Start Application Servers
log "Starting application servers..."

# Bernard Workers (start these before Next.js so they are ready for tasks)
(npm run queues:worker --prefix "$BERNARD_DIR" 2>&1 | sed "s/^/${CYAN}[QUEUE]${NC} /" ; if [ $? -ne 0 ]; then echo "Queue worker failed to start, continuing..."; fi) &
PIDS+=($!)

(npm run tasks:worker --prefix "$BERNARD_DIR" 2>&1 | sed "s/^/${CYAN}[TASK]${NC} /" ; if [ $? -ne 0 ]; then echo "Task worker failed to start, continuing..."; fi) &
PIDS+=($!)

# Next.js
(npm run dev --prefix "$BERNARD_DIR" -- --port 3000 2>&1 | sed "s/^/${BLUE}[NEXT]${NC} /" ; if [ $? -ne 0 ]; then echo "Next.js failed to start, continuing..."; fi) &
PIDS+=($!)

# Vite
(npm run dev --prefix "$UI_DIR" -- --port 4200 2>&1 | sed "s/^/${GREEN}[VITE]${NC} /" ; if [ $? -ne 0 ]; then echo "Vite failed to start, continuing..."; fi) &
PIDS+=($!)

# Give workers a moment to connect to Redis
sleep 2

# Unified Fastify Server (Foreground)
log "Starting Unified Server on port 3456..."
export PORT=3456
npm run dev --prefix "$SERVER_DIR"
