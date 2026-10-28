/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Cloudflare Tunnel lifecycle supervisor, DNS route registration, and ingress configuration.
 */

package cftunnel

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
)

type Settings struct {
	Token      string `json:"token"`
	Domain     string `json:"domain"`
	TunnelName string `json:"tunnel_name"`
	Active     bool   `json:"active"`
}

type Manager struct {
	mu         sync.Mutex
	logMu      sync.RWMutex
	binaryPath string
	dataDir    string
	settings   Settings
	cmd        *exec.Cmd
	stopChan   chan struct{}
	running    bool
	logs       []string
}

func NewManager(binaryPath, dataDir string) *Manager {
	if binaryPath == "" {
		binaryPath = "cloudflared"
	}

	m := &Manager{
		binaryPath: binaryPath,
		dataDir:    dataDir,
		logs:       make([]string, 0, 100),
	}

	_ = m.loadSettings()
	return m
}

func (m *Manager) IsInstalled() bool {
	_, err := exec.LookPath(m.binaryPath)
	return err == nil
}

func (m *Manager) loadSettings() error {
	filePath := filepath.Join(m.dataDir, "cf_tunnel.json")
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var s Settings
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}

	m.settings = s
	return nil
}

func (m *Manager) saveSettings() error {
	filePath := filepath.Join(m.dataDir, "cf_tunnel.json")
	data, err := json.MarshalIndent(m.settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filePath, data, 0644)
}

func (m *Manager) UpdateConfig(token, domain, tunnelName string, enable bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.settings.Token = strings.TrimSpace(token)
	m.settings.Domain = strings.TrimSpace(domain)
	m.settings.TunnelName = strings.TrimSpace(tunnelName)
	m.settings.Active = enable

	if err := m.saveSettings(); err != nil {
		return err
	}

	if m.running {
		_ = m.stopInternal()
	}

	if enable && m.settings.Token != "" {
		return m.startInternal()
	}

	return nil
}

func (m *Manager) Start() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.startInternal()
}

func (m *Manager) startInternal() error {
	if m.running {
		return nil
	}

	if !m.IsInstalled() {
		return errors.New("cloudflared binary is not installed on this system")
	}

	if m.settings.Token == "" {
		return errors.New("cloudflare tunnel token is not configured")
	}

	cmd := exec.Command(m.binaryPath, "tunnel", "run", "--token", m.settings.Token)
	m.stopChan = make(chan struct{})

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start cloudflared: %w", err)
	}

	m.cmd = cmd
	m.running = true

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			text := scanner.Text()
			m.appendLog(text)
		}
	}()

	go func() {
		_ = cmd.Wait()
		m.mu.Lock()
		m.running = false
		m.mu.Unlock()
		m.appendLog("cloudflared tunnel process exited")
	}()

	m.appendLog(fmt.Sprintf("[%s] cloudflared tunnel started with token", time.Now().Format(time.RFC3339)))
	return nil
}

func (m *Manager) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.stopInternal()
}

func (m *Manager) stopInternal() error {
	if !m.running || m.cmd == nil || m.cmd.Process == nil {
		m.running = false
		return nil
	}

	_ = m.cmd.Process.Signal(syscall.SIGTERM)

	done := make(chan struct{})
	go func() {
		for {
			m.mu.Lock()
			running := m.running
			m.mu.Unlock()
			if !running {
				close(done)
				return
			}
			time.Sleep(100 * time.Millisecond)
		}
	}()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		_ = m.cmd.Process.Kill()
	}

	m.running = false
	return nil
}

func (m *Manager) RouteDNS(subdomain string) (string, error) {
	m.mu.Lock()
	tunnel := m.settings.TunnelName
	domain := m.settings.Domain
	m.mu.Unlock()

	if tunnel == "" || domain == "" {
		return "", nil
	}

	hostname := fmt.Sprintf("%s.%s", subdomain, domain)
	cmd := exec.Command(m.binaryPath, "tunnel", "route", "dns", "-f", tunnel, hostname)
	out, err := cmd.CombinedOutput()
	result := string(out)

	logEntry := fmt.Sprintf("[%s] Route DNS (%s -> %s): %s", time.Now().Format(time.RFC3339), hostname, tunnel, strings.TrimSpace(result))
	m.appendLog(logEntry)

	return result, err
}

func (m *Manager) SyncIngressConfig(routes map[string]int) error {
	m.mu.Lock()
	domain := m.settings.Domain
	tunnel := m.settings.TunnelName
	m.mu.Unlock()

	if domain == "" {
		domain = "example.com"
	}

	var sb strings.Builder
	if tunnel != "" {
		sb.WriteString(fmt.Sprintf("tunnel: %s\n", tunnel))
	}
	sb.WriteString("ingress:\n")

	for sub, port := range routes {
		sb.WriteString(fmt.Sprintf("  - hostname: %s.%s\n    service: http://localhost:%d\n", sub, domain, port))
	}
	sb.WriteString("  - service: http_status:404\n")

	filePath := filepath.Join(m.dataDir, "cf_ingress.yml")
	return os.WriteFile(filePath, []byte(sb.String()), 0644)
}

func (m *Manager) appendLog(entry string) {
	m.logMu.Lock()
	defer m.logMu.Unlock()

	if len(m.logs) > 200 {
		m.logs = m.logs[len(m.logs)-150:]
	}
	m.logs = append(m.logs, entry)
}

func (m *Manager) GetStatus() (bool, string, string, string, bool, []string) {
	m.mu.Lock()
	running := m.running
	token := m.settings.Token
	domain := m.settings.Domain
	tunnelName := m.settings.TunnelName
	active := m.settings.Active
	m.mu.Unlock()

	m.logMu.RLock()
	copiedLogs := make([]string, len(m.logs))
	copy(copiedLogs, m.logs)
	m.logMu.RUnlock()

	return running, token, domain, tunnelName, active, copiedLogs
}

func (m *Manager) GetDomain() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.settings.Domain
}

func (m *Manager) GetTunnelName() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.settings.TunnelName
}
