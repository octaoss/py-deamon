/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Core domain entities, data transfer objects, and system status models.
 */

package domain

import "time"

type ProjectStatus string

const (
	StatusCreated  ProjectStatus = "created"
	StatusBuilding ProjectStatus = "building"
	StatusRunning  ProjectStatus = "running"
	StatusStopped  ProjectStatus = "stopped"
	StatusFailed   ProjectStatus = "failed"
)

type Project struct {
	ID               string            `json:"id"`
	Name             string            `json:"name"`
	Subdomain        string            `json:"subdomain"`
	Port             int               `json:"port"`
	SourceType       string            `json:"source_type"`
	GitURL           string            `json:"git_url,omitempty"`
	GitBranch        string            `json:"git_branch,omitempty"`
	PythonVersion    string            `json:"python_version"`
	Entrypoint       string            `json:"entrypoint"`
	RunCommand       string            `json:"run_command"`
	RequirementsFile string            `json:"requirements_file"`
	EnvVars          map[string]string `json:"env_vars"`
	Status           ProjectStatus     `json:"status"`
	ErrorMessage     string            `json:"error_message,omitempty"`
	CreatedAt        time.Time         `json:"created_at"`
	UpdatedAt        time.Time         `json:"updated_at"`
	PID              int               `json:"pid,omitempty"`
	AutoRestart      bool              `json:"auto_restart"`
	MemoryBytes      uint64            `json:"memory_bytes,omitempty"`
	CPUPercent       float64           `json:"cpu_percent,omitempty"`
	UptimeSeconds    int64             `json:"uptime_seconds,omitempty"`
}

type ProjectInspection struct {
	TempID              string   `json:"temp_id"`
	PythonFiles         []string `json:"python_files"`
	RequirementsFiles   []string `json:"requirements_files"`
	SuggestedEntrypoint string   `json:"suggested_entrypoint"`
	SuggestedCommand    string   `json:"suggested_command"`
	DetectedFramework   string   `json:"detected_framework"`
}

type PythonVersionInfo struct {
	Version     string `json:"version"`
	RawName     string `json:"raw_name"`
	IsInstalled bool   `json:"is_installed"`
	Path        string `json:"path,omitempty"`
}

type CreateProjectRequest struct {
	TempID           string            `json:"temp_id,omitempty"`
	Name             string            `json:"name"`
	Subdomain        string            `json:"subdomain"`
	Port             int               `json:"port,omitempty"`
	SourceType       string            `json:"source_type"`
	GitURL           string            `json:"git_url,omitempty"`
	GitBranch        string            `json:"git_branch,omitempty"`
	PythonVersion    string            `json:"python_version"`
	Entrypoint       string            `json:"entrypoint"`
	RunCommand       string            `json:"run_command"`
	RequirementsFile string            `json:"requirements_file"`
	EnvVars          map[string]string `json:"env_vars"`
	AutoRestart      bool              `json:"auto_restart"`
}

type UpdateProjectRequest struct {
	Name             string            `json:"name"`
	Subdomain        string            `json:"subdomain"`
	Port             int               `json:"port"`
	PythonVersion    string            `json:"python_version"`
	Entrypoint       string            `json:"entrypoint"`
	RunCommand       string            `json:"run_command"`
	RequirementsFile string            `json:"requirements_file"`
	EnvVars          map[string]string `json:"env_vars"`
	AutoRestart      bool              `json:"auto_restart"`
}

type SystemStatus struct {
	DaemonRunning  bool                `json:"daemon_running"`
	IsSystemd      bool                `json:"is_systemd"`
	UptimeSeconds  int64               `json:"uptime_seconds"`
	TotalProjects  int                 `json:"total_projects"`
	ActiveProjects int                 `json:"active_projects"`
	HostDomain     string              `json:"host_domain"`
	HTTPPort       int                 `json:"http_port"`
	UVInstalled    bool                `json:"uv_installed"`
	GitInstalled   bool                `json:"git_installed"`
	Versions       []PythonVersionInfo `json:"versions"`
}

type InspectGitRequest struct {
	URL    string `json:"url"`
	Branch string `json:"branch,omitempty"`
}
