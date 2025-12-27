#!/usr/bin/env bash
# Don't exit on individual service failures - let them fail gracefully
set -uo pipefail

# Base directories
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICES_DIR="$ROOT_DIR/services"
BERNARD_DIR="$SERVICES_DIR/bernard"
BERNARD_API_DIR="$SERVICES_DIR/bernard-api"
UI_DIR="$SERVICES_DIR/bernard-ui"
API_DIR="$ROOT_DIR/api"
MODELS_DIR="$ROOT_DIR/models"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() { echo -e "${BLUE}[SYSTEM]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# 1. Build Checks (Parallel with visible logs)
log "Starting build checks in parallel..."

# Function to prefix output
prefix_output() {
    local prefix=$1
    while IFS= read -r line; do
        echo "[$prefix] $line"
    done
}

(npm run type-check:src --prefix "$BERNARD_DIR" 2>&1 | prefix_output "BERNARD-TSC") &
BERNARD_TSC_PID=$!
(npm run type-check --prefix "$BERNARD_API_DIR" 2>&1 | prefix_output "BERNARD-API-TSC") &
BERNARD_API_TSC_PID=$!
(npm run build --prefix "$BERNARD_DIR" 2>&1 | prefix_output "BERNARD-BUILD") &
BERNARD_BUILD_PID=$!
(npm run build --prefix "$BERNARD_API_DIR" 2>&1 | prefix_output "BERNARD-API-BUILD") &
BERNARD_API_BUILD_PID=$!

# Wait for all build processes and capture exit codes
wait $BERNARD_TSC_PID
BERNARD_TSC_EXIT=$?
wait $BERNARD_API_TSC_PID
BERNARD_API_TSC_EXIT=$?
wait $BERNARD_BUILD_PID
BERNARD_BUILD_EXIT=$?
wait $BERNARD_API_BUILD_PID
BERNARD_API_BUILD_EXIT=$?

# Check for errors
if [ $BERNARD_TSC_EXIT -ne 0 ] || [ $BERNARD_API_TSC_EXIT -ne 0 ] || [ $BERNARD_BUILD_EXIT -ne 0 ] || [ $BERNARD_API_BUILD_EXIT -ne 0 ]; then
    error "Build checks failed"
    [ $BERNARD_TSC_EXIT -ne 0 ] && error "  - Bernard type check failed"
    [ $BERNARD_API_TSC_EXIT -ne 0 ] && error "  - Bernard API type check failed"
    [ $BERNARD_BUILD_EXIT -ne 0 ] && error "  - Bernard build failed"
    [ $BERNARD_API_BUILD_EXIT -ne 0 ] && error "  - Bernard API build failed"
    exit 1
fi

success "Build checks completed!"

# Source common utilities for service health checking
source "$ROOT_DIR/scripts/common.sh"

# 2. Start Redis
log "Starting Redis..."
"$ROOT_DIR/scripts/services/redis.sh" start 2>&1 | prefix_output "REDIS"

# 3. Start Bernard API
log "Starting Bernard API..."
"$ROOT_DIR/scripts/services/bernard-api.sh" start 2>&1 | prefix_output "BERNARD-API" &
BERNARD_API_START_PID=$!

# 4. Start Other Services (Parallel with visible logs)
log "Starting other services in parallel..."
"$ROOT_DIR/scripts/services/bernard.sh" start 2>&1 | prefix_output "BERNARD" &
BERNARD_START_PID=$!
"$ROOT_DIR/scripts/services/bernard-ui.sh" start 2>&1 | prefix_output "BERNARD-UI" &
BERNARD_UI_START_PID=$!
"$ROOT_DIR/scripts/services/whisper.sh" start 2>&1 | prefix_output "WHISPER" &
WHISPER_START_PID=$!
"$ROOT_DIR/scripts/services/kokoro.sh" start 2>&1 | prefix_output "KOKORO" &
KOKORO_START_PID=$!
"$ROOT_DIR/scripts/services/vllm-embedding.sh" start 2>&1 | prefix_output "VLLM-EMBEDDING" &
VLLM_START_PID=$!

# 5. Wait for all services to be ready (or fail)
log "Waiting for all services to start..."
SERVICES_FAILED=0

# Wait for Bernard API (port 3000, /health endpoint)
wait_for_service "Bernard API" 3000 "/health" 60 || SERVICES_FAILED=$((SERVICES_FAILED + 1))

# Wait for Bernard (port 3001, /health endpoint)
wait_for_service "Bernard" 3001 "/health" 60 || SERVICES_FAILED=$((SERVICES_FAILED + 1))

# Wait for Bernard UI (port 4200, / endpoint)
wait_for_service "Bernard-UI" 4200 "/" 30 || SERVICES_FAILED=$((SERVICES_FAILED + 1))

# Wait for Whisper (port 8002, /health endpoint)
wait_for_service "Whisper" 8002 "/health" 30 || SERVICES_FAILED=$((SERVICES_FAILED + 1))

# Wait for Kokoro (port 8880, /health endpoint)
wait_for_service "Kokoro" 8880 "/health" 30 || SERVICES_FAILED=$((SERVICES_FAILED + 1))

# Wait for vLLM Embedding (port 8001, /health endpoint)
wait_for_service "vLLM-Embedding" 8001 "/health" 90 || SERVICES_FAILED=$((SERVICES_FAILED + 1))

if [ $SERVICES_FAILED -gt 0 ]; then
    warning "$SERVICES_FAILED service(s) failed to start, but continuing..."
else
    success "All services started successfully!"
fi

# 6. Start API Gateway
log "Starting API Gateway..."
"$ROOT_DIR/scripts/api.sh" start 2>&1 | prefix_output "API-GATEWAY" &
API_START_PID=$!

# Wait for API Gateway to be ready
wait_for_service "Server" 3456 "/health" 30 || {
    error "API Gateway failed to start"
    SERVICES_FAILED=$((SERVICES_FAILED + 1))
}

# 7. Launch Browser
log "Opening browser to http://localhost:3456/bernard/chat..."
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:3456/bernard/chat" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    open "http://localhost:3456/bernard/chat" >/dev/null 2>&1 &
fi

# 8. Application startup complete
if [ $SERVICES_FAILED -eq 0 ]; then
    success "Application startup complete!"
else
    warning "Application startup complete with $SERVICES_FAILED service(s) failed"
fi

# Keep script running
while true; do sleep 1; done
