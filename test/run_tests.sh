#!/usr/bin/env bash
# Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
#
# Automated end-to-end test runner for PyDaemon tunnel routes and proxy validation.

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
BACKEND_PORT=9876
rm -rf "$TEST_DATA_DIR"
mkdir -p "$TEST_DATA_DIR"

python3 -c "
from http.server import HTTPServer, BaseHTTPRequestHandler
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'OK: Hello from local service on port $BACKEND_PORT')
HTTPServer(('127.0.0.1', $BACKEND_PORT), H).serve_forever()
" &
BACKEND_PID=$!

echo "[*] Starting PyDaemon on port $TEST_PORT..."
PYD_PORT=$TEST_PORT PYD_BASE_DIR=$TEST_DATA_DIR "$BINARY" > "$TEST_DATA_DIR/daemon.log" 2>&1 &
DAEMON_PID=$!

cleanup() {
    echo "[*] Cleaning up test daemon (PID: $DAEMON_PID) and backend (PID: $BACKEND_PID)..."
    kill -9 "$DAEMON_PID" "$BACKEND_PID" 2>/dev/null || true
    rm -rf "$TEST_DATA_DIR"
}
trap cleanup EXIT

sleep 2

echo "[*] Testing /api/system/status..."
STATUS_RES=$(curl -s "http://127.0.0.1:$TEST_PORT/api/system/status")
echo "System Status: $STATUS_RES"

echo "[*] Configuring Cloudflare Root Domain (example.com)..."
curl -s -X POST "http://127.0.0.1:$TEST_PORT/api/cftunnel" \
    -H "Content-Type: application/json" \
    -d '{"domain":"example.com","token":"","active":false}'

echo "[*] Creating tunnel route (name, subdomain, port)..."
CREATE_RES=$(curl -s -X POST "http://127.0.0.1:$TEST_PORT/api/projects" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"My API\",\"subdomain\":\"api\",\"port\":$BACKEND_PORT}")
echo "Create Result: $CREATE_RES"

echo "[*] Testing reverse proxy via Host header (api.example.com -> localhost:$BACKEND_PORT)..."
PROXY_RES=$(curl -s -H "Host: api.example.com" "http://127.0.0.1:$TEST_PORT/")
echo "Proxy Output: $PROXY_RES"

if echo "$PROXY_RES" | grep -q "Hello from local service on port $BACKEND_PORT"; then
    echo "[+] SUCCESS: Cloudflare Tunnel routing (api.example.com -> localhost:$BACKEND_PORT) works perfectly!"
else
    echo "[!] Proxy response did not match expected output"
    exit 1
fi

echo "=========================================================="
echo "  All automated tests completed successfully!"
echo "=========================================================="
