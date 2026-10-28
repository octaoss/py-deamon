/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Project lifecycle coordinator for build provisioning, systemd unit generation, and service supervision.
 */

package service

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/octaoss/py-daemon/services/internal/config"
	"github.com/octaoss/py-daemon/services/internal/domain"
	"github.com/octaoss/py-daemon/services/internal/git"
	"github.com/octaoss/py-daemon/services/internal/uv"
)

type Manager struct {
	cfg        *config.Config
	uvClient   *uv.Client
	gitClient  *git.Client
	supervisor *Supervisor
}

func NewManager(cfg *config.Config, uvClient *uv.Client, gitClient *git.Client) *Manager {
	return &Manager{
		cfg:        cfg,
		uvClient:   uvClient,
		gitClient:  gitClient,
		supervisor: NewSupervisor(),
	}
}

func (m *Manager) Deploy(p *domain.Project, tempSourceDir string, logWriter io.Writer) error {
	projectDir := filepath.Join(m.cfg.AppsDir, p.ID)
	sourceDir := filepath.Join(projectDir, "source")
	logsDir := filepath.Join(projectDir, "logs")

	if err := os.MkdirAll(projectDir, 0755); err != nil {
		return err
	}
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		return err
	}

	p.Status = domain.StatusBuilding

	if tempSourceDir != "" {
		_ = os.RemoveAll(sourceDir)
		if err := os.Rename(tempSourceDir, sourceDir); err != nil {
			if copyErr := copyDir(tempSourceDir, sourceDir); copyErr != nil {
				return fmt.Errorf("failed to move source files: %w", copyErr)
			}
			_ = os.RemoveAll(tempSourceDir)
		}
	} else if p.SourceType == "git" && p.GitURL != "" {
		_ = os.RemoveAll(sourceDir)
		_, _ = fmt.Fprintf(logWriter, "Cloning git repository %s...\n", p.GitURL)
		if err := m.gitClient.Clone(p.GitURL, p.GitBranch, sourceDir, logWriter); err != nil {
			_, _ = fmt.Fprintf(logWriter, "Git clone error: %v\n", err)
			return fmt.Errorf("git clone failed: %w", err)
		}
		_, _ = fmt.Fprintln(logWriter, "Git repository cloned successfully.")
	}

	if err := m.writeEnvFile(projectDir, p.EnvVars, p.Port); err != nil {
		return fmt.Errorf("failed to write env file: %w", err)
	}

	_, _ = fmt.Fprintf(logWriter, "Setting up Python virtual environment (version: %s)...\n", p.PythonVersion)
	if err := m.uvClient.EnsurePython(p.PythonVersion, logWriter); err != nil {
		_, _ = fmt.Fprintf(logWriter, "Warning: uv ensure python output: %v\n", err)
	}

	if err := m.uvClient.CreateVenv(projectDir, p.PythonVersion, logWriter); err != nil {
		return fmt.Errorf("failed to create venv: %w", err)
	}

	if p.RequirementsFile != "" {
		reqPath := filepath.Join(sourceDir, p.RequirementsFile)
		if _, err := os.Stat(reqPath); err == nil {
			_, _ = fmt.Fprintf(logWriter, "Installing dependencies from %s...\n", p.RequirementsFile)
			if err := m.uvClient.InstallRequirements(projectDir, p.RequirementsFile, logWriter); err != nil {
				return fmt.Errorf("dependency installation failed: %w", err)
			}
		}
	}

	if m.cfg.IsSystemd {
		if err := m.setupSystemdService(p, projectDir); err != nil {
			_, _ = fmt.Fprintf(logWriter, "Warning: systemd setup error (%v), falling back to process supervisor\n", err)
			return m.supervisor.Start(p, projectDir)
		}
		return m.startSystemdService(p)
	}

	return m.supervisor.Start(p, projectDir)
}

func (m *Manager) Start(p *domain.Project) error {
	projectDir := filepath.Join(m.cfg.AppsDir, p.ID)
	if m.cfg.IsSystemd {
		return m.startSystemdService(p)
	}
	return m.supervisor.Start(p, projectDir)
}

func (m *Manager) Stop(p *domain.Project) error {
	if m.cfg.IsSystemd {
		return m.stopSystemdService(p)
	}
	return m.supervisor.Stop(p.ID)
}

