#!/usr/bin/env bash
echo "Starting Bernard API..." >&2

# Kill existing processes
pkill -f "bernard-api.*dev" || true
sleep 1

# Start the API
cd /home/blake/Documents/software/bernard/services/bernard-api
export PORT=3000
npm run dev &
echo $! > "/tmp/bernard-api.pid"

# Wait for it to start
sleep 3

# Check if it's running
if curl -f --max-time 2 "http://localhost:3000/health" >/dev/null 2>&1; then
    echo "Bernard API started successfully" >&2
    exit 0
else
    echo "Bernard API failed to start" >&2
    exit 1
fi
