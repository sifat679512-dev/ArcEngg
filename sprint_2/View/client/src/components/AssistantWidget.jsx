import React from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5002'

export default function AssistantWidget(){
  const [open, setOpen] = React.useState(false)
  const [input, setInput] = React.useState('')
  const [messages, setMessages] = React.useState([
    { role: 'bot', text: 'Hi! I\'m your assistant. Ask me about your projects, accepted bids, Kanban status, deadlines, or how features work. Type "help" for tips.' }
  ])
  const [busy, setBusy] = React.useState(false)

  const tokenRef = React.useRef(null)
  const [me, setMe] = React.useState(null)

  React.useEffect(()=>{
    try{ tokenRef.current = localStorage.getItem('token') || null }catch{}
    // Load user info if available
    if (tokenRef.current){
      fetch(`${API_BASE}/api/user/me`, { headers: { Authorization: `Bearer ${tokenRef.current}` } })
        .then(r=> r.ok ? r.json() : null)
        .then(d=> d && setMe(d))
        .catch(()=>{})
    }
  }, [])

  function push(role, text){ setMessages(m=>[...m, { role, text }]) }

  async function respond(query){
    const q = query.trim().toLowerCase()
    if (!q) return

    // Help
    if (q === 'help' || q.includes('what can you do')){
      return push('bot', [
        'I can help with:',
        '- my projects — show your Kanban counts',
        me?.role === 'provider' ? '- accepted bids — count your accepted bids' : null,
        '- deadline — how bidding deadlines work',
        '- location — how to add/view project map pins',
        '- features — summary of key app features'
      ].filter(Boolean).join('\n'))
    }

    // Features/how-to
    if (q.includes('feature') || q.includes('how') || q.includes('guide')){
      return push('bot', [
        'Key features:',
        '- Post a project (client): add description, optional image, bidding deadline, and optional map pin.',
        '- Providers place bids before the deadline.',
        '- Two-step accept: initial accept enables chat; final accept inside chat moves project to TODO Kanban.',
        '- Kanban (TODO/In Process/Done) for both client and provider views.',
        '- View location: use the “View location” button on cards to see the map pin.'
      ].join('\n'))
    }

    // Deadline info
    if (q.includes('deadline')){
      return push('bot', 'Clients can set a bidding deadline when posting a project. Providers can only bid before the deadline. Clients can also set an expected finishing date from the Projects panel.')
    }

    // Location info
    if (q.includes('location') || q.includes('map')){
      return push('bot', 'Clients can optionally add a map pin when creating a project. Everyone can view the pin via the “View location” buttons on project cards, Accepted BID items, and Kanban boards.')
    }

    // My projects / Kanban
    if (q.includes('project')){
      if (!tokenRef.current){ return push('bot', 'Please sign in to check your projects.') }
      setBusy(true)
      try{
        const role = me?.role
        if (role !== 'client' && role !== 'provider'){
          push('bot', 'I can show project status for client or provider accounts only.')
        } else {
          const url = role === 'provider' ? `${API_BASE}/api/projects/kanban/provider` : `${API_BASE}/api/projects/kanban/client`
          const r = await fetch(url, { headers: { Authorization: `Bearer ${tokenRef.current}` } })
          if (r.ok){
            const d = await r.json()
            const todo = d.todo?.length || 0
            const inP = d.inProcess?.length || 0
            const done = d.done?.length || 0
            push('bot', `Your Kanban: TODO ${todo}, In Process ${inP}, Done ${done}.`)
          } else {
            push('bot', 'Sorry, I could not load your Kanban right now.')
          }
        }
      }catch{
        push('bot', 'Sorry, something went wrong while loading your projects.')
      }
      setBusy(false)
      return
    }

    // Accepted bids (provider)
    if (q.includes('accepted')){
      if (me?.role !== 'provider') return push('bot', 'Accepted bids are available for provider accounts.')
      if (!tokenRef.current){ return push('bot', 'Please sign in to check your accepted bids.') }
      setBusy(true)
      try{
        const r = await fetch(`${API_BASE}/api/projects/my/accepted-bids`, { headers: { Authorization: `Bearer ${tokenRef.current}` } })
        if (r.ok){
          const d = await r.json()
          push('bot', `You have ${Array.isArray(d) ? d.length : 0} accepted bid(s).`)
        } else {
          push('bot', 'I could not load your accepted bids right now.')
        }
      }catch{
        push('bot', 'Sorry, something went wrong while loading your accepted bids.')
      }
      setBusy(false)
      return
    }

    // Fallback
    push('bot', 'I\'m not sure about that. Try: "my projects", "accepted bids" (provider), "deadline", "location", or "features".')
  }

  async function onSubmit(e){
    e.preventDefault()
    if (!input.trim()) return
    const text = input
    setInput('')
    push('user', text)
    await respond(text)
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50">
        {open && (
          <div className="w-80 h-96 bg-white card shadow-lg border flex flex-col overflow-hidden mb-2">
            <div className="p-3 border-b flex items-center justify-between">
              <div className="font-semibold">Assistant</div>
              <button className="btn btn-ghost" onClick={()=>setOpen(false)}>×</button>
            </div>
            <div className="flex-1 p-3 space-y-2 overflow-y-auto">
              {messages.map((m, i)=> (
                <div key={i} className={m.role==='bot' ? 'text-sm' : 'text-sm text-right'}>
                  <span className={m.role==='bot' ? 'inline-block bg-gray-100 rounded px-2 py-1' : 'inline-block bg-blue-600 text-white rounded px-2 py-1'}>
                    {m.text}
                  </span>
                </div>
              ))}
              {busy && <div className="text-xs text-gray-500">Thinking…</div>}
            </div>
            <form onSubmit={onSubmit} className="p-2 border-t flex items-center gap-2">
              <input
                className="input flex-1"
                placeholder="Type a message…"
                value={input}
                onChange={e=>setInput(e.target.value)}
                disabled={busy}
              />
              <button className="btn" disabled={busy || !input.trim()} type="submit">Send</button>
            </form>
          </div>
        )}
        <button className="btn btn-primary rounded-full w-12 h-12 shadow-lg" onClick={()=>setOpen(o=>!o)} aria-label="Assistant">
          {open ? '–' : 'AI'}
        </button>
      </div>
    </>
  )
}
