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

# Function to prefix output
prefix_output() {
    local prefix=$1
    while IFS= read -r line; do
        echo "[$prefix] $line"
    done
}

# Source common utilities for service health checking
source "$ROOT_DIR/scripts/common.sh"

# Track failed services
SERVICES_FAILED=0

# 1. Parallel group: tsc, lint, build
log "Starting build checks in parallel (tsc, lint, build)..."

(npm run type-check:src --prefix "$BERNARD_DIR" 2>&1 | prefix_output "BERNARD-TSC") &
BERNARD_TSC_PID=$!
(npm run type-check --prefix "$BERNARD_API_DIR" 2>&1 | prefix_output "BERNARD-API-TSC") &
BERNARD_API_TSC_PID=$!
(npm run lint --prefix "$BERNARD_DIR" 2>&1 | prefix_output "BERNARD-LINT") &
BERNARD_LINT_PID=$!
(npm run lint --prefix "$BERNARD_API_DIR" 2>&1 | prefix_output "BERNARD-API-LINT") &
BERNARD_API_LINT_PID=$!
(npm run build --prefix "$BERNARD_DIR" 2>&1 | prefix_output "BERNARD-BUILD") &
BERNARD_BUILD_PID=$!
(npm run build --prefix "$BERNARD_API_DIR" 2>&1 | prefix_output "BERNARD-API-BUILD") &
BERNARD_API_BUILD_PID=$!

# 2. Wait for all building steps to complete
log "Waiting for all build steps to complete..."
wait $BERNARD_TSC_PID
BERNARD_TSC_EXIT=$?
wait $BERNARD_API_TSC_PID
BERNARD_API_TSC_EXIT=$?
wait $BERNARD_LINT_PID
BERNARD_LINT_EXIT=$?
wait $BERNARD_API_LINT_PID
BERNARD_API_LINT_EXIT=$?
wait $BERNARD_BUILD_PID
BERNARD_BUILD_EXIT=$?
wait $BERNARD_API_BUILD_PID
BERNARD_API_BUILD_EXIT=$?

# Check for any failures - ALL failures are fatal
FAILED_STEPS=0
if [ $BERNARD_TSC_EXIT -ne 0 ] || [ $BERNARD_API_TSC_EXIT -ne 0 ] || [ $BERNARD_LINT_EXIT -ne 0 ] || [ $BERNARD_API_LINT_EXIT -ne 0 ] || [ $BERNARD_BUILD_EXIT -ne 0 ] || [ $BERNARD_API_BUILD_EXIT -ne 0 ]; then
    error ""
    error "═══════════════════════════════════════════════════════════════"
    error "BUILD CHECKS FAILED - Startup halted"
    error "═══════════════════════════════════════════════════════════════"
    error ""
    
    [ $BERNARD_TSC_EXIT -ne 0 ] && {
        error "❌ Bernard type check (tsc) FAILED"
        FAILED_STEPS=$((FAILED_STEPS + 1))
    }
    [ $BERNARD_API_TSC_EXIT -ne 0 ] && {
        error "❌ Bernard API type check (tsc) FAILED"
        FAILED_STEPS=$((FAILED_STEPS + 1))
    }
    [ $BERNARD_LINT_EXIT -ne 0 ] && {
        error "❌ Bernard lint FAILED"
        FAILED_STEPS=$((FAILED_STEPS + 1))
    }
    [ $BERNARD_API_LINT_EXIT -ne 0 ] && {
        error "❌ Bernard API lint FAILED"
        FAILED_STEPS=$((FAILED_STEPS + 1))
    }
    [ $BERNARD_BUILD_EXIT -ne 0 ] && {
        error "❌ Bernard build FAILED"
        FAILED_STEPS=$((FAILED_STEPS + 1))
    }
    [ $BERNARD_API_BUILD_EXIT -ne 0 ] && {
        error "❌ Bernard API build FAILED"
        FAILED_STEPS=$((FAILED_STEPS + 1))
    }
    
    error ""
    error "Total failed steps: $FAILED_STEPS"
    error ""
    error "Please fix the errors above before starting the application."
    error "═══════════════════════════════════════════════════════════════"
    error ""
    exit 1
fi

success "All build checks completed successfully!"

# 3. Kill processes on required ports
log "Killing existing processes on required ports..."
REQUIRED_PORTS=(
    "6379:Redis"
    "3001:Bernard"
    "4200:Bernard-UI"
    "8002:Whisper"
    "8880:Kokoro"
    "8001:vLLM-Embedding"
    "3456:API-Proxy"
)

for port_service in "${REQUIRED_PORTS[@]}"; do
    IFS=':' read -r port name <<< "$port_service"
    if ! kill_port "$port" "$name"; then
        warning "Failed to free port $port, but continuing startup..."
    fi
done

success "Port cleanup completed."

# 5. Start Redis
log "Starting Redis..."
"$ROOT_DIR/scripts/services/redis.sh" start 2>&1 | prefix_output "REDIS" || {
    error "Redis failed to start"
    SERVICES_FAILED=$((SERVICES_FAILED + 1))
    exit 1
}

# 6. Wait for Redis to be ready
log "Waiting for Redis to be ready..."
if ! wait_for_service "Redis" 6379 "" 30; then
    error "Redis failed to become ready"
    SERVICES_FAILED=$((SERVICES_FAILED + 1))
    exit 1
