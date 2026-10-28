/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Cloudflare Tunnel lifecycle supervisor, credential management, and tunnel log telemetry.
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
	"sync"
	"syscall"
	"time"
)

type Settings struct {
	Token  string `json:"token"`
	Domain string `json:"domain"`
	Active bool   `json:"active"`
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

func (m *Manager) UpdateConfig(token, domain string, enable bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.settings.Token = token
	m.settings.Domain = domain
	m.settings.Active = enable

	if err := m.saveSettings(); err != nil {
		return err
	}

	if m.running {
		_ = m.stopInternal()
	}

	if enable && token != "" {
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

func (m *Manager) appendLog(entry string) {
	m.logMu.Lock()
	defer m.logMu.Unlock()

	if len(m.logs) > 200 {
		m.logs = m.logs[len(m.logs)-150:]
	}
	m.logs = append(m.logs, entry)
}

func (m *Manager) GetStatus() (bool, string, string, bool, []string) {
	m.mu.Lock()
	running := m.running
	token := m.settings.Token
	domain := m.settings.Domain
	active := m.settings.Active
	m.mu.Unlock()

	m.logMu.RLock()
	copiedLogs := make([]string, len(m.logs))
	copy(copiedLogs, m.logs)
	m.logMu.RUnlock()

	return running, token, domain, active, copiedLogs
}

func (m *Manager) GetDomain() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.settings.Domain
}
