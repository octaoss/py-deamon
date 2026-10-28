/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Vite build and bundler configuration.
 */

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../services/internal/web/dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
