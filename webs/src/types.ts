/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * TypeScript interface definitions for API responses and client-side domain entities.
 */

export type ProjectStatus = 'created' | 'building' | 'running' | 'stopped' | 'failed'

export interface Project {
  id: string
  name: string
  subdomain: string
  port: number
  source_type: 'git' | 'zip' | 'tunnel'
  git_url?: string
  git_branch?: string
  python_version: string
  entrypoint: string
  run_command: string
  requirements_file: string
  env_vars: Record<string, string>
  status: ProjectStatus
  error_message?: string
  created_at: string
  updated_at: string
  pid?: number
  auto_restart: boolean
  memory_bytes?: number
  cpu_percent?: number
  uptime_seconds?: number
}

export interface PythonVersionInfo {
  version: string
  raw_name: string
  is_installed: boolean
  path?: string
}

export interface ProjectInspection {
  temp_id: string
  python_files: string[]
  requirements_files: string[]
  suggested_entrypoint: string
  suggested_command: string
  detected_framework: string
}

export interface SystemStatus {
  daemon_running: boolean
  is_systemd: boolean
  uptime_seconds: number
  total_projects: number
  active_projects: number
  host_domain: string
  http_port: number
  uv_installed: boolean
  git_installed: boolean
  versions: PythonVersionInfo[]
}

export interface CFTunnelStatus {
  running: boolean
  token: string
  domain: string
  tunnel_id?: string
  api_token?: string
  account_id?: string
  active: boolean
  logs: string[]
  installed: boolean
}

export interface AuthStatusResponse {
  auth_required: boolean
  authenticated: boolean
}
