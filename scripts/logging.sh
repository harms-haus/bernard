#!/bin/bash

# scripts/logging.sh
# Common logging functions for all services

# Requires SERVICE_NAME and COLOR to be defined in the calling script

log() {
    spaces=$((15 - ${#SERVICE_NAME}))
    before=$((spaces / 2))
    after=$((spaces - before))
    tag=$(printf "[%*s%s%*s]" $before "" "$SERVICE_NAME" $after "")
    echo -e "${COLOR}${tag}${NC}    $1"
}

success() {
    spaces=$((15 - ${#SERVICE_NAME}))
    before=$((spaces / 2))
    after=$((spaces - before))
    tag=$(printf "[%*s%s%*s]" $before "" "$SERVICE_NAME" $after "")
    echo -e "${COLOR}${tag}${NC} ✓  $1"
}

error() {
    spaces=$((15 - ${#SERVICE_NAME}))
    before=$((spaces / 2))
    after=$((spaces - before))
    tag=$(printf "[%*s%s%*s]" $before "" "$SERVICE_NAME" $after "")
    echo -e "${COLOR}${tag}${NC} ✗  $1"
}