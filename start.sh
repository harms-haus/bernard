#!/usr/bin/env bash
# Don't exit on individual service failures - let them fail gracefully
set -uo pipefail

# Base directories
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICES_DIR="$ROOT_DIR/services"
BERNARD_DIR="$SERVICES_DIR/bernard"
UI_DIR="$SERVICES_DIR/bernard-ui"
API_DIR="$ROOT_DIR/api"
MODELS_DIR="$ROOT_DIR/models"

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

# Check GPU memory availability (used by vLLM script)
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
# 1. Build Checks (Fail Fast)
log "Starting build checks..."

# Create temp files for capturing output
BERNARD_TSC_LOG=$(mktemp)
SERVER_BUILD_LOG=$(mktemp)
BERNARD_LINT_LOG=$(mktemp)
BERNARD_BUILD_LOG=$(mktemp)

# Start all build checks in parallel
log "Running build checks in parallel..."

# Bernard type check
npm run type-check:src --prefix "$BERNARD_DIR" > "$BERNARD_TSC_LOG" 2>&1 &
BERNARD_TSC_PID=$!

# API build (includes type check)
npm run build --prefix "$API_DIR" > "$SERVER_BUILD_LOG" 2>&1 &
SERVER_BUILD_PID=$!

# Bernard lint
npm run lint --prefix "$BERNARD_DIR" > "$BERNARD_LINT_LOG" 2>&1 &
BERNARD_LINT_PID=$!

# Bernard build
npm run build --prefix "$BERNARD_DIR" > "$BERNARD_BUILD_LOG" 2>&1 &
BERNARD_BUILD_PID=$!

# Wait for all to complete
log "Waiting for build checks to complete..."
wait $BERNARD_TSC_PID
BERNARD_TSC_EXIT=$?
wait $SERVER_BUILD_PID
SERVER_BUILD_EXIT=$?
wait $BERNARD_LINT_PID
BERNARD_LINT_EXIT=$?
wait $BERNARD_BUILD_PID
BERNARD_BUILD_EXIT=$?

# Check results and report failures
FAILED_CHECKS=()

if [ $BERNARD_TSC_EXIT -ne 0 ]; then
    FAILED_CHECKS+=("Bernard Type Check")
    error "Bernard type check failed:"
    cat "$BERNARD_TSC_LOG"
fi

if [ $SERVER_BUILD_EXIT -ne 0 ]; then
    FAILED_CHECKS+=("API Build")
    error "API build failed:"
    cat "$SERVER_BUILD_LOG"
fi

if [ $BERNARD_LINT_EXIT -ne 0 ]; then
    FAILED_CHECKS+=("Bernard Lint")
    error "Bernard linting failed:"
    cat "$BERNARD_LINT_LOG"
fi

if [ $BERNARD_BUILD_EXIT -ne 0 ]; then
    FAILED_CHECKS+=("Bernard Build")
    error "Bernard build failed:"
    cat "$BERNARD_BUILD_LOG"
fi

# Clean up temp files
rm -f "$BERNARD_TSC_LOG" "$SERVER_BUILD_LOG" "$BERNARD_LINT_LOG" "$BERNARD_BUILD_LOG"

