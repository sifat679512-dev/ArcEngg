import React, { useEffect, useRef, useState } from 'react'

function ensureLeafletLoaded(){
  return new Promise((resolve)=>{
    if (window.L) return resolve()
    const cssId = 'leaflet-css'
    if (!document.getElementById(cssId)){
      const link = document.createElement('link')
      link.id = cssId
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    const jsId = 'leaflet-js'
    if (document.getElementById(jsId)){
      const check = ()=>{ if (window.L) resolve() ; else setTimeout(check, 50) }
      return check()
    }
    const script = document.createElement('script')
    script.id = jsId
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = ()=> resolve()
    document.body.appendChild(script)
  })
}

export default function MapPicker({ value, onChange, readOnly=false, height=300 }){
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(()=>{ let mounted = true
    ensureLeafletLoaded().then(()=>{ if (!mounted) return; setReady(true) })
    return ()=>{ mounted = false }
  },[])

  useEffect(()=>{
    if (!ready) return
    if (!containerRef.current) return
    const L = window.L
    if (!mapRef.current){
      const center = value?.lat && value?.lng ? [value.lat, value.lng] : [23.7808875, 90.2792371]
      const map = L.map(containerRef.current).setView(center, value?.lat? 14 : 6)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map)
      mapRef.current = map
      if (!readOnly){
        map.on('click', (e)=>{
          const latlng = e.latlng
          place(latlng.lat, latlng.lng)
        })
      }
    }
    if (value?.lat && value?.lng){ place(value.lat, value.lng, true) }
    // Recenter when value changes in readOnly mode as well
    // eslint-disable-next-line
  }, [ready, value?.lat, value?.lng])

  function place(lat, lng, move=false){
    // Coerce potential string inputs to numbers
    const nlat = Number(lat)
    const nlng = Number(lng)
    if (!isFinite(nlat) || !isFinite(nlng) || !mapRef.current) return
    const L = window.L
    if (!markerRef.current){
      markerRef.current = L.marker([nlat, nlng], { draggable: !readOnly }).addTo(mapRef.current)
      if (!readOnly){
        markerRef.current.on('dragend', (e)=>{
          const ll = e.target.getLatLng()
          onChange && onChange({ lat: ll.lat, lng: ll.lng })
        })
      }
    } else {
      markerRef.current.setLatLng([nlat, nlng])
    }
    if (!move) mapRef.current.setView([nlat, nlng], 14)
    onChange && !readOnly && onChange({ lat: nlat, lng: nlng })
  }

  return (
    <div style={{ height: typeof height==='number' ? height+'px' : height }} ref={containerRef} className="w-full rounded overflow-hidden border" />
  )
}
