#!/bin/bash

# scripts/check-utils.sh
# Shared utility functions for parallel build checking

# Function to run a check step with logging
run_check_step() {
    local step_name="$1"
    local step_command="$2"
    local log_file="$3"
    local service_name="$4"
    local dir="$5"

    # Calculate padded tag
    local spaces=$((15 - ${#service_name}))
    local before=$((spaces / 2))
    local after=$((spaces - before))
    local tag=$(printf "[%*s%s%*s]" $before "" "$service_name" $after "")

    if [ ! -d "$dir" ]; then
        echo "${tag} ✗  Directory not found: $dir" | tee -a "$log_file"
        echo "${tag} ✗  $step_name failed - directory does not exist" | tee -a "$log_file"
        return 1
    fi

    echo "${tag}    Running $step_name in $dir..." | tee -a "$log_file"

    (
        if ! cd "$dir"; then
            echo "${tag} ✗  Failed to change to directory: $dir" | tee -a "$log_file"
            exit 1
        fi

        if [[ "$step_command" == npm* ]]; then
            local npm_script=$(echo "$step_command" | sed 's/npm run //' | sed 's/npm //')
            if ! npm run | grep -q "^  $npm_script$"; then
                echo "${tag} ✗  npm script not found: $npm_script" | tee -a "$log_file"
                echo "${tag}    Available scripts:" | tee -a "$log_file"
                npm run | tee -a "$log_file"
                exit 1
            fi
        fi

        eval "$step_command"
    ) >> "$log_file" 2>&1
    local step_result=$?

    if [ $step_result -eq 0 ]; then
        echo "${tag} ✓  $step_name passed" | tee -a "$log_file"
        return 0
    else
        echo "${tag} ✗  $step_name failed (exit code: $step_result)" | tee -a "$log_file"
        return 1
    fi
}

# Function to wait for service health and start console logging
start_console_logging_on_health() {
    local service_name="$1"
    local port="$2"
    local health_path="$3"
    local log_file="$4"
    local pid_file="$5"
    
    # Background process to monitor health and stream logs
    (
        while true; do
            if curl -sf "http://127.0.0.1:$port$health_path" > /dev/null 2>&1; then
                # Service is reachable - start tailing log to console
                # Calculate padded tag
    local spaces=$((15 - ${#service_name}))
    local before=$((spaces / 2))
    local after=$((spaces - before))
    local tag=$(printf "[%*s%s%*s]" $before "" "$service_name" $after "")
    echo "${tag}    Service reachable, streaming logs to console..." | tee -a "$log_file"
                tail -f "$log_file" 2>/dev/null &
                TAIL_PID=$!
                # Monitor PID file while tailing
                while [ -f "$pid_file" ]; do
                    sleep 0.1
                done
                # Clean up tail process
                kill $TAIL_PID 2>/dev/null
                wait $TAIL_PID 2>/dev/null
                break
            fi
            sleep 0.5
            
            # Stop if check process completed
            if [ ! -f "$pid_file" ]; then
                break
            fi
        done
    ) &
}

# Function to track check results
track_result() {
    local service_name="$1"
    local status_file="$2"
    local check_step="$3"
    local result="$4"
    
    if [ "$result" -eq 0 ]; then
        echo "$check_step=pass" >> "$status_file"
    else
        echo "$check_step=fail" >> "$status_file"
    fi
}

# Function to finalize check status
finalize_status() {
    local service_name="$1"
    local status_file="$2"

    # Count failures
    local failures
    if [ -f "$status_file" ]; then
        failures=$(grep -c "=fail" "$status_file")
    else
        failures=0
    fi

    if [ "$failures" -eq 0 ]; then
        echo "overall=pass" >> "$status_file"
        return 0
    else
        echo "overall=fail" >> "$status_file"
        return 1
    fi
}

# Function to log with timestamp
log_with_timestamp() {
    local service_name="$1"
    local message="$2"
    echo "[$service_name] $(date '+%Y-%m-%d %H:%M:%S') $message"
}