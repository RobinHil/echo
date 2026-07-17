import { useEffect, useRef } from 'react'

// Ligne d'onde animee de l'ecran de generation : une seule ligne horizontale
// qui ondule, somme de trois sinusoides voyageant a des vitesses differentes,
// enveloppee pour rester calme aux extremites. Deux passes de trace : un halo
// large et diffus, puis le trait fin par-dessus.

const HARMONICS = [
  { cycles: 1.4, speed: 0.55, amp: 0.52 },
  { cycles: 2.6, speed: -0.34, amp: 0.3 },
  { cycles: 4.1, speed: 0.21, amp: 0.18 },
]

export function WaveLine() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const start = performance.now()

    const draw = (now: number) => {
      const t = (now - start) / 1000
      const dpr = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width === 0) {
        raf = requestAnimationFrame(draw)
        return
      }
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      // Respiration lente de l'amplitude globale.
      const breath = 0.72 + 0.28 * Math.sin(t * 0.9)
      const mid = height / 2

      const trace = () => {
        ctx.beginPath()
        for (let x = 0; x <= width; x += 2) {
          const u = x / width
          const envelope = Math.sin(Math.PI * u) ** 1.5
          let y = 0
          for (const h of HARMONICS) {
            y += Math.sin(u * h.cycles * Math.PI * 2 + t * h.speed * Math.PI * 2) * h.amp
          }
          const py = mid + y * envelope * breath * height * 0.36
          if (x === 0) ctx.moveTo(x, py)
          else ctx.lineTo(x, py)
        }
        ctx.stroke()
      }

      const gradient = ctx.createLinearGradient(0, 0, width, 0)
      gradient.addColorStop(0, 'rgba(242, 240, 234, 0)')
      gradient.addColorStop(0.2, 'rgba(242, 240, 234, 0.85)')
      gradient.addColorStop(0.5, 'rgba(223, 184, 126, 1)')
      gradient.addColorStop(0.8, 'rgba(242, 240, 234, 0.85)')
      gradient.addColorStop(1, 'rgba(242, 240, 234, 0)')

      ctx.lineCap = 'round'
      ctx.strokeStyle = gradient

      // Halo diffus.
      ctx.globalAlpha = 0.16
      ctx.lineWidth = 6
      ctx.shadowColor = 'rgba(223, 184, 126, 0.8)'
      ctx.shadowBlur = 22
      trace()

      // Trait principal.
      ctx.globalAlpha = 1
      ctx.lineWidth = 1.4
      ctx.shadowBlur = 8
      trace()
      ctx.shadowBlur = 0

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={canvasRef} className="h-40 w-full max-w-2xl" aria-hidden />
}
