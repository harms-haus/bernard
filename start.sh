#!/bin/bash

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

log() {
    echo -e "\033[1;34m[MAIN]\033[0m $1"
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
build_service "services/bernard" "BERNARD"
build_service "services/bernard-api" "BERNARD-API"
build_service "services/bernard-ui" "BERNARD-UI"
build_service "proxy-api" "PROXY-API"

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

# 3. Start services in order
log "Starting services in order..."

./scripts/redis.sh start || exit 1
./scripts/bernard-api.sh start || exit 1
./scripts/proxy-api.sh start || exit 1
./scripts/bernard.sh start || exit 1
./scripts/bernard-ui.sh start || exit 1
./scripts/vllm.sh start
./scripts/whisper.sh start
./scripts/kokoro.sh start

# 4. Summary
log "All services started successfully!"
echo "--------------------------------------------------"
echo "Service        | URL                        | Port"
echo "--------------------------------------------------"
echo "Proxy API      | http://0.0.0.0:3456        | 3456"
echo "Bernard UI     | http://127.0.0.1:3456/bernard/ | 8810"
echo "Bernard API    | http://127.0.0.1:8800      | 8800"
echo "Bernard Agent  | http://127.0.0.1:8850      | 8850"
echo "vLLM           | http://127.0.0.1:8860      | 8860"
echo "Whisper        | http://127.0.0.1:8870      | 8870"
echo "Kokoro         | http://127.0.0.1:8880      | 8880"
echo "Redis          | redis://127.0.0.1:6379     | 6379"
echo "--------------------------------------------------"
log "Logs are available in the logs/ directory."
log "You can access the UI at http://localhost:3456/bernard/"
