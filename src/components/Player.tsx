import { useEffect, useRef } from 'react'
import { Pause, Play, Volume2 } from 'lucide-react'
import type { AudioPlayer } from '../hooks/useAudioPlayer'

interface Props {
  player: AudioPlayer
  buffer: AudioBuffer
  title: string
  subtitle: string
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Trace la forme d'onde (enveloppe min/max par tranche) sur un canvas.
function drawWaveform(canvas: HTMLCanvasElement, buffer: AudioBuffer, progress: number) {
  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (width === 0) return
  canvas.width = width * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)

  const data = buffer.getChannelData(0)
  const bars = Math.floor(width / 4)
  const samplesPerBar = Math.floor(data.length / bars)
  const mid = height / 2

  for (let i = 0; i < bars; i++) {
    let peak = 0
    const start = i * samplesPerBar
    // Sous-echantillonnage : lire chaque frame serait inutilement couteux.
    for (let j = start; j < start + samplesPerBar; j += 32) {
      const v = Math.abs(data[j])
      if (v > peak) peak = v
    }
    const barHeight = Math.max(peak * height * 0.9, 2)
    const x = i * 4
    const played = i / bars <= progress
    ctx.fillStyle = played ? '#dfb87e' : 'rgba(242, 240, 234, 0.18)'
    ctx.fillRect(x, mid - barHeight / 2, 2.5, barHeight)
  }
}

export function Player({ player, buffer, title, subtitle }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const progress = player.duration > 0 ? player.position / player.duration : 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) drawWaveform(canvas, buffer, progress)
  }, [buffer, progress])

  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current
      if (canvas) drawWaveform(canvas, buffer, player.duration > 0 ? player.position / player.duration : 0)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [buffer, player.duration, player.position])

  return (
    <section
      aria-label="Lecteur audio"
      className="animate-screen rounded-3xl border border-hairline bg-glass p-6 backdrop-blur-2xl sm:p-8"
    >
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-medium text-ivory">{title}</h2>
          <p className="mt-1 text-xs text-ivory-soft">{subtitle}</p>
        </div>
        <p className="shrink-0 text-xs tabular-nums text-ivory-faint">
          {formatTime(player.position)} / {formatTime(player.duration)}
        </p>
      </div>

      <canvas
        ref={canvasRef}
        role="slider"
        aria-label="Position de lecture"
        aria-valuemin={0}
        aria-valuemax={Math.round(player.duration)}
        aria-valuenow={Math.round(player.position)}
        tabIndex={0}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          player.seek(((e.clientX - rect.left) / rect.width) * player.duration)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') player.seek(player.position + 5)
          if (e.key === 'ArrowLeft') player.seek(player.position - 5)
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            player.toggle()
          }
        }}
        className="h-24 w-full cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
      />

      <div className="mt-6 flex items-center justify-between gap-6">
        <button
          type="button"
          onClick={player.toggle}
          aria-label={player.isPlaying ? 'Pause' : 'Lecture'}
          className="flex h-13 w-13 items-center justify-center rounded-full bg-ivory text-night transition-all duration-200 hover:scale-105 hover:bg-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          {player.isPlaying ? <Pause size={18} aria-hidden /> : <Play size={18} className="ml-0.5" aria-hidden />}
        </button>

        <div className="flex w-36 items-center gap-3">
          <Volume2 size={15} className="shrink-0 text-ivory-faint" aria-hidden />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={player.volume}
            aria-label="Volume"
            onChange={(e) => player.setVolume(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>
    </section>
  )
}
