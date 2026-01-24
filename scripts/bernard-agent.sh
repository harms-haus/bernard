#!/bin/bash
# Bernard Agent Service Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

BERNARD_AGENT_DIR="$PROJECT_ROOT/core"
cd "$BERNARD_AGENT_DIR" || exit 1

case "$1" in
    start)
        echo "Starting Bernard Agent..."
        bun run agent:bernard
        ;;
    stop)
        echo "Stopping Bernard Agent..."
        pkill -f "bun.*start-agent.ts"
        ;;
    restart)
        echo "Restarting Bernard Agent..."
        "$0" stop
        sleep 2
        "$0" start
        ;;
    status)
        if pgrep -f "bun.*start-agent.ts" > /dev/null; then
            echo "Bernard Agent: running"
        else
            echo "Bernard Agent: stopped"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
