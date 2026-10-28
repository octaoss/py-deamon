/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Main application entrypoint for PyDaemon runtime server and reverse proxy.
 */

package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/octaoss/py-daemon/services/internal/api"
	"github.com/octaoss/py-daemon/services/internal/cftunnel"
	"github.com/octaoss/py-daemon/services/internal/config"
	"github.com/octaoss/py-daemon/services/internal/domain"
	"github.com/octaoss/py-daemon/services/internal/git"
	"github.com/octaoss/py-daemon/services/internal/proxy"
	"github.com/octaoss/py-daemon/services/internal/service"
	"github.com/octaoss/py-daemon/services/internal/store"
	"github.com/octaoss/py-daemon/services/internal/uv"
	"github.com/octaoss/py-daemon/services/internal/web"
)

func main() {
	cfg := config.Load()

	if err := cfg.EnsureDirectories(); err != nil {
		log.Fatalf("failed to create runtime directories: %v", err)
	}

	st, err := store.NewStore(cfg.DataDir)
	if err != nil {
		log.Fatalf("failed to initialize metadata store: %v", err)
	}

	uvClient := uv.NewClient(cfg.UVBinary)
	gitClient := git.NewClient(cfg.GitBinary)
	cfMgr := cftunnel.NewManager("", cfg.DataDir)

	running, _, _, active, _ := cfMgr.GetStatus()
	if active && !running {
		_ = cfMgr.Start()
	}

	svcMgr := service.NewManager(cfg, uvClient, gitClient)

	projects := st.GetAll()
	for _, p := range projects {
		if p.Status == domain.StatusRunning {
			_ = svcMgr.Start(p)
		}
	}

	apiServer := api.NewServer(cfg, st, svcMgr, uvClient, gitClient, cfMgr)

	mux := http.NewServeMux()
	apiServer.RegisterRoutes(mux)
	mux.Handle("/", web.Handler())

	proxyRouter := proxy.NewRouter(st, cfMgr, cfg.HostDomain, mux)

	srv := &http.Server{
		Addr:    fmt.Sprintf("0.0.0.0:%d", cfg.HTTPPort),
		Handler: proxyRouter,
	}

	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("PyDaemon manager started on http://0.0.0.0:%d\n", cfg.HTTPPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	<-stopChan
	log.Println("Shutting down PyDaemon...")

	_ = cfMgr.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v\n", err)
	}

	log.Println("PyDaemon stopped successfully.")
}
