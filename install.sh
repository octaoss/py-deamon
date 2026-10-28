#!/usr/bin/env bash
# Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
#
# Production installer for Debian systems: installs git, astral-uv, cloudflared,
# provisions /opt/pyd directory structure, builds PyDaemon runtime, and registers systemd service.

set -e

if [ "$(id -u)" -ne 0 ]; then
    echo "[!] Please run this installer with root privileges: sudo bash install.sh"
    exit 1
fi

echo "[*] Updating system packages and installing prerequisites..."
apt-get update -y
apt-get install -y curl git tar ca-certificates systemd

if ! command -v uv >/dev/null 2>&1; then
    echo "[*] Installing Astral UV toolchain..."
    curl -LsSf https://astral.sh/uv/install.sh | env CARGO_HOME=/usr/local UV_INSTALL_DIR=/usr/local/bin sh
fi

if ! command -v cloudflared >/dev/null 2>&1; then
    echo "[*] Installing Cloudflare Tunnel (cloudflared)..."
    ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
    case "$ARCH" in
        amd64) CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" ;;
        arm64) CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64" ;;
        *) CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" ;;
    esac
    curl -fsSL "$CF_URL" -o /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared
fi

mkdir -p /opt/pyd/bin
mkdir -p /opt/pyd/apps
mkdir -p /opt/pyd/data
mkdir -p /opt/pyd/logs
mkdir -p /opt/pyd/services

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/services/pyd" ]; then
    cp "$SCRIPT_DIR/services/pyd" /opt/pyd/bin/pyd
    chmod +x /opt/pyd/bin/pyd
else
    echo "[*] Compiling frontend and PyDaemon binary..."
    if command -v npm >/dev/null 2>&1; then
        (cd "$SCRIPT_DIR/webs" && npm install --legacy-peer-deps && npm run build)
    fi
    if command -v go >/dev/null 2>&1; then
        (cd "$SCRIPT_DIR/services" && go build -o /opt/pyd/bin/pyd ./cmd/pyd)
    else
        echo "[!] Go compiler not found. If distributing prebuilt binary, place it at $SCRIPT_DIR/services/pyd"
        exit 1
    fi
    chmod +x /opt/pyd/bin/pyd
fi

if [ -f "$SCRIPT_DIR/daemon/py-daemon.service" ]; then
    cp "$SCRIPT_DIR/daemon/py-daemon.service" /etc/systemd/system/py-daemon.service
elif [ -f "$SCRIPT_DIR/deamon/py-daemon.services" ]; then
    cp "$SCRIPT_DIR/deamon/py-daemon.services" /etc/systemd/system/py-daemon.service
fi

systemctl daemon-reload
systemctl enable --now py-daemon.service

LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")

echo "=========================================================="
echo "  PyDaemon Installed Successfully!"
echo "  Dashboard URL: http://$LOCAL_IP:8080"
echo "  Cloudflare Tunnels: Available & Integrated"
echo "  Astral UV Toolchain: Active"
echo "  Service Status: systemctl status py-daemon"
echo "=========================================================="
