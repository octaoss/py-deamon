/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * PyDaemon Cloudflare Tunnel & Project Route Manager dashboard.
 */

import React, { useState, useEffect } from 'react'
import {
  Server,
  Plus,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Layers,
  X,
  RefreshCw,
  Clock,
  ArrowRight,
  Copy,
  Check
} from 'lucide-react'
import type {
  Project,
  SystemStatus,
  CFTunnelStatus
} from './types'

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [cfStatus, setCFStatus] = useState<CFTunnelStatus | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false)
  const [isCFModalOpen, setIsCFModalOpen] = useState<boolean>(false)

  const [projectName, setProjectName] = useState<string>('')
  const [projectSubdomain, setProjectSubdomain] = useState<string>('')
  const [projectPort, setProjectPort] = useState<number | ''>(8000)
  const [isDeploying, setIsDeploying] = useState<boolean>(false)

  const [cfToken, setCFToken] = useState<string>('')
  const [cfDomain, setCFDomain] = useState<string>('')
  const [cfActive, setCFActive] = useState<boolean>(false)
  const [isSavingCF, setIsSavingCF] = useState<boolean>(false)

  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    fetchInitialData()
    const interval = setInterval(fetchProjects, 4000)
    return () => clearInterval(interval)
  }, [])

  const fetchInitialData = async () => {
    setLoading(true)
    await Promise.all([fetchProjects(), fetchSystemStatus(), fetchCFTunnel()])
    setLoading(false)
  }

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        setProjects(data)
      }
    } catch {
    }
  }

  const fetchSystemStatus = async () => {
    try {
      const res = await fetch('/api/system/status')
      if (res.ok) {
        const data = await res.json()
        setSystemStatus(data)
      }
    } catch {
    }
  }

  const fetchCFTunnel = async () => {
    try {
      const res = await fetch('/api/cftunnel')
      if (res.ok) {
        const data = await res.json()
        setCFStatus(data)
        setCFToken(data.token || '')
        setCFDomain(data.domain || '')
        setCFActive(data.active || false)
      }
    } catch {
    }
  }

  const handleNameChange = (val: string) => {
    setProjectName(val)
    if (!projectSubdomain || projectSubdomain === projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-')) {
      setProjectSubdomain(val.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
    }
  }

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsDeploying(true)

    const payload = {
      name: projectName,
      subdomain: projectSubdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      port: Number(projectPort) || 8000,
    }

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        alert(`Route creation error: ${err.error || 'Failed to create tunnel route.'}`)
        setIsDeploying(false)
        return
      }

      setIsNewModalOpen(false)
      resetNewForm()
      await fetchProjects()
    } catch (err: any) {
      alert(`Network error: ${err.message}`)
    } finally {
      setIsDeploying(false)
    }
  }

  const resetNewForm = () => {
    setProjectName('')
    setProjectSubdomain('')
    setProjectPort(8000)
  }

  const handleDelete = async (p: Project) => {
    if (!confirm(`Are you sure you want to remove tunnel route "${p.subdomain}"?`)) {
      return
    }
    await fetch(`/api/projects/${p.id}`, { method: 'DELETE' })
    await fetchProjects()
  }

  const handleSaveCF = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingCF(true)

    try {
      const res = await fetch('/api/cftunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: cfToken,
          domain: cfDomain.trim(),
          active: cfActive,
        }),
      })

      if (res.ok) {
        await fetchCFTunnel()
        setIsCFModalOpen(false)
      } else {
        const err = await res.json()
        alert(`Cloudflare configuration error: ${err.error}`)
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`)
    } finally {
      setIsSavingCF(false)
    }
  }

  const getPublicHost = (subdomain: string) => {
    const domain = cfStatus?.domain || 'domain'
    return `${subdomain}.${domain}`
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatUptime = (seconds: number = 0) => {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (d > 0) return `${d}d ${h}h`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <div className="logo-badge">
            <Layers size={22} />
          </div>
          <div>
            <div className="brand-title">PyDaemon</div>
            <div className="brand-subtitle">Cloudflare Tunnel Route Manager</div>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsCFModalOpen(true)}
          >
            <ShieldCheck size={16} />
            <span>
              {cfStatus?.domain ? `CF Domain: ${cfStatus.domain}` : 'Set CF Domain'}
            </span>
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              resetNewForm()
              setIsNewModalOpen(true)
            }}
          >
            <Plus size={16} />
            <span>New Project</span>
          </button>
        </div>
      </header>

      {systemStatus && (
        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Active Tunnel Routes</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>
              {projects.length}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Cloudflare Root Domain</div>
            <div
              className="stat-value"
              style={{ fontSize: '1.15rem', color: cfStatus?.domain ? 'var(--primary)' : 'var(--text-dim)', cursor: 'pointer' }}
              onClick={() => setIsCFModalOpen(true)}
            >
              {cfStatus?.domain || 'Not configured'}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Daemon Uptime</div>
            <div className="stat-value" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={18} />
              {formatUptime(systemStatus.uptime_seconds)}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Tunnel Daemon</div>
            <div className="stat-value" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Server size={18} />
              {cfStatus?.running ? 'Connected' : cfStatus?.active ? 'Connecting' : 'Standby'}
            </div>
          </div>
        </section>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="spin" style={{ marginBottom: '1rem' }} />
          <div>Loading PyDaemon routes...</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <Layers size={44} style={{ color: 'var(--primary)', opacity: 0.8 }} />
          <h3 className="empty-title">No Tunnel Routes Configured</h3>
          <p className="empty-desc">
            Create your first route to map a Cloudflare Tunnel subdomain directly to your local port.
            Example: <code>subdomain.domain ➔ localhost:port</code>.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              resetNewForm()
              setIsNewModalOpen(true)
            }}
          >
            <Plus size={16} />
            <span>Create New Route</span>
          </button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((p) => {
            const host = getPublicHost(p.subdomain)
            const fullUrl = `https://${host}`

            return (
              <div key={p.id} className="project-card">
                <div className="card-top">
                  <div>
                    <h3 className="project-name">{p.name}</h3>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                      Subdomain: <strong style={{ color: 'var(--text-main)' }}>{p.subdomain}</strong>
                    </div>
                  </div>
                  <span className="status-badge status-running">
                    <span className="pulse-dot" />
                    Active
                  </span>
                </div>

                <div style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.75rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  fontSize: '0.85rem',
                  fontFamily: 'ui-monospace, monospace'
                }}>
                  <span style={{ color: '#60a5fa', fontWeight: 600 }}>{host}</span>
                  <ArrowRight size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                  <span style={{ color: '#34d399', fontWeight: 600 }}>localhost:{p.port}</span>
                </div>

                <div className="card-actions">
                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Copy public URL"
                      onClick={() => copyToClipboard(fullUrl, p.id)}
                    >
                      {copiedId === p.id ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
                    </button>

                    <a
                      href={fullUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="icon-btn"
                      title={`Open https://${host}`}
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>

                  <button
                    type="button"
                    className="icon-btn"
                    style={{ color: '#ef4444' }}
                    title="Delete route"
                    onClick={() => handleDelete(p)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isNewModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">New Tunnel Project</h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  Route incoming Cloudflare Tunnel domain to your local port
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setIsNewModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleDeploy} className="modal-body">
              <div className="form-group">
                <label className="form-label">1. Project Name</label>
                <input
                  type="text"
                  placeholder="My API Service"
                  value={projectName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">2. Sub Domain Name</label>
                <input
                  type="text"
                  placeholder="api"
                  value={projectSubdomain}
                  onChange={(e) => setProjectSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">3. Port Expose (Local Port)</label>
                <input
                  type="number"
                  placeholder="8000"
                  value={projectPort}
                  onChange={(e) => setProjectPort(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  required
                />
              </div>

              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px dashed var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.85rem',
                fontSize: '0.82rem'
              }}>
                <div style={{ color: 'var(--text-dim)', marginBottom: '0.25rem' }}>Cloudflare Tunnel Route Preview:</div>
                <div style={{ color: 'var(--primary)', fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>
                  {getPublicHost(projectSubdomain || 'subdomain')} ➔ localhost:{projectPort || 8000}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsNewModalOpen(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isDeploying}
                >
                  {isDeploying ? 'Creating...' : 'Create Tunnel Route'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCFModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Cloudflare Tunnel (cf tun) Settings</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setIsCFModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCF} className="modal-body">
              <div style={{ padding: '0.75rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>
                  Cloudflare Root Domain
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  All routes will be created as <code>[subdomain].[domain] ➔ localhost:[port]</code>.
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Cloudflare Domain</label>
                <input
                  type="text"
                  placeholder="example.com"
                  value={cfDomain}
                  onChange={(e) => setCFDomain(e.target.value)}
                  required
                />
                <span className="form-help">Enter your root domain (e.g. <code>mycompany.com</code> or <code>octa.dev</code>).</span>
              </div>

              <div className="form-group">
                <label className="form-label">Cloudflare Tunnel Token (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="eyJhIjoi..."
                  value={cfToken}
                  onChange={(e) => setCFToken(e.target.value)}
                />
                <span className="form-help">If running cloudflared daemon via PyDaemon, paste token from Cloudflare Zero Trust.</span>
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  id="cf-enable-cb"
                  checked={cfActive}
                  onChange={(e) => setCFActive(e.target.checked)}
                />
                <label htmlFor="cf-enable-cb" className="form-label" style={{ cursor: 'pointer', margin: 0 }}>
                  Enable cloudflared daemon process
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsCFModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSavingCF}
                >
                  {isSavingCF ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
