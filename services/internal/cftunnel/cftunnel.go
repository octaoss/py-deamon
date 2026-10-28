/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Cloudflare Zero Trust Tunnel API client, remote ingress provisioning, and daemon supervision.
 */

package cftunnel

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
)

type Settings struct {
	APIToken   string `json:"api_token"`
	AccountID  string `json:"account_id"`
	TunnelID   string `json:"tunnel_id"`
	ZoneID     string `json:"zone_id"`
	Domain     string `json:"domain"`
	Token      string `json:"token"`
	Active     bool   `json:"active"`
}

type IngressRule struct {
	Hostname string `json:"hostname,omitempty"`
	Service  string `json:"service"`
}

type TunnelConfig struct {
	Config struct {
		Ingress []IngressRule `json:"ingress"`
	} `json:"config"`
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
	httpClient *http.Client
}

func NewManager(binaryPath, dataDir string) *Manager {
	if binaryPath == "" {
		binaryPath = "cloudflared"
	}

	m := &Manager{
		binaryPath: binaryPath,
		dataDir:    dataDir,
		logs:       make([]string, 0, 100),
		httpClient: &http.Client{Timeout: 15 * time.Second},
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

func (m *Manager) UpdateConfig(apiToken, accountID, tunnelID, zoneID, domain, token string, enable bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.settings.APIToken = strings.TrimSpace(apiToken)
	m.settings.AccountID = strings.TrimSpace(accountID)
	m.settings.TunnelID = strings.TrimSpace(tunnelID)
	m.settings.ZoneID = strings.TrimSpace(zoneID)
	m.settings.Domain = strings.TrimSpace(domain)
	m.settings.Token = strings.TrimSpace(token)
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

	m.appendLog(fmt.Sprintf("[%s] cloudflared tunnel started", time.Now().Format(time.RFC3339)))
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

func (m *Manager) CreateCloudflareRoute(subdomain string, port int) error {
	m.mu.Lock()
	apiToken := m.settings.APIToken
	accountID := m.settings.AccountID
	tunnelID := m.settings.TunnelID
	zoneID := m.settings.ZoneID
	domain := m.settings.Domain
	m.mu.Unlock()

	hostname := fmt.Sprintf("%s.%s", subdomain, domain)
	serviceURL := fmt.Sprintf("http://localhost:%d", port)

	if apiToken == "" || accountID == "" || tunnelID == "" {
		if m.IsInstalled() && tunnelID != "" && domain != "" {
			cmd := exec.Command(m.binaryPath, "tunnel", "route", "dns", "-f", tunnelID, hostname)
			out, _ := cmd.CombinedOutput()
			m.appendLog(fmt.Sprintf("[%s] cloudflared CLI route: %s", time.Now().Format(time.RFC3339), string(out)))
		}
		return nil
	}

	if zoneID == "" && domain != "" {
		discoveredZone, err := m.findZoneID(apiToken, domain)
		if err == nil && discoveredZone != "" {
			zoneID = discoveredZone
			m.mu.Lock()
			m.settings.ZoneID = discoveredZone
			_ = m.saveSettings()
			m.mu.Unlock()
		}
	}

	if zoneID != "" {
		_ = m.upsertDNSRecord(apiToken, zoneID, hostname, fmt.Sprintf("%s.cfargotunnel.com", tunnelID))
	}

	err := m.updateTunnelConfiguration(apiToken, accountID, tunnelID, hostname, serviceURL)
	if err != nil {
		m.appendLog(fmt.Sprintf("[%s] Error updating Cloudflare Tunnel config: %v", time.Now().Format(time.RFC3339), err))
		return err
	}

	m.appendLog(fmt.Sprintf("[%s] Cloudflare route created: %s -> %s", time.Now().Format(time.RFC3339), hostname, serviceURL))
	return nil
}

func (m *Manager) DeleteCloudflareRoute(subdomain string) error {
	m.mu.Lock()
	apiToken := m.settings.APIToken
	accountID := m.settings.AccountID
	tunnelID := m.settings.TunnelID
	domain := m.settings.Domain
	m.mu.Unlock()

	if apiToken == "" || accountID == "" || tunnelID == "" {
		return nil
	}

	hostname := fmt.Sprintf("%s.%s", subdomain, domain)
	return m.removeTunnelConfiguration(apiToken, accountID, tunnelID, hostname)
}

func (m *Manager) findZoneID(apiToken, domain string) (string, error) {
	url := fmt.Sprintf("https://api.cloudflare.com/client/v4/zones?name=%s", domain)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var res struct {
		Success bool `json:"success"`
		Result  []struct {
			ID string `json:"id"`
		} `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}

	if len(res.Result) > 0 {
		return res.Result[0].ID, nil
	}

	return "", errors.New("zone not found")
}

func (m *Manager) upsertDNSRecord(apiToken, zoneID, hostname, target string) error {
	listURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/zones/%s/dns_records?name=%s&type=CNAME", zoneID, hostname)
	req, err := http.NewRequest("GET", listURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiToken)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var listRes struct {
		Success bool `json:"success"`
		Result  []struct {
			ID string `json:"id"`
		} `json:"result"`
	}

	_ = json.NewDecoder(resp.Body).Decode(&listRes)

	payload := map[string]interface{}{
		"type":    "CNAME",
		"name":    hostname,
		"content": target,
		"proxied": true,
	}
	bodyBytes, _ := json.Marshal(payload)

	if len(listRes.Result) > 0 {
		recordID := listRes.Result[0].ID
		updateURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/zones/%s/dns_records/%s", zoneID, recordID)
		putReq, _ := http.NewRequest("PUT", updateURL, bytes.NewReader(bodyBytes))
		putReq.Header.Set("Authorization", "Bearer "+apiToken)
		putReq.Header.Set("Content-Type", "application/json")
		putResp, putErr := m.httpClient.Do(putReq)
		if putErr == nil {
			putResp.Body.Close()
		}
		return putErr
	}

	createURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/zones/%s/dns_records", zoneID)
	postReq, _ := http.NewRequest("POST", createURL, bytes.NewReader(bodyBytes))
	postReq.Header.Set("Authorization", "Bearer "+apiToken)
	postReq.Header.Set("Content-Type", "application/json")
	postResp, postErr := m.httpClient.Do(postReq)
	if postErr == nil {
		postResp.Body.Close()
	}
	return postErr
}

func (m *Manager) updateTunnelConfiguration(apiToken, accountID, tunnelID, hostname, serviceURL string) error {
	configURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/cfd_tunnel/%s/configurations", accountID, tunnelID)

	req, err := http.NewRequest("GET", configURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiToken)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var configResp struct {
		Success bool `json:"success"`
		Result  struct {
			Config struct {
				Ingress []IngressRule `json:"ingress"`
			} `json:"config"`
		} `json:"result"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}

	_ = json.NewDecoder(resp.Body).Decode(&configResp)

	var newIngress []IngressRule
	added := false

	for _, rule := range configResp.Result.Config.Ingress {
		if rule.Hostname == "" {
			continue
		}
		if rule.Hostname == hostname {
			newIngress = append(newIngress, IngressRule{Hostname: hostname, Service: serviceURL})
			added = true
		} else {
			newIngress = append(newIngress, rule)
		}
	}

	if !added {
		newIngress = append(newIngress, IngressRule{Hostname: hostname, Service: serviceURL})
	}

	newIngress = append(newIngress, IngressRule{Service: "http_status:404"})

	putPayload := map[string]interface{}{
		"config": map[string]interface{}{
			"ingress": newIngress,
		},
	}
	putBytes, _ := json.Marshal(putPayload)

	putReq, _ := http.NewRequest("PUT", configURL, bytes.NewReader(putBytes))
	putReq.Header.Set("Authorization", "Bearer "+apiToken)
	putReq.Header.Set("Content-Type", "application/json")

	putResp, putErr := m.httpClient.Do(putReq)
	if putErr != nil {
		return putErr
	}
	defer putResp.Body.Close()

	if putResp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(putResp.Body)
		return fmt.Errorf("cloudflare api error (status %d): %s", putResp.StatusCode, string(respBody))
	}

	return nil
}

func (m *Manager) removeTunnelConfiguration(apiToken, accountID, tunnelID, hostname string) error {
	configURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/cfd_tunnel/%s/configurations", accountID, tunnelID)

	req, err := http.NewRequest("GET", configURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiToken)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var configResp struct {
		Success bool `json:"success"`
		Result  struct {
			Config struct {
				Ingress []IngressRule `json:"ingress"`
			} `json:"config"`
		} `json:"result"`
	}

	_ = json.NewDecoder(resp.Body).Decode(&configResp)

	var newIngress []IngressRule
	for _, rule := range configResp.Result.Config.Ingress {
		if rule.Hostname == "" || rule.Hostname == hostname {
			continue
		}
		newIngress = append(newIngress, rule)
	}

	newIngress = append(newIngress, IngressRule{Service: "http_status:404"})

	putPayload := map[string]interface{}{
		"config": map[string]interface{}{
			"ingress": newIngress,
		},
	}
	putBytes, _ := json.Marshal(putPayload)

	putReq, _ := http.NewRequest("PUT", configURL, bytes.NewReader(putBytes))
	putReq.Header.Set("Authorization", "Bearer "+apiToken)
	putReq.Header.Set("Content-Type", "application/json")

	putResp, putErr := m.httpClient.Do(putReq)
	if putErr == nil {
		putResp.Body.Close()
	}
	return putErr
}

func (m *Manager) SyncIngressConfig(routes map[string]int) error {
	m.mu.Lock()
	domain := m.settings.Domain
	tunnel := m.settings.TunnelID
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

func (m *Manager) GetStatus() (bool, string, string, string, string, string, bool, []string) {
	m.mu.Lock()
	running := m.running
	token := m.settings.Token
	domain := m.settings.Domain
	tunnelID := m.settings.TunnelID
	apiToken := m.settings.APIToken
	accountID := m.settings.AccountID
	active := m.settings.Active
	m.mu.Unlock()

	m.logMu.RLock()
	copiedLogs := make([]string, len(m.logs))
	copy(copiedLogs, m.logs)
	m.logMu.RUnlock()

	return running, token, domain, tunnelID, apiToken, accountID, active, copiedLogs
}

func (m *Manager) GetDomain() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.settings.Domain
}
