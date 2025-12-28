#!/usr/bin/env bash
# Redis service management script

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"

SERVICE_NAME="Redis"
PORT=6379

start_redis() {
    log "Setting up Redis with RediSearch..."

    # Check if Docker is available
    if ! command -v docker >/dev/null 2>&1; then
        error "Docker is not available. Redis with RediSearch is required."
        exit 1
    fi

    # Check if container is already running
    if docker ps --format 'table {{.Names}}' | grep -q "^bernard-redis$"; then
        log "Redis container is already running"
        wait_for_redis
        return $?
    fi

    log "Checking for existing bernard-redis container..."
    # Start any existing bernard-redis container (but don't remove it)
    if docker ps -a --format 'table {{.Names}}' | grep -q "^bernard-redis$"; then
        # Kill any existing processes on the port before starting container
        kill_port $PORT "$SERVICE_NAME" || exit 1
        log "Starting existing bernard-redis container..."
        if docker start bernard-redis; then
            wait_for_redis
            return $?
        else
            error "Failed to start existing Redis container"
            exit 1
        fi
    fi

    # Kill any existing processes on the port before starting new container
    kill_port $PORT "$SERVICE_NAME" || exit 1

    # Start the Redis Stack container with RediSearch
    log "Starting new Redis with RediSearch container..."
    if docker run -d --name bernard-redis \
        -p 6379:6379 \
        --restart unless-stopped \
        -v bernard-redis-data:/data \
        docker.io/redis/redis-stack-server:7.4.0-v0; then

        wait_for_redis
        return $?
    else
        error "Failed to start Redis Docker container"
        exit 1
    fi
}

wait_for_redis() {
    log "Waiting for Redis to be ready..."
    local retries=30
    local count=0
    while [ $count -lt $retries ]; do
        if docker exec bernard-redis redis-cli ping >/dev/null 2>&1; then
            success "Redis with RediSearch is ready!"
            return 0
        fi
        count=$((count + 1))
        sleep 1
    done
    error "Redis failed to start properly"
    return 1
}

stop_redis() {
    log "Stopping Redis container..."
    docker stop bernard-redis >/dev/null 2>&1 || true
    success "Redis stopped"
}

restart_redis() {
    log "Restarting Redis..."
    stop_redis
    sleep 2
    start_redis
}

# Main command handling
case "${1:-start}" in
    start)
        start_redis
        ;;
    stop)
        stop_redis
        ;;
    restart)
        restart_redis
        ;;
    status)
        get_service_status "$SERVICE_NAME" $PORT
        ;;
    *)
        error "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac

