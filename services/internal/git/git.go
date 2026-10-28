/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Git repository operations and project source code inspection.
 */

package git

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/octaoss/py-daemon/services/internal/domain"
)

type Client struct {
	binaryPath string
}

func NewClient(binaryPath string) *Client {
	if binaryPath == "" {
		binaryPath = "git"
	}
	return &Client{binaryPath: binaryPath}
}

func (c *Client) IsAvailable() bool {
	_, err := exec.LookPath(c.binaryPath)
	return err == nil
}

func (c *Client) Clone(url, branch, destDir string, out io.Writer) error {
	args := []string{"clone", "--depth", "1"}
	if branch != "" {
		args = append(args, "--branch", branch)
	}
	args = append(args, url, destDir)

	cmd := exec.Command(c.binaryPath, args...)
	if out != nil {
		cmd.Stdout = out
		cmd.Stderr = out
	}
	return cmd.Run()
}

func (c *Client) Pull(repoDir string, out io.Writer) error {
	cmd := exec.Command(c.binaryPath, "pull")
	cmd.Dir = repoDir
	if out != nil {
		cmd.Stdout = out
		cmd.Stderr = out
	}
	return cmd.Run()
}

func ExtractZip(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}

	for _, f := range r.File {
		cleanedPath := filepath.Clean(f.Name)
		if strings.HasPrefix(cleanedPath, "..") || strings.HasPrefix(cleanedPath, "/") {
			continue
		}

		targetPath := filepath.Join(destDir, cleanedPath)
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, f.Mode()); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			return err
		}

		outFile, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return err
		}

		_, err = io.Copy(outFile, rc)
		rc.Close()
		outFile.Close()
		if err != nil {
			return err
		}
	}

	entries, err := os.ReadDir(destDir)
	if err == nil && len(entries) == 1 && entries[0].IsDir() {
		singleSubdir := filepath.Join(destDir, entries[0].Name())
		tempMoveDir := destDir + "_tmp_unwrap"
		if err := os.Rename(singleSubdir, tempMoveDir); err == nil {
			os.RemoveAll(destDir)
			os.Rename(tempMoveDir, destDir)
		}
	}

	return nil
}

func InspectDirectory(dirPath string) (*domain.ProjectInspection, error) {
	var pyFiles []string
	var reqFiles []string

	detectedFramework := "Generic"
	suggestedEntrypoint := ""
	suggestedCommand := ""

	err := filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		relPath, err := filepath.Rel(dirPath, path)
		if err != nil {
			return nil
		}

		if info.IsDir() {
			base := info.Name()
			if strings.HasPrefix(base, ".") || base == "node_modules" || base == "venv" || base == ".venv" || base == "__pycache__" {
				return filepath.SkipDir
			}
			return nil
		}

		lowerName := strings.ToLower(info.Name())

		if strings.HasSuffix(lowerName, ".py") {
			pyFiles = append(pyFiles, relPath)
			if suggestedEntrypoint == "" {
				if lowerName == "main.py" || lowerName == "app.py" || lowerName == "server.py" || lowerName == "wsgi.py" || lowerName == "manage.py" {
					suggestedEntrypoint = relPath
				}
			}
		}

		if lowerName == "requirements.txt" || strings.HasPrefix(lowerName, "requirements-") || lowerName == "pyproject.toml" || lowerName == "pipfile" {
			reqFiles = append(reqFiles, relPath)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	if suggestedEntrypoint == "" && len(pyFiles) > 0 {
		suggestedEntrypoint = pyFiles[0]
	}

	for _, py := range pyFiles {
		contentBytes, err := os.ReadFile(filepath.Join(dirPath, py))
		if err != nil {
			continue
		}
		content := string(contentBytes)
		if strings.Contains(content, "FastAPI") || strings.Contains(content, "fastapi") {
			detectedFramework = "FastAPI"
			break
		} else if strings.Contains(content, "Flask") || strings.Contains(content, "flask") {
			detectedFramework = "Flask"
			break
		} else if strings.Contains(content, "django") || strings.Contains(content, "Django") {
			detectedFramework = "Django"
			break
		}
	}

	switch detectedFramework {
	case "FastAPI":
		moduleName := strings.TrimSuffix(filepath.Base(suggestedEntrypoint), ".py")
		if moduleName == "" {
			moduleName = "main"
		}
		suggestedCommand = fmt.Sprintf("uvicorn %s:app --host 0.0.0.0 --port $PORT", moduleName)
	case "Flask":
		suggestedCommand = fmt.Sprintf("python %s", suggestedEntrypoint)
	case "Django":
		suggestedCommand = "python manage.py runserver 0.0.0.0:$PORT"
	default:
		if suggestedEntrypoint != "" {
			suggestedCommand = fmt.Sprintf("python %s", suggestedEntrypoint)
		} else {
			suggestedCommand = "python main.py"
		}
	}

	return &domain.ProjectInspection{
		PythonFiles:         pyFiles,
		RequirementsFiles:   reqFiles,
		SuggestedEntrypoint: suggestedEntrypoint,
		SuggestedCommand:    suggestedCommand,
		DetectedFramework:   detectedFramework,
	}, nil
}
