/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Process supervisor for local process isolation, auto-restart on error, and log capture.
 */

package service

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/octaoss/py-daemon/services/internal/domain"
)

type ProcessInstance struct {
	mu          sync.Mutex
	projectID   string
	projectDir  string
	cmdString   string
	envVars     map[string]string
	port        int
	autoRestart bool
	cmd         *exec.Cmd
	stopChan    chan struct{}
	running     bool
	pid         int
	exitErr     error
}

type Supervisor struct {
	mu        sync.RWMutex
	instances map[string]*ProcessInstance
}

func NewSupervisor() *Supervisor {
	return &Supervisor{
		instances: make(map[string]*ProcessInstance),
	}
}

func (s *Supervisor) Start(p *domain.Project, projectDir string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if inst, exists := s.instances[p.ID]; exists && inst.IsRunning() {
		return nil
	}

	inst := &ProcessInstance{
		projectID:   p.ID,
		projectDir:  projectDir,
		cmdString:   p.RunCommand,
		envVars:     p.EnvVars,
		port:        p.Port,
		autoRestart: p.AutoRestart,
		stopChan:    make(chan struct{}),
	}

	s.instances[p.ID] = inst
	go inst.runLoop()

	return nil
}

func (s *Supervisor) Stop(projectID string) error {
	s.mu.Lock()
	inst, exists := s.instances[projectID]
	s.mu.Unlock()

	if !exists {
		return nil
	}

	return inst.Stop()
}

func (s *Supervisor) Restart(p *domain.Project, projectDir string) error {
	_ = s.Stop(p.ID)
	time.Sleep(500 * time.Millisecond)
	return s.Start(p, projectDir)
}

func (s *Supervisor) IsRunning(projectID string) (bool, int) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	inst, exists := s.instances[projectID]
	if !exists {
		return false, 0
	}

	return inst.IsRunning(), inst.pid
}

func (inst *ProcessInstance) IsRunning() bool {
	inst.mu.Lock()
	defer inst.mu.Unlock()
	return inst.running
}

func (inst *ProcessInstance) Stop() error {
	inst.mu.Lock()
	if !inst.running {
		inst.mu.Unlock()
		return nil
	}

	close(inst.stopChan)

	if inst.cmd != nil && inst.cmd.Process != nil {
		_ = inst.cmd.Process.Signal(syscall.SIGTERM)
	}
	inst.mu.Unlock()

	done := make(chan struct{})
	go func() {
		for {
			inst.mu.Lock()
			running := inst.running
			inst.mu.Unlock()
			if !running {
				close(done)
				return
			}
			time.Sleep(100 * time.Millisecond)
		}
	}()

	select {
	case <-done:
		return nil
	case <-time.After(3 * time.Second):
		inst.mu.Lock()
		if inst.cmd != nil && inst.cmd.Process != nil {
			_ = inst.cmd.Process.Kill()
		}
		inst.running = false
		inst.mu.Unlock()
		return nil
	}
}

func (inst *ProcessInstance) runLoop() {
	for {
		select {
		case <-inst.stopChan:
			return
		default:
		}

		err := inst.executeSingleRun()

		select {
		case <-inst.stopChan:
			return
		default:
		}

		if !inst.autoRestart {
			return
		}

		if err != nil {
			time.Sleep(2 * time.Second)
		} else {
			return
		}
	}
}

func (inst *ProcessInstance) executeSingleRun() error {
	logsDir := filepath.Join(inst.projectDir, "logs")
	_ = os.MkdirAll(logsDir, 0755)
	logFile, err := os.OpenFile(filepath.Join(logsDir, "app.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return err
	}
	defer logFile.Close()

	sourceDir := filepath.Join(inst.projectDir, "source")
	venvBin := filepath.Join(inst.projectDir, "venv", "bin")

	parts := strings.Fields(inst.cmdString)
	if len(parts) == 0 {
		return fmt.Errorf("empty run command")
	}

	exe := parts[0]
	args := parts[1:]

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

	for i, arg := range args {
		if arg == "$PORT" {
			args[i] = fmt.Sprintf("%d", inst.port)
		} else {
			args[i] = strings.ReplaceAll(arg, "$PORT", fmt.Sprintf("%d", inst.port))
		}
	}

	cmd := exec.Command(exe, args...)
	cmd.Dir = sourceDir

	env := os.Environ()
	env = append(env, fmt.Sprintf("PATH=%s:%s", venvBin, os.Getenv("PATH")))
	env = append(env, fmt.Sprintf("PORT=%d", inst.port))
	for k, v := range inst.envVars {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}
	cmd.Env = env

	cmd.Stdout = logFile
	cmd.Stderr = logFile

	if err := cmd.Start(); err != nil {
		_, _ = logFile.WriteString(fmt.Sprintf("[%s] Failed to start process: %v\n", time.Now().Format(time.RFC3339), err))
		return err
	}

	inst.mu.Lock()
	inst.cmd = cmd
	inst.pid = cmd.Process.Pid
	inst.running = true
	inst.mu.Unlock()

	_, _ = logFile.WriteString(fmt.Sprintf("[%s] Started process (PID %d): %s\n", time.Now().Format(time.RFC3339), inst.pid, inst.cmdString))

	waitErr := cmd.Wait()

	inst.mu.Lock()
	inst.running = false
	inst.exitErr = waitErr
	inst.mu.Unlock()

	exitMsg := fmt.Sprintf("[%s] Process exited (PID %d)", time.Now().Format(time.RFC3339), inst.pid)
	if waitErr != nil {
		exitMsg += fmt.Sprintf(" with error: %v\n", waitErr)
	} else {
		exitMsg += " with code 0\n"
	}
	_, _ = logFile.WriteString(exitMsg)

	return waitErr
}

func ReadLogTail(logFilePath string, maxLines int) ([]string, error) {
	file, err := os.Open(logFilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}
	defer file.Close()

	var lines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	if len(lines) <= maxLines {
		return lines, nil
	}

	return lines[len(lines)-maxLines:], nil
}

func StreamLogFile(logFilePath string, stopChan <-chan struct{}) (<-chan string, error) {
	out := make(chan string, 100)

	go func() {
		defer close(out)

		var offset int64 = 0

		file, err := os.Open(logFilePath)
		if err == nil {
			stat, _ := file.Stat()
			if stat.Size() > 4096 {
				offset = stat.Size() - 4096
			}
			file.Close()
		}

		for {
			select {
			case <-stopChan:
				return
			default:
			}

			file, err := os.Open(logFilePath)
			if err != nil {
				time.Sleep(500 * time.Millisecond)
				continue
			}

			_, _ = file.Seek(offset, io.SeekStart)
			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				out <- scanner.Text()
			}

			newOffset, _ := file.Seek(0, io.SeekCurrent)
			offset = newOffset
			file.Close()

			time.Sleep(500 * time.Millisecond)
		}
	}()

	return out, nil
}
