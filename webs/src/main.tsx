/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Client application bootstrap and DOM root mounting.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
