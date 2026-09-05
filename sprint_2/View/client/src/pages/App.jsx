import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import LightPillar from '../components/LightPillar.jsx'
import CalendarConnectButton from '../components/CalendarConnectButton.jsx'
import MapPicker from '../components/MapPicker.jsx'
import AssistantWidget from '../components/AssistantWidget.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5002'

// Search button/modal used by client/provider (defined early to avoid reference issues)
function UserSearchBtn({ me, token }){
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [arch, setArch] = useState(true)
  const [engg, setEngg] = useState(true)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const canSearch = !!(me && (me.role === 'client' || me.role === 'provider'))
  if (!canSearch) return null

  async function search(){
    setLoading(true); setMsg('')
    try{
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const domains = []
      if (arch) domains.push('architecture')
      if (engg) domains.push('engineering')
      if (domains.length>0 && domains.length<2) params.set('domains', domains.join(','))
      const url = `${API_BASE}/api/user/search?${params.toString()}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok){ const d = await res.json(); setResults(d) } else { setMsg('Search failed') }
    }catch{ setMsg('Search failed') }
    setLoading(false)
  }

  function openPanel(){ setOpen(true); setResults([]); setMsg(''); setLoading(false) }

  return (
    <>
      <button className="btn btn-ghost" onClick={openPanel}>Search</button>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
          <div className="w-full max-w-lg h-full bg-white card p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="section-title">Search users</div>
              <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
            </div>
            <div className="space-y-3">
              <input className="input w-full" placeholder="Search by username or name" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if (e.key==='Enter') search() }} />
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={arch} onChange={e=>setArch(e.target.checked)} /> Architecture
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={engg} onChange={e=>setEngg(e.target.checked)} /> Engg
                </label>
                <div className="ml-auto">
                  <button className="btn btn-primary" onClick={search} disabled={loading}>{loading? 'Searching...' : 'Search'}</button>
                </div>
              </div>
              {msg && <div className="text-sm text-red-600">{msg}</div>}
              <div className="space-y-2">
                {results.map(u => (
                  <div key={u.username} className="border rounded p-3 flex items-center gap-3">
                    {u.avatarUrl ? (
                      <img src={`${API_BASE}${u.avatarUrl}`} alt="avatar" className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200" />
                    ) : (
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700 font-semibold">
                        {u.username?.[0]?.toUpperCase() || 'U'}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium flex items-center gap-1">
                        {u.username}
                        {u.verified && <span title="Verified" className="text-green-600">✔︎</span>}
                      </div>
                      {u.displayName && <div className="subtle truncate">{u.displayName}</div>}
                      <div className="text-xs text-gray-600">
                        Type: {u.verifiedCategory==='provider_company' ? 'Company' : (u.verifiedSubtype==='architect' ? 'Architect' : (u.verifiedSubtype==='engineer' ? 'Engineer' : ''))}
                        {Array.isArray(u.domains) && u.domains.length>0 && (
                          <> 
                            • Domains: {(u.domains || []).map(d => d==='architecture' ? 'Architecture' : 'Engg').join(', ')}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Provider</div>
                  </div>
                ))}
                {results.length===0 && !loading && <div className="subtle">No results</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Backward-compatible alias used in header
function UserSearchButton(props){
  return <UserSearchBtn {...props} />
}

// Simple error boundary to prevent white screen on runtime errors
class ErrorBoundary extends React.Component {
  constructor(props){
    super(props)
    this.state = { error: null }
    }

  static getDerivedStateFromError(error){
    return { error }
  }
  componentDidCatch(error, info){
    // Log for debugging
    // eslint-disable-next-line no-console
    console.error('UI error:', error, info)
  }
  render(){
    if (this.state.error){
      return (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="card p-6 space-y-3">
            <div className="section-title">Something went wrong</div>
            <div className="text-sm text-gray-700">Please refresh the page. If it persists, share the error below.</div>
            <pre className="text-xs whitespace-pre-wrap bg-gray-50 p-3 rounded border overflow-auto" style={{maxHeight:'200px'}}>{String(this.state.error && (this.state.error.stack || this.state.error.message || this.state.error))}</pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function RoleSelector({ selected, onSelect }) {
  const roles = [
    { key: 'Admin', desc: 'Fixed credentials' },
    { key: 'Client', desc: 'Sign up & log in' },
    { key: 'Service provider', desc: 'Sign up & log in' },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {roles.map(r => (
        <button
          key={r.key}
          onClick={() => onSelect(r.key)}
          className={`card p-4 text-left transition ring-1 ${selected===r.key? 'ring-primary-600 shadow-md' : 'ring-gray-200 hover:ring-primary-300 hover:shadow-sm'}`}
        >
          <div className="font-semibold">{r.key}</div>
          <div className="subtle mt-1">{r.desc}</div>
        </button>
      ))}
    </div>
  )
}

function AdminLogin({ onAuth }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('12345')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e){
    e.preventDefault()
    setLoading(true)
    setMsg('')
    const res = await fetch(`${API_BASE}/api/auth/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    const data = await res.json()
    setMsg(res.ok ? `Logged in as ${data.username}` : (data.message || 'Error'))
    if (res.ok) onAuth(data)
    setLoading(false)
  }

  // removed inner UserSearchButton; a top-level component is used instead

  

  return (
    <form onSubmit={submit} className="card p-6 space-y-4">
      <div className="section-title">Admin Login</div>
      <div className="grid gap-3">
        <input className="input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Username" />
        <input className="input" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Signing in...' : 'Login'}</button>
        {msg && <span className="subtle">{msg}</span>}
      </div>
    </form>
  )
}

function UserAuth({ roleKey, onAuth }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e){
    e.preventDefault()
    setLoading(true)
    setMsg('')
    const path = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login'
    // Map display role labels to API values expected by server ('client' | 'provider')
    const apiRole = roleKey === 'Client' ? 'client' : (roleKey === 'Service provider' ? 'provider' : roleKey)
    const body = mode === 'signup' ? { username, password, role: apiRole } : { username, password }
    console.log('[Auth] submitting', { path, body })
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    console.log('[Auth] response', res.status, data)
    setMsg(res.ok ? `Success (${data.role}): ${data.username}` : (data.message || 'Error'))
    if (res.ok) onAuth(data)
    setLoading(false)
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <button className={`btn ${mode==='login' ? 'btn-primary' : 'btn-ghost'}`} onClick={()=>setMode('login')} disabled={mode==='login'}>Log in</button>
        <button className={`btn ${mode==='signup' ? 'btn-primary' : 'btn-ghost'}`} onClick={()=>setMode('signup')} disabled={mode==='signup'}>Sign up</button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="section-title">{roleKey === 'client' ? 'Client' : 'Service Provider'} {mode === 'login' ? 'Login' : 'Sign up'}</div>
        <div className="grid gap-3">
          <input className="input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Username" />
          <input className="input" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Submitting...' : 'Submit'}</button>
          {msg && <span className="subtle">{msg}</span>}
        </div>
      </form>
    </div>
  )
}

