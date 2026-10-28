/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Configuration package for PyDaemon environment and runtime settings.
 */

package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	HTTPPort      int
	HostDomain    string
	BaseDir       string
	AppsDir       string
	DataDir       string
	ServicesDir   string
	LogsDir       string
	UVBinary      string
	GitBinary     string
	IsSystemd     bool
	AdminPassword string
}

func Load() *Config {
	baseDir := os.Getenv("PYD_BASE_DIR")
	if baseDir == "" {
		if os.Geteuid() == 0 {
			baseDir = "/opt/pyd"
		} else {
			home, err := os.UserHomeDir()
			if err == nil {
				baseDir = home + "/.pyd"
			} else {
				baseDir = "/opt/pyd"
			}
		}
	}

	appsDir := os.Getenv("PYD_APPS_DIR")
	if appsDir == "" {
		appsDir = baseDir + "/apps"
	}

	dataDir := os.Getenv("PYD_DATA_DIR")
	if dataDir == "" {
		dataDir = baseDir + "/data"
	}

	servicesDir := os.Getenv("PYD_SERVICES_DIR")
	if servicesDir == "" {
		if os.Geteuid() == 0 {
			servicesDir = "/etc/systemd/system"
		} else {
			servicesDir = baseDir + "/services"
		}
	}

	logsDir := os.Getenv("PYD_LOGS_DIR")
	if logsDir == "" {
		logsDir = baseDir + "/logs"
	}

	httpPort := 8080
	if portStr := os.Getenv("PYD_PORT"); portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil {
			httpPort = p
		}
	}

	hostDomain := os.Getenv("PYD_DOMAIN")
	if hostDomain == "" {
		hostDomain = "localhost"
	}

	uvBin := os.Getenv("PYD_UV_BIN")
	if uvBin == "" {
		uvBin = "uv"
	}

	gitBin := os.Getenv("PYD_GIT_BIN")
	if gitBin == "" {
		gitBin = "git"
	}

	isSystemd := false
	if _, err := os.Stat("/run/systemd/system"); err == nil && os.Geteuid() == 0 {
		isSystemd = true
	}

	adminPassword := os.Getenv("PYD_ADMIN_PASSWORD")
	if adminPassword == "" {
		passPath := filepath.Join(dataDir, "admin.pass")
		if b, err := os.ReadFile(passPath); err == nil {
			adminPassword = strings.TrimSpace(string(b))
		}
	}

	return &Config{
		HTTPPort:      httpPort,
		HostDomain:    hostDomain,
		BaseDir:       baseDir,
		AppsDir:       appsDir,
		DataDir:       dataDir,
		ServicesDir:   servicesDir,
		LogsDir:       logsDir,
		UVBinary:      uvBin,
		GitBinary:     gitBin,
		IsSystemd:     isSystemd,
		AdminPassword: adminPassword,
	}
}

func (c *Config) EnsureDirectories() error {
	dirs := []string{c.BaseDir, c.AppsDir, c.DataDir, c.ServicesDir, c.LogsDir}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}
	return nil
}
