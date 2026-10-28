/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Main dashboard application with direct project deployment and Cloudflare Tunnel controls.
 */

import React, { useState, useEffect, useRef } from 'react'
import {
  Server,
  Plus,
  Play,
  Square,
  RotateCw,
  Terminal,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Layers,
  Code2,
  FolderGit2,
  FileArchive,
  X,
  RefreshCw,
  Clock
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

  const [sourceType, setSourceType] = useState<'git' | 'zip'>('git')
  const [gitURL, setGitURL] = useState<string>('')
  const [gitBranch, setGitBranch] = useState<string>('')
  const [zipFile, setZipFile] = useState<File | null>(null)

  const [projectName, setProjectName] = useState<string>('')
  const [projectSubdomain, setProjectSubdomain] = useState<string>('')
  const [projectPythonVersion, setProjectPythonVersion] = useState<string>('3.12')
  const [projectRunCommand, setProjectRunCommand] = useState<string>('python main.py')
  const [projectRequirements, setProjectRequirements] = useState<string>('requirements.txt')
  const [projectEnvVars, setProjectEnvVars] = useState<Array<{ key: string; value: string }>>([])
  const [isDeploying, setIsDeploying] = useState<boolean>(false)

  const [projectLogs, setProjectLogs] = useState<string[]>([])
  const terminalEndRef = useRef<HTMLDivElement>(null)

  const [cfToken, setCFToken] = useState<string>('')
  const [cfDomain, setCFDomain] = useState<string>('')
  const [cfActive, setCFActive] = useState<boolean>(false)
  const [isSavingCF, setIsSavingCF] = useState<boolean>(false)

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
    if (!selectedProject) return

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
        setCFToken(data.token || '')
        setCFDomain(data.domain || '')
        setCFActive(data.active || false)
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

  const handleGitURLChange = (url: string) => {
    setGitURL(url)
    if (!projectName || projectName === 'my-app' || projectName === 'python-app') {
      const trimmed = url.trim().replace(/\/+$/, '')
      const parts = trimmed.split('/')
      const last = parts[parts.length - 1] || ''
      const name = last.replace(/\.git$/i, '')
      if (name) {
        setProjectName(name)
        setProjectSubdomain(name.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
      }
    }
  }

  const handleZipFileChange = (file: File | null) => {
    setZipFile(file)
    if (file && (!projectName || projectName === 'my-app' || projectName === 'python-app')) {
      const name = file.name.replace(/\.zip$/i, '')
      setProjectName(name)
      setProjectSubdomain(name.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
    }
  }

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsDeploying(true)

    const envMap: Record<string, string> = {}
    projectEnvVars.forEach((item) => {
      if (item.key.trim()) {
        envMap[item.key.trim()] = item.value
      }
    })

    try {
      let res: Response
      if (sourceType === 'git') {
        const payload = {
          name: projectName,
          subdomain: projectSubdomain,
          source_type: 'git',
          git_url: gitURL,
          git_branch: gitBranch,
          python_version: projectPythonVersion,
          run_command: projectRunCommand,
          requirements_file: projectRequirements,
          env_vars: envMap,
          auto_restart: true,
        }

        res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        if (!zipFile) {
          alert('Please select a ZIP file.')
          setIsDeploying(false)
          return
        }

        const formData = new FormData()
        formData.append('file', zipFile)
        formData.append('name', projectName)
        formData.append('subdomain', projectSubdomain)
        formData.append('python_version', projectPythonVersion)
        formData.append('run_command', projectRunCommand)
        formData.append('requirements_file', projectRequirements)
        formData.append('env_vars', JSON.stringify(envMap))

        res = await fetch('/api/projects', {
          method: 'POST',
          body: formData,
        })
      }

      if (!res.ok) {
        const err = await res.json()
        alert(`Deployment error: ${err.error || 'Failed to deploy project.'}`)
        setIsDeploying(false)
        return
      }

      const createdProject: Project = await res.json()
      setIsNewModalOpen(false)
      resetNewForm()
      await fetchProjects()
      setSelectedProject(createdProject)
    } catch (err: any) {
      alert(`Network error: ${err.message}`)
    } finally {
      setIsDeploying(false)
    }
  }

  const resetNewForm = () => {
    setGitURL('')
    setGitBranch('')
    setZipFile(null)
    setProjectName('')
    setProjectSubdomain('')
    setProjectRunCommand('python main.py')
    setProjectRequirements('requirements.txt')
    setProjectEnvVars([])
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
    if (!confirm(`Are you sure you want to delete "${p.name}"? This removes source code, virtualenvs, and service configuration.`)) {
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
          token: cfToken,
          domain: cfDomain,
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

  const getPublicURL = (subdomain: string) => {
    if (cfStatus?.domain && cfStatus?.active) {
      return `https://${subdomain}.${cfStatus.domain}`
    }
    return `http://${subdomain}.localhost:8080`
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
            <div className="brand-subtitle">Python Serverless Daemon & Virtualhost Manager</div>
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
              {cfStatus?.running
                ? 'CF Tunnel: Active'
                : cfStatus?.active
                ? 'CF Tunnel: Connecting'
                : 'CF Tunnel: Configure'}
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
            <div className="stat-label">Active Services</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>
              {systemStatus.active_projects} / {systemStatus.total_projects}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">System Daemon</div>
            <div className="stat-value" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Server size={18} />
              {systemStatus.is_systemd ? 'Systemd Service' : 'Process Supervisor'}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">System Uptime</div>
            <div className="stat-value" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={18} />
              {formatUptime(systemStatus.uptime_seconds)}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Python UV Toolchain</div>
            <div className="stat-value" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Code2 size={18} />
              {systemStatus.uv_installed ? 'Astral UV Enabled' : 'UV Missing'}
            </div>
          </div>
        </section>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="spin" style={{ marginBottom: '1rem' }} />
          <div>Loading PyDaemon services...</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <Layers size={44} style={{ color: 'var(--primary)', opacity: 0.8 }} />
          <h3 className="empty-title">No Python Projects Deployed</h3>
          <p className="empty-desc">
            Deploy your Python project directly from a public Git repository or ZIP archive.
            PyDaemon automatically provisions isolated UV virtual environments and daemon services.
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
            <span>Create New Project</span>
          </button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((p) => {
            const publicUrl = getPublicURL(p.subdomain)
            return (
              <div key={p.id} className="project-card">
                <div className="card-top">
                  <div>
                    <h3 className="project-name">{p.name}</h3>
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="subdomain-link"
                    >
                      <span>{publicUrl.replace(/^https?:\/\//, '')}</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  <span className={`status-badge status-${p.status}`}>
                    <span className="pulse-dot" />
                    {p.status}
                  </span>
                </div>

                <div className="card-meta">
                  <span className="meta-pill">Python {p.python_version}</span>
                  <span className="meta-pill">Port :{p.port}</span>
                  {p.pid ? <span className="meta-pill">PID {p.pid}</span> : null}
                  <span className="meta-pill">{p.source_type}</span>
                </div>

                <div className="card-actions">
                  <div className="action-buttons">
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
                      title="View logs"
                      onClick={() => setSelectedProject(p)}
                    >
                      <Terminal size={14} />
                    </button>
                  </div>

                  <button
                    type="button"
                    className="icon-btn"
                    style={{ color: '#ef4444' }}
                    title="Delete project"
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
              <h2 className="modal-title">Deploy Python Application</h2>
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
                <label className="form-label">Deployment Source</label>
                <div className="tab-selector">
                  <button
                    type="button"
                    className={`tab-btn ${sourceType === 'git' ? 'active' : ''}`}
                    onClick={() => setSourceType('git')}
                  >
                    <FolderGit2 size={14} style={{ display: 'inline', marginRight: '6px' }} />
                    Git Repository
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

              {sourceType === 'git' ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Public Git Repository URL</label>
                    <input
                      type="url"
                      placeholder="https://github.com/username/my-python-app"
                      value={gitURL}
                      onChange={(e) => handleGitURLChange(e.target.value)}
                      required
                    />
                    <span className="form-help">PyDaemon will clone this repository directly during deployment.</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Branch (Optional)</label>
                    <input
                      type="text"
                      placeholder="main"
                      value={gitBranch}
                      onChange={(e) => setGitBranch(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <div className="form-group">
                  <label className="form-label">Select ZIP File</label>
                  <input
                    type="file"
                    accept=".zip"
                    onChange={(e) => handleZipFileChange(e.target.files?.[0] || null)}
                    required
                  />
                  <span className="form-help">Upload project archive containing your Python files.</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Project Name</label>
                <input
                  type="text"
                  placeholder="my-app"
                  value={projectName}
                  onChange={(e) => {
                    setProjectName(e.target.value)
                    if (!projectSubdomain || projectSubdomain === projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-')) {
                      setProjectSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                    }
                  }}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Subdomain Name</label>
                <input
                  type="text"
                  placeholder="my-app"
                  value={projectSubdomain}
                  onChange={(e) => setProjectSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  required
                />
                <span className="form-help">
                  Address: {getPublicURL(projectSubdomain || 'my-app')}
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Python Version (Astral UV)</label>
                <select
                  value={projectPythonVersion}
                  onChange={(e) => setProjectPythonVersion(e.target.value)}
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
                  value={projectRunCommand}
                  onChange={(e) => setProjectRunCommand(e.target.value)}
                  required
                />
                <span className="form-help">Command executed to start the service. Use $PORT for port binding (e.g. python main.py or uvicorn main:app --host 0.0.0.0 --port $PORT).</span>
              </div>

              <div className="form-group">
                <label className="form-label">Requirements File</label>
                <input
                  type="text"
                  placeholder="requirements.txt"
                  value={projectRequirements}
                  onChange={(e) => setProjectRequirements(e.target.value)}
                />
                <span className="form-help">Dependencies installed via UV pip. Left as requirements.txt by default.</span>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Environment Variables</label>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setProjectEnvVars([...projectEnvVars, { key: '', value: '' }])}
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                  >
                    + Add Variable
                  </button>
                </div>
                {projectEnvVars.map((item, idx) => (
                  <div key={idx} className="env-row" style={{ marginTop: '0.3rem' }}>
                    <input
                      type="text"
                      placeholder="KEY"
                      value={item.key}
                      onChange={(e) => {
                        const next = [...projectEnvVars]
                        next[idx].key = e.target.value
                        setProjectEnvVars(next)
                      }}
                      style={{ flex: 1 }}
                    />
                    <input
                      type="text"
                      placeholder="VALUE"
                      value={item.value}
                      onChange={(e) => {
                        const next = [...projectEnvVars]
                        next[idx].value = e.target.value
                        setProjectEnvVars(next)
                      }}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => {
                        setProjectEnvVars(projectEnvVars.filter((_, i) => i !== idx))
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1rem' }}>
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
                  {isDeploying ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>Deploying...</span>
                    </>
                  ) : (
                    <span>Deploy Project</span>
                  )}
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
                  Assigned Port: {selectedProject.port} | Python: {selectedProject.python_version} | Status: {selectedProject.status}
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
                  href={getPublicURL(selectedProject.subdomain)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{ marginLeft: 'auto' }}
                >
                  <ExternalLink size={14} />
                  <span>Open URL</span>
                </a>
              </div>

              <div className="terminal-box">
                {projectLogs.length === 0 ? (
                  <div style={{ color: 'var(--text-dim)' }}>Waiting for service logs...</div>
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
              <h2 className="modal-title">Cloudflare Tunnel (cf tun) Proxy Settings</h2>
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
                  Cloudflare Zero Trust Tunnel
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Cloudflare Tunnels expose your local PyDaemon services to the public internet securely without opening firewall ports.
                  Point wildcard hostname <code>*.[yourdomain]</code> to <code>http://localhost:8080</code> in Cloudflare dashboard.
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Cloudflare Tunnel Token</label>
                <textarea
                  rows={3}
                  placeholder="eyJhIjoi..."
                  value={cfToken}
                  onChange={(e) => setCFToken(e.target.value)}
                />
                <span className="form-help">Obtained from Cloudflare Zero Trust &gt; Networks &gt; Tunnels.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Root Domain</label>
                <input
                  type="text"
                  placeholder="example.com"
                  value={cfDomain}
                  onChange={(e) => setCFDomain(e.target.value)}
                />
                <span className="form-help">Projects will be mapped to <code>[subdomain].{cfDomain || 'yourdomain.com'}</code>.</span>
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  id="cf-enable-cb"
                  checked={cfActive}
                  onChange={(e) => setCFActive(e.target.checked)}
                />
                <label htmlFor="cf-enable-cb" className="form-label" style={{ cursor: 'pointer', margin: 0 }}>
                  Enable Cloudflare Tunnel Daemon
                </label>
              </div>

              {cfStatus?.logs && cfStatus.logs.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Tunnel Daemon Status Logs</label>
                  <div className="terminal-box" style={{ height: '140px' }}>
                    {cfStatus.logs.slice(-20).map((l, i) => (
                      <div key={i}>{l}</div>
                    ))}
                  </div>
                </div>
              )}

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
                  {isSavingCF ? 'Saving...' : 'Save & Connect Tunnel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
