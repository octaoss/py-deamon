/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * PyDaemon Cloudflare Tunnel & Project Route Manager dashboard with direct localhost to domain mapping.
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
  Check,
  Radio,
  FileArchive,
  FolderGit2
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
  const [sourceType, setSourceType] = useState<'tunnel' | 'git' | 'zip'>('tunnel')
  const [gitURL, setGitURL] = useState<string>('')
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [runCommand, setRunCommand] = useState<string>('python main.py')
  const [isDeploying, setIsDeploying] = useState<boolean>(false)

  const [cfToken, setCFToken] = useState<string>('')
  const [cfDomain, setCFDomain] = useState<string>('')
  const [cfTunnelName, setCFTunnelName] = useState<string>('')
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
        setCFTunnelName(data.tunnel_name || '')
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

    const cleanSubdomain = projectSubdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const targetPort = Number(projectPort) || 8000

    try {
      let res: Response
      if (sourceType === 'zip' && zipFile) {
        const formData = new FormData()
        formData.append('file', zipFile)
        formData.append('name', projectName)
        formData.append('subdomain', cleanSubdomain)
        formData.append('port', String(targetPort))
        formData.append('run_command', runCommand)
        res = await fetch('/api/projects', {
          method: 'POST',
          body: formData,
        })
      } else {
        const payload: Record<string, any> = {
          name: projectName,
          subdomain: cleanSubdomain,
          port: targetPort,
          source_type: sourceType,
        }
        if (sourceType === 'git') {
          payload.git_url = gitURL
          payload.run_command = runCommand
        }
        res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const err = await res.json()
        alert(`Gagal membuat route: ${err.error || 'Terjadi kesalahan saat membuat route.'}`)
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
    setSourceType('tunnel')
    setGitURL('')
    setZipFile(null)
    setRunCommand('python main.py')
  }

  const handleDelete = async (p: Project) => {
    if (!confirm(`Hapus route Cloudflare "${p.subdomain}" (localhost:${p.port})?`)) {
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
          tunnel_name: cfTunnelName.trim(),
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
            <div className="brand-subtitle">Cloudflare Tunnel & Project Port Route Manager</div>
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
              {cfStatus?.domain ? `Domain: ${cfStatus.domain}` : 'Atur CF Domain'}
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
            <span>New Route / Project</span>
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
              {cfStatus?.domain || 'Belum diatur (Klik di sini)'}
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
              {cfStatus?.running ? 'Connected' : cfStatus?.active ? 'Connecting' : 'Ready'}
            </div>
          </div>
        </section>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="spin" style={{ marginBottom: '1rem' }} />
          <div>Memuat data route...</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <Layers size={44} style={{ color: 'var(--primary)', opacity: 0.8 }} />
          <h3 className="empty-title">Belum Ada Route Cloudflare Tunnel</h3>
          <p className="empty-desc">
            Buat route pertama Anda untuk menghubungkan port lokal project langsung ke domain Cloudflare.
            Format: <code>localhost:[port] ➔ [subdomain].[domain]</code>.
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
            <span>Buat Route Baru</span>
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
                    Active Route
                  </span>
                </div>

                <div style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  fontSize: '0.88rem',
                  fontFamily: 'ui-monospace, monospace'
                }}>
                  <span style={{ color: '#34d399', fontWeight: 600 }}>localhost:{p.port}</span>
                  <ArrowRight size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                  <span style={{ color: '#60a5fa', fontWeight: 600 }}>{host}</span>
                </div>

                <div className="card-actions">
                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Copy URL Cloudflare"
                      onClick={() => copyToClipboard(fullUrl, p.id)}
                    >
                      {copiedId === p.id ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
                    </button>

                    <a
                      href={fullUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="icon-btn"
                      title={`Buka https://${host}`}
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>

                  <button
                    type="button"
                    className="icon-btn"
                    style={{ color: '#ef4444' }}
                    title="Hapus route"
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
                <h2 className="modal-title">Buat Route Cloudflare Tunnel</h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  Arahkan request dari subdomain Cloudflare langsung ke port localhost project Anda
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
                <label className="form-label">Tipe Service / Project</label>
                <div className="tab-selector">
                  <button
                    type="button"
                    className={`tab-btn ${sourceType === 'tunnel' ? 'active' : ''}`}
                    onClick={() => setSourceType('tunnel')}
                  >
                    <Radio size={14} style={{ display: 'inline', marginRight: '6px' }} />
                    Port Service Lokal
                  </button>
                  <button
                    type="button"
                    className={`tab-btn ${sourceType === 'git' ? 'active' : ''}`}
                    onClick={() => setSourceType('git')}
                  >
                    <FolderGit2 size={14} style={{ display: 'inline', marginRight: '6px' }} />
                    Git Repo
                  </button>
                  <button
                    type="button"
                    className={`tab-btn ${sourceType === 'zip' ? 'active' : ''}`}
                    onClick={() => setSourceType('zip')}
                  >
                    <FileArchive size={14} style={{ display: 'inline', marginRight: '6px' }} />
                    Upload ZIP
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">1. Nama Project</label>
                <input
                  type="text"
                  placeholder="Contoh: my-fastapi-service"
                  value={projectName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <label className="form-label" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                  2. Port apa yang kamu pakai untuk project ini? (Localhost Port)
                </label>
                <input
                  type="number"
                  placeholder="8000"
                  value={projectPort}
                  onChange={(e) => setProjectPort(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  style={{ fontSize: '1.05rem', fontWeight: 600 }}
                  required
                />
                <span className="form-help">
                  Port tempat aplikasi Anda berjalan di localhost (misal: <code>8000</code>, <code>5000</code>, <code>3000</code>, <code>8080</code>).
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">3. Nama Subdomain</label>
                <input
                  type="text"
                  placeholder="Contoh: api"
                  value={projectSubdomain}
                  onChange={(e) => setProjectSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  required
                />
              </div>

              {sourceType === 'git' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Git Repository URL</label>
                    <input
                      type="url"
                      placeholder="https://github.com/username/repo"
                      value={gitURL}
                      onChange={(e) => setGitURL(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Run Command</label>
                    <input
                      type="text"
                      placeholder="python main.py"
                      value={runCommand}
                      onChange={(e) => setRunCommand(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              {sourceType === 'zip' && (
                <>
                  <div className="form-group">
                    <label className="form-label">File ZIP Project</label>
                    <input
                      type="file"
                      accept=".zip"
                      onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Run Command</label>
                    <input
                      type="text"
                      placeholder="python main.py"
                      value={runCommand}
                      onChange={(e) => setRunCommand(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.85rem'
              }}>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                  Cloudflare Tunnel Route yang akan dibuat:
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: '0.9rem'
                }}>
                  <span style={{ color: '#34d399', fontWeight: 600 }}>localhost:{projectPort || 8000}</span>
                  <ArrowRight size={14} style={{ color: 'var(--text-dim)' }} />
                  <span style={{ color: '#60a5fa', fontWeight: 600 }}>{getPublicHost(projectSubdomain || 'subdomain')}</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsNewModalOpen(false)}
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isDeploying}
                >
                  {isDeploying ? 'Membuat Route...' : 'Buat Cloudflare Route'}
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
              <h2 className="modal-title">Pengaturan Cloudflare Tunnel (cf tun)</h2>
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
                  Integrasi Cloudflare Tunnel
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Setiap route project akan langsung diarahkan dari <code>localhost:[port]</code> ke <code>[subdomain].[domain]</code>.
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Cloudflare Root Domain</label>
                <input
                  type="text"
                  placeholder="Contoh: octa.dev atau example.com"
                  value={cfDomain}
                  onChange={(e) => setCFDomain(e.target.value)}
                  required
                />
                <span className="form-help">Domain utama Cloudflare Anda (tanpa <code>http://</code> atau <code>subdomain</code>).</span>
              </div>

              <div className="form-group">
                <label className="form-label">Tunnel Name / ID (Opsional untuk Auto DNS)</label>
                <input
                  type="text"
                  placeholder="Contoh: my-tunnel"
                  value={cfTunnelName}
                  onChange={(e) => setCFTunnelName(e.target.value)}
                />
                <span className="form-help">Jika diisi, PyDaemon akan otomatis menjalankan <code>cloudflared tunnel route dns -f [tunnel] [subdomain.domain]</code> saat membuat route.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Cloudflare Tunnel Token (Opsional)</label>
                <textarea
                  rows={2}
                  placeholder="eyJhIjoi..."
                  value={cfToken}
                  onChange={(e) => setCFToken(e.target.value)}
                />
                <span className="form-help">Token jika Anda ingin menjalankan daemon cloudflared langsung melalui PyDaemon.</span>
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  id="cf-enable-cb"
                  checked={cfActive}
                  onChange={(e) => setCFActive(e.target.checked)}
                />
                <label htmlFor="cf-enable-cb" className="form-label" style={{ cursor: 'pointer', margin: 0 }}>
                  Jalankan cloudflared daemon di background
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsCFModalOpen(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSavingCF}
                >
                  {isSavingCF ? 'Menyimpan...' : 'Simpan Pengaturan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
