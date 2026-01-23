#!/bin/bash
# Bernard UI Service Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

BERNARD_UI_DIR="$PROJECT_ROOT/services/bernard-ui"
cd "$BERNARD_UI_DIR" || exit 1

case "$1" in
    start)
        echo "Starting Bernard UI..."
        bun run dev
        ;;
    stop)
        echo "Stopping Bernard UI..."
        pkill -f "vite"
        ;;
    restart)
        echo "Restarting Bernard UI..."
        "$0" stop
        sleep 2
        "$0" start
        ;;
    status)
        if pgrep -f "vite" > /dev/null; then
            echo "Bernard UI: running"
        else
            echo "Bernard UI: stopped"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