func (m *Manager) Restart(p *domain.Project) error {
	projectDir := filepath.Join(m.cfg.AppsDir, p.ID)
	if m.cfg.IsSystemd {
		return m.restartSystemdService(p)
	}
	return m.supervisor.Restart(p, projectDir)
}

func (m *Manager) PullAndDeploy(p *domain.Project, logWriter io.Writer) error {
	projectDir := filepath.Join(m.cfg.AppsDir, p.ID)
	sourceDir := filepath.Join(projectDir, "source")

	_, _ = fmt.Fprintln(logWriter, "Pulling latest changes from git repository...")
	if err := m.gitClient.Pull(sourceDir, logWriter); err != nil {
		_, _ = fmt.Fprintf(logWriter, "Git pull error: %v\n", err)
		return err
	}
	_, _ = fmt.Fprintln(logWriter, "Git pull completed successfully.")

	if p.RequirementsFile != "" {
		reqPath := filepath.Join(sourceDir, p.RequirementsFile)
		if _, err := os.Stat(reqPath); err == nil {
			_, _ = fmt.Fprintf(logWriter, "Installing dependencies from %s...\n", p.RequirementsFile)
			_ = m.uvClient.InstallRequirements(projectDir, p.RequirementsFile, logWriter)
		}
	}

	_, _ = fmt.Fprintln(logWriter, "Restarting application service...")
	return m.Restart(p)
}

func (m *Manager) UpdateZipAndDeploy(p *domain.Project, zipPath string, logWriter io.Writer) error {
	projectDir := filepath.Join(m.cfg.AppsDir, p.ID)
	sourceDir := filepath.Join(projectDir, "source")

	_, _ = fmt.Fprintln(logWriter, "Extracting updated ZIP package...")
	if err := git.ExtractZip(zipPath, sourceDir); err != nil {
		_, _ = fmt.Fprintf(logWriter, "ZIP extraction error: %v\n", err)
		return err
	}
	_, _ = fmt.Fprintln(logWriter, "ZIP extracted successfully.")

	if p.RequirementsFile != "" {
		reqPath := filepath.Join(sourceDir, p.RequirementsFile)
		if _, err := os.Stat(reqPath); err == nil {
			_, _ = fmt.Fprintf(logWriter, "Installing dependencies from %s...\n", p.RequirementsFile)
			_ = m.uvClient.InstallRequirements(projectDir, p.RequirementsFile, logWriter)
		}
	}

	_, _ = fmt.Fprintln(logWriter, "Restarting application service...")
	return m.Restart(p)
}

func (m *Manager) SyncEnvAndRestart(p *domain.Project) error {
	projectDir := filepath.Join(m.cfg.AppsDir, p.ID)
	if err := m.writeEnvFile(projectDir, p.EnvVars, p.Port); err != nil {
		return err
	}

	if m.cfg.IsSystemd {
		_ = m.setupSystemdService(p, projectDir)
	}

	return m.Restart(p)
}

func (m *Manager) Remove(p *domain.Project) error {
	_ = m.Stop(p)

	if m.cfg.IsSystemd {
		unitName := fmt.Sprintf("pyd-%s.service", p.ID)
		_ = exec.Command("systemctl", "disable", unitName).Run()
		unitPath := filepath.Join(m.cfg.ServicesDir, unitName)
		_ = os.Remove(unitPath)
		_ = exec.Command("systemctl", "daemon-reload").Run()
	}

	projectDir := filepath.Join(m.cfg.AppsDir, p.ID)
	return os.RemoveAll(projectDir)
}

func (m *Manager) GetStatus(p *domain.Project) (domain.ProjectStatus, int) {
	if m.cfg.IsSystemd {
		unitName := fmt.Sprintf("pyd-%s.service", p.ID)
		cmd := exec.Command("systemctl", "is-active", unitName)
		out, err := cmd.Output()
		statusStr := strings.TrimSpace(string(out))
		if err == nil && statusStr == "active" {
			pidCmd := exec.Command("systemctl", "show", unitName, "--property=MainPID")
			pidOut, _ := pidCmd.Output()
			var pid int
			_, _ = fmt.Sscanf(strings.TrimSpace(string(pidOut)), "MainPID=%d", &pid)
			return domain.StatusRunning, pid
		}
		if statusStr == "failed" {
			return domain.StatusFailed, 0
		}
		return domain.StatusStopped, 0
	}

	running, pid := m.supervisor.IsRunning(p.ID)
	if running {
		return domain.StatusRunning, pid
	}
	if p.Status == domain.StatusFailed {
		return domain.StatusFailed, 0
	}
	return domain.StatusStopped, 0
}

