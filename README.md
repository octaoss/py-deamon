
<h1 align="center">
PYTHON DEAMON SERVER
</h1>
<p align="center">Management Server Project Untuk Python</p>

# PyDaemon

PyDaemon is a lightweight, single-binary Python process supervisor, application daemon, and virtual host manager designed for Linux environments. It integrates Astral UV for high-speed isolated virtual environment provisioning and Cloudflare Zero Trust Tunnels for automated public domain routing.

> [!NOTE]
> PyDaemon is delivered as a self-contained executable. The Go runtime embeds the React frontend dashboard directly, eliminating external dependencies on Nginx, Apache, or separate Node.js processes.

<p align="center">
<img width="759" height="622" alt="image" src="https://github.com/user-attachments/assets/62cf2727-ffa0-40a3-b994-d1b9c469e9df" />
  
</p>

---

## Features

- **Process Supervision:** Runs services via Systemd or internal supervisor with automatic crash recovery, live process metrics, and state preservation.
- **Astral UV Toolchain:** Automates dependency resolution and isolated virtual environment creation per project.
- **Cloudflare Zero Trust Integration:** Configures public ingress rules and DNS records directly via Cloudflare API (`subdomain.domain -> localhost:port`).
- **Flexible Deployments:** Supports deployments from Git repositories (with one-click pull updates) and ZIP packages (with replacement upload), or direct port routing for existing applications.
- **Log Streaming:** Real-time log capture and live SSE streaming through the integrated dashboard.
- **Dashboard Authentication:** Session-based token security to prevent unauthorized access.
- **Vercel-Inspired UI:** Dark, developer-focused dashboard with real-time health indicators.

---

## Prerequisites

- Operating System: Debian 11+, Ubuntu 20.04+, or compatible Linux distributions.
- Tools: `curl`, `git`, `tar`, and `systemd`.
- Optional: Cloudflare account with Zero Trust Tunnel and API token for automated public routing.

---

## Installation

Run the automated installer script with root privileges. You can provide an initial dashboard password as an argument.

```bash
sudo bash install.sh [dashboard_password]
```

> [!TIP]
> Supplying a password as the first argument automatically configures dashboard protection. If omitted, the installer will prompt you to set one.

The installer performs the following operations:
1. Installs system dependencies (`curl`, `git`, `tar`, `systemd`).
2. Installs the Astral UV package manager.
3. Installs the Cloudflare Tunnel (`cloudflared`) binary.
4. Prepares the `/opt/pyd` application directory and permissions.
5. Deploys the `pyd` binary to `/usr/local/bin/pyd`.
6. Configures and starts the `py-daemon` systemd service.

> [!IMPORTANT]
> The installer requires root privileges (`sudo`) to register systemd services and manage networking binaries in `/usr/local/bin`.

---

## Configuration

PyDaemon reads configuration from environment variables or `/opt/pyd/config.env`.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PYD_PORT` | `8080` | HTTP listen port for the dashboard and reverse proxy. |
| `PYD_DOMAIN` | `localhost` | Host domain name for local or tunnel routing. |
| `PYD_ADMIN_PASSWORD` | *(empty)* | Admin password for dashboard access. |
| `PYD_BASE_DIR` | `/opt/pyd` | Base storage directory for apps, data, and logs. |
| `PYD_UV_BIN` | `uv` | Path to the Astral UV binary. |
| `PYD_GIT_BIN` | `git` | Path to the Git binary. |

---

## Manual Execution

PyDaemon can be executed standalone without systemd for development or testing:

```bash
./services/pyd -port 8080 -password mysecurepassword
```

Available flags:
- `-port <number>`: Sets the listening HTTP port.
- `-password <string>`: Sets the dashboard authentication password.

---

## Cloudflare Zero Trust Configuration

To route applications through public hostnames:
1. Open the dashboard at `http://<server-ip>:8080`.
2. Click **Cloudflare API Setup** in the navigation header.
3. Provide your Cloudflare API Token, Account ID, Tunnel ID, and Root Domain.
4. Save the configuration. Every project created will automatically register its ingress route and DNS CNAME record.

---

## Uninstallation

To remove PyDaemon and all associated services from the system:

```bash
sudo bash uninstall.sh
```

> [!WARNING]
> Running `uninstall.sh` permanently stops and disables all PyDaemon services, removes systemd units, and purges the `/opt/pyd` directory. Ensure you have backed up any critical project data before proceeding.

---

## License

Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
Distributed under the terms specified in the [LICENSE](LICENSE) file.


