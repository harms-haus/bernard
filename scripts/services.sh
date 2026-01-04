#!/bin/bash

log() {
    echo -e "\033[1;34m[    SERVICES   ]\033[0m    $1"
}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m'

# Function to conditionally colorize output
colorize() {
    if [ -t 1 ]; then
        echo -e "$1"
    else
        echo "$2"
    fi
}

cleanup_all_services() {
    log "Stopping all services..."
    ./scripts/redis.sh stop
    ./scripts/shared.sh stop
    ./scripts/bernard-api.sh stop
    ./scripts/proxy-api.sh stop
    ./scripts/bernard-agent.sh stop
    ./scripts/bernard-ui.sh stop
    ./scripts/vllm.sh stop
    ./scripts/whisper.sh stop
    ./scripts/kokoro.sh stop
    log "All services stopped"
    exit 0
}

COLOR_REDIS='\033[0;31m'
COLOR_SHARED='\033[1;36m'
COLOR_BERNARD_API='\033[0;33m'
COLOR_PROXY_API='\033[0;36m'
COLOR_BERNARD_AGENT='\033[0;32m'
COLOR_BERNARD_UI='\033[0;35m'
COLOR_VLLM='\033[0;34m'
COLOR_WHISPER='\033[0;37m'
COLOR_KOKORO='\033[38;5;208m'