func (m *Manager) GetLogs(p *domain.Project, maxLines int) ([]string, error) {
	logFilePath := filepath.Join(m.cfg.AppsDir, p.ID, "logs", "app.log")
	return ReadLogTail(logFilePath, maxLines)
}

func (m *Manager) StreamLogs(p *domain.Project, stopChan <-chan struct{}) (<-chan string, error) {
	logFilePath := filepath.Join(m.cfg.AppsDir, p.ID, "logs", "app.log")
	return StreamLogFile(logFilePath, stopChan)
}

func (m *Manager) writeEnvFile(projectDir string, envVars map[string]string, port int) error {
	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("PORT=%d\n", port))
	for k, v := range envVars {
		builder.WriteString(fmt.Sprintf("%s=%s\n", k, v))
	}
	return os.WriteFile(filepath.Join(projectDir, ".env"), []byte(builder.String()), 0600)
}

func (m *Manager) setupSystemdService(p *domain.Project, projectDir string) error {
	sourceDir := filepath.Join(projectDir, "source")
	venvBin := filepath.Join(projectDir, "venv", "bin")
	logFile := filepath.Join(projectDir, "logs", "app.log")
	envFile := filepath.Join(projectDir, ".env")

	parts := strings.Fields(p.RunCommand)
	if len(parts) == 0 {
		return fmt.Errorf("empty run command")
	}

	exe := parts[0]
	if exe == "python" || exe == "python3" {
		exe = filepath.Join(venvBin, "python")
	} else if exe == "uvicorn" {
		exe = filepath.Join(venvBin, "uvicorn")
	} else if exe == "gunicorn" {
		exe = filepath.Join(venvBin, "gunicorn")
	} else if !filepath.IsAbs(exe) {
		venvExe := filepath.Join(venvBin, exe)
		if _, statErr := os.Stat(venvExe); statErr == nil {
			exe = venvExe
		}
	}

	var resolvedArgs []string
	for _, arg := range parts[1:] {
		if arg == "$PORT" {
			resolvedArgs = append(resolvedArgs, fmt.Sprintf("%d", p.Port))
		} else {
			resolvedArgs = append(resolvedArgs, strings.ReplaceAll(arg, "$PORT", fmt.Sprintf("%d", p.Port)))
		}
	}

	fullExec := exe
	if len(resolvedArgs) > 0 {
		fullExec += " " + strings.Join(resolvedArgs, " ")
	}

	unitContent := fmt.Sprintf(`[Unit]
Description=PyDaemon Service - %s
After=network.target

[Service]
Type=simple
WorkingDirectory=%s
EnvironmentFile=-%s
Environment=PORT=%d
Environment=PATH=%s:/usr/local/bin:/usr/bin:/bin
ExecStart=%s
Restart=on-failure
RestartSec=3s
StandardOutput=append:%s
StandardError=append:%s

[Install]
WantedBy=multi-user.target
`, p.Name, sourceDir, envFile, p.Port, venvBin, fullExec, logFile, logFile)

	unitName := fmt.Sprintf("pyd-%s.service", p.ID)
	unitPath := filepath.Join(m.cfg.ServicesDir, unitName)

	if err := os.WriteFile(unitPath, []byte(unitContent), 0644); err != nil {
		return err
	}

	return exec.Command("systemctl", "daemon-reload").Run()
}

func (m *Manager) startSystemdService(p *domain.Project) error {
	unitName := fmt.Sprintf("pyd-%s.service", p.ID)
	return exec.Command("systemctl", "restart", unitName).Run()
}

func (m *Manager) stopSystemdService(p *domain.Project) error {
	unitName := fmt.Sprintf("pyd-%s.service", p.ID)
	return exec.Command("systemctl", "stop", unitName).Run()
}

func (m *Manager) restartSystemdService(p *domain.Project) error {
	unitName := fmt.Sprintf("pyd-%s.service", p.ID)
	return exec.Command("systemctl", "restart", unitName).Run()
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		in, err := os.Open(path)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
		if err != nil {
			return err
		}
		defer out.Close()
		_, err = io.Copy(out, in)
		return err
	})
}