# Exit if any checks failed
if [ ${#FAILED_CHECKS[@]} -ne 0 ]; then
    error "Build checks failed: ${FAILED_CHECKS[*]}"
    exit 1
fi

success "Build checks passed!"

# 2. Cleanup and Process Management

# Pre-startup cleanup - kill any existing Bernard processes
cleanup_existing() {
    log "Cleaning up existing Bernard processes..."

    # Use individual service scripts to stop services
    "$ROOT_DIR/scripts/services/redis.sh" stop 2>/dev/null || true
    "$ROOT_DIR/scripts/services/vllm-embedding.sh" stop 2>/dev/null || true
    "$ROOT_DIR/scripts/services/kokoro.sh" stop 2>/dev/null || true
    "$ROOT_DIR/scripts/services/whisper.sh" stop 2>/dev/null || true
    "$ROOT_DIR/scripts/services/bernard.sh" stop 2>/dev/null || true
    "$ROOT_DIR/scripts/services/bernard-ui.sh" stop 2>/dev/null || true
    "$ROOT_DIR/scripts/api.sh" stop 2>/dev/null || true

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

    # Aggressive cleanup of Bernard workers that might be stuck in Redis reconnection loops
    echo "Force terminating any stuck Bernard workers..."
    pkill -9 -f "queueWorker.ts" 2>/dev/null || true
    pkill -9 -f "taskWorker.ts" 2>/dev/null || true

    # Stop services in reverse order (server first, then dependencies)
    "$ROOT_DIR/scripts/api.sh" stop 2>/dev/null || true
    "$ROOT_DIR/scripts/services/bernard.sh" stop 2>/dev/null || true
    "$ROOT_DIR/scripts/services/bernard-ui.sh" stop 2>/dev/null || true
    "$ROOT_DIR/scripts/services/redis.sh" stop 2>/dev/null || true
    "$ROOT_DIR/scripts/services/vllm-embedding.sh" stop 2>/dev/null || true
    "$ROOT_DIR/scripts/services/kokoro.sh" stop 2>/dev/null || true
    "$ROOT_DIR/scripts/services/whisper.sh" stop 2>/dev/null || true

    success "All services stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 3. Setup Infrastructure
log "Setting up infrastructure..."

# Setup Redis with RediSearch
if ! "$ROOT_DIR/scripts/services/redis.sh" start; then
    error "Failed to setup Redis. Conversation indexing will not work."
    warning "Continuing startup anyway..."
fi

# 5. Start Background Services
log "Starting backend services in parallel..."

# Track service startup results
VLLM_STARTED=false
SERVICES_PIDS=()

# Check GPU memory before starting GPU services
if check_gpu_memory; then
    # Start vLLM Embedding
    "$ROOT_DIR/scripts/services/vllm-embedding.sh" start &
    SERVICES_PIDS+=($!)
    
    VLLM_STARTED=true
else
    warning "Skipping VLLM due to low GPU memory"
fi

# Start Kokoro (TTS Service)
"$ROOT_DIR/scripts/services/kokoro.sh" start &
SERVICES_PIDS+=($!)

# Start Whisper (TS)
"$ROOT_DIR/scripts/services/whisper.sh" start &
SERVICES_PIDS+=($!)

# 6. Start Application Servers
log "Starting application servers..."

# Start Bernard (includes workers and Next.js)
"$ROOT_DIR/scripts/services/bernard.sh" start &
SERVICES_PIDS+=($!)

# Wait for all services to complete their startup
log "Waiting for all services to complete startup..."
for pid in "${SERVICES_PIDS[@]}"; do
    if ! wait "$pid" 2>/dev/null; then
        warning "Service with PID $pid failed to start, continuing..."
    fi
done

success "All services startup attempts completed"

# Start Bernard UI (Vite)
if ! "$ROOT_DIR/scripts/services/bernard-ui.sh" start; then
    warning "Bernard UI failed to start, continuing..."
fi

# Start Unified Fastify Server
log "Starting Unified Server on port 3456..."
if ! "$ROOT_DIR/scripts/api.sh" start; then
    error "Failed to start unified server"
    exit 1
fi

# Open browser to the unified server
log "Opening browser to http://localhost:3456/bernard/chat..."
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:3456/bernard/chat" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    open "http://localhost:3456/bernard/chat" >/dev/null 2>&1 &
else
    warning "Could not find a command to open the browser. Please manually open http://localhost:3456/bernard/chat"
fi

# Wait indefinitely to keep the script running while services are active
log "All services started. Press Ctrl+C to stop all services."
# Wait indefinitely for interrupt signals
while true; do
    sleep 1
done