tail_logs() {
    local pids=()
    local services=(
        "redis:${COLOR_REDIS}"
        "shared:${COLOR_SHARED}"
        "bernard-api:${COLOR_BERNARD_API}"
        "proxy-api:${COLOR_PROXY_API}"
        "bernard-agent:${COLOR_BERNARD_AGENT}"
        "bernard-ui:${COLOR_BERNARD_UI}"
        "vllm:${COLOR_VLLM}"
        "whisper:${COLOR_WHISPER}"
        "kokoro:${COLOR_KOKORO}"
    )

    # Maximum length of service names (vllm-embeddings = 15)
    local max_len=15

    for service_info in "${services[@]}"; do
        IFS=':' read -r service_name service_color <<< "$service_info"
        local log_file="logs/${service_name}.log"

        if [ -f "$log_file" ]; then
            local upper_name="${service_name^^}"
            local len=${#upper_name}
            local spaces=$((max_len - len))
            local spaces_before=$((spaces / 2))
            local spaces_after=$((spaces - spaces_before))
            local padded="[$(printf "%*s%s%*s" $spaces_before "" "$upper_name" $spaces_after "")]"
            if [ -t 1 ]; then
                tail -f "$log_file" 2>/dev/null | sed "s/^/${service_color}${padded}${NC} /" &
            else
                tail -f "$log_file" 2>/dev/null | sed "s/^/${padded} /" &
            fi
            pids+=($!)
        fi
    done

    if [ ${#pids[@]} -eq 0 ]; then
        log "Warning: No log files found to tail"
        return
    fi

    wait "${pids[@]}"
}

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

start() {
    EXIT_AFTER_START=false

    for arg in "$@"; do
        case $arg in
            --exit-after-start)
                EXIT_AFTER_START=true
                shift
                ;;
            --help)
                echo "Usage: $0 start [--exit-after-start]"
                echo ""
                echo "Options:"
                echo "  --exit-after-start    Start services and exit immediately (services run in background)"
                echo "                        Without this flag, the script will remain running and monitor logs"
                echo "  --help                Show this help message"
                exit 0
                ;;
        esac
    done

    if [ "$EXIT_AFTER_START" = false ]; then
        trap 'log "Interrupt received, cleaning up..."; cleanup_all_services' SIGINT SIGTERM
    fi

    if ! check; then
        echo ""
        echo "❌ Build checks failed. Cannot start services."
        exit 1
    fi

    log "Shutting down existing services..."
    ./scripts/redis.sh stop
    ./scripts/shared.sh stop
    ./scripts/bernard-api.sh stop
    ./scripts/proxy-api.sh stop
    ./scripts/bernard-agent.sh stop
    ./scripts/bernard-ui.sh stop
    ./scripts/vllm.sh stop
    ./scripts/whisper.sh stop
    ./scripts/kokoro.sh stop

    log "Starting services in order..."

    mkdir -p logs

    declare -A service_status
    declare -A service_hosts
    declare -A service_ports

    service_hosts["REDIS"]="127.0.0.1"
    service_ports["REDIS"]="6379"
    service_hosts["SHARED"]="127.0.0.1"
    service_ports["SHARED"]="0"
    service_hosts["BERNARD-API"]="127.0.0.1"
    service_ports["BERNARD-API"]="8800"
    service_hosts["PROXY-API"]="0.0.0.0"
    service_ports["PROXY-API"]="3456"
    service_hosts["BERNARD-AGENT"]="127.0.0.1"
    service_ports["BERNARD-AGENT"]="2024"
    service_hosts["BERNARD-UI"]="127.0.0.1"
    service_ports["BERNARD-UI"]="8810"
    service_hosts["VLLM"]="127.0.0.1"
    service_ports["VLLM"]="8860"
    service_hosts["WHISPER"]="127.0.0.1"
    service_ports["WHISPER"]="8870"
    service_hosts["KOKORO"]="127.0.0.1"
    service_ports["KOKORO"]="8880"

    # Shared library has no running service, just ensure it's built
    log "Building shared library..."
    ./scripts/shared.sh start
    service_status["SHARED"]=$?

    start_service_with_timeout "./scripts/redis.sh" "REDIS" 20
    service_status["REDIS"]=$?

    start_service_with_timeout "./scripts/bernard-api.sh" "BERNARD-API" 20
    service_status["BERNARD-API"]=$?

    start_service_with_timeout "./scripts/proxy-api.sh" "PROXY-API" 20
    service_status["PROXY-API"]=$?

    start_service_with_timeout "./scripts/bernard-agent.sh" "BERNARD-AGENT" 20
    service_status["BERNARD-AGENT"]=$?

    start_service_with_timeout "./scripts/bernard-ui.sh" "BERNARD-UI" 20
    service_status["BERNARD-UI"]=$?

    start_service_with_timeout "./scripts/vllm.sh" "VLLM" 20
    service_status["VLLM"]=$?

    start_service_with_timeout "./scripts/whisper.sh" "WHISPER" 20
    service_status["WHISPER"]=$?

    start_service_with_timeout "./scripts/kokoro.sh" "KOKORO" 20
    service_status["KOKORO"]=$?

    # Give services time to finish their initialization logging before showing final status
    # Some services (like VLLM, KOKORO) continue outputting logs even after health checks pass
    log "Finalizing startup..."
    sleep 8

    # Final status check - verify all services are actually responding
    log "Verifying all services are responding..."

    all_healthy=true
    for service in "BERNARD-API" "PROXY-API" "BERNARD-AGENT" "VLLM" "WHISPER" "KOKORO"; do
        if [ "$service" = "BERNARD-API" ] || [ "$service" = "PROXY-API" ] || [ "$service" = "BERNARD-AGENT" ]; then
            if ! curl -sf "${service_hosts[$service]}:${service_ports[$service]}/health" > /dev/null 2>&1; then
                all_healthy=false
                break
            fi
        elif [ "$service" = "VLLM" ] || [ "$service" = "WHISPER" ] || [ "$service" = "KOKORO" ]; then
            if ! curl -sf "${service_hosts[$service]}:${service_ports[$service]}/health" > /dev/null 2>&1; then
                all_healthy=false
                break
            fi
        fi
    done

    if [ "$all_healthy" = true ]; then
        log "Startup complete!"
    else
        log "Warning: Some services may still be initializing..."
    fi

    echo
    log "Service Status:"
    echo "---------------------------------------------------------------------"
    printf "%-12s | %-8s | %-15s | %-6s\n" "Service Name" "Status" "Host Name" "Port"
    echo "---------------------------------------------------------------------"

    for service in "REDIS" "SHARED" "BERNARD-API" "PROXY-API" "BERNARD-AGENT" "BERNARD-UI" "VLLM" "WHISPER" "KOKORO"; do
        if [ "${service_status[$service]}" -eq 0 ]; then
            status=$(colorize "${GREEN}up${NC}" "up")
        else
            status=$(colorize "${RED}down${NC}" "down")
        fi
        printf "%-12s | %-8s | %-15s | %-6s\n" "$service" "$status" "${service_hosts[$service]}" "${service_ports[$service]}"
    done

    echo "---------------------------------------------------------------------"
    log "Logs are available in the logs/ directory."
    log "You can access the UI at http://0.0.0.0:3456/bernard/"

    if [ "$EXIT_AFTER_START" = true ]; then
        log "Exiting after start (services left running)"
        log "To stop services, run: $0 stop"
        exit 0
    fi

    # Only start log monitoring if not exiting after start
    log "Monitoring services... Press Ctrl+C to stop all services"
    echo ""
    tail_logs
}

stop() {
    log "Stopping all Bernard services..."

    ./scripts/shared.sh stop
    ./scripts/redis.sh stop
    ./scripts/bernard-api.sh stop
    ./scripts/proxy-api.sh stop
    ./scripts/bernard-agent.sh stop
    ./scripts/bernard-ui.sh stop
    ./scripts/vllm.sh stop
    ./scripts/whisper.sh stop
    ./scripts/kokoro.sh stop

    echo ""
    log "All Bernard services stopped"
}

init() {
    log "Initializing all Bernard services..."

    log "Initializing shared library..."
    ./scripts/shared.sh init

    log "Initializing Redis..."
    ./scripts/redis.sh init

    log "Initializing Bernard-API..."
    ./scripts/bernard-api.sh init

    log "Initializing Proxy-API..."
    ./scripts/proxy-api.sh init

    log "Initializing Bernard-Agent..."
    ./scripts/bernard-agent.sh init

    log "Initializing Bernard-UI..."
    ./scripts/bernard-ui.sh init

    log "Initializing VLLM..."
    ./scripts/vllm.sh init

    log "Initializing Whisper..."
    ./scripts/whisper.sh init

    log "Initializing Kokoro..."
    ./scripts/kokoro.sh init

    echo ""
    log "All Bernard services initialized"
}

clean() {
    log "Cleaning all Bernard services..."

    log "Cleaning shared library..."
    ./scripts/shared.sh clean

    log "Cleaning Redis..."
    ./scripts/redis.sh clean

    log "Cleaning Bernard-API..."
    ./scripts/bernard-api.sh clean

    log "Cleaning Proxy-API..."
    ./scripts/proxy-api.sh clean

    log "Cleaning Bernard-Agent..."
    ./scripts/bernard-agent.sh clean

    log "Cleaning Bernard-UI..."
    ./scripts/bernard-ui.sh clean

    log "Cleaning VLLM..."
    ./scripts/vllm.sh clean

    log "Cleaning Whisper..."
    ./scripts/whisper.sh clean

    log "Cleaning Kokoro..."
    ./scripts/kokoro.sh clean

    echo ""
    log "All Bernard services cleaned"
}

check() {
    LOG_DIR="$(cd "$(dirname "$0")/.." && pwd)/logs"
    mkdir -p "$LOG_DIR"

    SERVICES=("shared" "bernard-agent" "bernard-ui" "bernard-api" "proxy-api" "vllm" "whisper" "kokoro" "redis")
    PIDS=()

    run_service_check() {
        local service="$1"
        local script_path="./scripts/${service}.sh"

        if [ -f "$script_path" ]; then
            "$script_path" check
            echo $? > "$LOG_DIR/${service}-check.exit"
        else
            echo "Error: Script not found: $script_path" > "$LOG_DIR/${service}-check.log"
            echo 1 > "$LOG_DIR/${service}-check.exit"
        fi
    }

    echo "Starting parallel checks for all services..."

    for service in "${SERVICES[@]}"; do
        run_service_check "$service" &
        PIDS+=($!)
    done

    # Wait for all checks to complete
    echo "Waiting for all checks to complete..."
    for pid in "${PIDS[@]}"; do
        wait "$pid"
    done

    echo "All checks completed."

    FAILED_SERVICES=()
    for service in "${SERVICES[@]}"; do
        exit_code=$(cat "$LOG_DIR/${service}-check.exit" 2>/dev/null || echo "1")

        if [ "$exit_code" -ne 0 ]; then
            FAILED_SERVICES+=("$service")
            echo "❌ $service: FAILED"
        else
            echo "✓ $service: PASSED"
        fi
    done

    if [ ${#FAILED_SERVICES[@]} -gt 0 ]; then
        echo ""
        echo "═══════════════════════════════════════════════════════════"
        echo "  BUILD CHECKS FAILED"
        echo "═══════════════════════════════════════════════════════════"
        echo ""

        for service in "${FAILED_SERVICES[@]}"; do
            log_file="$LOG_DIR/${service}-check.log"
            status_file="$LOG_DIR/${service}-check.status"

            echo "───────────────────────────────────────────────────"
            echo "Service: $service"
            echo "───────────────────────────────────────────────────"

            if [ -f "$status_file" ]; then
                echo ""
                echo "Failed steps:"
                grep "=fail" "$status_file" | sed 's/\(.*\)=fail/  ✗ \1/'
            fi

            echo ""
            echo "Error logs:"
            echo "───────────────────────────────────────────────────"
            if [ -f "$log_file" ]; then
                cat "$log_file"
            else
                echo "No log file found."
            fi
            echo ""
        done

        echo "═══════════════════════════════════════════════════════════"
        return 1
    else
        echo ""
        echo "═══════════════════════════════════════════════════════════"
        echo "  ALL BUILD CHECKS PASSED"
        echo "═══════════════════════════════════════════════════════════"
        return 0
    fi
}

case "$1" in
    start)
        shift
        start "$@"
        ;;
    stop)
        stop
        ;;
    init)
        init
        ;;
    clean)
        clean
        ;;
    check)
        check
        exit $?
        ;;
    *)
        echo "Usage: $0 {start|stop|init|clean|check}"
        echo ""
        echo "Commands:"
        echo "  start [--exit-after-start]    Start all services"
        echo "  stop                         Stop all services"
        echo "  init                         Initialize all services (install dependencies)"
        echo "  clean                        Clean all services (remove dependencies)"
        echo "  check                        Check all services (run build checks)"
        exit 1
        ;;
esac
