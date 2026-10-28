/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Reverse proxy middleware for Cloudflare Tunnel and subdomain virtual host dispatching.
 */

package proxy

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"

	"github.com/octaoss/py-daemon/services/internal/cftunnel"
	"github.com/octaoss/py-daemon/services/internal/store"
)

type Router struct {
	store      *store.Store
	cfTunnel   *cftunnel.Manager
	hostDomain string
	next       http.Handler
	proxiesMu  sync.RWMutex
	proxies    map[int]*httputil.ReverseProxy
}

func NewRouter(st *store.Store, cf *cftunnel.Manager, hostDomain string, next http.Handler) *Router {
	return &Router{
		store:      st,
		cfTunnel:   cf,
		hostDomain: hostDomain,
		next:       next,
		proxies:    make(map[int]*httputil.ReverseProxy),
	}
}

func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	if strings.HasPrefix(req.URL.Path, "/api/") || req.URL.Path == "/healthz" {
		r.next.ServeHTTP(w, req)
		return
	}

	if strings.HasPrefix(req.URL.Path, "/proxy/") {
		parts := strings.SplitN(strings.TrimPrefix(req.URL.Path, "/proxy/"), "/", 2)
		subdomain := parts[0]
		if p, found := r.store.GetBySubdomain(subdomain); found {
			remainder := "/"
			if len(parts) > 1 {
				remainder += parts[1]
			}
			req.URL.Path = remainder
			req.URL.RawPath = remainder
			r.proxyToPort(w, req, p.Port)
			return
		}
	}

	subdomain := r.extractSubdomain(req.Host)
	if subdomain != "" && subdomain != "www" && subdomain != "admin" {
		if p, found := r.store.GetBySubdomain(subdomain); found {
			r.proxyToPort(w, req, p.Port)
			return
		}
	}

	r.next.ServeHTTP(w, req)
}

func (r *Router) extractSubdomain(hostHeader string) string {
	host := hostHeader
	if colonIdx := strings.Index(host, ":"); colonIdx != -1 {
		host = host[:colonIdx]
	}

	cfDomain := r.cfTunnel.GetDomain()
	if cfDomain != "" {
		suffix := "." + cfDomain
		if strings.HasSuffix(host, suffix) {
			sub := strings.TrimSuffix(host, suffix)
			if !strings.Contains(sub, ".") && sub != "" {
				return sub
			}
		}
	}

	if r.hostDomain != "" && r.hostDomain != "localhost" {
		suffix := "." + r.hostDomain
		if strings.HasSuffix(host, suffix) {
			sub := strings.TrimSuffix(host, suffix)
			if !strings.Contains(sub, ".") && sub != "" {
				return sub
			}
		}
	}

	parts := strings.Split(host, ".")
	if len(parts) >= 2 {
		candidate := parts[0]
		if candidate != "www" && candidate != "admin" {
			if _, found := r.store.GetBySubdomain(candidate); found {
				return candidate
			}
		}
	}

	return ""
}

func (r *Router) proxyToPort(w http.ResponseWriter, req *http.Request, port int) {
	r.proxiesMu.RLock()
	proxy, exists := r.proxies[port]
	r.proxiesMu.RUnlock()

	if !exists {
		targetURL, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", port))
		newProxy := httputil.NewSingleHostReverseProxy(targetURL)

		originalDirector := newProxy.Director
		newProxy.Director = func(outReq *http.Request) {
			originalDirector(outReq)
			outReq.Header.Set("X-Forwarded-Host", req.Host)
			if proto := req.Header.Get("X-Forwarded-Proto"); proto != "" {
				outReq.Header.Set("X-Forwarded-Proto", proto)
			} else if req.TLS != nil {
				outReq.Header.Set("X-Forwarded-Proto", "https")
			} else {
				outReq.Header.Set("X-Forwarded-Proto", "http")
			}
		}

		newProxy.ErrorHandler = func(rw http.ResponseWriter, r *http.Request, err error) {
			rw.Header().Set("Content-Type", "text/html; charset=utf-8")
			rw.WriteHeader(http.StatusBadGateway)
			_, _ = fmt.Fprintf(rw, `<!DOCTYPE html><html><head><title>502 Bad Gateway - PyDaemon</title><style>body{background:#0a0a0a;color:#ededed;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}div{text-align:center;padding:2rem;border:1px solid #333;border-radius:12px;background:#141414;}h1{font-size:2rem;margin:0 0 1rem;color:#f87171;}p{color:#888;margin:0;}</style></head><body><div><h1>502 Bad Gateway</h1><p>Local service is unreachable on localhost:%d</p></div></body></html>`, port)
		}

		r.proxiesMu.Lock()
		r.proxies[port] = newProxy
		proxy = newProxy
		r.proxiesMu.Unlock()
	}

	proxy.ServeHTTP(w, req)
}
