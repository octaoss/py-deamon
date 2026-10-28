/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * UV integration client for Python toolchain, version discovery, and virtual environment provisioning.
 */

package uv

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/octaoss/py-daemon/services/internal/domain"
)

type Client struct {
	binaryPath string
}

func NewClient(binaryPath string) *Client {
	if binaryPath == "" {
		binaryPath = "uv"
	}
	return &Client{binaryPath: binaryPath}
}

func (c *Client) IsAvailable() bool {
	_, err := exec.LookPath(c.binaryPath)
	return err == nil
}

func (c *Client) ListPythonVersions() ([]domain.PythonVersionInfo, error) {
	cmd := exec.Command(c.binaryPath, "python", "list")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to run uv python list: %w", err)
	}

	scanner := bufio.NewScanner(bytes.NewReader(output))
	var results []domain.PythonVersionInfo
	seen := make(map[string]bool)

	cpythonRegex := regexp.MustCompile(`^(cpython|pypy)-([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[a-zA-Z0-9]+)?)(?:\+[a-zA-Z0-9]+)?-[^\s]+\s+(.*)$`)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		matches := cpythonRegex.FindStringSubmatch(line)
		if len(matches) < 4 {
			continue
		}

		flavor := matches[1]
		version := matches[2]
		statusOrPath := strings.TrimSpace(matches[3])

		isInstalled := !strings.Contains(statusOrPath, "<download available>")
		rawName := fmt.Sprintf("%s-%s", flavor, version)

		if seen[rawName] {
			continue
		}
		seen[rawName] = true

		results = append(results, domain.PythonVersionInfo{
			Version:     version,
			RawName:     rawName,
			IsInstalled: isInstalled,
			Path:        statusOrPath,
		})
	}

	if len(results) == 0 {
		defaultVersions := []string{"3.13", "3.12", "3.11", "3.10", "3.9"}
		for _, v := range defaultVersions {
			results = append(results, domain.PythonVersionInfo{
				Version:     v,
				RawName:     "cpython-" + v,
				IsInstalled: false,
			})
		}
	}

	return results, nil
}

func (c *Client) EnsurePython(version string, out io.Writer) error {
	cmd := exec.Command(c.binaryPath, "python", "install", version)
	if out != nil {
		cmd.Stdout = out
		cmd.Stderr = out
	}
	return cmd.Run()
}

func (c *Client) CreateVenv(projectDir, version string, out io.Writer) error {
	venvPath := filepath.Join(projectDir, "venv")
	args := []string{"venv"}
	if version != "" {
		args = append(args, "--python", version)
	}
	args = append(args, venvPath)

	cmd := exec.Command(c.binaryPath, args...)
	cmd.Dir = projectDir
	if out != nil {
		cmd.Stdout = out
		cmd.Stderr = out
	}
	return cmd.Run()
}

func (c *Client) InstallRequirements(projectDir, reqFile string, out io.Writer) error {
	venvPython := filepath.Join(projectDir, "venv", "bin", "python")
	reqPath := filepath.Join(projectDir, "source", reqFile)

	args := []string{"pip", "install", "-p", venvPython, "-r", reqPath}
	cmd := exec.Command(c.binaryPath, args...)
	cmd.Dir = filepath.Join(projectDir, "source")
	if out != nil {
		cmd.Stdout = out
		cmd.Stderr = out
	}
	return cmd.Run()
}
