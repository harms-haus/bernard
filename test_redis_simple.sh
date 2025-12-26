#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[TEST]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Redis Docker container management function
manage_redis_container() {
    log "Setting up Redis with RediSearch..."

    # Check if Docker is available
    if ! command -v docker >/dev/null 2>&1; then
        error "Docker is not available. Redis with RediSearch is required for conversation indexing."
        return 1
    fi

    # Check if container is already running
    if docker ps --format 'table {{.Names}}' | grep -q "^bernard-redis$"; then
        log "Redis container is already running"
        return 0
    fi

    # Stop any existing bernard-redis container (but don't remove it)
    if docker ps -a --format 'table {{.Names}}' | grep -q "^bernard-redis$"; then
        log "Starting existing bernard-redis container..."
        if docker start bernard-redis >/dev/null 2>&1; then
            # Wait for Redis to be ready
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
        else
            error "Failed to start existing Redis container"
            return 1
        fi
    fi

    # Start the Redis Stack container with RediSearch
    log "Starting new Redis with RediSearch container..."
    if docker run -d --name bernard-redis \
        -p 6379:6379 \
        --restart unless-stopped \
        -v bernard-redis-data:/data \
        docker.io/redis/redis-stack-server:7.4.0-v0 >/dev/null 2>&1; then

        # Wait for Redis to be ready
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
    else
        error "Failed to start Redis Docker container"
        return 1
    fi
}

# Test the function
log "Testing manage_redis_container function..."
if manage_redis_container; then
    success "manage_redis_container function worked!"
    docker ps | grep bernard-redis
else
    error "manage_redis_container function failed"
fi
