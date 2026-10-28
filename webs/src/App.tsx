/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Full Python hosting dashboard with automated Cloudflare Zero Trust Tunnel API integration.
 */

import React, { useState, useEffect, useRef } from 'react'
import {
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
  FolderGit2,
  FileArchive,
  Terminal,
  Play,
  Square,
  RotateCw,
  Radio
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
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  const [projectName, setProjectName] = useState<string>('')
  const [projectSubdomain, setProjectSubdomain] = useState<string>('')
  const [projectPort, setProjectPort] = useState<number | ''>(8000)
  const [sourceType, setSourceType] = useState<'git' | 'zip' | 'tunnel'>('git')
  const [gitURL, setGitURL] = useState<string>('')
  const [gitBranch, setGitBranch] = useState<string>('')
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [pythonVersion, setPythonVersion] = useState<string>('3.12')
  const [runCommand, setRunCommand] = useState<string>('python main.py')
  const [requirementsFile, setRequirementsFile] = useState<string>('requirements.txt')
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([])
  const [isDeploying, setIsDeploying] = useState<boolean>(false)

  const [projectLogs, setProjectLogs] = useState<string[]>([])
  const terminalEndRef = useRef<HTMLDivElement>(null)

  const [cfApiToken, setCfApiToken] = useState<string>('')
  const [cfAccountId, setCfAccountId] = useState<string>('')
  const [cfTunnelId, setCfTunnelId] = useState<string>('')
  const [cfDomain, setCfDomain] = useState<string>('')
  const [cfToken, setCfToken] = useState<string>('')
  const [cfActive, setCfActive] = useState<boolean>(false)
  const [isSavingCF, setIsSavingCF] = useState<boolean>(false)

  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    fetchInitialData()
    const interval = setInterval(fetchProjects, 4000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [projectLogs])

  useEffect(() => {
    if (!selectedProject || selectedProject.source_type === 'tunnel') return

    fetchLogs(selectedProject.id)
    const eventSource = new EventSource(`/api/projects/${selectedProject.id}/logs/stream`)

    eventSource.onmessage = (e) => {
      setProjectLogs((prev) => [...prev, e.data])
    }

    eventSource.onerror = () => {
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [selectedProject?.id])

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
        setCfApiToken(data.api_token || '')
        setCfAccountId(data.account_id || '')
        setCfTunnelId(data.tunnel_id || '')
        setCfDomain(data.domain || '')
        setCfToken(data.token || '')
        setCfActive(data.active || false)
      }
    } catch {
    }
  }

  const fetchLogs = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}/logs`)
      if (res.ok) {
        const data = await res.json()
        setProjectLogs(data.logs || [])
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

    const envMap: Record<string, string> = {}
    envVars.forEach((item) => {
      if (item.key.trim()) {
        envMap[item.key.trim()] = item.value
      }
    })

    try {
      let res: Response
      if (sourceType === 'zip' && zipFile) {
        const formData = new FormData()
        formData.append('file', zipFile)
        formData.append('name', projectName)
        formData.append('subdomain', cleanSubdomain)
        formData.append('port', String(targetPort))
        formData.append('python_version', pythonVersion)
        formData.append('run_command', runCommand)
        formData.append('requirements_file', requirementsFile)
        formData.append('env_vars', JSON.stringify(envMap))
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
          python_version: pythonVersion,
          requirements_file: requirementsFile,
          env_vars: envMap,
        }
        if (sourceType === 'git') {
          payload.git_url = gitURL
          payload.git_branch = gitBranch
          payload.run_command = runCommand
        } else if (sourceType === 'tunnel') {
          payload.run_command = ''
        }
        res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const err = await res.json()
        alert(`Gagal membuat project / route: ${err.error || 'Terjadi kesalahan'}`)
        setIsDeploying(false)
        return
      }

      const created: Project = await res.json()
      setIsNewModalOpen(false)
      resetNewForm()
      await fetchProjects()

      if (sourceType !== 'tunnel') {
        setSelectedProject(created)
      }
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
    setSourceType('git')
    setGitURL('')
    setGitBranch('')
    setZipFile(null)
    setPythonVersion('3.12')
    setRunCommand('python main.py')
    setRequirementsFile('requirements.txt')
    setEnvVars([])
  }

  const handleStart = async (p: Project) => {
    await fetch(`/api/projects/${p.id}/start`, { method: 'POST' })
    await fetchProjects()
  }

  const handleStop = async (p: Project) => {
    await fetch(`/api/projects/${p.id}/stop`, { method: 'POST' })
    await fetchProjects()
  }

  const handleRestart = async (p: Project) => {
    await fetch(`/api/projects/${p.id}/restart`, { method: 'POST' })
    await fetchProjects()
  }

  const handleRebuild = async (p: Project) => {
    await fetch(`/api/projects/${p.id}/rebuild`, { method: 'POST' })
    await fetchProjects()
  }

  const handleDelete = async (p: Project) => {
    if (!confirm(`Hapus project dan Cloudflare route "${p.subdomain}"?`)) {
      return
    }
    await fetch(`/api/projects/${p.id}`, { method: 'DELETE' })
    if (selectedProject?.id === p.id) {
      setSelectedProject(null)
    }
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
          api_token: cfApiToken.trim(),
          account_id: cfAccountId.trim(),
          tunnel_id: cfTunnelId.trim(),
          domain: cfDomain.trim(),
          token: cfToken.trim(),
          active: cfActive,
        }),
      })

      if (res.ok) {
        await fetchCFTunnel()
        setIsCFModalOpen(false)
      } else {
        const err = await res.json()
        alert(`Pengaturan Cloudflare gagal: ${err.error}`)
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
            <div className="brand-subtitle">Python Hosting Manager with Cloudflare Zero Trust Tunnel API</div>
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
              {cfStatus?.domain ? `CF: ${cfStatus.domain}` : 'Pengaturan Cloudflare API'}
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
            <span>New Project / Route</span>
          </button>
        </div>
      </header>

      {systemStatus && (
        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Projects & Routes</div>
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
            <div className="stat-label">Cloudflare API Status</div>
            <div className="stat-value" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: cfStatus?.api_token ? 'var(--success)' : 'var(--warning)' }}>
              <ShieldCheck size={18} />
              {cfStatus?.api_token ? 'API Connected' : 'Manual / CLI'}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Daemon Uptime</div>
            <div className="stat-value" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={18} />
              {formatUptime(systemStatus.uptime_seconds)}
            </div>
          </div>
        </section>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="spin" style={{ marginBottom: '1rem' }} />
          <div>Memuat data PyDaemon...</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <Layers size={44} style={{ color: 'var(--primary)', opacity: 0.8 }} />
          <h3 className="empty-title">Belum Ada Project Python atau Route</h3>
          <p className="empty-desc">
            Deploy project Python Anda (Git/ZIP/Port) dan hubungkan langsung ke domain Cloudflare secara otomatis melalui Cloudflare Zero Trust API.
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
            <span>Deploy Project Baru</span>
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
                  <span className={`status-badge status-${p.status}`}>
                    <span className="pulse-dot" />
                    {p.status}
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

                <div className="card-meta">
                  <span className="meta-pill">Port :{p.port}</span>
                  {p.python_version ? <span className="meta-pill">Python {p.python_version}</span> : null}
                  {p.pid ? <span className="meta-pill">PID {p.pid}</span> : null}
                  <span className="meta-pill">{p.source_type}</span>
                </div>

                <div className="card-actions">
                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                    {p.source_type !== 'tunnel' && (
                      <>
                        {p.status === 'running' ? (
                          <button
                            type="button"
                            className="icon-btn"
                            title="Stop service"
                            onClick={() => handleStop(p)}
                          >
                            <Square size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="icon-btn"
                            title="Start service"
                            onClick={() => handleStart(p)}
                          >
                            <Play size={14} />
                          </button>
                        )}

                        <button
                          type="button"
                          className="icon-btn"
                          title="Restart service"
                          onClick={() => handleRestart(p)}
                        >
                          <RotateCw size={14} />
                        </button>

                        <button
                          type="button"
                          className="icon-btn"
                          title="Lihat Logs"
                          onClick={() => setSelectedProject(p)}
                        >
                          <Terminal size={14} />
                        </button>
                      </>
                    )}

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
                    title="Hapus project"
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
                <h2 className="modal-title">Deploy Project Python & Cloudflare Route</h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  Arahkan request dari domain Cloudflare langsung ke localhost:[port]
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
                <label className="form-label">Tipe Sumber Project</label>
                <div className="tab-selector">
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
                  <button
                    type="button"
                    className={`tab-btn ${sourceType === 'tunnel' ? 'active' : ''}`}
                    onClick={() => setSourceType('tunnel')}
                  >
                    <Radio size={14} style={{ display: 'inline', marginRight: '6px' }} />
                    Port Service Saja
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Nama Project</label>
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
                  Port apa yang kamu pakai untuk project ini? (Localhost Port)
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
                  Port tempat aplikasi Python Anda berjalan (misal: <code>8000</code>, <code>5000</code>, <code>3000</code>).
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Nama Subdomain</label>
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
                      placeholder="https://github.com/username/my-python-app"
                      value={gitURL}
                      onChange={(e) => setGitURL(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Branch (Opsional)</label>
                    <input
                      type="text"
                      placeholder="main"
                      value={gitBranch}
                      onChange={(e) => setGitBranch(e.target.value)}
                    />
                  </div>
                </>
              )}

              {sourceType === 'zip' && (
                <div className="form-group">
                  <label className="form-label">Pilih File ZIP</label>
                  <input
                    type="file"
                    accept=".zip"
                    onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                    required
                  />
                </div>
              )}

              {sourceType !== 'tunnel' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Versi Python (UV Toolchain)</label>
                    <select
                      value={pythonVersion}
                      onChange={(e) => setPythonVersion(e.target.value)}
                    >
                      {systemStatus?.versions && systemStatus.versions.length > 0 ? (
                        systemStatus.versions.map((v) => (
                          <option key={v.raw_name} value={v.version}>
                            Python {v.version} {v.is_installed ? '(Installed)' : '(UV Auto-download)'}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="3.14">Python 3.14</option>
                          <option value="3.13">Python 3.13</option>
                          <option value="3.12">Python 3.12</option>
                          <option value="3.11">Python 3.11</option>
                          <option value="3.10">Python 3.10</option>
                        </>
                      )}
                    </select>
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
                    <span className="form-help">Command untuk menjalankan script. Gunakan $PORT jika dinamis.</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Requirements File</label>
                    <input
                      type="text"
                      placeholder="requirements.txt"
                      value={requirementsFile}
                      onChange={(e) => setRequirementsFile(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label">Environment Variables</label>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setEnvVars([...envVars, { key: '', value: '' }])}
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      >
                        + Tambah Variable
                      </button>
                    </div>
                    {envVars.map((item, idx) => (
                      <div key={idx} className="env-row" style={{ marginTop: '0.3rem' }}>
                        <input
                          type="text"
                          placeholder="KEY"
                          value={item.key}
                          onChange={(e) => {
                            const next = [...envVars]
                            next[idx].key = e.target.value
                            setEnvVars(next)
                          }}
                          style={{ flex: 1 }}
                        />
                        <input
                          type="text"
                          placeholder="VALUE"
                          value={item.value}
                          onChange={(e) => {
                            const next = [...envVars]
                            next[idx].value = e.target.value
                            setEnvVars(next)
                          }}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => {
                            setEnvVars(envVars.filter((_, i) => i !== idx))
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
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
                  Cloudflare Tunnel Route yang akan dibuat otomatis via API:
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
                  {isDeploying ? 'Deploying & Creating Route...' : 'Deploy & Buat CF Route'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedProject && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">{selectedProject.name} — Live Logs & Status</h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                  Port: {selectedProject.port} | Subdomain: {selectedProject.subdomain} | Status: {selectedProject.status}
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSelectedProject(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.5rem' }}>
                {selectedProject.status === 'running' ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleStop(selectedProject)}
                  >
                    <Square size={14} />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleStart(selectedProject)}
                  >
                    <Play size={14} />
                    <span>Start</span>
                  </button>
                )}

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleRestart(selectedProject)}
                >
                  <RotateCw size={14} />
                  <span>Restart</span>
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleRebuild(selectedProject)}
                >
                  <RefreshCw size={14} />
                  <span>Rebuild Dependencies</span>
                </button>

                <a
                  href={`https://${getPublicHost(selectedProject.subdomain)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{ marginLeft: 'auto' }}
                >
                  <ExternalLink size={14} />
                  <span>Buka URL</span>
                </a>
              </div>

              <div className="terminal-box">
                {projectLogs.length === 0 ? (
                  <div style={{ color: 'var(--text-dim)' }}>Menunggu output log...</div>
                ) : (
                  projectLogs.map((line, idx) => <div key={idx}>{line}</div>)
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          </div>
        </div>
      )}

      {isCFModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Pengaturan Cloudflare Zero Trust API</h2>
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
                  Cloudflare Zero Trust Automated Routing API
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Masukkan kredensial Cloudflare API agar setiap project yang dibuat otomatis mendaftarkan public hostname & CNAME DNS record di Cloudflare.
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Cloudflare Root Domain</label>
                <input
                  type="text"
                  placeholder="Contoh: octa.dev atau example.com"
                  value={cfDomain}
                  onChange={(e) => setCfDomain(e.target.value)}
                  required
                />
                <span className="form-help">Domain yang terdaftar di akun Cloudflare Anda.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Cloudflare API Token (Bearer Token)</label>
                <input
                  type="password"
                  placeholder="Bearer token dengan izin Cloudflare Tunnel & DNS Edit"
                  value={cfApiToken}
                  onChange={(e) => setCfApiToken(e.target.value)}
                />
                <span className="form-help">Dibuat di Cloudflare Dashboard &gt; My Profile &gt; API Tokens.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Cloudflare Account ID</label>
                <input
                  type="text"
                  placeholder="Account ID dari dashboard Cloudflare"
                  value={cfAccountId}
                  onChange={(e) => setCfAccountId(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Cloudflare Tunnel ID (UUID)</label>
                <input
                  type="text"
                  placeholder="Contoh: c1744f8b-faa1-48a4-9e5c-02ac921467fa"
                  value={cfTunnelId}
                  onChange={(e) => setCfTunnelId(e.target.value)}
                />
                <span className="form-help">ID Tunnel dari Zero Trust &gt; Networks &gt; Tunnels.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Tunnel Token (Opsional untuk Daemon Lokal)</label>
                <textarea
                  rows={2}
                  placeholder="eyJhIjoi..."
                  value={cfToken}
                  onChange={(e) => setCfToken(e.target.value)}
                />
                <span className="form-help">Jika ingin menjalankan daemon cloudflared di background server ini.</span>
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  id="cf-enable-cb"
                  checked={cfActive}
                  onChange={(e) => setCfActive(e.target.checked)}
                />
                <label htmlFor="cf-enable-cb" className="form-label" style={{ cursor: 'pointer', margin: 0 }}>
                  Aktifkan daemon cloudflared lokal
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
                  {isSavingCF ? 'Menyimpan...' : 'Simpan Pengaturan Cloudflare'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
