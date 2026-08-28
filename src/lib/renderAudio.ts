import * as Tone from 'tone'
import { clamp, lerp, type Sequence, type SequenceTimbre, type SoundEvent } from './sequence'

// Rendu hors-ligne d'une Sequence en AudioBuffer via Tone.Offline.
//
// Le moteur ne decide de rien : la composition lui fournit les evenements, les
// timbres et les reglages d'effets. Son role est de traduire chaque role en
// voix, de placer les evenements et de mixer.
//
// Timbres : chaque voix dispose d'une famille de patches (cf. SequenceTimbre).
// Deux pieces de styles differents ne se distinguent donc pas seulement par
// leurs notes, mais par leurs instruments.
//
// Panoramique : les operateurs stereo de Strudel (jux, pan) produisent une
// position par evenement. Un PolySynth ne pouvant pas panoramiser note par
// note, chaque voix instancie un synthetiseur par position rencontree.
//
// Humanisation : chaque evenement recoit un micro-decalage de temps et de
// velocite derive d'un hash de son index. L'ordre des evenements etant
// canonique, le rendu reste strictement deterministe et rejouable.

export const SAMPLE_RATE = 44100

// Hash -> valeur dans [-0.5, 0.5), stable pour un meme index.
function jitter(i: number): number {
  return (((i * 2654435761) >>> 0) / 4294967296) - 0.5
}

// ---------------------------------------------------------------------------
// Definition des timbres
// ---------------------------------------------------------------------------

// Forme d'onde de la porteuse. Une sinusoide n'a aucune harmonique : jouee
// grave elle est inaudible sur un petit haut-parleur, jouee aigue elle sonne
// fluette. Les timbres tirent leur corps de leur porteuse et de leur indice de
// modulation, qui engendre les partiels.
type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth'

interface FMShape {
  carrier: Wave
  modulator: Wave
  harmonicity: number
  modulationIndex: number
  attack: number
  decay: number
  sustain: number
  release: number
  volume: number
}

const LEAD_SHAPES: Record<SequenceTimbre['lead'], FMShape> = {
  rhodes: { carrier: 'sine', modulator: 'sine', harmonicity: 2, modulationIndex: 7, attack: 0.012, decay: 0.5, sustain: 0.25, release: 0.9, volume: -7 },
  cloche: { carrier: 'sine', modulator: 'triangle', harmonicity: 3.5, modulationIndex: 11, attack: 0.004, decay: 1.4, sustain: 0.08, release: 1.8, volume: -10 },
  verre: { carrier: 'square', modulator: 'sine', harmonicity: 1.5, modulationIndex: 5, attack: 0.09, decay: 0.8, sustain: 0.4, release: 1.4, volume: -12 },
  anche: { carrier: 'sawtooth', modulator: 'sawtooth', harmonicity: 1, modulationIndex: 6, attack: 0.03, decay: 0.3, sustain: 0.6, release: 0.5, volume: -13 },
  corde: { carrier: 'sawtooth', modulator: 'square', harmonicity: 2, modulationIndex: 9, attack: 0.005, decay: 0.35, sustain: 0.06, release: 0.4, volume: -12 },
}

// La basse est la voix qui souffrait le plus de la synthese sinusoidale : son
// fondamental, vers 40-70 Hz, n'est pratiquement pas restitue par un haut-
// parleur d'ordinateur ou de telephone. Ce sont ses harmoniques, entre 150 et
// 600 Hz, qui la rendent audible - l'oreille reconstruit le fondamental.
const BASS_SHAPES: Record<SequenceTimbre['bass'], FMShape> = {
  ronde: { carrier: 'sawtooth', modulator: 'sawtooth', harmonicity: 1, modulationIndex: 6, attack: 0.035, decay: 0.25, sustain: 0.7, release: 0.6, volume: -4 },
  sub: { carrier: 'square', modulator: 'sine', harmonicity: 0.5, modulationIndex: 5, attack: 0.05, decay: 0.4, sustain: 0.8, release: 0.9, volume: -4 },
  grondante: { carrier: 'sawtooth', modulator: 'square', harmonicity: 0.5, modulationIndex: 13, attack: 0.015, decay: 0.2, sustain: 0.55, release: 0.35, volume: -7 },
  pincee: { carrier: 'sawtooth', modulator: 'sawtooth', harmonicity: 2, modulationIndex: 8, attack: 0.004, decay: 0.28, sustain: 0.05, release: 0.3, volume: -5 },
}

