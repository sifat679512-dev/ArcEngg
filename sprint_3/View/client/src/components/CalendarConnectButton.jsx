import { useState } from 'react'

export default function CalendarConnectButton({ apiBase, token }){
  const [loading, setLoading] = useState(false)
  async function connect(){
    try{
      setLoading(true)
      const r = await fetch(`${apiBase}/api/calendar/auth-url`)
      if (!r.ok){ setLoading(false); return }
      const { url } = await r.json()
      window.location.href = url
    }catch{
      // ignore
    } finally { setLoading(false) }
  }
  if (!token) return null
  return (
    <button className="btn btn-ghost" onClick={connect} disabled={loading} title="Connect Google Calendar">
      {loading ? 'Connecting...' : 'Connect Calendar'}
    </button>
  )
}
