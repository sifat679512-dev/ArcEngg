import React, { useEffect, useRef } from 'react'

export default function ArchitectureBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Blueprint grid lines
    const gridSize = 50
    const lines = []
    
    // Create initial grid lines
    for (let x = 0; x < canvas.width + gridSize; x += gridSize) {
      lines.push({ type: 'vertical', x, progress: Math.random() })
    }
    for (let y = 0; y < canvas.height + gridSize; y += gridSize) {
      lines.push({ type: 'horizontal', y, progress: Math.random() })
    }

    // Geometric shapes (buildings)
    const shapes = []
    for (let i = 0; i < 12; i++) {
      shapes.push({
        x: Math.random() * canvas.width,
        y: canvas.height - Math.random() * canvas.height * 0.4,
        width: 30 + Math.random() * 60,
        height: 50 + Math.random() * 150,
        type: Math.random() > 0.5 ? 'rectangle' : 'triangle',
        progress: Math.random(),
        speed: 0.002 + Math.random() * 0.003
      })
    }

    // Floating geometric elements
    const particles = []
    for (let i = 0; i < 25; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: 2 + Math.random() * 4,
        speedX: (Math.random() - 0.5) * 0.5,
        speedY: (Math.random() - 0.5) * 0.5,
        type: Math.floor(Math.random() * 3)
      })
    }

    function animate() {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw blueprint grid
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1

      lines.forEach(line => {
        line.progress += 0.005
        if (line.progress > 1) line.progress = 0

        const alpha = 0.3 + Math.sin(line.progress * Math.PI) * 0.2
        ctx.strokeStyle = `rgba(148, 163, 184, ${alpha})`

        ctx.beginPath()
        if (line.type === 'vertical') {
          ctx.moveTo(line.x, 0)
          ctx.lineTo(line.x, canvas.height)
        } else {
          ctx.moveTo(0, line.y)
          ctx.lineTo(canvas.width, line.y)
        }
        ctx.stroke()
      })

      // Draw building silhouettes
      shapes.forEach(shape => {
        shape.progress += shape.speed
        if (shape.progress > 1) shape.progress = 0

        const alpha = 0.1 + Math.sin(shape.progress * Math.PI) * 0.15
        ctx.fillStyle = `rgba(99, 102, 241, ${alpha})`
        ctx.strokeStyle = `rgba(99, 102, 241, ${alpha + 0.1})`
        ctx.lineWidth = 2

        ctx.beginPath()
        if (shape.type === 'rectangle') {
          ctx.rect(shape.x, shape.y, shape.width, shape.height)
        } else {
          ctx.moveTo(shape.x, shape.y + shape.height)
          ctx.lineTo(shape.x + shape.width / 2, shape.y)
          ctx.lineTo(shape.x + shape.width, shape.y + shape.height)
          ctx.closePath()
        }
        ctx.fill()
        ctx.stroke()
      })

      // Draw floating particles
      particles.forEach(particle => {
        particle.x += particle.speedX
        particle.y += particle.speedY

        if (particle.x < 0) particle.x = canvas.width
        if (particle.x > canvas.width) particle.x = 0
        if (particle.y < 0) particle.y = canvas.height
        if (particle.y > canvas.height) particle.y = 0

        ctx.fillStyle = 'rgba(99, 102, 241, 0.3)'
        ctx.beginPath()

        if (particle.type === 0) {
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        } else if (particle.type === 1) {
          ctx.rect(particle.x - particle.size, particle.y - particle.size, particle.size * 2, particle.size * 2)
        } else {
          ctx.moveTo(particle.x, particle.y - particle.size)
          ctx.lineTo(particle.x + particle.size, particle.y + particle.size)
          ctx.lineTo(particle.x - particle.size, particle.y + particle.size)
          ctx.closePath()
        }
        ctx.fill()
      })

      // Draw architectural compass/angle markers
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)'
      ctx.lineWidth = 1
      const time = Date.now() * 0.001
      
      for (let i = 0; i < 5; i++) {
        const cx = 100 + i * 200
        const cy = 100 + Math.sin(time + i) * 20
        const radius = 30 + Math.sin(time * 0.5 + i) * 10
        
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.stroke()
        
        // Cross lines
        ctx.beginPath()
        ctx.moveTo(cx - radius, cy)
        ctx.lineTo(cx + radius, cy)
        ctx.moveTo(cx, cy - radius)
        ctx.lineTo(cx, cy + radius)
        ctx.stroke()
      }

      animationFrameId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10"
      style={{ background: '#f8fafc' }}
    />
  )
}
