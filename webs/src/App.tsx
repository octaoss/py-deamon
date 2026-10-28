/*
 * Copyright (c) 2026 Yohanes Oktanio. All Rights Reserved.
 *
 * Minimal Vercel-inspired SaaS dashboard for PyDaemon with project editing, git pull, and ZIP updating.
 */

import React, { useState, useEffect, useRef } from 'react'
import {
  Plus,
  Trash2,
  ExternalLink,
  X,
  RefreshCw,
  Copy,
  Check,
  FolderGit2,
  FileArchive,
  Terminal,
  Play,
  Square,
  RotateCw,
  Radio,
  Download,
  Upload,
  Settings,
  Lock,
  LogOut
} from 'lucide-react'
import type {
  Project,
  SystemStatus,
  CFTunnelStatus,
  AuthStatusResponse
} from './types'

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [cfStatus, setCFStatus] = useState<CFTunnelStatus | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false)
  const [isCFModalOpen, setIsCFModalOpen] = useState<boolean>(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [updatingZipProject, setUpdatingZipProject] = useState<Project | null>(null)

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

  const [editName, setEditName] = useState<string>('')
  const [editSubdomain, setEditSubdomain] = useState<string>('')
  const [editPort, setEditPort] = useState<number | ''>(8000)
  const [editRunCommand, setEditRunCommand] = useState<string>('')
  const [editRequirements, setEditRequirements] = useState<string>('')
  const [editEnvVars, setEditEnvVars] = useState<Array<{ key: string; value: string }>>([])
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false)

  const [newZipUploadFile, setNewZipUploadFile] = useState<File | null>(null)
  const [isUploadingZip, setIsUploadingZip] = useState<boolean>(false)

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
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const [authRequired, setAuthRequired] = useState<boolean>(false)
  const [authenticated, setAuthenticated] = useState<boolean>(true)
  const [authChecking, setAuthChecking] = useState<boolean>(true)
  const [passwordInput, setPasswordInput] = useState<string>('')
  const [loginError, setLoginError] = useState<string>('')
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false)

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('pyd_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const authFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const existingHeaders = (init.headers as Record<string, string>) || {}
    const headers = {
      ...getAuthHeaders(),
      ...existingHeaders
    }
    const res = await fetch(input, { ...init, headers })
    if (res.status === 401) {
      localStorage.removeItem('pyd_token')
      setAuthenticated(false)
    }
    return res
  }

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status', {
        headers: getAuthHeaders()
      })
      if (res.ok) {
        const data: AuthStatusResponse = await res.json()
        setAuthRequired(data.auth_required)
        setAuthenticated(data.authenticated)
        return !data.auth_required || data.authenticated
      }
    } catch {
    } finally {
      setAuthChecking(false)
    }
    return false
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setIsLoggingIn(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput })
      })
      if (res.ok) {
        const data = await res.json()
        localStorage.setItem('pyd_token', data.token)
        setAuthenticated(true)
        setPasswordInput('')
        fetchInitialData()
      } else {
        setLoginError('Invalid password. Please try again.')
      }
    } catch {
      setLoginError('Failed to communicate with PyDaemon backend.')
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders()
      })
    } catch {
    }
    localStorage.removeItem('pyd_token')
    setAuthenticated(false)
  }

  useEffect(() => {
    const init = async () => {
      const isAuthed = await checkAuthStatus()
      if (isAuthed) {
        fetchInitialData()
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (!authRequired || authenticated) {
      const interval = setInterval(fetchProjects, 4000)
      return () => clearInterval(interval)
    }
  }, [authRequired, authenticated])

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [projectLogs])

  useEffect(() => {
    if (!selectedProject || selectedProject.source_type === 'tunnel') return

    fetchLogs(selectedProject.id)
    const token = localStorage.getItem('pyd_token')
    const sseUrl = token
      ? `/api/projects/${selectedProject.id}/logs/stream?token=${encodeURIComponent(token)}`
      : `/api/projects/${selectedProject.id}/logs/stream`
    const eventSource = new EventSource(sseUrl)

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
      const res = await authFetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        setProjects(data)
      }
    } catch {
    }
  }

  const fetchSystemStatus = async () => {
    try {
      const res = await authFetch('/api/system/status')
      if (res.ok) {
        const data = await res.json()
        setSystemStatus(data)
      }
    } catch {
    }
  }

  const fetchCFTunnel = async () => {
    try {
      const res = await authFetch('/api/cftunnel')
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
      const res = await authFetch(`/api/projects/${id}/logs`)
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
        res = await authFetch('/api/projects', {
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
        res = await authFetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const err = await res.json()
        alert(`Failed to create project: ${err.error || 'Unknown error'}`)
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

  const openEditModal = (p: Project) => {
    setEditingProject(p)
    setEditName(p.name)
    setEditSubdomain(p.subdomain)
    setEditPort(p.port)
    setEditRunCommand(p.run_command || '')
    setEditRequirements(p.requirements_file || '')

    const envArr: Array<{ key: string; value: string }> = []
    if (p.env_vars) {
      Object.entries(p.env_vars).forEach(([k, v]) => {
        envArr.push({ key: k, value: v })
      })
    }
    setEditEnvVars(envArr)
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProject) return
    setIsSavingEdit(true)

    const envMap: Record<string, string> = {}
    editEnvVars.forEach((item) => {
      if (item.key.trim()) {
        envMap[item.key.trim()] = item.value
      }
    })

    const payload = {
      name: editName,
      subdomain: editSubdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      port: Number(editPort) || editingProject.port,
      run_command: editRunCommand,
      requirements_file: editRequirements,
      env_vars: envMap,
      auto_restart: true,
    }

    try {
      const res = await authFetch(`/api/projects/${editingProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setEditingProject(null)
        await fetchProjects()
      } else {
        const err = await res.json()
        alert(`Update error: ${err.error}`)
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`)
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handlePullGit = async (p: Project) => {
    setActionLoadingId(p.id)
    try {
      const res = await authFetch(`/api/projects/${p.id}/pull`, { method: 'POST' })
      if (res.ok) {
        await fetchProjects()
        setSelectedProject(p)
      } else {
        const err = await res.json()
        alert(`Git pull error: ${err.error}`)
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`)
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleUploadNewZip = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!updatingZipProject || !newZipUploadFile) return
    setIsUploadingZip(true)

    const formData = new FormData()
    formData.append('file', newZipUploadFile)

    try {
      const res = await authFetch(`/api/projects/${updatingZipProject.id}/update-zip`, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        const p = updatingZipProject
        setUpdatingZipProject(null)
        setNewZipUploadFile(null)
        await fetchProjects()
        setSelectedProject(p)
      } else {
        const err = await res.json()
        alert(`Upload error: ${err.error}`)
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`)
    } finally {
      setIsUploadingZip(false)
    }
  }

  const handleStart = async (p: Project) => {
    await authFetch(`/api/projects/${p.id}/start`, { method: 'POST' })
    await fetchProjects()
  }

  const handleStop = async (p: Project) => {
    await authFetch(`/api/projects/${p.id}/stop`, { method: 'POST' })
    await fetchProjects()
  }

  const handleRestart = async (p: Project) => {
    await authFetch(`/api/projects/${p.id}/restart`, { method: 'POST' })
    await fetchProjects()
  }

  const handleDelete = async (p: Project) => {
    if (!confirm(`Are you sure you want to delete project "${p.name}"?`)) {
      return
    }
    await authFetch(`/api/projects/${p.id}`, { method: 'DELETE' })
    if (selectedProject?.id === p.id) {
      setSelectedProject(null)
    }
    await fetchProjects()
  }

  const handleSaveCF = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingCF(true)

    try {
      const res = await authFetch('/api/cftunnel', {
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

  if (authChecking) {
    return (
      <div className="login-wrapper">
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading PyDaemon...</div>
      </div>
    )
  }

  if (authRequired && !authenticated) {
    return (
      <div className="login-wrapper">
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon-box">
              <Lock size={20} />
            </div>
            <h1 className="login-title">PyDaemon</h1>
            <p className="login-subtitle">Enter dashboard password to continue</p>
          </div>

          {loginError && <div className="login-error">{loginError}</div>}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <input
                type="password"
                placeholder="Enter password..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoFocus
                required
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={isLoggingIn}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {isLoggingIn ? 'Unlocking...' : 'Unlock Dashboard'}
            </button>
          </form>
        </div>
        <footer className="footer-copyright" style={{ borderTop: 'none', marginTop: '2rem' }}>
          <p>Copyright &copy; 2026 Yohanes Oktanio. All Rights Reserved.</p>
        </footer>
      </div>
    )
  }

  return (
    <div className="app-root">
      <div className="container">
        <header className="header">
          <div className="brand">
            <div className="logo-badge">▲</div>
            <span className="brand-title">PyDaemon</span>
            <span className="brand-badge">Python Hosting</span>
          </div>

          <div className="header-actions">
            {authRequired && (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleLogout}
                title="Lock Dashboard"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <LogOut size={14} />
                <span>Lock</span>
              </button>
            )}

            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsCFModalOpen(true)}
            >
              <span className={`dot ${cfStatus?.domain ? 'dot-green' : 'dot-amber'}`} />
              <span>
                {cfStatus?.domain ? cfStatus.domain : 'Cloudflare API Setup'}
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
              <Plus size={14} />
              <span>New Project</span>
            </button>
          </div>
        </header>

      {systemStatus && (
        <section className="overview-bar">
          <div className="overview-col">
            <div className="overview-label">Projects & Routes</div>
            <div className="overview-val">{projects.length}</div>
          </div>

          <div className="overview-col">
            <div className="overview-label">Root Domain</div>
            <div
              className="overview-val"
              style={{ fontSize: '1.05rem', cursor: 'pointer' }}
              onClick={() => setIsCFModalOpen(true)}
            >
              {cfStatus?.domain || 'Not configured'}
            </div>
          </div>

          <div className="overview-col">
            <div className="overview-label">Cloudflare API</div>
            <div className="overview-val" style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span className={`dot ${cfStatus?.api_token ? 'dot-green' : 'dot-amber'}`} />
              <span style={{ fontSize: '0.95rem' }}>
                {cfStatus?.api_token ? 'Connected' : 'Manual / CLI'}
              </span>
            </div>
          </div>

          <div className="overview-col">
            <div className="overview-label">Daemon Uptime</div>
            <div className="overview-val" style={{ fontSize: '1.05rem' }}>
              {formatUptime(systemStatus.uptime_seconds)}
            </div>
          </div>
        </section>
      )}

      <div className="projects-section-header">
        <h2 className="section-title">Projects & Deployments</h2>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-secondary)' }}>
          <RefreshCw size={20} className="spin" style={{ marginBottom: '0.75rem' }} />
          <div style={{ fontSize: '0.85rem' }}>Loading projects...</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <div style={{ width: 40, height: 40, margin: '0 auto', background: 'var(--bg-subtle)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
            ▲
          </div>
          <h3 className="empty-title">No Projects Deployed</h3>
          <p className="empty-desc">
            Deploy your first Python application from a Git repository or ZIP package,
            or expose a local port through Cloudflare Zero Trust.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              resetNewForm()
              setIsNewModalOpen(true)
            }}
          >
            <Plus size={14} />
            <span>Create your first project</span>
          </button>
        </div>
      ) : (
        <div className="project-list">
          {projects.map((p) => {
            const host = getPublicHost(p.subdomain)
            const fullUrl = `https://${host}`

            let dotClass = 'dot-green'
            if (p.status === 'building') dotClass = 'dot-amber'
            else if (p.status === 'stopped') dotClass = 'dot-gray'
            else if (p.status === 'failed') dotClass = 'dot-red'

            return (
              <div key={p.id} className="project-row">
                <div className="project-left">
                  <div className="project-heading">
                    <span className={`dot ${dotClass}`} />
                    <span className="project-title">{p.name}</span>
                    <span className="pill" style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                      {p.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <a
                      href={fullUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="route-link"
                    >
                      <span>{host}</span>
                      <ExternalLink size={12} style={{ opacity: 0.7 }} />
                    </a>
                    <span className="route-arrow">➔</span>
                    <span className="local-port">localhost:{p.port}</span>
                  </div>

                  <div className="project-pills">
                    {p.python_version ? <span className="pill">Python {p.python_version}</span> : null}
                    {p.pid ? <span className="pill">PID {p.pid}</span> : null}
                    <span className="pill">{p.source_type}</span>
                    {p.run_command ? <span className="pill">{p.run_command}</span> : null}
                  </div>
                </div>

                <div className="project-actions">
                  {p.source_type === 'git' && (
                    <button
                      type="button"
                      className="action-btn"
                      title="Pull latest code from Git"
                      disabled={actionLoadingId === p.id}
                      onClick={() => handlePullGit(p)}
                    >
                      <Download size={14} className={actionLoadingId === p.id ? 'spin' : ''} />
                    </button>
                  )}

                  {p.source_type === 'zip' && (
                    <button
                      type="button"
                      className="action-btn"
                      title="Upload updated ZIP file"
                      onClick={() => setUpdatingZipProject(p)}
                    >
                      <Upload size={14} />
                    </button>
                  )}

                  <button
                    type="button"
                    className="action-btn"
                    title="Edit project settings"
                    onClick={() => openEditModal(p)}
                  >
                    <Settings size={14} />
                  </button>

                  {p.source_type !== 'tunnel' && (
                    <>
                      {p.status === 'running' ? (
                        <button
                          type="button"
                          className="action-btn"
                          title="Stop process"
                          onClick={() => handleStop(p)}
                        >
                          <Square size={13} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="action-btn"
                          title="Start process"
                          onClick={() => handleStart(p)}
                        >
                          <Play size={13} />
                        </button>
                      )}

                      <button
                        type="button"
                        className="action-btn"
                        title="Restart service"
                        onClick={() => handleRestart(p)}
                      >
                        <RotateCw size={13} />
                      </button>

                      <button
                        type="button"
                        className="action-btn"
                        title="View streaming terminal logs"
                        onClick={() => setSelectedProject(p)}
                      >
                        <Terminal size={13} />
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    className="action-btn"
                    title="Copy public URL"
                    onClick={() => copyToClipboard(fullUrl, p.id)}
                  >
                    {copiedId === p.id ? <Check size={13} style={{ color: 'var(--status-green)' }} /> : <Copy size={13} />}
                  </button>

                  <button
                    type="button"
                    className="action-btn danger"
                    title="Delete project"
                    onClick={() => handleDelete(p)}
                  >
                    <Trash2 size={13} />
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
              <h2 className="modal-title">Deploy New Project</h2>
              <button
                type="button"
                className="action-btn"
                onClick={() => setIsNewModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleDeploy} className="modal-body">
              <div className="form-group">
                <label className="form-label">Deployment Type</label>
                <div className="tab-selector">
                  <button
                    type="button"
                    className={`tab-btn ${sourceType === 'git' ? 'active' : ''}`}
                    onClick={() => setSourceType('git')}
                  >
                    <FolderGit2 size={13} style={{ display: 'inline', marginRight: 5 }} />
                    Git Repository
                  </button>
                  <button
                    type="button"
                    className={`tab-btn ${sourceType === 'zip' ? 'active' : ''}`}
                    onClick={() => setSourceType('zip')}
                  >
                    <FileArchive size={13} style={{ display: 'inline', marginRight: 5 }} />
                    Upload ZIP
                  </button>
                  <button
                    type="button"
                    className={`tab-btn ${sourceType === 'tunnel' ? 'active' : ''}`}
                    onClick={() => setSourceType('tunnel')}
                  >
                    <Radio size={13} style={{ display: 'inline', marginRight: 5 }} />
                    Port Forward Only
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Project Name</label>
                <input
                  type="text"
                  placeholder="ali-audio"
                  value={projectName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Localhost Port (Target Port)</label>
                <input
                  type="number"
                  placeholder="8000"
                  value={projectPort}
                  onChange={(e) => setProjectPort(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  required
                />
                <span className="form-help">Port where your application listens on localhost.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Subdomain Name</label>
                <input
                  type="text"
                  placeholder="aliaudio"
                  value={projectSubdomain}
                  onChange={(e) => setProjectSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  required
                />
                <span className="form-help">
                  Route: <code>localhost:{projectPort || 8000} ➔ {getPublicHost(projectSubdomain || 'subdomain')}</code>
                </span>
              </div>

              {sourceType === 'git' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Git Repository URL</label>
                    <input
                      type="url"
                      placeholder="https://github.com/username/project"
                      value={gitURL}
                      onChange={(e) => setGitURL(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Git Branch (Optional)</label>
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
                  <label className="form-label">Select Project ZIP</label>
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
                    <label className="form-label">Python Version (UV Toolchain)</label>
                    <select
                      value={pythonVersion}
                      onChange={(e) => setPythonVersion(e.target.value)}
                    >
                      {systemStatus?.versions && systemStatus.versions.length > 0 ? (
                        systemStatus.versions.map((v) => (
                          <option key={v.raw_name} value={v.version}>
                            Python {v.version} {v.is_installed ? '(Installed)' : '(Downloadable)'}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="3.14">Python 3.14</option>
                          <option value="3.13">Python 3.13</option>
                          <option value="3.12">Python 3.12</option>
                          <option value="3.11">Python 3.11</option>
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
                        className="btn-secondary"
                        onClick={() => setEnvVars([...envVars, { key: '', value: '' }])}
                        style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                      >
                        + Add Variable
                      </button>
                    </div>
                    {envVars.map((item, idx) => (
                      <div key={idx} className="env-row">
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
                          className="action-btn"
                          onClick={() => setEnvVars(envVars.filter((_, i) => i !== idx))}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
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
                  {isDeploying ? 'Deploying...' : 'Deploy Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingProject && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Edit Project: {editingProject.name}</h2>
              <button
                type="button"
                className="action-btn"
                onClick={() => setEditingProject(null)}
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="modal-body">
              <div className="form-group">
                <label className="form-label">Project Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Subdomain Name</label>
                <input
                  type="text"
                  value={editSubdomain}
                  onChange={(e) => setEditSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  required
                />
                <span className="form-help">
                  Updating subdomain will automatically update the Cloudflare route.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Localhost Port</label>
                <input
                  type="number"
                  value={editPort}
                  onChange={(e) => setEditPort(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  required
                />
              </div>

              {editingProject.source_type !== 'tunnel' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Run Command</label>
                    <input
                      type="text"
                      value={editRunCommand}
                      onChange={(e) => setEditRunCommand(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Requirements File</label>
                    <input
                      type="text"
                      value={editRequirements}
                      onChange={(e) => setEditRequirements(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label">Environment Variables</label>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setEditEnvVars([...editEnvVars, { key: '', value: '' }])}
                        style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                      >
                        + Add Variable
                      </button>
                    </div>
                    {editEnvVars.map((item, idx) => (
                      <div key={idx} className="env-row">
                        <input
                          type="text"
                          placeholder="KEY"
                          value={item.key}
                          onChange={(e) => {
                            const next = [...editEnvVars]
                            next[idx].key = e.target.value
                            setEditEnvVars(next)
                          }}
                          style={{ flex: 1 }}
                        />
                        <input
                          type="text"
                          placeholder="VALUE"
                          value={item.value}
                          onChange={(e) => {
                            const next = [...editEnvVars]
                            next[idx].value = e.target.value
                            setEditEnvVars(next)
                          }}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="action-btn"
                          onClick={() => setEditEnvVars(editEnvVars.filter((_, i) => i !== idx))}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingProject(null)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSavingEdit}
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {updatingZipProject && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Upload Updated ZIP Package: {updatingZipProject.name}</h2>
              <button
                type="button"
                className="action-btn"
                onClick={() => {
                  setUpdatingZipProject(null)
                  setNewZipUploadFile(null)
                }}
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleUploadNewZip} className="modal-body">
              <div className="form-group">
                <label className="form-label">Select New ZIP Archive</label>
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => setNewZipUploadFile(e.target.files?.[0] || null)}
                  required
                />
                <span className="form-help">
                  Files will be extracted into the project source directory, dependencies updated, and service restarted.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setUpdatingZipProject(null)
                    setNewZipUploadFile(null)
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isUploadingZip || !newZipUploadFile}
                >
                  {isUploadingZip ? 'Extracting & Restarting...' : 'Upload & Deploy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedProject && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '780px' }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">{selectedProject.name} — Logs & Terminal</h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  localhost:{selectedProject.port} ➔ {getPublicHost(selectedProject.subdomain)}
                </div>
              </div>
              <button
                type="button"
                className="action-btn"
                onClick={() => setSelectedProject(null)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                {selectedProject.status === 'running' ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleStop(selectedProject)}
                  >
                    <Square size={13} />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleStart(selectedProject)}
                  >
                    <Play size={13} />
                    <span>Start</span>
                  </button>
                )}

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleRestart(selectedProject)}
                >
                  <RotateCw size={13} />
                  <span>Restart</span>
                </button>

                {selectedProject.source_type === 'git' && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handlePullGit(selectedProject)}
                  >
                    <Download size={13} />
                    <span>Git Pull</span>
                  </button>
                )}

                <a
                  href={`https://${getPublicHost(selectedProject.subdomain)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{ marginLeft: 'auto' }}
                >
                  <ExternalLink size={13} />
                  <span>Open URL</span>
                </a>
              </div>

              <div className="terminal-box">
                {projectLogs.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>Waiting for terminal output...</div>
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
              <h2 className="modal-title">Cloudflare Zero Trust API Settings</h2>
              <button
                type="button"
                className="action-btn"
                onClick={() => setIsCFModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSaveCF} className="modal-body">
              <div className="form-group">
                <label className="form-label">Root Domain</label>
                <input
                  type="text"
                  placeholder="oktanio.dev"
                  value={cfDomain}
                  onChange={(e) => setCfDomain(e.target.value)}
                  required
                />
                <span className="form-help">Your apex domain registered on Cloudflare.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Cloudflare API Token (Bearer Token)</label>
                <input
                  type="password"
                  placeholder="Bearer token with Cloudflare Tunnel & DNS Edit permissions"
                  value={cfApiToken}
                  onChange={(e) => setCfApiToken(e.target.value)}
                />
                <span className="form-help">Created in Cloudflare Dashboard &gt; My Profile &gt; API Tokens.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Account ID</label>
                <input
                  type="text"
                  placeholder="Account ID from Cloudflare sidebar"
                  value={cfAccountId}
                  onChange={(e) => setCfAccountId(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Tunnel ID (UUID)</label>
                <input
                  type="text"
                  placeholder="c1744f8b-faa1-48a4-9e5c-02ac921467fa"
                  value={cfTunnelId}
                  onChange={(e) => setCfTunnelId(e.target.value)}
                />
                <span className="form-help">UUID from Cloudflare Zero Trust &gt; Networks &gt; Tunnels.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Tunnel Token (Optional for Local cloudflared Daemon)</label>
                <textarea
                  rows={2}
                  placeholder="eyJhIjoi..."
                  value={cfToken}
                  onChange={(e) => setCfToken(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="cf-enable-cb"
                  checked={cfActive}
                  onChange={(e) => setCfActive(e.target.checked)}
                />
                <label htmlFor="cf-enable-cb" className="form-label" style={{ cursor: 'pointer', margin: 0 }}>
                  Run local cloudflared daemon in background
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
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
      <footer className="footer-copyright">
        <p>Copyright &copy; 2026 Yohanes Oktanio. All Rights Reserved.</p>
      </footer>
    </div>
  )
}
