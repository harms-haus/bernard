#!/bin/bash

# Standalone Redis Docker container management function
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
        return 0
    fi

    echo "Checking for existing bernard-redis container..."
    # Stop any existing bernard-redis container (but don't remove it)
    if docker ps -a --format 'table {{.Names}}' | grep -q "^bernard-redis$"; then
        echo "Starting existing bernard-redis container..."
        if docker start bernard-redis; then
            echo "Waiting for Redis to be ready..."
            # Wait for Redis to be ready
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

        echo "Waiting for Redis to be ready..."
        # Wait for Redis to be ready
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
    else
        echo "ERROR: Failed to start Redis Docker container"
        return 1
    fi
}

# If called directly, run the function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    manage_redis_container
fi
