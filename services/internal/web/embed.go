/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Embedded frontend web assets and single-page application fallback file server with cache control headers.
 */

package web

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"strings"
)

//go:embed dist/*
var distFS embed.FS

func Handler() http.Handler {
	subFS, err := fs.Sub(distFS, "dist")
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "embedded filesystem error", http.StatusInternalServerError)
		})
	}

	fileServer := http.FileServer(http.FS(subFS))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		if path == "index.html" || !strings.Contains(path, ".") {
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			w.Header().Set("Pragma", "no-cache")
			w.Header().Set("Expires", "0")
		} else if strings.HasPrefix(path, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}

		f, err := subFS.Open(path)
		if err != nil {
			if os.IsNotExist(err) || strings.Contains(err.Error(), "does not exist") {
				w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
				r.URL.Path = "/"
				fileServer.ServeHTTP(w, r)
				return
			}
		} else {
			_ = f.Close()
		}

		fileServer.ServeHTTP(w, r)
	})
}
