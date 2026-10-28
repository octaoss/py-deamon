/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * REST API router, project lifecycle endpoints, file uploads, and Server-Sent Events log streaming.
 */

package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/octaoss/py-daemon/services/internal/cftunnel"
	"github.com/octaoss/py-daemon/services/internal/config"
	"github.com/octaoss/py-daemon/services/internal/domain"
	"github.com/octaoss/py-daemon/services/internal/git"
	"github.com/octaoss/py-daemon/services/internal/service"
	"github.com/octaoss/py-daemon/services/internal/store"
	"github.com/octaoss/py-daemon/services/internal/uv"
)

type Server struct {
	cfg       *config.Config
	store     *store.Store
	manager   *service.Manager
	uvClient  *uv.Client
	gitClient *git.Client
	cfTunnel  *cftunnel.Manager
	startTime time.Time
}

func NewServer(
	cfg *config.Config,
	st *store.Store,
	mgr *service.Manager,
	uvClient *uv.Client,
	gitClient *git.Client,
	cfTunnel *cftunnel.Manager,
) *Server {
	return &Server{
		cfg:       cfg,
		store:     st,
		manager:   mgr,
		uvClient:  uvClient,
		gitClient: gitClient,
		cfTunnel:  cfTunnel,
		startTime: time.Now(),
	}
}

func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /api/system/status", s.handleSystemStatus)
	mux.HandleFunc("GET /api/python/versions", s.handlePythonVersions)

	mux.HandleFunc("POST /api/projects/inspect-git", s.handleInspectGit)
	mux.HandleFunc("POST /api/projects/inspect-zip", s.handleInspectZip)

	mux.HandleFunc("GET /api/projects", s.handleListProjects)
	mux.HandleFunc("POST /api/projects", s.handleCreateProject)
	mux.HandleFunc("GET /api/projects/{id}", s.handleGetProject)
	mux.HandleFunc("PUT /api/projects/{id}", s.handleUpdateProject)
	mux.HandleFunc("DELETE /api/projects/{id}", s.handleDeleteProject)

	mux.HandleFunc("POST /api/projects/{id}/start", s.handleStartProject)
	mux.HandleFunc("POST /api/projects/{id}/stop", s.handleStopProject)
	mux.HandleFunc("POST /api/projects/{id}/restart", s.handleRestartProject)
	mux.HandleFunc("POST /api/projects/{id}/rebuild", s.handleRebuildProject)

	mux.HandleFunc("GET /api/projects/{id}/logs", s.handleGetLogs)
	mux.HandleFunc("GET /api/projects/{id}/logs/stream", s.handleStreamLogs)

	mux.HandleFunc("GET /api/cftunnel", s.handleGetCFTunnel)
	mux.HandleFunc("POST /api/cftunnel", s.handleUpdateCFTunnel)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (s *Server) handleSystemStatus(w http.ResponseWriter, r *http.Request) {
	projects := s.store.GetAll()
	activeCount := 0
	for _, p := range projects {
		status, _ := s.manager.GetStatus(p)
		if status == domain.StatusRunning {
			activeCount++
		}
	}

	versions, _ := s.uvClient.ListPythonVersions()

	resp := domain.SystemStatus{
		DaemonRunning:  true,
		IsSystemd:      s.cfg.IsSystemd,
		UptimeSeconds:  int64(time.Since(s.startTime).Seconds()),
		TotalProjects:  len(projects),
		ActiveProjects: activeCount,
		HostDomain:     s.cfg.HostDomain,
		HTTPPort:       s.cfg.HTTPPort,
		UVInstalled:    s.uvClient.IsAvailable(),
		GitInstalled:   s.gitClient.IsAvailable(),
		Versions:       versions,
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handlePythonVersions(w http.ResponseWriter, r *http.Request) {
	versions, err := s.uvClient.ListPythonVersions()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, versions)
}

func (s *Server) handleInspectGit(w http.ResponseWriter, r *http.Request) {
	var req domain.InspectGitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if req.URL == "" {
		writeError(w, http.StatusBadRequest, "git url is required")
		return
	}

	tempID := generateRandomID(8)
	tempDir := filepath.Join(os.TempDir(), "pyd-inspect-"+tempID)

	if err := s.gitClient.Clone(req.URL, req.Branch, tempDir, nil); err != nil {
		_ = os.RemoveAll(tempDir)
		writeError(w, http.StatusBadRequest, fmt.Sprintf("git clone failed: %v", err))
		return
	}

	inspection, err := git.InspectDirectory(tempDir)
	if err != nil {
		_ = os.RemoveAll(tempDir)
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("inspection failed: %v", err))
		return
	}

	inspection.TempID = tempID
	writeJSON(w, http.StatusOK, inspection)
}

