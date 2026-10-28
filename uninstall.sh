#!/usr/bin/env bash
# Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
#
# Production uninstaller for Debian systems: stops and disables all PyDaemon
# systemd services, removes application binaries and runtime directories.

set -e

echo "=========================================================="
echo "  PyDaemon Uninstaller"
echo "  Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved."
echo "=========================================================="

if [ "$(id -u)" -ne 0 ]; then
    echo "[!] Please run this uninstaller with root privileges: sudo bash uninstall.sh"
    exit 1
fi

echo "[*] Stopping and disabling PyDaemon systemd services..."
if systemctl is-active --quiet py-daemon.service 2>/dev/null; then
    systemctl stop py-daemon.service
fi

if systemctl is-enabled --quiet py-daemon.service 2>/dev/null; then
    systemctl disable py-daemon.service
fi

rm -f /etc/systemd/system/py-daemon.service

for svc in /etc/systemd/system/pyd-*.service; do
    if [ -f "$svc" ]; then
        svcname=$(basename "$svc")
        systemctl stop "$svcname" 2>/dev/null || true
        systemctl disable "$svcname" 2>/dev/null || true
        rm -f "$svc"
    fi
done

systemctl daemon-reload

echo "[*] Removing binaries and system links..."
rm -f /usr/local/bin/pyd

echo "[*] Cleaning up /opt/pyd runtime directory..."
rm -rf /opt/pyd

echo "=========================================================="
echo "  PyDaemon has been completely uninstalled from this system."
echo "=========================================================="