// L'arpege est la voix la plus nombreuse : il est volontairement en retrait,
// sinon il masque la melodie et tire tout le morceau vers l'aigu.
const ARP_SHAPES: Record<SequenceTimbre['arp'], FMShape> = {
  kalimba: { carrier: 'triangle', modulator: 'sine', harmonicity: 3.01, modulationIndex: 6, attack: 0.003, decay: 0.22, sustain: 0, release: 0.35, volume: -18 },
  cristal: { carrier: 'sine', modulator: 'sine', harmonicity: 5, modulationIndex: 10, attack: 0.002, decay: 0.14, sustain: 0, release: 0.22, volume: -20 },
  boite: { carrier: 'triangle', modulator: 'triangle', harmonicity: 4, modulationIndex: 6, attack: 0.003, decay: 0.4, sustain: 0, release: 0.6, volume: -19 },
  goutte: { carrier: 'sine', modulator: 'triangle', harmonicity: 2, modulationIndex: 9, attack: 0.001, decay: 0.09, sustain: 0, release: 0.14, volume: -19 },
}

interface PadShape {
  type: 'fatsine' | 'fatsawtooth' | 'fattriangle'
  count: number
  spread: number
  attack: number
  release: number
  volume: number
}

const PAD_SHAPES: Record<SequenceTimbre['pad'], PadShape> = {
  choeur: { type: 'fatsawtooth', count: 3, spread: 22, attack: 0.9, release: 2.2, volume: -22 },
  cordes: { type: 'fatsawtooth', count: 3, spread: 14, attack: 0.5, release: 1.6, volume: -21 },
  halo: { type: 'fattriangle', count: 4, spread: 34, attack: 1.6, release: 3.2, volume: -17 },
  souffle: { type: 'fatsawtooth', count: 2, spread: 48, attack: 2.2, release: 4, volume: -23 },
}

interface KickShape {
  pitchDecay: number
  octaves: number
  decay: number
  volume: number
}

const KICK_SHAPES: Record<SequenceTimbre['kick'], KickShape> = {
  profonde: { pitchDecay: 0.05, octaves: 6, decay: 0.4, volume: -7 },
  seche: { pitchDecay: 0.018, octaves: 4, decay: 0.19, volume: -8 },
  ample: { pitchDecay: 0.08, octaves: 8, decay: 0.62, volume: -6 },
}

interface NoiseShape {
  type: 'white' | 'pink' | 'brown'
  decay: number
  frequency: number
  q: number
  volume: number
}

const SNARE_SHAPES: Record<SequenceTimbre['snare'], NoiseShape> = {
  clap: { type: 'white', decay: 0.17, frequency: 1900, q: 1.1, volume: -14 },
  rim: { type: 'white', decay: 0.055, frequency: 3200, q: 2.4, volume: -16 },
  balai: { type: 'pink', decay: 0.3, frequency: 1400, q: 0.7, volume: -19 },
}