func (s *Server) handleInspectZip(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(100 << 20)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to parse multipart form")
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file field is required")
		return
	}
	defer file.Close()

	tempID := generateRandomID(8)
	tempDir := filepath.Join(os.TempDir(), "pyd-inspect-"+tempID)
	zipPath := tempDir + ".zip"

	outZip, err := os.Create(zipPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create temporary zip")
		return
	}
	_, err = io.Copy(outZip, file)
	outZip.Close()
	if err != nil {
		_ = os.Remove(zipPath)
		writeError(w, http.StatusInternalServerError, "failed to save zip")
		return
	}

	err = git.ExtractZip(zipPath, tempDir)
	_ = os.Remove(zipPath)
	if err != nil {
		_ = os.RemoveAll(tempDir)
		writeError(w, http.StatusBadRequest, fmt.Sprintf("failed to extract zip: %v", err))
		return
	}

	inspection, err := git.InspectDirectory(tempDir)
	if err != nil {
		_ = os.RemoveAll(tempDir)
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("inspection failed: %v", err))
		return
	}

	inspection.TempID = tempID
	writeJSON(w, http.StatusOK, inspection)
}

func (s *Server) handleListProjects(w http.ResponseWriter, r *http.Request) {
	projects := s.store.GetAll()
	for _, p := range projects {
		status, pid := s.manager.GetStatus(p)
		p.Status = status
		p.PID = pid
	}
	writeJSON(w, http.StatusOK, projects)
}