fi

# 7. Start Bernard API
log "Starting Bernard API..."
if ! { "$ROOT_DIR/scripts/services/bernard-api.sh" start 2>&1 | prefix_output "BERNARD-API"; }; then
    error "Bernard API failed to start"
    SERVICES_FAILED=$((SERVICES_FAILED + 1))
fi

# 8. Parallel group: bernard, bernard-ui, whisper, kokoro, vllm
log "Starting services in parallel (bernard, bernard-ui, whisper, kokoro, vllm)..."
(
    "$ROOT_DIR/scripts/services/bernard.sh" start 2>&1 | prefix_output "BERNARD"
    echo ${PIPESTATUS[0]} > /tmp/bernard-exit
) &
BERNARD_START_PID=$!
(
    "$ROOT_DIR/scripts/services/bernard-ui.sh" start 2>&1 | prefix_output "BERNARD-UI"
    echo ${PIPESTATUS[0]} > /tmp/bernard-ui-exit
) &
BERNARD_UI_START_PID=$!
(
    "$ROOT_DIR/scripts/services/whisper.sh" start 2>&1 | prefix_output "WHISPER"
    echo ${PIPESTATUS[0]} > /tmp/whisper-exit
) &
WHISPER_START_PID=$!
(
    "$ROOT_DIR/scripts/services/kokoro.sh" start 2>&1 | prefix_output "KOKORO"
    echo ${PIPESTATUS[0]} > /tmp/kokoro-exit
) &
KOKORO_START_PID=$!
(
    "$ROOT_DIR/scripts/services/vllm-embedding.sh" start 2>&1 | prefix_output "VLLM-EMBEDDING"
    echo ${PIPESTATUS[0]} > /tmp/vllm-exit
) &
VLLM_START_PID=$!

# 9. Wait for all services to start or fail
log "Waiting for all services to start or fail..."
wait $BERNARD_START_PID
BERNARD_EXIT=$(cat /tmp/bernard-exit 2>/dev/null || echo "1")
wait $BERNARD_UI_START_PID
BERNARD_UI_EXIT=$(cat /tmp/bernard-ui-exit 2>/dev/null || echo "1")
wait $WHISPER_START_PID
WHISPER_EXIT=$(cat /tmp/whisper-exit 2>/dev/null || echo "1")
wait $KOKORO_START_PID
KOKORO_EXIT=$(cat /tmp/kokoro-exit 2>/dev/null || echo "1")
wait $VLLM_START_PID
VLLM_EXIT=$(cat /tmp/vllm-exit 2>/dev/null || echo "1")

# Clean up exit code files
rm -f /tmp/bernard-exit /tmp/bernard-ui-exit /tmp/whisper-exit /tmp/kokoro-exit /tmp/vllm-exit

# Check each service's exit status and verify health
if [ $BERNARD_EXIT -ne 0 ]; then
    SERVICES_FAILED=$((SERVICES_FAILED + 1))
else
    wait_for_service "Bernard" 3001 "/health" 5 || SERVICES_FAILED=$((SERVICES_FAILED + 1))
fi

if [ $BERNARD_UI_EXIT -ne 0 ]; then
    SERVICES_FAILED=$((SERVICES_FAILED + 1))
else
    wait_for_service "Bernard-UI" 4200 "/" 5 || SERVICES_FAILED=$((SERVICES_FAILED + 1))
fi

if [ $WHISPER_EXIT -ne 0 ]; then
    SERVICES_FAILED=$((SERVICES_FAILED + 1))
else
    wait_for_service "Whisper" 8002 "/health" 5 || SERVICES_FAILED=$((SERVICES_FAILED + 1))
fi

if [ $KOKORO_EXIT -ne 0 ]; then
    SERVICES_FAILED=$((SERVICES_FAILED + 1))
else
    wait_for_service "Kokoro" 8880 "/health" 5 || SERVICES_FAILED=$((SERVICES_FAILED + 1))
fi

if [ $VLLM_EXIT -ne 0 ]; then
    SERVICES_FAILED=$((SERVICES_FAILED + 1))
else
    wait_for_service "vLLM-Embedding" 8001 "/health" 5 || SERVICES_FAILED=$((SERVICES_FAILED + 1))
fi

# 10. Start API Proxy
log "Starting API Proxy..."
if ! "$ROOT_DIR/scripts/api.sh" start 2>&1 | prefix_output "API-PROXY"; then
    error "API Proxy failed to start"
    SERVICES_FAILED=$((SERVICES_FAILED + 1))
fi

# 11. Wait for API Proxy to be ready (service script already waits, but verify)
log "Waiting for API Proxy to be ready..."
if ! wait_for_service "Server" 3456 "/health" 30; then
    error "API Proxy failed to become ready"
    SERVICES_FAILED=$((SERVICES_FAILED + 1))
fi

# 12. Launch browser to http://localhost:3456/bernard/chat
log "Launching browser to http://localhost:3456/bernard/chat..."
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:3456/bernard/chat" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    open "http://localhost:3456/bernard/chat" >/dev/null 2>&1 &
fi

# 13. Log that application is loaded, warn about services not started
if [ $SERVICES_FAILED -eq 0 ]; then
    success "Application loaded successfully! All services are running."
else
    warning "Application loaded, but $SERVICES_FAILED service(s) failed to start."
fi

# Keep script running
while true; do sleep 1; done
