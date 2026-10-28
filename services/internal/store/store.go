/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Thread-safe persistent file store for project metadata and port allocation.
 */

package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/octaoss/py-daemon/services/internal/domain"
)

type Store struct {
	mu       sync.RWMutex
	filePath string
	projects map[string]*domain.Project
}

func NewStore(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, err
	}

	filePath := filepath.Join(dataDir, "projects.json")
	s := &Store{
		filePath: filePath,
		projects: make(map[string]*domain.Project),
	}

	if err := s.load(); err != nil {
		return nil, err
	}

	return s, nil
}

func (s *Store) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var list []*domain.Project
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}

	for _, p := range list {
		s.projects[p.ID] = p
	}

	return nil
}

func (s *Store) save() error {
	list := make([]*domain.Project, 0, len(s.projects))
	for _, p := range s.projects {
		list = append(list, p)
	}

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}

	tmpFile := s.filePath + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return err
	}

	return os.Rename(tmpFile, s.filePath)
}

func (s *Store) GetAll() []*domain.Project {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]*domain.Project, 0, len(s.projects))
	for _, p := range s.projects {
		copied := *p
		list = append(list, &copied)
	}
	return list
}

func (s *Store) Get(id string) (*domain.Project, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	p, exists := s.projects[id]
	if !exists {
		return nil, fmt.Errorf("project not found: %s", id)
	}
	copied := *p
	return &copied, nil
}

func (s *Store) GetBySubdomain(subdomain string) (*domain.Project, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, p := range s.projects {
		if p.Subdomain == subdomain {
			copied := *p
			return &copied, true
		}
	}
	return nil, false
}

func (s *Store) Create(p *domain.Project) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.projects[p.ID]; exists {
		return errors.New("project with ID already exists")
	}

	for _, existing := range s.projects {
		if existing.Subdomain == p.Subdomain {
			return fmt.Errorf("subdomain '%s' is already in use", p.Subdomain)
		}
	}

	now := time.Now()
	p.CreatedAt = now
	p.UpdatedAt = now

	s.projects[p.ID] = p
	return s.save()
}

func (s *Store) Update(p *domain.Project) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, exists := s.projects[p.ID]
	if !exists {
		return fmt.Errorf("project not found: %s", p.ID)
	}

	for _, other := range s.projects {
		if other.ID != p.ID && other.Subdomain == p.Subdomain {
			return fmt.Errorf("subdomain '%s' is already in use by another project", p.Subdomain)
		}
	}

	p.CreatedAt = existing.CreatedAt
	p.UpdatedAt = time.Now()

	s.projects[p.ID] = p
	return s.save()
}

func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.projects[id]; !exists {
		return fmt.Errorf("project not found: %s", id)
	}

	delete(s.projects, id)
	return s.save()
}

func (s *Store) AllocatePort() int {
	s.mu.RLock()
	usedPorts := make(map[int]bool)
	for _, p := range s.projects {
		if p.Port > 0 {
			usedPorts[p.Port] = true
		}
	}
	s.mu.RUnlock()

	for candidate := 8100; candidate < 9000; candidate++ {
		if usedPorts[candidate] {
			continue
		}
		if isPortAvailable(candidate) {
			return candidate
		}
	}
	return 9000
}

func isPortAvailable(port int) bool {
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	listener.Close()
	return true
}