func (s *Server) handleGetProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	p.Status, p.PID = s.manager.GetStatus(p)
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	var req domain.CreateProjectRequest
	var tempDir string

	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		if err := r.ParseMultipartForm(100 << 20); err != nil {
			writeError(w, http.StatusBadRequest, "failed to parse multipart form")
			return
		}

		req.Name = r.FormValue("name")
		req.Subdomain = r.FormValue("subdomain")
		req.SourceType = "zip"
		req.PythonVersion = r.FormValue("python_version")
		req.RunCommand = r.FormValue("run_command")
		req.RequirementsFile = r.FormValue("requirements_file")
		req.AutoRestart = true

		if envJSON := r.FormValue("env_vars"); envJSON != "" {
			var envMap map[string]string
			if err := json.Unmarshal([]byte(envJSON), &envMap); err == nil {
				req.EnvVars = envMap
			}
		}

		file, _, err := r.FormFile("file")
		if err == nil && file != nil {
			defer file.Close()
			tempID := generateRandomID(8)
			tempDir = filepath.Join(os.TempDir(), "pyd-upload-"+tempID)
			zipPath := tempDir + ".zip"

			outZip, err := os.Create(zipPath)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to create temporary zip")
				return
			}
			_, err = io.Copy(outZip, file)
			outZip.Close()
			if err != nil {
				_ = os.Remove(zipPath)
				writeError(w, http.StatusInternalServerError, "failed to save zip")
				return
			}

			err = git.ExtractZip(zipPath, tempDir)
			_ = os.Remove(zipPath)
			if err != nil {
				_ = os.RemoveAll(tempDir)
				writeError(w, http.StatusBadRequest, fmt.Sprintf("failed to extract zip: %v", err))
				return
			}
		}
	} else {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.TempID != "" {
			tempDir = filepath.Join(os.TempDir(), "pyd-inspect-"+req.TempID)
		}
	}

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	subdomain := sanitizeSubdomain(req.Subdomain)
	if subdomain == "" {
		subdomain = sanitizeSubdomain(req.Name)
	}

	if _, exists := s.store.GetBySubdomain(subdomain); exists {
		writeError(w, http.StatusConflict, fmt.Sprintf("subdomain '%s' is already in use", subdomain))
		return
	}

	port := req.Port
	if port <= 0 {
		port = s.store.AllocatePort()
	}

	projectID := sanitizeSubdomain(req.Name) + "-" + generateRandomID(4)

	pyVer := req.PythonVersion
	if pyVer == "" {
		pyVer = "3.12"
	}

	srcType := req.SourceType
	if srcType == "" {
		if req.GitURL != "" {
			srcType = "git"
		} else if tempDir != "" {
			srcType = "zip"
		} else {
			srcType = "tunnel"
		}
	}

	hasSourceOrCommand := req.RunCommand != "" || req.GitURL != "" || tempDir != ""

	initialStatus := domain.StatusRunning
	if hasSourceOrCommand {
		initialStatus = domain.StatusBuilding
	}

	p := &domain.Project{
		ID:               projectID,
		Name:             req.Name,
		Subdomain:        subdomain,
		Port:             port,
		SourceType:       srcType,
		GitURL:           req.GitURL,
		GitBranch:        req.GitBranch,
		PythonVersion:    pyVer,
		Entrypoint:       req.Entrypoint,
		RunCommand:       req.RunCommand,
		RequirementsFile: req.RequirementsFile,
		EnvVars:          req.EnvVars,
		Status:           initialStatus,
		AutoRestart:      true,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	if p.EnvVars == nil {
		p.EnvVars = make(map[string]string)
	}

	if err := s.store.Create(p); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	routes := make(map[string]int)
	for _, proj := range s.store.GetAll() {
		routes[proj.Subdomain] = proj.Port
	}
	_ = s.cfTunnel.SyncIngressConfig(routes)
	_ = s.cfTunnel.CreateCloudflareRoute(subdomain, port)

	if hasSourceOrCommand {
		go func() {
			projectDir := filepath.Join(s.cfg.AppsDir, p.ID)
			logsDir := filepath.Join(projectDir, "logs")
			_ = os.MkdirAll(logsDir, 0755)
			logFile, _ := os.OpenFile(filepath.Join(logsDir, "app.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
			var writer io.Writer = os.Stdout
			if logFile != nil {
				writer = io.MultiWriter(os.Stdout, logFile)
				defer logFile.Close()
			}

			err := s.manager.Deploy(p, tempDir, writer)
			if err != nil {
				p.Status = domain.StatusFailed
				p.ErrorMessage = err.Error()
			} else {
				p.Status = domain.StatusRunning
				p.ErrorMessage = ""
			}
			_ = s.store.Update(p)
		}()
	}

	writeJSON(w, http.StatusCreated, p)
}

func (s *Server) handleUpdateProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	var req domain.UpdateProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid update payload")
		return
	}

	if req.Subdomain != "" {
		p.Subdomain = sanitizeSubdomain(req.Subdomain)
	}
	if req.Port > 0 {
		p.Port = req.Port
	}
	if req.PythonVersion != "" {
		p.PythonVersion = req.PythonVersion
	}
	if req.Entrypoint != "" {
		p.Entrypoint = req.Entrypoint
	}
	if req.RunCommand != "" {
		p.RunCommand = req.RunCommand
	}
	if req.RequirementsFile != "" {
		p.RequirementsFile = req.RequirementsFile
	}
	if req.EnvVars != nil {
		p.EnvVars = req.EnvVars
	}
	p.AutoRestart = req.AutoRestart

	if err := s.store.Update(p); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	_ = s.manager.Restart(p)
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleDeleteProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	_ = s.manager.Remove(p)
	_ = s.store.Delete(id)
	_ = s.cfTunnel.DeleteCloudflareRoute(p.Subdomain)

	routes := make(map[string]int)
	for _, proj := range s.store.GetAll() {
		routes[proj.Subdomain] = proj.Port
	}
	_ = s.cfTunnel.SyncIngressConfig(routes)

	writeJSON(w, http.StatusOK, map[string]string{"message": "project deleted"})
}