const HAT_SHAPES: Record<SequenceTimbre['hat'], NoiseShape> = {
  fermee: { type: 'white', decay: 0.045, frequency: 9500, q: 0.9, volume: -17 },
  scintillante: { type: 'white', decay: 0.13, frequency: 12000, q: 0.6, volume: -20 },
  sable: { type: 'pink', decay: 0.028, frequency: 7000, q: 1.6, volume: -18 },
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

// Une voix prete a jouer : son point de sortie dans le graphe, et de quoi la
// declencher. L'abstraction permet de traiter de la meme facon un PolySynth
// (qui recoit une note) et un synthetiseur de bruit (qui n'en recoit pas).
interface Voice {
  output: Tone.ToneAudioNode
  trigger(note: string, duration: number, time: number, velocity: number): void
}

// Positions stereo arrondies au quart : les operateurs de Strudel en
// produisent peu de valeurs distinctes, le graphe reste donc leger.
function panKey(pan: number): number {
  return Math.round(clamp(pan, -1, 1) * 4) / 4
}

// Un PolySynth ne sait pas panoramiser note par note : on instancie une voix
// par position rencontree. Les voix sont creees ici, en une fois, et jamais a
// la volee : Tone.Offline n'expose son contexte que pendant l'execution de son
// callback, et un noeud cree plus tard appartiendrait au contexte global.
function panned(
  destination: Tone.InputNode,
  pans: number[],
  create: () => Voice,
): (pan: number) => Voice | null {
  if (pans.length === 0) return () => null
  const pool = new Map<number, Voice>()
  for (const key of pans) {
    const voice = create()
    const panner = new Tone.Panner(key).connect(destination)
    voice.output.connect(panner)
    pool.set(key, voice)
  }
  const fallback = pool.values().next().value as Voice
  return (pan: number) => pool.get(panKey(pan)) ?? fallback
}

export async function renderSequence(sequence: Sequence): Promise<AudioBuffer> {
  // Positions stereo effectivement utilisees par chaque role : elles decident
  // du nombre de voix a instancier.
  const pansOf = (role: SoundEvent['role']) => [
    ...new Set(sequence.events.filter((e) => e.role === role).map((e) => panKey(e.pan))),
  ]
  const pans = {
    lead: pansOf('lead'),
    pad: pansOf('pad'),
    bass: pansOf('bass'),
    arp: pansOf('arp'),
    hat: pansOf('hat'),
  }

  const toneBuffer = await Tone.Offline(
    ({ transport }) => {
      const { effects, timbre } = sequence
      // L'ouverture des timbres suit la brillance demandee par la composition.
      const bright = lerp(0.72, 1.45, timbre.brightness)

      // --- Chaine de mixage ---
      // Passe-haut de mixage : sous 35 Hz un haut-parleur ne restitue rien,
      // mais le limiteur, lui, compte cette energie et baisse tout le reste.
      // La couper rend la piece plus pleine, pas plus maigre.
      const limiter = new Tone.Limiter(-1).toDestination()
      const highpass = new Tone.Filter({ frequency: 35, type: 'highpass', rolloff: -24 }).connect(limiter)
      const glue = new Tone.Compressor({ threshold: -16, ratio: 3, attack: 0.02, release: 0.2 }).connect(highpass)
      const reverb = new Tone.Reverb({
        decay: effects.reverbDecay,
        preDelay: 0.02,
        wet: effects.reverbWet,
      }).connect(glue)
      const delay = new Tone.FeedbackDelay({
        delayTime: effects.delayTime,
        feedback: effects.delayFeedback,
        wet: effects.delayWet,
      }).connect(reverb)
      const chorus = new Tone.Chorus({
        frequency: 0.5,
        depth: effects.chorusDepth,
        wet: effects.chorusDepth > 0 ? 0.4 : 0,
      })
        .connect(delay)
        .start()
      const filter = new Tone.Filter({ frequency: effects.filterCutoff, type: 'lowpass', rolloff: -12 }).connect(
        chorus,
      )

      // --- Voix melodiques ---
      const leadShape = LEAD_SHAPES[timbre.lead]
      const leadVibrato = new Tone.Vibrato({ frequency: 4.4, depth: 0.06 }).connect(filter)
      const lead = panned(leadVibrato, pans.lead, () => {
        const synth = new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: leadShape.harmonicity,
          modulationIndex: leadShape.modulationIndex * bright,
          oscillator: { type: leadShape.carrier },
          envelope: {
            attack: leadShape.attack,
            decay: leadShape.decay,
            sustain: leadShape.sustain,
            release: leadShape.release,
          },
          modulation: { type: leadShape.modulator },
          modulationEnvelope: { attack: 0.004, decay: 0.3, sustain: 0.08, release: 0.4 },
          volume: leadShape.volume,
        })
        return { output: synth, trigger: (n, d, t, v) => synth.triggerAttackRelease(n, d, t, v) }
      })

      const padShape = PAD_SHAPES[timbre.pad]
      const padWidener = new Tone.StereoWidener(0.6 + timbre.detune * 0.35).connect(filter)
      const pad = panned(padWidener, pans.pad, () => {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: {
            type: padShape.type,
            count: padShape.count,
            spread: Math.round(padShape.spread * lerp(0.6, 1.4, timbre.detune)),
          },
          envelope: { attack: padShape.attack, decay: 0.4, sustain: 0.6, release: padShape.release },
          volume: padShape.volume,
        })
        return { output: synth, trigger: (n, d, t, v) => synth.triggerAttackRelease(n, d, t, v) }
      })

      const bassShape = BASS_SHAPES[timbre.bass]
      const bass = panned(filter, pans.bass, () => {
        const synth = new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: bassShape.harmonicity,
          modulationIndex: bassShape.modulationIndex * bright,
          oscillator: { type: bassShape.carrier },
          envelope: {
            attack: bassShape.attack,
            decay: bassShape.decay,
            sustain: bassShape.sustain,
            release: bassShape.release,
          },
          modulation: { type: bassShape.modulator },
          modulationEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.2, release: 0.4 },
          volume: bassShape.volume,
        })
        return { output: synth, trigger: (n, d, t, v) => synth.triggerAttackRelease(n, d, t, v) }
      })

      const arpShape = ARP_SHAPES[timbre.arp]
      const arp = panned(filter, pans.arp, () => {
        const synth = new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: arpShape.harmonicity,
          modulationIndex: arpShape.modulationIndex * bright,
          oscillator: { type: arpShape.carrier },
          envelope: {
            attack: arpShape.attack,
            decay: arpShape.decay,
            sustain: arpShape.sustain,
            release: arpShape.release,
          },
          modulation: { type: arpShape.modulator },
          modulationEnvelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.1 },
          volume: arpShape.volume,
        })
        return { output: synth, trigger: (n, d, t, v) => synth.triggerAttackRelease(n, d, t, v) }
      })

      // --- Percussions ---
      // Hors de la chaine d'effets, avec un envoi de reverberation pour
      // partager l'espace du reste de l'arrangement.
      const percRoom = new Tone.Gain(0.14).connect(reverb)
      const percBus = new Tone.Gain(1).connect(glue)
      percBus.connect(percRoom)

      const kickShape = KICK_SHAPES[timbre.kick]
      const kick = new Tone.MembraneSynth({
        pitchDecay: kickShape.pitchDecay,
        octaves: kickShape.octaves,
        envelope: { attack: 0.001, decay: kickShape.decay, sustain: 0, release: 0.12 },
        volume: kickShape.volume,
      }).connect(percBus)

      const snareShape = SNARE_SHAPES[timbre.snare]
      const snareBand = new Tone.Filter({
        frequency: snareShape.frequency,
        type: 'bandpass',
        Q: snareShape.q,
      }).connect(percBus)
      const snare = new Tone.NoiseSynth({
        noise: { type: snareShape.type },
        envelope: { attack: 0.001, decay: snareShape.decay, sustain: 0, release: 0.03 },
        volume: snareShape.volume,
      }).connect(snareBand)

      // Le charley suit les operateurs stereo : chaque position a son propre
      // filtre, sinon les voix se sommeraient avant le panoramique.
      const hatShape = HAT_SHAPES[timbre.hat]
      const hat = panned(percBus, pans.hat, () => {
        const band = new Tone.Filter({ frequency: hatShape.frequency, type: 'bandpass', Q: hatShape.q })
        const synth = new Tone.NoiseSynth({
          noise: { type: hatShape.type },
          envelope: { attack: 0.001, decay: hatShape.decay, sustain: 0, release: 0.025 },
          volume: hatShape.volume,
        }).connect(band)
        return { output: band, trigger: (_n, d, t, v) => synth.triggerAttackRelease(d, t, v) }
      })

      const pools: Record<string, (pan: number) => Voice | null> = { lead, pad, bass, arp, hat }

      // --- Placement des evenements ---
      sequence.events.forEach((event: SoundEvent, i) => {
        // La grosse caisse reste sur la grille ; le reste respire un peu.
        const timeJitter = event.role === 'kick' ? 0 : jitter(i) * 0.014
        const velocity = clamp(event.velocity * (1 + jitter(i + 7919) * 0.12), 0.05, 1)
        const at = Math.max(0, event.time + timeJitter)

        transport.schedule((t) => {
          if (event.role === 'kick') {
            kick.triggerAttackRelease(event.note, event.duration, t, velocity)
            return
          }
          if (event.role === 'snare') {
            snare.triggerAttackRelease(event.duration, t, velocity)
            return
          }
          pools[event.role](event.pan)?.trigger(event.note, event.duration, t, velocity)
        }, at)
      })

      transport.start(0)
    },
    sequence.duration,
    2,
    SAMPLE_RATE,
  )

  return toneBuffer.get() as AudioBuffer
}