export default function App(){
  const [selected, setSelected] = useState('Admin')
  const [token, setToken] = useState(() => localStorage.getItem('token') || '')
  const [me, setMe] = useState(null)
  const [sessionUser, setSessionUser] = useState(null)
  const isAuthed = !!token
  const [activeTab, setActiveTab] = useState('feed') // 'feed' | 'projects'
  const [runtimeError, setRuntimeError] = useState('')
  const fetchedProfileRef = React.useRef(false)
  // key to trigger projects feed reloads from outside the panel
  const [projectsReloadKey, setProjectsReloadKey] = useState(0)
  const triggerProjectsReload = () => setProjectsReloadKey((k) => k + 1)
  const [calendarConnected, setCalendarConnected] = useState(false)

  useEffect(() => {
    function onErr(message, source, lineno, colno, error){
      const msg = String(message || (error && (error.stack || error.message)) || 'Error')
      setRuntimeError(msg)
      // keep running
      return false
    }
    function onRejection(ev){
      const msg = String((ev && (ev.reason && (ev.reason.stack || ev.reason.message))) || 'Promise rejection')
      setRuntimeError(msg)
    }
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  useEffect(() => {
    if (token && !me && !fetchedProfileRef.current) {
      fetchedProfileRef.current = true
      // reduce console noise; keep one concise log in dev
      console.log('[Auth] token present, fetching profile')
      fetchMe(token)
    }
  }, [token, me])

  useEffect(() => {
    (async () => {
      try{
        if (!token || !me || !(me.role==='client' || me.role==='provider')){ setCalendarConnected(false); return }
        const r = await fetch(`${API_BASE}/api/calendar/me`, { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok){ const d = await r.json(); setCalendarConnected(!!d.hasTokens) } else { setCalendarConnected(false) }
      }catch{ setCalendarConnected(false) }
    })()
  }, [token, me])

  async function fetchMe(tok){
    try{
      const res = await fetch(`${API_BASE}/api/user/me?ts=${Date.now()}`, {
        headers: { Authorization: `Bearer ${tok}`, 'Cache-Control': 'no-cache' },
        cache: 'no-store',
      })
      if (res.status === 304) {
        console.log('[Auth] /me 304 - keeping existing session')
        return
      }
      if(res.ok){
        const data = await res.json()
        setMe(data)
      } else {
        localStorage.removeItem('token')
        setToken('')
        setMe(null)
      }
    }catch{}
  }

  function handleAuth(data){
    // only persist for client/provider as requested; admin won't show profile controls
    if (data.role === 'client' || data.role === 'provider'){
      localStorage.setItem('token', data.token)
      setToken(data.token)
      console.log('[Auth] logged-in as', data.role, 'fetching profile')
      // Optimistically set minimal profile to avoid blank state
      setMe({ role: data.role, username: data.username })
      setSessionUser({ role: data.role, username: data.username })
      fetchMe(data.token)
    } else if (data.role === 'admin') {
      // set admin session token without persisting
      setToken(data.token)
      setMe({ role: 'admin', username: data.username })
      setSessionUser({ role: 'admin', username: data.username })
    }
  }

  function logout(){
    localStorage.removeItem('token')
    setToken('')
    setMe(null)
  }

  async function updateProfile({ displayName, password }){
    const res = await fetch(`${API_BASE}/api/user/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName, password })
    })
    if (res.ok){
      const data = await res.json()
      setMe(data)
      return { ok: true }
    }
    return { ok: false, message: 'Update failed' }
  }

  async function uploadAvatar(file){
    const fd = new FormData()
    fd.append('avatar', file)
    const res = await fetch(`${API_BASE}/api/user/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    })
    if (res.ok){
      const data = await res.json()
      setMe(data)
      return { ok: true }
    }
    return { ok: false }
  }

  // Provider posts: list and create
  const [myPosts, setMyPosts] = useState([])
  async function fetchMyPosts(){
    const res = await fetch(`${API_BASE}/api/posts/provider/mine`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok){
      const data = await res.json()
      setMyPosts(data)
    }
  }

  async function createPost({ content, file }){
    const fd = new FormData()
    if (content) fd.append('content', content)
    if (file) fd.append('image', file)
    const res = await fetch(`${API_BASE}/api/posts/provider`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    })
    if (res.ok){
      await fetchMyPosts()
      return { ok: true }
    }
    return { ok: false }
  }

  // Admin moderation: list pending and approve
  const [pendingPosts, setPendingPosts] = useState([])
  async function fetchPending(){
    const res = await fetch(`${API_BASE}/api/posts/admin/pending`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok){
      const data = await res.json()
      setPendingPosts(data)
    }
  }

  async function approvePost(id){
    const res = await fetch(`${API_BASE}/api/posts/admin/approve/${id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok){
      await fetchPending()
      await fetchFeed()
    }
  }

  // Public feed of approved posts
  const [feed, setFeed] = useState([])
  async function fetchFeed(){
    const res = await fetch(`${API_BASE}/api/posts/feed`)
    if (res.ok){
      const data = await res.json()
      setFeed(data)
      const names = Array.from(new Set(data.map(x=>x.authorUsername)))
      if (names.length) await fetchVerifiedMap(names)
    }
  }

  useEffect(() => { fetchFeed() }, [])
  // refresh public posts feed when tab changes; projects are handled inside ProjectsFeedPanel
  useEffect(() => {
    if (activeTab === 'feed') fetchFeed()
  }, [activeTab])
  useEffect(() => {
    if (me?.role === 'provider' && token) fetchMyPosts()
    if (me?.role === 'admin' && token) fetchPending()
  }, [me, token])

  // Verified badges map { username: boolean }
  const [verifiedMap, setVerifiedMap] = useState({})
  async function fetchVerifiedMap(usernames){
    try{
      const q = encodeURIComponent(usernames.join(','))
      const res = await fetch(`${API_BASE}/api/verification/verified?usernames=${q}`)
      if (res.ok){
        const map = await res.json()
        setVerifiedMap(prev => ({ ...prev, ...map }))
      }
    }catch{}
  }

  function ProfilePanel(){
    const [open, setOpen] = useState(false)
    const [openedAt, setOpenedAt] = useState(0)
    const [displayName, setDisplayName] = useState(me?.displayName || '')
    const [password, setPassword] = useState('')
    const roleLabel = me?.role
    const avatarSrc = me?.avatarUrl ? `${API_BASE}${me.avatarUrl}` : undefined
    const [verifyOpen, setVerifyOpen] = useState(false)

    async function onSave(e){
      e.preventDefault()
      const res = await updateProfile({ displayName, password })
      if (res.ok) {
        setPassword('')
        setOpen(false)
      }
    }

    async function onFile(e){
      const f = e.target.files?.[0]
      if (f) await uploadAvatar(f)
    }

    

    // Allow closing with Escape key; disable backdrop click-to-close
    useEffect(() => {
      function onKey(e){ if (e.key === 'Escape') setOpen(false) }
      if (open) window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [open])

    return (
      <div>
        <button
          className="btn btn-ghost"
          onMouseDown={(e)=>{ e.preventDefault(); e.stopPropagation() }}
          onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setOpen(true); setOpenedAt(Date.now()) }}
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt="avatar" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white font-semibold">
              {me?.username?.[0]?.toUpperCase() || 'U'}
            </span>
          )}
        </button>

        {open && ReactDOM.createPortal((
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          >
            <div
              className="card w-full max-w-md p-6 space-y-4 bg-white"
              onClick={(e)=>e.stopPropagation()}
              onMouseDown={(e)=>e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="section-title">My Profile</div>
                <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
              </div>
              <div className="text-sm text-gray-600">Role: <span className="font-medium inline-flex items-center gap-1">{roleLabel}{me?.verified && <span title="Verified" className="text-green-600">✔︎</span>}</span></div>
              <div className="flex items-center gap-3">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="avatar" className="h-14 w-14 rounded-full object-cover ring-1 ring-gray-200" />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-primary-100 text-primary-700 grid place-items-center text-lg font-semibold">
                    {me?.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
                <label className="btn btn-primary cursor-pointer">
                  Upload picture
                  <input type="file" accept="image/*" className="hidden" onChange={onFile} />
                </label>
              </div>

              <form onSubmit={onSave} className="space-y-3">
                <div>
                  <label className="subtle">Display name</label>
                  <input className="input mt-1" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Your name" />
                </div>
                <div>
                  <label className="subtle">New password</label>
                  <input className="input mt-1" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" type="password" />
                </div>
                <div className="flex items-center justify-between">
                  <button type="submit" className="btn btn-primary">Save</button>
                  <button type="button" className="btn btn-ghost" onClick={logout}>Log out</button>
                </div>
              </form>

              {(me?.role==='client' || me?.role==='provider') && (
                <div className="pt-2">
                  <button className="btn btn-ghost" onClick={()=>setVerifyOpen(true)}>Request for verification</button>
                </div>
              )}
            </div>
          </div>
        ), document.body)}
        {verifyOpen && (
          <VerificationRequestDrawer onClose={()=>setVerifyOpen(false)} forceMode={me?.role === 'client' ? 'client' : 'provider'} />
        )}
      </div>
    )
  }

  function AcceptedBidsButton(){
    const [open, setOpen] = useState(false)
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState('')
    const [chatProjectId, setChatProjectId] = useState(null)
    const [locOpen, setLocOpen] = useState(false)
    const [locView, setLocView] = useState(null)

    async function load(){
      setLoading(true); setMsg('')
      try{
        const res = await fetch(`${API_BASE}/api/projects/my/accepted-bids`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok){ const d = await res.json(); setItems(d) } else { setMsg('Failed to load') }
      }catch{ setMsg('Failed to load') }
      setLoading(false)
    }

    function openPanel(){ setOpen(true); setItems([]); setMsg(''); load() }

    if (!me || me.role !== 'provider') return null
    return (
      <>
        <button className="btn btn-ghost" onClick={openPanel}>Accepted BID</button>
        {open && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
            <div className="w-full max-w-2xl h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">My accepted bids</div>
                <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
              </div>
              {msg && <div className="text-sm text-gray-600">{msg}</div>}
              {loading ? (
                <div className="subtle">Loading...</div>
              ) : (
                <div className="space-y-3">
                  {items.map(it => (
                    <div key={`${it.projectId}-${it.bid?._id||'bid'}`} className="border rounded p-3 space-y-2">
                      <div className="text-sm text-gray-600 flex flex-wrap items-center gap-2">
                        <span>Client: <span className="font-medium">{it.authorUsername}</span></span>
                        <span>•</span>
                        <span className="capitalize">{it.category}</span>
                        {it.subcategory && <><span>•</span><span>{it.subcategory}</span></>}
                        {it.tier && <><span>•</span><span className="capitalize">{it.tier}</span></>}
                        {it.projectType && <><span>•</span><span>{it.projectType}</span></>}
                      </div>
                      {it.description && <div>{it.description}</div>}
                      {it.imageUrl && <img src={`${API_BASE}${it.imageUrl}`} alt="project" className="max-h-48 rounded" />}
                      {it.location && (
                        <div>
                          <button className="btn btn-ghost" onClick={()=>{ setLocView(it.location); setLocOpen(true) }}>View location</button>
                        </div>
                      )}
                      {it.bid && (
                        <div className="text-sm flex items-center justify-between gap-2">
                          <div>
                            <span className="font-medium">Your bid:</span> {it.bid.text}
                          </div>
                          <button className="btn btn-ghost" title="Open chat" onClick={()=>setChatProjectId(it.projectId)}>💬 Message</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {items.length===0 && <div className="subtle">No accepted bids yet.</div>}
                </div>
              )}
              {chatProjectId && <ChatDrawer projectId={chatProjectId} onClose={()=>setChatProjectId(null)} />}
        {locOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setLocOpen(false)} />
            <div className="w-full max-w-lg h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Project location</div>
                <button className="btn btn-ghost" onClick={()=>setLocOpen(false)}>Close</button>
              </div>
              <div className="space-y-3">
                <MapPicker readOnly value={locView} height={360} />
                {locView && <div className="text-xs text-gray-700">Lat {Number(locView.lat).toFixed(6)}, Lng {Number(locView.lng).toFixed(6)}</div>}
              </div>
            </div>
          </div>
        )}
              {locOpen && (
                <div className="fixed inset-0 z-50 flex">
                  <div className="flex-1 bg-black/30" onClick={()=>setLocOpen(false)} />
                  <div className="w-full max-w-lg h-full bg-white card p-6 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <div className="section-title">Project location</div>
                      <button className="btn btn-ghost" onClick={()=>setLocOpen(false)}>Close</button>
                    </div>
                    <div className="space-y-3">
                      <MapPicker readOnly value={locView} height={360} />
                      {locView && <div className="text-xs text-gray-700">Lat {Number(locView.lat).toFixed(6)}, Lng {Number(locView.lng).toFixed(6)}</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </>
    )
  }
  
  // Chat drawer for accepted bid conversations
  function ChatDrawer({ projectId, onClose }){
    const [open, setOpen] = useState(true)
    const [items, setItems] = useState([])
    const [text, setText] = useState('')
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState('')
    const [timer, setTimer] = useState(null)
    const [suspended, setSuspended] = useState(false)
    const [suspendReason, setSuspendReason] = useState('')
    const [helpOpen, setHelpOpen] = useState(false)
    const [helpText, setHelpText] = useState('')
    const [kanbanStatus, setKanbanStatus] = useState(null)
    const [finalizing, setFinalizing] = useState(false)

    async function load(){
      setLoading(true); setMsg('')
      try{
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/chat`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok){ const d = await res.json(); setItems(d) } else { setMsg('Failed to load messages') }
        try{
          const st = await fetch(`${API_BASE}/api/projects/${projectId}/chat/status`, { headers: { Authorization: `Bearer ${token}` } })
          if (st.ok){ const s2 = await st.json(); setSuspended(!!s2.suspended); setSuspendReason(s2.reason || ''); setKanbanStatus(s2.kanbanStatus || null) }
        }catch{}
      }catch{ setMsg('Failed to load messages') }
      setLoading(false)
    }

    async function finalizeAcceptance(){
      setFinalizing(true); setMsg('')
      try{
        const r = await fetch(`${API_BASE}/api/projects/${projectId}/chat/accept-provider`, { method:'POST', headers:{ Authorization:`Bearer ${token}` } })
        if (r.ok){ await load(); setMsg('Provider accepted. Moved to TODO.') }
        else {
          let d = {}
          try{ d = await r.json() }catch{}
          setMsg(d.message || 'Failed to accept provider')
        }
      }catch{ setMsg('Failed to accept provider') }
      setFinalizing(false)
    }
    async function send(){
      if (!text.trim()) return
      setLoading(true); setMsg('')
      try{
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ text })
        })
        if (res.ok){ setText(''); await load() } else if (res.status===403){ try{ const d=await res.json(); if (d.suspended){ setSuspended(true); setSuspendReason(d.reason || ''); setMsg(d.message || 'Messaging suspended') } else { setMsg(d.message || 'Forbidden') } } catch { setMsg('Messaging suspended') } } else { setMsg('Failed to send') }
      }catch{ setMsg('Failed to send') }
      setLoading(false)
    }
    useEffect(()=>{ if (projectId) load() }, [projectId])
    // Auto-refresh every 5s while open
    useEffect(()=>{
      if (!projectId) return
      const t = setInterval(load, 5000)
      setTimer(t)
      return ()=>{ clearInterval(t) }
    }, [projectId])
    if (!open) return null
    return (
      <div className="fixed inset-0 z-50 flex">
        <div className="flex-1 bg-black/30" onClick={()=>{ setOpen(false); onClose?.() }} />
        <div className="w-full max-w-md h-full bg-white card p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="section-title flex items-center gap-2">
              <span>Messages</span>
              {kanbanStatus ? (
                <span className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200" title="This provider is fully accepted for this project and is on the board">✔︎ Accepted</span>
              ) : (
                <span className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200" title="Chat enabled. Finalize to move to provider TODO.">Pending finalization</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {me?.role==='client' && !kanbanStatus && (
                <button className="btn btn-primary btn-sm" onClick={finalizeAcceptance} disabled={finalizing}>{finalizing? 'Accepting...' : 'Accept this provider'}</button>
              )}
              <button className="btn btn-ghost" onClick={()=>{ setOpen(false); onClose?.() }}>Close</button>
            </div>
          </div>
          {msg && <div className="text-sm text-gray-700">{msg}</div>}
          {suspended && (
            <div className="mb-3 p-3 rounded border border-yellow-300 bg-yellow-50 text-sm text-yellow-900">
              <div className="font-medium mb-1">Messaging suspended</div>
              <div>{suspendReason || "Policy violation"}</div>
              <div className="mt-2"><button className="btn btn-ghost btn-sm" onClick={()=>setHelpOpen(v=>!v)}>Help</button></div>
            </div>
          )}
          {helpOpen && (
            <div className="mb-3 space-y-2 border rounded p-3">
              <div className="text-sm font-medium">Explain briefly why suspension should be reviewed</div>
              <textarea className="input min-h-[70px]" placeholder="Write reason..." value={helpText} onChange={e=>setHelpText(e.target.value)} />
              <div className="flex gap-2 justify-end">
                <button className="btn btn-ghost" onClick={()=>setHelpOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={async ()=>{ setMsg(''); try{ const r = await fetch(`${API_BASE}/api/projects/${projectId}/chat/help`, { method:'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ reason: helpText }) }); if (r.ok){ setHelpOpen(false); setHelpText(''); setMsg('Help requested to admin') } else { setMsg('Failed to request help') } } catch { setMsg('Failed to request help') } }}>Submit</button>
              </div>
            </div>
          )}
          {loading ? (
            <div className="subtle">Loading...</div>
          ) : (
            <div className="space-y-2">
              {items.map(m => (
                <div key={m._id} className="border rounded p-2 text-sm">
                  <div className="text-xs text-gray-600 mb-1">{m.senderUsername}</div>
                  <div>{m.text}</div>
                </div>
              ))}
              {items.length===0 && <div className="subtle">No messages yet.</div>}
            </div>
          )}
          <div className="mt-3 space-y-2">
            <textarea className="input min-h-[70px]" placeholder={suspended? "Suspended" : "Write a message..."} value={text} onChange={e=>setText(e.target.value)} disabled={suspended} />
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={send} disabled={suspended || loading || !text.trim()}>{loading? 'Sending...' : 'Send'}</button>
              <button className="btn btn-ghost" onClick={()=>{ setOpen(false); onClose?.() }}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  function AdminSuspensionsButton(){
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [msg, setMsg] = React.useState('')
  const [chatProjectId, setChatProjectId] = React.useState(null)

  async function load(){
    setLoading(true); setMsg('')
    try{
      const res = await fetch(API_BASE + "/api/projects/admin/suspensions", { headers: { Authorization: "Bearer " + token } })
      if (res.ok){ const d = await res.json(); setItems(d) } else { setMsg('Failed to load') }
    }catch{ setMsg('Failed to load') }
    setLoading(false)
  }
  async function removeSuspension(projectId){
    setMsg('')
    const res = await fetch(API_BASE + "/api/projects/admin/suspensions/" + projectId + "/remove", { method: "POST", headers: { Authorization: "Bearer " + token } })
    if (res.ok){ await load(); setMsg('Removed suspension') } else { setMsg('Failed to remove') }
  }
  function openPanel(){ setOpen(true); setItems([]); setMsg(''); load() }
  if (!me || me.role !== "admin") return null
  return (
    <>
      <button className="btn btn-ghost" onClick={openPanel}>Suspension Box</button>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
          <div className="w-full max-w-2xl h-full bg-white card p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="section-title">Active suspensions</div>
              <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
            </div>
            {msg && <div className="text-sm text-gray-700">{msg}</div>}
            {loading ? (<div className="subtle">Loading...</div>) : (
              <div className="space-y-3">
                {items.map(it => (
                  <div key={it.projectId} className="border rounded p-3 space-y-2">
                    <div className="text-sm text-gray-700 flex flex-wrap items-center gap-2">
                      <span className="font-medium">Project: {it.projectId}</span>
                      <span>• Client: {it.clientUsername}</span>
                      <span>• Provider: {it.providerUsername}</span>
                    </div>
                    <div className="text-sm">Reason: {it.reason}</div>
                    {it.helpRequested && <div className="text-sm text-yellow-700">Help requested: {it.helpReason || "Yes"}</div>}
                    <div className="flex gap-2 justify-end">
                      <button className="btn btn-ghost" onClick={()=>setChatProjectId(it.projectId)}>View chat</button>
                      <button className="btn btn-primary" onClick={()=>removeSuspension(it.projectId)}>Remove suspension</button>
                    </div>
                  </div>
                ))}
                {items.length===0 && <div className="subtle">No suspensions.</div>}
              </div>
            )}
            {chatProjectId && <ChatDrawer projectId={chatProjectId} onClose={()=>setChatProjectId(null)} />}
          </div>
        </div>
      )}
    </>
  )
}

function AdminVerificationButton(){
    const [open, setOpen] = useState(false)
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState('')

    async function fetchPending(){
      setLoading(true)
      try{
        const res = await fetch(`${API_BASE}/api/verification/admin/pending`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok){ const data = await res.json(); setItems(data) } else { setMsg('Failed to load') }
      }catch{ setMsg('Failed to load') }
      setLoading(false)
    }

    async function approve(id){
      setMsg('')
      const res = await fetch(`${API_BASE}/api/verification/admin/approve/${id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok){
        await fetchPending()
        // refresh feeds so verified badges update
        await fetchFeed()
        triggerProjectsReload()
        setMsg('Approved')
      } else { setMsg('Approval failed') }
    }

    function openPanel(){ setOpen(true); setItems([]); setMsg(''); fetchPending() }

    return (
      <>
        <button className="btn btn-ghost" onClick={openPanel}>User Verification</button>
        {open && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
            <div className="w-full max-w-3xl h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Pending verification requests</div>
                <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
              </div>
              {msg && <div className="text-sm text-gray-600">{msg}</div>}
              {loading ? (
                <div className="subtle">Loading...</div>
              ) : (
                <div className="space-y-4">
                  {items.map(v => (
                    <div key={v._id} className="border rounded p-4 space-y-3">
                      <div className="text-sm text-gray-700 flex flex-wrap gap-2">
                        <span className="font-medium">{v.username}</span>
                        <span>•</span>
                        <span>{v.role}</span>
                        <span>•</span>
                        <span>{v.category}</span>
                        {v.subtype && <><span>•</span><span>{v.subtype}</span></>}
                      </div>
                      {v.description && <div className="text-sm">{v.description}</div>}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {v.nidUrl && <img src={`${API_BASE}${v.nidUrl}`} alt="nid" className="rounded border" />}
                        {Array.isArray(v.certificateUrls) && v.certificateUrls.map((u,i)=>(<img key={i} src={`${API_BASE}${u}`} alt={`cert-${i}`} className="rounded border" />))}
                        {v.licenseUrl && <img src={`${API_BASE}${v.licenseUrl}`} alt="license" className="rounded border" />}
                        {v.companyLicenseUrl && <img src={`${API_BASE}${v.companyLicenseUrl}`} alt="company-license" className="rounded border" />}
                        {Array.isArray(v.companyRegistrationUrls) && v.companyRegistrationUrls.map((u,i)=>(<img key={i} src={`${API_BASE}${u}`} alt={`reg-${i}`} className="rounded border" />))}
                      </div>
                      <div className="flex justify-end">
                        <button className="btn btn-primary" onClick={()=>approve(v._id)}>Approve</button>
                      </div>
                    </div>
                  ))}
                  {items.length===0 && <div className="subtle">No pending requests.</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </>
    )
  }

  function VerificationRequestDrawer({ onClose, forceMode }){
    const [step, setStep] = useState(0)
    const [mode, setMode] = useState(forceMode || (me?.role === 'client' ? 'client' : 'provider')) // client | provider
    const [providerType, setProviderType] = useState('') // individual | company
    const [individualRole, setIndividualRole] = useState('') // architect | engineer
    const [nid, setNid] = useState(null)
    const [certificates, setCertificates] = useState([])
    const [license, setLicense] = useState(null)
    const [companyLicense, setCompanyLicense] = useState(null)
    const [companyRegistrations, setCompanyRegistrations] = useState([])
    const [description, setDescription] = useState('')
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState('')

    function reset(){
      setStep(forceMode ? 1 : 0); setMode(forceMode || (me?.role === 'client' ? 'client' : 'provider')); setProviderType(''); setIndividualRole('');
      setNid(null); setCertificates([]); setLicense(null); setCompanyLicense(null); setCompanyRegistrations([]); setDescription(''); setMsg('')
    }

    useEffect(()=>{
      // Auto-skip account type selection when role is known
      if (forceMode) setStep(1)
    }, [forceMode])

    async function submit(){
      setLoading(true); setMsg('')
      const fd = new FormData()
      let category = 'client'
      let subtype = ''
      if (mode === 'provider'){
        if (providerType === 'individual'){ category = 'provider_individual'; subtype = individualRole }
        else if (providerType === 'company'){ category = 'provider_company' }
      }
      fd.append('category', category)
      if (subtype) fd.append('subtype', subtype)
      if (description) fd.append('description', description)
      if (nid) fd.append('nid', nid)
      certificates.forEach(f => fd.append('certificates', f))
      if (license) fd.append('license', license)
      if (companyLicense) fd.append('companyLicense', companyLicense)
      companyRegistrations.forEach(f => fd.append('companyRegistrations', f))
      const res = await fetch(`${API_BASE}/api/verification/request`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd
      })
      setLoading(false)
      if (res.ok){ setMsg('Submitted for verification'); setTimeout(()=>{ onClose?.(); reset(); }, 700) }
      else { try{ const d = await res.json(); setMsg(d?.message || 'Failed') } catch { setMsg('Failed') } }
    }

    return (
      <div className="fixed inset-0 z-50 flex">
        <div className="flex-1 bg-black/30" onClick={onClose} />
        <div className="w-full max-w-md h-full bg-white card p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="section-title">Request for verification</div>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>

          {step===0 && !forceMode && (
            <div className="space-y-3">
              <div className="section-title">Select account type</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`card p-4 transition ${mode==='client' ? 'ring-2 ring-primary-600 border-primary-300 bg-primary-50' : 'ring-1 ring-gray-200 hover:ring-primary-300'}`}
                  onClick={(e)=>{e.preventDefault(); setMode('client')}}
                >Client</button>
                <button
                  type="button"
                  className={`card p-4 transition ${mode==='provider' ? 'ring-2 ring-primary-600 border-primary-300 bg-primary-50' : 'ring-1 ring-gray-200 hover:ring-primary-300'}`}
                  onClick={(e)=>{e.preventDefault(); setMode('provider')}}
                >Service provider</button>
              </div>
              <div className="flex justify-end"><button className="btn btn-primary" onClick={()=>setStep(1)}>Next</button></div>
            </div>
          )}

          {step===1 && mode==='client' && (
            <div className="space-y-4">
              <div>
                <label className="subtle">Upload National ID card picture</label>
                <input type="file" accept="image/*" className="mt-1" onChange={e=>setNid(e.target.files?.[0]||null)} />
              </div>
              <div>
                <label className="subtle">Description (optional)</label>
                <textarea className="input mt-1 min-h-[100px]" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Notes for admin..." />
              </div>
              {msg && <div className={`text-sm ${msg.includes('Submitted')?'text-green-700':'text-red-600'}`}>{msg}</div>}
              <div className="flex items-center justify-between">
                <button className="btn btn-ghost" onClick={()=>{ if (forceMode) { onClose?.() } else { setStep(0) } }}>Back</button>
                <button className="btn btn-primary" onClick={submit} disabled={loading || !nid}>{loading? 'Submitting...' : 'Submit'}</button>
              </div>
            </div>
          )}

          {step===1 && mode==='provider' && !providerType && (
            <div className="space-y-3">
              <div className="section-title">Select provider type</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`card p-4 transition ${providerType==='individual' ? 'ring-2 ring-primary-600 border-primary-300 bg-primary-50' : 'ring-1 ring-gray-200 hover:ring-primary-300'}`}
                  onClick={(e)=>{e.preventDefault(); setProviderType('individual'); setStep(2)}}
                >Individual</button>
                <button
                  type="button"
                  className={`card p-4 transition ${providerType==='company' ? 'ring-2 ring-primary-600 border-primary-300 bg-primary-50' : 'ring-1 ring-gray-200 hover:ring-primary-300'}`}
                  onClick={(e)=>{e.preventDefault(); setProviderType('company'); setStep(2)}}
                >Company</button>
              </div>
              <div className="flex justify-between">
                <button className="btn btn-ghost" onClick={()=>{ if (forceMode) { onClose?.() } else { setStep(0) } }}>Back</button>
                {providerType && <button className="btn btn-primary" onClick={()=>setStep(2)}>Next</button>}
              </div>
            </div>
          )}

          {step===2 && mode==='provider' && providerType==='individual' && !individualRole && (
            <div className="space-y-3">
              <div className="section-title">Are you</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`card p-4 transition ${individualRole==='architect' ? 'ring-2 ring-primary-600 border-primary-300 bg-primary-50' : 'ring-1 ring-gray-200 hover:ring-primary-300'}`}
                  onClick={(e)=>{e.preventDefault(); setIndividualRole('architect'); setStep(3)}}
                >An Architect</button>
                <button
                  type="button"
                  className={`card p-4 transition ${individualRole==='engineer' ? 'ring-2 ring-primary-600 border-primary-300 bg-primary-50' : 'ring-1 ring-gray-200 hover:ring-primary-300'}`}
                  onClick={(e)=>{e.preventDefault(); setIndividualRole('engineer'); setStep(3)}}
                >An Engineer</button>
              </div>
              <div className="flex justify-between">
                <button className="btn btn-ghost" onClick={()=>{ if (forceMode) { setProviderType(''); setStep(1) } else { setProviderType(''); setStep(1) } }}>Back</button>
                {individualRole && <button className="btn btn-primary" onClick={()=>setStep(3)}>Next</button>}
              </div>
            </div>
          )}

          {((step===2 && mode==='provider' && providerType==='company') || (step===3 && mode==='provider' && providerType==='individual')) && (
            <div className="space-y-4">
              {providerType==='individual' && (
                <>
                  <div>
                    <label className="subtle">Upload National ID card picture</label>
                    <input type="file" accept="image/*" className="mt-1" onChange={e=>setNid(e.target.files?.[0]||null)} />
                  </div>
                  <div>
                    <label className="subtle">Upload institutional certificates</label>
                    <input multiple type="file" accept="image/*" className="mt-1" onChange={e=>setCertificates(Array.from(e.target.files||[]))} />
                  </div>
                  <div>
                    <label className="subtle">Upload work license picture</label>
                    <input type="file" accept="image/*" className="mt-1" onChange={e=>setLicense(e.target.files?.[0]||null)} />
                  </div>
                </>
              )}
              {providerType==='company' && (
                <>
                  <div>
                    <label className="subtle">Upload company license picture</label>
                    <input type="file" accept="image/*" className="mt-1" onChange={e=>setCompanyLicense(e.target.files?.[0]||null)} />
                  </div>
                  <div>
                    <label className="subtle">Upload company registration certificates</label>
                    <input multiple type="file" accept="image/*" className="mt-1" onChange={e=>setCompanyRegistrations(Array.from(e.target.files||[]))} />
                  </div>
                </>
              )}
              <div>
                <label className="subtle">Description (optional)</label>
                <textarea className="input mt-1 min-h-[100px]" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Notes for admin..." />
              </div>
              {msg && <div className={`text-sm ${msg.includes('Submitted')?'text-green-700':'text-red-600'}`}>{msg}</div>}
              <div className="flex items-center justify-between">
                <button className="btn btn-ghost" onClick={()=>{ if (providerType==='company'){ setProviderType(''); setStep(1) } else { setIndividualRole(''); setStep(2) } }}>Back</button>
                <button className="btn btn-primary" onClick={submit} disabled={loading || (providerType==='individual' && (!nid || !license)) || (providerType==='company' && (!companyLicense))}>{loading? 'Submitting...' : 'Submit'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
  
  function ProjectRequestDrawer(){
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState(0)
    const [category, setCategory] = useState('') // 'architecture' | 'engineering'
    const [subcategory, setSubcategory] = useState('') // exterior/interior or complete/partial
    const [tier, setTier] = useState('') // luxuries/regular/normal (architecture only)
    const [projectType, setProjectType] = useState('') // engineering type
    const [image, setImage] = useState(null) // architecture optional image
    const [description, setDescription] = useState('')
    const [loading, setLoading] = useState(false)
    const [biddingDeadline, setBiddingDeadline] = useState('')
    const [calInfo, setCalInfo] = useState({ hasTokens: false })
    const [loc, setLoc] = useState(null) // { lat, lng, address }
    const [locOpen, setLocOpen] = useState(false)

    function reset(){
      setStep(0); setCategory(''); setSubcategory(''); setTier(''); setProjectType(''); setImage(null); setDescription(''); setBiddingDeadline(''); setLoc(null)
    }

    async function confirm(){
      setLoading(true)
      const fd = new FormData()
      fd.append('category', category)
      if (subcategory) fd.append('subcategory', subcategory)
      if (tier) fd.append('tier', tier)
      if (projectType) fd.append('projectType', projectType)
      if (description) fd.append('description', description)
      if (biddingDeadline) fd.append('biddingDeadline', new Date(biddingDeadline).toISOString())
      if (image && category==='architecture') fd.append('image', image)
      if (loc && loc.lat!=null && loc.lng!=null) fd.append('location', JSON.stringify(loc))
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      setLoading(false)
      if (res.ok){
        triggerProjectsReload()
        setOpen(false)
        reset()
        setActiveTab('projects')
      }
    }

    return (
      <div>
        <button className="btn btn-primary" onClick={()=>{ setOpen(true); reset(); }}>Project Request</button>
        {open && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
            <div className="w-full max-w-md h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">New Project Request</div>
                <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
              </div>
              <div className="mb-3 text-xs text-gray-600">
                {calendarConnected ? 'Calendar connected ✓ — a Google Calendar event will be created when you set a bidding deadline.' : 'Calendar not connected — you can still set a bidding deadline; connect to auto-create a Calendar event.'}
              </div>

              {step===0 && (
                <div className="space-y-3">
                  <div className="section-title">Choose category</div>
                  <div className="grid grid-cols-2 gap-3">
                    <button className={`card p-4 ${category==='architecture'?'ring-2 ring-primary-600':''}`} onClick={()=>{setCategory('architecture'); setStep(1)}}>Architecture project</button>
                    <button className={`card p-4 ${category==='engineering'?'ring-2 ring-primary-600':''}`} onClick={()=>{setCategory('engineering'); setStep(1)}}>Engineering project</button>
                  </div>
                </div>
              )}

              {step===1 && category==='architecture' && (
                <div className="space-y-3">
                  <div className="section-title">Select type</div>
                  <div className="grid grid-cols-2 gap-3">
                    <button className={`card p-4 ${subcategory==='Exterior design'?'ring-2 ring-primary-600':''}`} onClick={()=>{setSubcategory('Exterior design'); setStep(2)}}>Exterior design</button>
                    <button className={`card p-4 ${subcategory==='Interior design'?'ring-2 ring-primary-600':''}`} onClick={()=>{setSubcategory('Interior design'); setStep(2)}}>Interior design</button>
                  </div>
                </div>
              )}

              {step===2 && category==='architecture' && (
                <div className="space-y-3">
                  <div className="section-title">Select option</div>
                  <div className="grid grid-cols-3 gap-3">
                    {['Luxuries','regular','normal'].map(t => (
                      <button key={t} className={`card p-4 ${tier.toLowerCase()===t.toLowerCase()?'ring-2 ring-primary-600':''}`} onClick={()=>{setTier(t.toLowerCase()); setStep(3)}}>{t}</button>
                    ))}
                  </div>
                </div>
              )}

              {step===3 && category==='architecture' && (
                <div className="space-y-4">
                  <div>
                    <label className="subtle">Upload picture</label>
                    <input type="file" accept="image/*" className="mt-1" onChange={e=>setImage(e.target.files?.[0]||null)} />
                  </div>
                  <div>
                    <label className="subtle">Description</label>
                    <textarea className="input mt-1 min-h-[100px]" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Write about your project..." />
                  </div>
                  <div>
                    <label className="subtle">Bidding deadline</label>
                    <input type="datetime-local" className="input mt-1" value={biddingDeadline} onChange={e=>setBiddingDeadline(e.target.value)} />
                  </div>
                  <div>
                    <label className="subtle">Project location (optional)</label>
                    <div className="flex items-center gap-2 mt-1">
                      <button type="button" className="btn btn-ghost" onClick={()=>setLocOpen(true)}>{loc? 'Edit location' : 'Add location'}</button>
                      {loc && <span className="text-xs text-gray-600">Lat {Number(loc.lat).toFixed(4)}, Lng {Number(loc.lng).toFixed(4)}</span>}
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={confirm} disabled={loading}>{loading? 'Posting...' : 'Confirm'}</button>
                </div>
              )}

              {step===1 && category==='engineering' && (
                <div className="space-y-3">
                  <div className="section-title">Select type</div>
                  <div className="grid grid-cols-2 gap-3">
                    <button className={`card p-4 ${subcategory==='Complete house design'?'ring-2 ring-primary-600':''}`} onClick={()=>{setSubcategory('Complete house design'); setStep(2)}}>Complete house design</button>
                    <button className={`card p-4 ${subcategory==='Partial house design'?'ring-2 ring-primary-600':''}`} onClick={()=>{setSubcategory('Partial house design'); setStep(2)}}>Partial house design</button>
                  </div>
                </div>
              )}

              {step===2 && category==='engineering' && (
                <div className="space-y-3">
                  <div className="section-title">Select option</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {['One storied building','Duplex/Triplex','Multi storied building'].map(opt => (
                      <button key={opt} className={`card p-4 ${projectType===opt?'ring-2 ring-primary-600':''}`} onClick={()=>{setProjectType(opt); setStep(3)}}>{opt}</button>
                    ))}
                  </div>
                </div>
              )}

              {step===3 && category==='engineering' && (
                <div className="space-y-4">
                  <div>
                    <label className="subtle">Description</label>
                    <textarea className="input mt-1 min-h-[100px]" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Write about your project..." />
                  </div>
                  <div>
                    <label className="subtle">Bidding deadline</label>
                    <input type="datetime-local" className="input mt-1" value={biddingDeadline} onChange={e=>setBiddingDeadline(e.target.value)} />
                  </div>
                  <div>
                    <label className="subtle">Project location (optional)</label>
                    <div className="flex items-center gap-2 mt-1">
                      <button type="button" className="btn btn-ghost" onClick={()=>setLocOpen(true)}>{loc? 'Edit location' : 'Add location'}</button>
                      {loc && <span className="text-xs text-gray-600">Lat {Number(loc.lat).toFixed(4)}, Lng {Number(loc.lng).toFixed(4)}</span>}
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={confirm} disabled={loading}>{loading? 'Posting...' : 'Confirm'}</button>
                </div>
              )}
            </div>
            {locOpen && (
              <div className="fixed inset-0 z-50 flex">
                <div className="flex-1 bg-black/30" onClick={()=>setLocOpen(false)} />
                <div className="w-full max-w-lg h-full bg-white card p-6 overflow-y-auto">
                  <div className="flex items-center justify-between mb-2">
                    <div className="section-title">Set project location</div>
                    <button className="btn btn-ghost" onClick={()=>setLocOpen(false)}>Close</button>
                  </div>
                  <div className="space-y-3">
                    <MapPicker value={loc} onChange={setLoc} height={360} />
                    {loc && <div className="text-xs text-gray-700">Lat {Number(loc.lat).toFixed(6)}, Lng {Number(loc.lng).toFixed(6)}</div>}
                    <div className="flex gap-2 justify-end">
                      <button className="btn btn-ghost" onClick={()=>setLoc(null)}>Clear</button>
                      <button className="btn btn-primary" onClick={()=>setLocOpen(false)}>Done</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
  
  function ProviderPanel(){
    const [content, setContent] = useState('')
    const [file, setFile] = useState(null)
    const [loading, setLoading] = useState(false)
    async function onSubmit(e){
      e.preventDefault()
      setLoading(true)
      await createPost({ content, file })
      setContent('')
      setFile(null)
      setLoading(false)
    }
    return (
      <div className="space-y-4">
        <div className="card p-6 space-y-3">
          <div className="section-title">Create a status</div>
          <form onSubmit={onSubmit} className="space-y-3">
            <textarea className="input min-h-[80px]" placeholder="What's new?" value={content} onChange={e=>setContent(e.target.value)} />
            <input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)} />
            <button className="btn btn-primary" disabled={loading}>{loading? 'Posting...' : 'Post (Pending for approval)'}</button>
          </form>
        </div>
        <div className="card p-6">
          <div className="section-title mb-3">My posts</div>
          <div className="space-y-3">
            {myPosts.map(p=> (
              <div key={p._id} className="border rounded p-3 space-y-2">
                <div className="text-sm text-gray-600">Status: <span className={p.status==='approved' ? 'text-green-700' : 'text-yellow-700'}>{p.status}</span></div>
                {p.content && <div>{p.content}</div>}
                {p.imageUrl && <img src={`${API_BASE}${p.imageUrl}`} alt="post" className="max-h-64 rounded" />}
              </div>
            ))}
            {myPosts.length===0 && <div className="subtle">No posts yet.</div>}
          </div>
        </div>
      </div>
    )
  }

  function AdminPanel(){
    return (
      <div className="card p-6">
        <div className="section-title mb-3">Pending posts</div>
        <div className="space-y-3">
          {pendingPosts.map(p => (
            <div key={p._id} className="border rounded p-3 space-y-2">
              <div className="text-sm text-gray-600">By: {p.authorUsername}</div>
              {p.content && <div>{p.content}</div>}
              {p.imageUrl && <img src={`${API_BASE}${p.imageUrl}`} alt="post" className="max-h-64 rounded" />}
              <button className="btn btn-primary" onClick={()=>approvePost(p._id)}>Approve</button>
            </div>
          ))}
          {pendingPosts.length===0 && <div className="subtle">No pending posts.</div>}
        </div>
      </div>
    )
  }

  function FeedPanel(){
    const [locOpen, setLocOpen] = useState(false)
    const [locView, setLocView] = useState(null)
    return (
      <div className="card p-6">
        <div className="section-title mb-3">Feed</div>
        <div className="space-y-3">
          {feed.map(p => (
            <div key={p._id} className="border rounded p-3 space-y-2">
              <div className="text-sm text-gray-600 flex items-center gap-2">
                <span className="flex items-center gap-1">By: {p.authorUsername}{verifiedMap[p.authorUsername] && <span title="Verified" className="text-green-600">✔︎</span>}</span>
                <span className="text-green-700 font-medium">Approved</span>
              </div>
              {p.content && <div>{p.content}</div>}
              {p.imageUrl && <img src={`${API_BASE}${p.imageUrl}`} alt="post" className="max-h-64 rounded" />}
              {p.location && (
                <div>
                  <button className="btn btn-ghost" onClick={()=>{ setLocView(p.location); setLocOpen(true) }}>View location</button>
                </div>
              )}
            </div>
          ))}
          {feed.length===0 && <div className="subtle">No posts yet.</div>}
        </div>
        {locOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setLocOpen(false)} />
            <div className="w-full max-w-lg h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Project location</div>
                <button className="btn btn-ghost" onClick={()=>setLocOpen(false)}>Close</button>
              </div>
              <div className="space-y-3">
                <MapPicker readOnly value={locView} height={360} />
                {locView && <div className="text-xs text-gray-700">Lat {Number(locView.lat).toFixed(6)}, Lng {Number(locView.lng).toFixed(6)}</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
  
  function ProjectsFeedPanel({ reloadKey }){
    const [chatProjectId, setChatProjectId] = useState(null)
    // Filters
    const [cat, setCat] = useState('') // architecture | engineering | ''
    // Architecture
    const [archSub, setArchSub] = useState('') // exterior | interior
    const [archTier, setArchTier] = useState('') // regular | luxuries | normal
    // Engineering
    const [engType, setEngType] = useState('') // complete house design | partial house design
    const [engSubtype, setEngSubtype] = useState('') // one storied building | duplex/triplex | multi storied building
    // Local projects list
    const [projects, setProjects] = useState([])
    const [acceptedIds, setAcceptedIds] = useState(new Set())
    const [lastSeen, setLastSeen] = useState({}) // { projectId: isoString }
    const [lastServer, setLastServer] = useState({}) // { projectId: isoString }
    const feedInFlight = React.useRef(false)
    const acceptedInFlight = React.useRef(false)
    const mountedRef = React.useRef(false)
    const requestIdRef = React.useRef(0)
    const [feedMsg, setFeedMsg] = useState('')
    const [feedLoading, setFeedLoading] = useState(false)
    // Local verified map to avoid triggering parent re-renders
    const [projVerifiedMap, setProjVerifiedMap] = useState({})
    // Throttle guards
    const lastParamsRef = React.useRef('')
    const lastFetchedAtRef = React.useRef(0)
    const lastReloadKeyRef = React.useRef(reloadKey)
    const acceptedIdsLastFetchAtRef = React.useRef(0)

    // Kanban boards
    const [provBoard, setProvBoard] = useState({ todo: [], inProcess: [], done: [] })
    const [clientBoard, setClientBoard] = useState({ todo: [], inProcess: [], done: [] })
    const [expectedModal, setExpectedModal] = useState({ open: false, projectId: null, value: '' })
    const [expectedMsg, setExpectedMsg] = useState('')
    const [locOpen, setLocOpen] = useState(false)
    const [locView, setLocView] = useState(null)
    async function loadProvBoard(){
      try{
        const r = await fetch(`${API_BASE}/api/projects/kanban/provider`, { headers: { Authorization: `Bearer ${token}` }})
        if (r.ok){ setProvBoard(await r.json()) }
      }catch{}
    }
    async function loadClientBoard(){
      try{
        const r = await fetch(`${API_BASE}/api/projects/kanban/client`, { headers: { Authorization: `Bearer ${token}` }})
        if (r.ok){ setClientBoard(await r.json()) }
      }catch{}
    }
    useEffect(()=>{ if (me?.role==='provider') loadProvBoard(); if (me?.role==='client') loadClientBoard(); }, [me, token, reloadKey])
    async function provAccept(projectId){ await fetch(`${API_BASE}/api/projects/${projectId}/kanban/accept`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }}); loadProvBoard() }
    function openExpectedModal(projectId){
      // prefill with current datetime-local string
      const now = new Date()
      const pad = (n)=> String(n).padStart(2,'0')
      const local = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
      setExpectedMsg('')
      setExpectedModal({ open: true, projectId, value: local })
    }
    async function saveExpected(){
      const { projectId, value } = expectedModal
      if (!projectId || !value) { setExpectedModal({ open:false, projectId:null, value:'' }); return }
      setExpectedMsg('')
      const iso = new Date(value)
      if (isNaN(iso.getTime())){ setExpectedMsg('Please enter a valid date/time'); return }
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/kanban/expected-deadline`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ expectedDeadline: iso.toISOString() })
      })
      if (res.ok){
        setExpectedModal({ open:false, projectId:null, value:'' })
        loadProvBoard()
      } else {
        let d = {}
        try{ d = await res.json() }catch{}
        setExpectedMsg(d.message || 'Failed to set expected deadline')
      }
    }
    async function provDone(projectId){ await fetch(`${API_BASE}/api/projects/${projectId}/kanban/done`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }}); loadProvBoard() }
    async function provUpload(projectId, files){ const fd=new FormData(); [...files].forEach(f=>fd.append('images', f)); await fetch(`${API_BASE}/api/projects/${projectId}/kanban/done/uploads`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body: fd }); loadProvBoard() }

    function sameSet(a, b){
      if (a.size !== b.size) return false
      for (const v of a){ if (!b.has(v)) return false }
      return true
    }

    async function fetchAcceptedIds(){
      if (!me || !token) return
      if (acceptedInFlight.current) return
      const now = Date.now()
      if (now - acceptedIdsLastFetchAtRef.current < 3000) return
      acceptedIdsLastFetchAtRef.current = now
      acceptedInFlight.current = true
      try{
        if (me.role === 'provider'){
          const r = await fetch(`${API_BASE}/api/projects/my/accepted-ids`, { headers: { Authorization: `Bearer ${token}` } })
          if (r.ok){ const ids = await r.json(); const next = new Set(ids.map(String)); if (!sameSet(next, acceptedIds)) setAcceptedIds(next) }
        } else if (me.role === 'client'){
          const r = await fetch(`${API_BASE}/api/projects/my/with-accepted-ids`, { headers: { Authorization: `Bearer ${token}` } })
          if (r.ok){ const ids = await r.json(); const next = new Set(ids.map(String)); if (!sameSet(next, acceptedIds)) setAcceptedIds(next) }
        }
      }catch{}
      acceptedInFlight.current = false
    }

    async function fetchLastServer(ids){
      if (!me || !token || !ids || ids.size===0) { setLastServer({}); return }
      const q = encodeURIComponent(Array.from(ids).join(','))
      try{
        const r = await fetch(`${API_BASE}/api/projects/chat/last?ids=${q}`, { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok){ const data = await r.json(); setLastServer(data) }
      }catch{}
    }

    async function load(){
      if (feedInFlight.current) return
      // Build params string for throttling
      const params = new URLSearchParams()
      if (cat) params.set('category', cat)
      if (cat === 'architecture'){
        if (archSub) params.set('subcategory', archSub)
        if (archTier) params.set('tier', archTier)
      }
      if (cat === 'engineering'){
        if (engType) params.set('subcategory', engType)
        if (engSubtype) params.set('projectType', engSubtype)
      }
      params.set('limit','50')
      const paramsStr = params.toString()
      const now = Date.now()
      const reloadChanged = reloadKey !== lastReloadKeyRef.current
      if (!reloadChanged && paramsStr === lastParamsRef.current && (now - lastFetchedAtRef.current) < 3000){
        return
      }
      feedInFlight.current = true
      setFeedMsg(''); setFeedLoading(true)
      lastParamsRef.current = paramsStr
      lastFetchedAtRef.current = now
      lastReloadKeyRef.current = reloadKey
      const reqId = ++requestIdRef.current
      try{
        const url = `${API_BASE}/api/projects/feed${paramsStr? ('?'+paramsStr) : ''}`
        const res = await fetch(url)
        if (res.ok && mountedRef.current && reqId === requestIdRef.current){
          const data = await res.json()
          setProjects(data)
          const names = Array.from(new Set(data.map(x=>x.authorUsername)))
          if (names.length){
            try{
              const q = encodeURIComponent(names.join(','))
              const vr = await fetch(`${API_BASE}/api/verification/verified?usernames=${q}`)
              if (vr.ok && mountedRef.current && reqId === requestIdRef.current){ const map = await vr.json(); setProjVerifiedMap(map) }
            }catch{}
          } else {
            setProjVerifiedMap({})
          }
        }
        else { setFeedMsg('Failed to load projects') }
      }catch{ setFeedMsg('Failed to load projects') }
      setFeedLoading(false)
      feedInFlight.current = false
    }

    useEffect(()=>{ mountedRef.current = true; load(); return ()=>{ mountedRef.current = false } }, [])
    useEffect(()=>{ load() }, [reloadKey])
    useEffect(()=>{ fetchAcceptedIds() }, [me, token])
    useEffect(()=>{ fetchLastServer(acceptedIds) }, [acceptedIds])
    function BidBox({ projectId, onSent }){
      const [open, setOpen] = useState(false)
      const [text, setText] = useState('')
      const [loading, setLoading] = useState(false)
      const [msg, setMsg] = useState('')
      async function send(){
        if (!text.trim()) return
        setLoading(true); setMsg('')
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/bids`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text })
        })
        setLoading(false)
        if (res.ok){ setText(''); setOpen(false); setMsg(''); onSent?.() } else { setMsg('Failed to send bid') }
      }
      if (!me || me.role !== 'provider') return null
      return (
        <div className="mt-2">
          {!open ? (
            <button className="btn btn-ghost" onClick={()=>setOpen(true)}>Bid</button>
          ) : (
            <div className="space-y-2">
              <textarea className="input min-h-[80px]" placeholder="Write your bid..." value={text} onChange={e=>setText(e.target.value)} />
              {msg && <div className="text-sm text-red-600">{msg}</div>}
              <div className="flex gap-2">
                <button className="btn btn-primary" disabled={loading || !text.trim()} onClick={send}>{loading? 'Sending...' : 'Send'}</button>
                <button className="btn btn-ghost" onClick={()=>{ setOpen(false); setText(''); setMsg('') }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )
    }

    function BidsModal({ project, onOpenChat, onAccepted }){
      const [open, setOpen] = useState(false)
      const [items, setItems] = useState([])
      const [loading, setLoading] = useState(false)
      const [msg, setMsg] = useState('')
      async function load(){
        setLoading(true); setMsg('')
        const res = await fetch(`${API_BASE}/api/projects/${project._id}/bids`, { headers: { Authorization: `Bearer ${token}` } })
        setLoading(false)
        if (res.ok){ const d = await res.json(); setItems(d) } else { setMsg('Failed to load bids') }
      }
      async function accept(bidId){
        setMsg('')
        const res = await fetch(`${API_BASE}/api/projects/${project._id}/bids/${bidId}/accept`, { method:'POST', headers: { Authorization: `Bearer ${token}` } })
        if (res.ok){ await load(); setMsg('Bid accepted'); onAccepted?.() } else { setMsg('Failed to accept') }
      }
      function openPanel(){ setOpen(true); load() }
      if (!me || me.role !== 'client' || me.username !== project.authorUsername) return null
      return (
        <>
          <button type="button" className="btn btn-ghost" onClick={openPanel}>Post BID</button>
          {open && (
            <div className="fixed inset-0 z-50 flex">
              <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
              <div className="w-full max-w-md h-full bg-white card p-6 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="section-title">Bids for your project</div>
                  <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
                </div>
                {msg && <div className="text-sm text-gray-700">{msg}</div>}
                {loading ? (<div className="subtle">Loading...</div>) : (
                  <div className="space-y-3">
                    {items.map(b => (
                      <div key={b._id} className="border rounded p-3 space-y-2">
                        <div className="text-sm text-gray-700 flex items-center gap-2">
                          <span className="font-medium">{b.username}</span>
                          {b.accepted && <span className="text-green-600">✔︎ Accepted</span>}
                        </div>
                        <div>{b.text}</div>
                        <div className="flex justify-end gap-2">
                          {!b.accepted && (
                            <button className="btn btn-primary" onClick={()=>accept(b._id)}>Accept</button>
                          )}
                          {b.accepted && (
                            <button className="btn btn-ghost" title="Open chat" onClick={()=>onOpenChat?.(project._id)}>💬 Message</button>
                          )}
                        </div>
                      </div>
                    ))}
                    {items.length===0 && <div className="subtle">No bids yet.</div>}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )
    }

    return (
      <div className="card p-6">
        <div className="section-title mb-3">Projects</div>
        {me?.role==='provider' && (
          <div className="mb-6 border rounded p-3">
            <div className="font-semibold mb-2">My Board (Provider)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="subtle mb-1">TODO</div>
                <div className="space-y-2">
                  {provBoard.todo.map(it => (
                    <div key={it.projectId} className="border rounded p-2 text-sm space-y-1">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="flex gap-2">
                        <button className="btn btn-primary btn-xs" onClick={()=>provAccept(it.projectId)}>Accept</button>
                        {it.location && (
                          <button className="btn btn-ghost btn-xs" onClick={()=>{ setLocView(it.location); setLocOpen(true) }}>View location</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {provBoard.todo.length===0 && <div className="subtle">No items</div>}
                </div>
              </div>
              <div>
                <div className="subtle mb-1">In process</div>
                <div className="space-y-2">
                  {provBoard.inProcess.map(it => (
                    <div key={it.projectId} className="border rounded p-2 text-sm space-y-1">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="text-xs">Expected: {it.expectedDeadline ? new Date(it.expectedDeadline).toLocaleString() : '—'}</div>
                      <div className="flex gap-2">
                        <button className="btn btn-ghost btn-xs" onClick={()=>openExpectedModal(it.projectId)}>Set expected</button>
                        <button className="btn btn-primary btn-xs" onClick={()=>provDone(it.projectId)}>Done</button>
                        {it.location && (
                          <button className="btn btn-ghost btn-xs" onClick={()=>{ setLocView(it.location); setLocOpen(true) }}>View location</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {provBoard.inProcess.length===0 && <div className="subtle">No items</div>}
                </div>
              </div>
              <div>
                <div className="subtle mb-1">Done</div>
                <div className="space-y-2">
                  {provBoard.done.map(it => (
                    <div key={it.projectId} className="border rounded p-2 text-sm space-y-1">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="text-xs">Uploads: {(it.uploads||[]).length}</div>
                      {it.location && (
                        <button className="btn btn-ghost btn-xs" onClick={()=>{ setLocView(it.location); setLocOpen(true) }}>View location</button>
                      )}
                      <label className="btn btn-ghost btn-xs inline-flex items-center gap-2">
                        <input type="file" multiple className="hidden" onChange={e=>{ if(e.target.files?.length){ provUpload(it.projectId, e.target.files) } }} />
                        Upload
                      </label>
                    </div>
                  ))}
                  {provBoard.done.length===0 && <div className="subtle">No items</div>}
                </div>
              </div>
            </div>
          </div>
        )}
        {me?.role==='client' && (
          <div className="mb-6 border rounded p-3">
            <div className="font-semibold mb-2">My Projects (Client)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="subtle mb-1">TODO</div>
                <div className="space-y-2">
                  {clientBoard.todo.map(it => (
                    <div key={it.projectId} className="border rounded p-2 text-sm">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="text-xs">Accepted: {it.clientAcceptedAt ? new Date(it.clientAcceptedAt).toLocaleString() : '—'}</div>
                      {it.location && <div className="mt-1"><button className="btn btn-ghost btn-xs" onClick={()=>{ setLocView(it.location); setLocOpen(true) }}>View location</button></div>}
                    </div>
                  ))}
                  {clientBoard.todo.length===0 && <div className="subtle">No items</div>}
                </div>
              </div>
              <div>
                <div className="subtle mb-1">In process</div>
                <div className="space-y-2">
                  {clientBoard.inProcess.map(it => (
                    <div key={it.projectId} className="border rounded p-2 text-sm">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="text-xs">Expected: {it.expectedDeadline ? new Date(it.expectedDeadline).toLocaleString() : '—'}</div>
                      {it.location && <div className="mt-1"><button className="btn btn-ghost btn-xs" onClick={()=>{ setLocView(it.location); setLocOpen(true) }}>View location</button></div>}
                    </div>
                  ))}
                  {clientBoard.inProcess.length===0 && <div className="subtle">No items</div>}
                </div>
              </div>
              <div>
                <div className="subtle mb-1">Done</div>
                <div className="space-y-2">
                  {clientBoard.done.map(it => (
                    <div key={it.projectId} className="border rounded p-2 text-sm">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="grid grid-cols-3 gap-1 mt-1">
                        {(it.uploads||[]).map((u,idx)=>(<img key={idx} src={`${API_BASE}${u}`} alt="upload" className="h-16 w-full object-cover rounded" />))}
                      </div>
                      {it.location && <div className="mt-1"><button className="btn btn-ghost btn-xs" onClick={()=>{ setLocView(it.location); setLocOpen(true) }}>View location</button></div>}
                    </div>
                  ))}
                  {clientBoard.done.length===0 && <div className="subtle">No items</div>}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="mb-4 border rounded p-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <label className="inline-flex items-center gap-2">
              <span className="subtle">Type</span>
              <select className="input" value={cat} onChange={e=>{ setCat(e.target.value); setArchSub(''); setArchTier(''); setEngType(''); setEngSubtype('') }}>
                <option value="">All</option>
                <option value="architecture">Architecture</option>
                <option value="engineering">Engineering</option>
              </select>
            </label>
            {cat==='architecture' && (
              <>
                <label className="inline-flex items-center gap-2">
                  <span className="subtle">Sub</span>
                  <select className="input" value={archSub} onChange={e=>setArchSub(e.target.value)}>
                    <option value="">Any</option>
                    <option value="Exterior design">Exterior design</option>
                    <option value="Interior design">Interior design</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-2">
                  <span className="subtle">Tier</span>
                  <select className="input" value={archTier} onChange={e=>setArchTier(e.target.value)}>
                    <option value="">Any</option>
                    <option value="regular">Regular</option>
                    <option value="luxuries">Luxury</option>
                    <option value="normal">Normal</option>
                  </select>
                </label>
              </>
            )}
            {cat==='engineering' && (
              <>
                <label className="inline-flex items-center gap-2">
                  <span className="subtle">Design</span>
                  <select className="input" value={engType} onChange={e=>setEngType(e.target.value)}>
                    <option value="">Any</option>
                    <option value="complete house design">Complete house design</option>
                    <option value="partial house design">Partial house design</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-2">
                  <span className="subtle">Building</span>
                  <select className="input" value={engSubtype} onChange={e=>setEngSubtype(e.target.value)}>
                    <option value="">Any</option>
                    <option value="one storied building">One storied building</option>
                    <option value="duplex/triplex">Duplex/Triplex</option>
                    <option value="multi storied building">Multi storied building</option>
                  </select>
                </label>
              </>
            )}
            <div className="ml-auto">
              <button type="button" className="btn btn-primary" disabled={feedLoading} onClick={load}>{feedLoading? 'Loading...' : 'Apply'}</button>
            </div>
          </div>
        </div>
        {feedMsg && <div className="text-sm text-red-600 mb-2">{feedMsg}</div>}
        <div className="space-y-3">
          {projects.map(p => (
            <div key={p._id} className="border rounded p-3 space-y-2">
              <div className="text-sm text-gray-600 flex flex-wrap items-center gap-2">
                <span className="font-medium flex items-center gap-1">{p.authorUsername}{projVerifiedMap[p.authorUsername] && <span title="Verified" className="text-green-600">✔︎</span>}</span>
                <span>•</span>
                <span className="capitalize">{p.category}</span>
                {p.subcategory && <><span>•</span><span>{p.subcategory}</span></>}
                {p.tier && <><span>•</span><span className="capitalize">{p.tier}</span></>}
                {p.projectType && <><span>•</span><span>{p.projectType}</span></>}
                <span className="ml-auto" />
                {acceptedIds.has(String(p._id)) && (
                  <button className="btn btn-ghost relative" title="Open chat" onClick={()=>{ setChatProjectId(p._id); setLastSeen(prev=>({ ...prev, [String(p._id)]: new Date().toISOString() })) }}>
                    💬 Message
                    {(() => {
                      const pid = String(p._id)
                      const serverTs = lastServer[pid]
                      const seenTs = lastSeen[pid]
                      if (serverTs && (!seenTs || new Date(serverTs) > new Date(seenTs))) {
                        return <span className="absolute -top-1 -right-1 inline-flex h-2 w-2 rounded-full bg-red-600" />
                      }
                      return null
                    })()}
                  </button>
                )}
              </div>
              {p.biddingDeadline && (
                <div className="text-xs text-gray-600">Bidding deadline: {new Date(p.biddingDeadline).toLocaleString()}</div>
              )}
              <div className="flex items-center gap-2">
                {acceptedIds.has(String(p._id)) && (
                  <span className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">✔︎ Accepted</span>
                )}
                {p.biddingDeadline && Date.parse(p.biddingDeadline) < Date.now() && (
                  <span className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-700 border">Expired</span>
                )}
              </div>
              {p.description && <div>{p.description}</div>}
              {p.imageUrl && <img src={`${API_BASE}${p.imageUrl}`} alt="project" className="max-h-64 rounded" />}
              {p.location && (
                <div>
                  <button className="btn btn-ghost" onClick={()=>{ setLocView(p.location); setLocOpen(true) }}>View location</button>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  {me?.role==='provider' && !(p.biddingDeadline && Date.parse(p.biddingDeadline) < Date.now()) && <BidBox projectId={p._id} />}
                </div>
                <div>
                  <BidsModal project={p} onOpenChat={(pid)=>setChatProjectId(pid)} onAccepted={()=>{ fetchAcceptedIds(); load(); }} />
                </div>
              </div>
            </div>
          ))}
          {projects.length===0 && <div className="subtle">No projects yet.</div>}
        </div>
        {chatProjectId && <ChatDrawer projectId={chatProjectId} onClose={()=>setChatProjectId(null)} />}
        {locOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setLocOpen(false)} />
            <div className="w-full max-w-lg h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Project location</div>
                <button className="btn btn-ghost" onClick={()=>setLocOpen(false)}>Close</button>
              </div>
              <div className="space-y-3">
                <MapPicker readOnly value={locView} height={360} />
                {locView && <div className="text-xs text-gray-700">Lat {Number(locView.lat).toFixed(6)}, Lng {Number(locView.lng).toFixed(6)}</div>}
              </div>
            </div>
          </div>
        )}
        {expectedModal.open && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setExpectedModal({ open:false, projectId:null, value:'' })} />
            <div className="w-full max-w-sm h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Set expected deadline</div>
                <button className="btn btn-ghost" onClick={()=>setExpectedModal({ open:false, projectId:null, value:'' })}>Close</button>
              </div>
              <div className="space-y-3">
                <input type="datetime-local" className="input w-full" value={expectedModal.value} onChange={e=>setExpectedModal(s=>({ ...s, value: e.target.value }))} />
                {expectedMsg && <div className="text-sm text-red-600">{expectedMsg}</div>}
                <div className="flex gap-2 justify-end">
                  <button className="btn btn-ghost" onClick={()=>setExpectedModal({ open:false, projectId:null, value:'' })}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveExpected} disabled={!expectedModal.value}>Save</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
  return (
    <ErrorBoundary>
    <div className="relative min-h-screen">
      {/* Full-screen animated background */}
      <div className="fixed inset-0 -z-10">
        <LightPillar
          topColor="#5227FF"
          bottomColor="#FF9FFC"
          intensity={1.0}
          rotationSpeed={0.3}
          glowAmount={0.005}
          pillarWidth={3.0}
          pillarHeight={0.4}
          noiseIntensity={0.5}
          pillarRotation={0}
          interactive={false}
          mixBlendMode="normal"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/50 to-white/80" />
      </div>

      <header className="mx-auto max-w-5xl px-4 pt-8 pb-4 flex items-center gap-4">
        <div className="flex items-center gap-3">
          {isAuthed && me && (me.role === 'client' || me.role === 'provider' || me.role === 'admin') && (
            <>
              <button className={`btn ${activeTab==='feed' ? 'btn-primary' : 'btn-ghost'}`} onClick={()=>setActiveTab('feed')}>Feed</button>
              <button className={`btn ${activeTab==='projects' ? 'btn-primary' : 'btn-ghost'}`} onClick={()=>setActiveTab('projects')}>Projects</button>
            </>
          )}
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">ArcEngg</h1>
          <p className="subtle mt-1">Choose a role to continue</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isAuthed && (
            <span className="text-xs rounded-full px-2 py-1 bg-gray-100 text-gray-700 border">
              Signed in{(me?.username||sessionUser?.username) ? ` as ${me?.username||sessionUser?.username}` : ''}
              {me?.role && ` (${me.role})`}
            </span>
          )}
          {isAuthed && me && me.role === 'admin' && (<><AdminVerificationButton /><AdminSuspensionsButton /></>)}
          {isAuthed && me && me.role === 'admin' && (
            <button className="btn btn-ghost" onClick={logout}>Log out</button>
          )}
          {isAuthed && me && me.role === 'client' && <ProjectRequestDrawer />}
          {isAuthed && me && (me.role === 'client' || me.role === 'provider') && <UserSearchButton me={me} token={token} />}
          {isAuthed && me && me.role === 'provider' && <AcceptedBidsButton />}
          {isAuthed && me && (me.role === 'client' || me.role === 'provider') && (
            <>
              <CalendarConnectButton apiBase={API_BASE} token={token} />
              <ProfilePanel />
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 space-y-6">
        {runtimeError && (
          <div className="card p-3 text-xs text-red-700 bg-red-50 border border-red-200">
            <div className="font-semibold">Runtime error</div>
            <div className="whitespace-pre-wrap break-all">{runtimeError}</div>
          </div>
        )}
        {!isAuthed && <RoleSelector selected={selected} onSelect={setSelected} />}

        {!isAuthed && selected === 'Admin' && (
          <AdminLogin onAuth={handleAuth} />
        )}
        {!isAuthed && selected === 'Client' && (
          <UserAuth roleKey="client" onAuth={handleAuth} />
        )}
        {!isAuthed && selected === 'Service provider' && (
          <UserAuth roleKey="provider" onAuth={handleAuth} />
        )}

        {isAuthed && me && me.role === 'provider' && activeTab !== 'projects' && (
          <ProviderPanel />
        )}
        {isAuthed && me && me.role === 'admin' && activeTab !== 'projects' && (
          <AdminPanel />
        )}

        {isAuthed && !me && (
          <div className="card p-6 subtle">Loading your profile...</div>
        )}

        {isAuthed && me && (
          activeTab==='projects' ? <ProjectsFeedPanel reloadKey={projectsReloadKey} /> : <FeedPanel />
        )}
      </main>
      <AssistantWidget />
    </div>
    </ErrorBoundary>
  )
}
