#!/usr/bin/env bash
# Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
#
# Automated end-to-end test runner for PyDaemon API, project provisioning, and proxy validation.

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$DIR")"
BINARY="$ROOT_DIR/services/pyd"

if [ ! -f "$BINARY" ]; then
    echo "[*] Building PyDaemon binary..."
    (cd "$ROOT_DIR/services" && go build -o pyd ./cmd/pyd)
fi

TEST_DATA_DIR="/tmp/pyd-automated-test-data"
TEST_PORT=9099
rm -rf "$TEST_DATA_DIR"
mkdir -p "$TEST_DATA_DIR"

echo "[*] Starting PyDaemon on port $TEST_PORT..."
PYD_PORT=$TEST_PORT PYD_BASE_DIR=$TEST_DATA_DIR "$BINARY" > "$TEST_DATA_DIR/daemon.log" 2>&1 &
DAEMON_PID=$!

cleanup() {
    echo "[*] Cleaning up test daemon (PID: $DAEMON_PID)..."
    kill -9 "$DAEMON_PID" 2>/dev/null || true
    rm -rf "$TEST_DATA_DIR"
}
trap cleanup EXIT

sleep 2

echo "[*] Testing /api/system/status..."
STATUS_RES=$(curl -s "http://127.0.0.1:$TEST_PORT/api/system/status")
echo "System Status: $STATUS_RES"

echo "[*] Testing ZIP inspection with simple-http.zip..."
INSPECT_RES=$(curl -s -F "file=@$DIR/simple-http.zip" "http://127.0.0.1:$TEST_PORT/api/projects/inspect-zip")
echo "Inspect Result: $INSPECT_RES"

TEMP_ID=$(echo "$INSPECT_RES" | grep -o '"temp_id":"[^"]*' | cut -d'"' -f4)

if [ -z "$TEMP_ID" ]; then
    echo "[!] Failed to extract temp_id from inspect response"
    exit 1
fi

echo "[*] Deploying project using temp_id: $TEMP_ID..."
CREATE_RES=$(curl -s -X POST "http://127.0.0.1:$TEST_PORT/api/projects" \
    -H "Content-Type: application/json" \
    -d "{\"temp_id\":\"$TEMP_ID\",\"name\":\"test-http\",\"subdomain\":\"test-http\",\"python_version\":\"3.12\",\"entrypoint\":\"main.py\",\"run_command\":\"python main.py\",\"requirements_file\":\"requirements.txt\",\"auto_restart\":true}")
echo "Create Result: $CREATE_RES"

PROJECT_ID=$(echo "$CREATE_RES" | grep -o '"id":"[^"]*' | cut -d'"' -f4)

echo "[*] Waiting for project $PROJECT_ID to start..."
MAX_RETRIES=20
RUNNING=0

for i in $(seq 1 $MAX_RETRIES); do
    sleep 1
    PROJECT_INFO=$(curl -s "http://127.0.0.1:$TEST_PORT/api/projects/$PROJECT_ID")
    if echo "$PROJECT_INFO" | grep -q '"status":"running"'; then
        echo "[*] Project is running!"
        RUNNING=1
        break
    fi
    echo "Waiting... (attempt $i)"
done

if [ "$RUNNING" -ne 1 ]; then
    echo "[!] Project failed to reach running status"
    curl -s "http://127.0.0.1:$TEST_PORT/api/projects/$PROJECT_ID/logs"
    exit 1
fi

echo "[*] Testing reverse proxy via Host header..."
PROXY_RES=$(curl -s -H "Host: test-http.localhost" "http://127.0.0.1:$TEST_PORT/")
echo "Proxy Output: $PROXY_RES"

if echo "$PROXY_RES" | grep -q "PyDaemon Simple HTTP App"; then
    echo "[+] SUCCESS: Host header routing works correctly!"
else
    echo "[!] Proxy response did not match expected output"
    exit 1
fi

echo "[*] Testing path proxy routing..."
PATH_PROXY_RES=$(curl -s "http://127.0.0.1:$TEST_PORT/proxy/test-http/")
if echo "$PATH_PROXY_RES" | grep -q "PyDaemon Simple HTTP App"; then
    echo "[+] SUCCESS: Path proxy routing works correctly!"
else
    echo "[!] Path proxy routing failed"
    exit 1
fi

echo "=========================================================="
echo "  All automated tests completed successfully!"
echo "=========================================================="
