#!/bin/bash

PORT=4096
OPENCODE_BIN="/Users/yfyx/.opencode/bin/opencode"

# Kill any existing process on port 4096
lsof -ti:$PORT | xargs kill -9 2>/dev/null

echo "Starting opencode server measurement..."
START_TIME=$(date +%s%N) # Nanoseconds

# Start server in background
$OPENCODE_BIN serve --port $PORT > /dev/null 2>&1 &
SERVER_PID=$!

# Wait for port to be open
while ! nc -z localhost $PORT; do
  sleep 0.1
done

END_TIME=$(date +%s%N)
DURATION_NS=$((END_TIME - START_TIME))
DURATION_MS=$((DURATION_NS / 1000000))

echo "Server started in ${DURATION_MS}ms"

# Cleanup
kill $SERVER_PID
