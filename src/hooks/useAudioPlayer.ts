import { useCallback, useEffect, useRef, useState } from 'react'

// Lecture d'un AudioBuffer avec lecture/pause, recherche et volume.
// Un AudioBufferSourceNode ne se rejoue pas : chaque reprise recree une
// source au bon offset, la position etant suivie via l'horloge du contexte.

export interface AudioPlayer {
  isPlaying: boolean
  position: number
  duration: number
  volume: number
  toggle: () => void
  stop: () => void
  seek: (seconds: number) => void
  setVolume: (v: number) => void
}

export function useAudioPlayer(buffer: AudioBuffer | null): AudioPlayer {
  const ctxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const startedAtRef = useRef(0)
  const offsetRef = useRef(0)
  const rafRef = useRef(0)

  const [isPlaying, setIsPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [volume, setVolumeState] = useState(0.85)

  const getContext = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext()
      gainRef.current = ctxRef.current.createGain()
      gainRef.current.connect(ctxRef.current.destination)
    }
    return ctxRef.current
  }, [])

  const stopSource = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop()
      } catch {
        // Source deja arretee.
      }
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    cancelAnimationFrame(rafRef.current)
  }, [])

  const pause = useCallback(() => {
    if (!ctxRef.current || !sourceRef.current) return
    offsetRef.current = Math.min(
      offsetRef.current + (ctxRef.current.currentTime - startedAtRef.current),
      buffer?.duration ?? 0,
    )
    stopSource()
    setIsPlaying(false)
    setPosition(offsetRef.current)
  }, [buffer, stopSource])

  const play = useCallback(
    (fromSeconds?: number) => {
      if (!buffer) return
      const ctx = getContext()
      stopSource()
      if (fromSeconds !== undefined) offsetRef.current = fromSeconds
      if (offsetRef.current >= buffer.duration - 0.05) offsetRef.current = 0

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(gainRef.current as GainNode)
      source.onended = () => {
        // onended est asynchrone : celui d'une source remplacee (recherche
        // dans la piste, relecture) arrive apres la mise en place de la
        // suivante. Seule la source courante a le droit de declarer la fin,
        // sinon un clic sur la frise remettrait la lecture a zero pendant que
        // la nouvelle source joue.
        if (sourceRef.current !== source) return
        offsetRef.current = 0
        setIsPlaying(false)
        setPosition(buffer.duration)
        cancelAnimationFrame(rafRef.current)
      }
      source.start(0, offsetRef.current)
      sourceRef.current = source
      startedAtRef.current = ctx.currentTime
      setIsPlaying(true)

      const tick = () => {
        const pos = offsetRef.current + ctx.currentTime - startedAtRef.current
        setPosition(Math.min(pos, buffer.duration))
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    },
    [buffer, getContext, stopSource],
  )

  const toggle = useCallback(() => {
    if (isPlaying) pause()
    else play()
  }, [isPlaying, pause, play])

  // Arret complet, position remise a zero. Sert quand le lecteur quitte
  // l'ecran : le son doit s'arreter avec lui.
  const stop = useCallback(() => {
    // Rien a faire si la lecture est deja a l'arret au debut : on evite un
    // rendu inutile a chaque changement d'ecran.
    if (!sourceRef.current && offsetRef.current === 0) return
    stopSource()
    offsetRef.current = 0
    setIsPlaying(false)
    setPosition(0)
  }, [stopSource])

  const seek = useCallback(
    (seconds: number) => {
      if (!buffer) return
      const target = Math.max(0, Math.min(seconds, buffer.duration))
      if (isPlaying) {
        play(target)
      } else {
        offsetRef.current = target
        setPosition(target)
      }
    },
    [buffer, isPlaying, play],
  )

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    if (gainRef.current) gainRef.current.gain.value = v
  }, [])

  // Nouveau buffer : lecture arretee et position remise a zero.
  useEffect(() => {
    stopSource()
    offsetRef.current = 0
    setIsPlaying(false)
    setPosition(0)
  }, [buffer, stopSource])

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume
  }, [volume])

  useEffect(() => {
    return () => {
      stopSource()
      ctxRef.current?.close().catch(() => {})
    }
  }, [stopSource])

  return { isPlaying, position, duration: buffer?.duration ?? 0, volume, toggle, stop, seek, setVolume }
}
