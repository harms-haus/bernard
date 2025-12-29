#!/bin/bash

SERVICE_NAME="REDIS"
COLOR="\033[0;31m"
NC="\033[0m"
PORT=6379
CONTAINER_NAME="bernard-redis"

source "$(dirname "$0")/logging.sh"

stop() {
    log "Stopping Redis container..."
    docker stop $CONTAINER_NAME >/dev/null 2>&1 || true
    success "Redis stopped"
}

init() {
    log "Initializing Redis (no-op)..."
}

clean() {
    log "Cleaning Redis..."
    docker rm -f $CONTAINER_NAME >/dev/null 2>&1 || true
    docker volume rm bernard-redis-data >/dev/null 2>&1 || true
    success "Redis cleaned"
}

check() {
    log "Running checks for $SERVICE_NAME..."
    local all_passed=true

    log "Checking docker installation..."
    if command -v docker > /dev/null 2>&1; then
        success "Docker found"
    else
        error "Docker not found"
        all_passed=false
    fi

    if [ "$all_passed" = false ]; then
        log "Some checks failed. Halting."
        return 1
    fi

    log "All checks passed!"
    return 0
}

start() {
    log "Setting up Redis with RediSearch..."

    if ! command -v docker >/dev/null 2>&1; then
        error "Docker is not available. Redis with RediSearch is required."
        exit 1
    fi

    if docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log "Redis container is already running"
        wait_for_redis
        return $?
    fi

    log "Checking for existing $CONTAINER_NAME container..."
    if docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        kill_port "$PORT" "$SERVICE_NAME" || exit 1
        log "Starting existing $CONTAINER_NAME container..."
        if docker start $CONTAINER_NAME; then
            wait_for_redis
            return $?
        else
            error "Failed to start existing Redis container"
            exit 1
        fi
    fi

    kill_port "$PORT" "$SERVICE_NAME" || exit 1

    log "Starting new Redis with RediSearch container..."
    if docker run -d --name $CONTAINER_NAME \
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

kill_port() {
    local port=$1
    local service=$2
    local pid=$(lsof -t -i:$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        log "Killing process on port $port (PID: $pid)"
        kill -9 $pid
        sleep 0.5
    fi
}

wait_for_redis() {
    log "Waiting for Redis to be ready..."
    local retries=30
    local count=0
    while [ $count -lt $retries ]; do
        if docker exec $CONTAINER_NAME redis-cli ping >/dev/null 2>&1; then
            success "Redis with RediSearch is ready!"
            return 0
        fi
        count=$((count + 1))
        sleep 1
    done
    error "Redis failed to start properly"
    return 1
}

case "$1" in
    start) start ;;
    stop) stop ;;
    init) init ;;
    clean) clean ;;
    check) check ;;
    *) echo "Usage: $0 {start|stop|init|clean|check}" ;;
esac
