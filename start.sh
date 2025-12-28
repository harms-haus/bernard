#!/bin/bash

# Load environment variables
if [ -f .env ]; then
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip comments and empty lines
        [[ "$line" =~ ^[[:space:]]*#.*$ ]] && continue
        [[ -z "${line//[[:space:]]/}" ]] && continue
        
        # Only export if it looks like a variable assignment
        if [[ "$line" =~ ^[a-zA-Z_][a-zA-Z0-9_]*=.*$ ]]; then
            export "$line"
        fi
    done < .env
fi

log() {
    echo -e "\033[1;34m[MAIN]\033[0m $1"
}

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m' # No Color

# Function to start a service with timeout
start_service_with_timeout() {
    local script=$1
    local service_name=$2
    local timeout=${3:-20}

    log "Starting $service_name (timeout: ${timeout}s)..."

    timeout $timeout $script start
    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        log "${GREEN}$service_name started successfully!${NC}"
        return 0
    elif [ $exit_code -eq 124 ]; then
        log "${YELLOW}$service_name timed out after ${timeout}s${NC}"

        local log_file="logs/${service_name,,}.log"
        if [ -f "$log_file" ]; then
            log "${RED}Last 10 lines of $service_name log:${NC}"
            tail -10 "$log_file" | sed 's/^/  /'
        else
            log "${RED}No log file found for $service_name${NC}"
        fi
        return 1
    else
        log "${RED}$service_name failed to start (exit code: $exit_code)${NC}"

        local log_file="logs/${service_name,,}.log"
        if [ -f "$log_file" ]; then
            log "${RED}Last 10 lines of $service_name log:${NC}"
            tail -10 "$log_file" | sed 's/^/  /'
        else
            log "${RED}No log file found for $service_name${NC}"
        fi
        return 1
    fi
}

# Function to run build steps for a service
build_service() {
    local dir=$1
    local name=$2
    log "Preparing $name..."
    (
        cd "$dir" || exit 1
        log "[$name] Running type-check..."
        npm run type-check || exit 1
        log "[$name] Running lint..."
        npm run lint || exit 1
        log "[$name] Running build..."
        npm run build || exit 1
    )
}

# 1. Build TypeScript Services
build_service "services/bernard" "BERNARD" || exit 1
build_service "services/bernard-api" "BERNARD-API" || exit 1
build_service "services/bernard-ui" "BERNARD-UI" || exit 1
build_service "proxy-api" "PROXY-API" || exit 1

# 2. Shutdown all existing services
log "Shutting down existing services..."
./scripts/redis.sh stop
./scripts/bernard-api.sh stop
./scripts/proxy-api.sh stop
./scripts/bernard.sh stop
./scripts/bernard-ui.sh stop
./scripts/vllm.sh stop
./scripts/whisper.sh stop
./scripts/kokoro.sh stop

# 3. Start services in order with timeout handling
log "Starting services in order..."

# Create logs directory if it doesn't exist
mkdir -p logs

# Start all services with timeout, regardless of individual failures
start_service_with_timeout "./scripts/redis.sh" "REDIS" 20
start_service_with_timeout "./scripts/bernard-api.sh" "BERNARD-API" 20
start_service_with_timeout "./scripts/proxy-api.sh" "PROXY-API" 20
start_service_with_timeout "./scripts/bernard.sh" "BERNARD" 20
start_service_with_timeout "./scripts/bernard-ui.sh" "BERNARD-UI" 20
start_service_with_timeout "./scripts/vllm.sh" "VLLM" 20
start_service_with_timeout "./scripts/whisper.sh" "WHISPER" 20
start_service_with_timeout "./scripts/kokoro.sh" "KOKORO" 20

# 4. Summary
log "Startup complete!"

check_service() {
    local service=$1
    local port=$2
    local url=$3

    if [ -z "$url" ]; then
        if lsof -i:$port > /dev/null 2>&1; then
            echo -e "${GREEN}up${NC}"
        else
            echo -e "${RED}down${NC}"
        fi
    else
        if curl -sf "$url/health" > /dev/null 2>&1 || curl -sf "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}up${NC}"
        else
            echo -e "${RED}down${NC}"
        fi
    fi
}

echo
log "Service URLs:"
echo "--------------------------------------------------------------"
echo "Service        | URL                        | Port   | status "
echo "--------------------------------------------------------------"
printf "Proxy API      | http://0.0.0.0:3456        | 3456   | %s\n" "$(check_service "Proxy API" 3456 "")"
printf "Bernard UI     | http://127.0.0.1:8810      | 8810   | %s\n" "$(check_service "Bernard UI" 8810 "http://127.0.0.1:8810")"
printf "Bernard API    | http://127.0.0.1:8800      | 8800   | %s\n" "$(check_service "Bernard API" 8800 "http://127.0.0.1:8800")"
printf "Bernard Agent  | http://127.0.0.1:8850      | 8850   | %s\n" "$(check_service "Bernard Agent" 8850 "http://127.0.0.1:8850")"
printf "vLLM           | http://127.0.0.1:8860      | 8860   | %s\n" "$(check_service "vLLM" 8860 "http://127.0.0.1:8860")"
printf "Whisper        | http://127.0.0.1:8870      | 8870   | %s\n" "$(check_service "Whisper" 8870 "http://127.0.0.1:8870")"
printf "Kokoro         | http://127.0.0.1:8880      | 8880   | %s\n" "$(check_service "Kokoro" 8880 "http://127.0.0.1:8880")"
printf "Redis          | redis://127.0.0.1:6379     | 6379   | %s\n" "$(check_service "Redis" 6379 "")"
echo "--------------------------------------------------------------"
log "Logs are available in the logs/ directory."
log "You can access the UI at http://0.0.0.0:3456/bernard/"