func (s *Server) handleStartProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	if err := s.manager.Start(p); err != nil {
		p.Status = domain.StatusFailed
		p.ErrorMessage = err.Error()
		_ = s.store.Update(p)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	p.Status = domain.StatusRunning
	p.ErrorMessage = ""
	_ = s.store.Update(p)

	writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleStopProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	if err := s.manager.Stop(p); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	p.Status = domain.StatusStopped
	_ = s.store.Update(p)

	writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleRestartProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	if err := s.manager.Restart(p); err != nil {
		p.Status = domain.StatusFailed
		p.ErrorMessage = err.Error()
		_ = s.store.Update(p)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	p.Status = domain.StatusRunning
	p.ErrorMessage = ""
	_ = s.store.Update(p)

	writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleRebuildProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	go func() {
		projectDir := filepath.Join(s.cfg.AppsDir, p.ID)
		logsDir := filepath.Join(projectDir, "logs")
		logFile, _ := os.OpenFile(filepath.Join(logsDir, "app.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		var writer io.Writer = os.Stdout
		if logFile != nil {
			writer = io.MultiWriter(os.Stdout, logFile)
			defer logFile.Close()
		}

		_ = s.manager.Stop(p)
		p.Status = domain.StatusBuilding
		_ = s.store.Update(p)

		err := s.manager.Deploy(p, "", writer)
		if err != nil {
			p.Status = domain.StatusFailed
			p.ErrorMessage = err.Error()
		} else {
			p.Status = domain.StatusRunning
			p.ErrorMessage = ""
		}
		_ = s.store.Update(p)
	}()

	writeJSON(w, http.StatusAccepted, map[string]string{"message": "rebuild initiated"})
}

func (s *Server) handleGetLogs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	lines, err := s.manager.GetLogs(p, 150)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string][]string{"logs": lines})
}

func (s *Server) handleStreamLogs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusBadRequest, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	stopChan := make(chan struct{})
	defer close(stopChan)

	lines, err := s.manager.StreamLogs(p, stopChan)
	if err != nil {
		_, _ = fmt.Fprintf(w, "event: error\ndata: %s\n\n", err.Error())
		flusher.Flush()
		return
	}

	notify := r.Context().Done()

	for {
		select {
		case <-notify:
			return
		case line, ok := <-lines:
			if !ok {
				return
			}
			_, _ = fmt.Fprintf(w, "data: %s\n\n", line)
			flusher.Flush()
		}
	}
}

func (s *Server) handleGetCFTunnel(w http.ResponseWriter, r *http.Request) {
	running, token, domainStr, tunnelID, apiToken, accountID, active, logs := s.cfTunnel.GetStatus()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"running":    running,
		"token":      token,
		"domain":     domainStr,
		"tunnel_id":  tunnelID,
		"api_token":  apiToken,
		"account_id": accountID,
		"active":     active,
		"logs":       logs,
		"installed":  s.cfTunnel.IsInstalled(),
	})
}

func (s *Server) handleUpdateCFTunnel(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		APIToken  string `json:"api_token"`
		AccountID string `json:"account_id"`
		TunnelID  string `json:"tunnel_id"`
		ZoneID    string `json:"zone_id"`
		Domain    string `json:"domain"`
		Token     string `json:"token"`
		Active    bool   `json:"active"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}

	if err := s.cfTunnel.UpdateConfig(payload.APIToken, payload.AccountID, payload.TunnelID, payload.ZoneID, payload.Domain, payload.Token, payload.Active); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	routes := make(map[string]int)
	for _, p := range s.store.GetAll() {
		routes[p.Subdomain] = p.Port
	}
	_ = s.cfTunnel.SyncIngressConfig(routes)

	writeJSON(w, http.StatusOK, map[string]string{"message": "cloudflare tunnel settings updated"})
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func generateRandomID(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)[:n]
}

func sanitizeSubdomain(input string) string {
	reg := regexp.MustCompile("[^a-zA-Z0-9-]+")
	cleaned := reg.ReplaceAllString(strings.ToLower(input), "-")
	return strings.Trim(cleaned, "-")
}
