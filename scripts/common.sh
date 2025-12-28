#!/usr/bin/env bash
# Common utilities for Bernard service scripts

# Base directories
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../" && pwd)"
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
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log() { echo -e "${BLUE}[SERVICE]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }

# Kill process using specific port
kill_port() {
    local port=$1
    local name=$2

    log "Checking port $port for existing $name processes..."

    # Find processes using the port
    local pids=$(lsof -ti:$port 2>/dev/null)

    if [ -n "$pids" ]; then
        warning "Found processes using port $port: $pids"
        warning "Killing processes on port $port..."
        echo "$pids" | xargs kill -9 2>/dev/null || true

        # Wait a moment for processes to die
        sleep 1

        # Check if port is still in use
        if lsof -ti:$port >/dev/null 2>&1; then
            error "Failed to free port $port"
            return 1
        else
            success "Successfully freed port $port"
        fi
    else
        log "Port $port is available"
    fi

    return 0
}

# Check if a service is healthy by testing its port
check_service_health() {
    local name=$1
    local port=$2
    local endpoint=${3:-""}
    local timeout=${4:-5}

    if [ -n "$endpoint" ]; then
        # For HTTP endpoints
        if curl -f --max-time $timeout "http://localhost:$port$endpoint" >/dev/null 2>&1; then
            return 0
        fi
    else
        # For simple port checks
        if timeout $timeout bash -c "echo > /dev/tcp/localhost/$port" 2>/dev/null; then
            return 0
        fi
    fi

    return 1
}

# Wait for service to become ready
wait_for_service() {
    local name=$1
    local port=$2
    local endpoint=${3:-""}
    local retries=${4:-30}
    local timeout=${5:-5}

    log "Waiting for $name to be ready on port $port..."
    local count=0
    while [ $count -lt $retries ]; do
        if check_service_health "$name" "$port" "$endpoint" "$timeout"; then
            success "$name is ready!"
            return 0
        fi
        count=$((count + 1))
        sleep 1
    done

    warning "$name failed to become ready in time"
    return 1
}

# Get the service status (used by status API)
get_service_status() {
    local name=$1
    local port=$2
    local endpoint=${3:-""}

    if check_service_health "$name" "$port" "$endpoint" 2; then
        echo "online"
    else
        echo "offline"
    fi
}

