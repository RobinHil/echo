// Types partages entre les algorithmes de sonification et le moteur de rendu.
// Une Sequence est une description complete et deterministe d'une piece :
// la stocker suffit pour regenerer un audio strictement identique.

export type SynthRole = 'lead' | 'pad' | 'bass' | 'arp' | 'kick' | 'hat'

export interface SoundEvent {
  // Temps de depart en secondes depuis le debut de la piece.
  time: number
  // Duree de la note en secondes.
  duration: number
  // Note au format scientifique (ex : "C4", "F#3").
  note: string
  // Velocite normalisee [0..1], traduite en volume par le moteur.
  velocity: number
  // Voix qui joue l'evenement.
  role: SynthRole
}

export interface SequenceEffects {
  // Part de signal traite [0..1] pour chaque effet.
  reverbWet: number
  delayWet: number
  delayFeedback: number
  chorusDepth: number
  // Frequence de coupure du filtre passe-bas global, en Hz.
  filterCutoff: number
}

export interface Sequence {
  events: SoundEvent[]
  // Duree totale en secondes, queue de reverb comprise.
  duration: number
  effects: SequenceEffects
  // Nom de l'echelle musicale retenue, pour affichage.
  scaleName: string
}

export type InputMode = 'text' | 'image'

// Echelles pentatoniques et modales : tout mapping tombe sur une de ces
// grilles, ce qui garantit un resultat consonant quel que soit le contenu.
export const SCALES: Record<string, number[]> = {
  'pentatonique majeure': [0, 2, 4, 7, 9],
  'pentatonique mineure': [0, 3, 5, 7, 10],
  dorien: [0, 2, 3, 5, 7, 9, 10],
  lydien: [0, 2, 4, 6, 7, 9, 11],
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Convertit (classe de hauteur de la tonique, degre dans l'echelle, octave)
// en note scientifique. Le degre peut depasser la taille de l'echelle :
// l'excedent monte d'octave, ce qui permet un mapping lineaire simple.
export function scaleNote(rootPitchClass: number, scale: number[], degree: number, baseOctave: number): string {
  const octaveShift = Math.floor(degree / scale.length)
  const semitone = rootPitchClass + scale[((degree % scale.length) + scale.length) % scale.length]
  const midi = (baseOctave + 1 + octaveShift) * 12 + semitone
  const clamped = Math.min(Math.max(midi, 24), 96)
  return NOTE_NAMES[clamped % 12] + String(Math.floor(clamped / 12) - 1)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// Accord de trois sons empiles par tierces dans l'espace de l'echelle
// (degres n, n+2, n+4) : consonant sur toutes les echelles utilisees.
export function chordNotes(rootPitchClass: number, scale: number[], degree: number, baseOctave: number): string[] {
  return [0, 2, 4].map((offset) => scaleNote(rootPitchClass, scale, degree + offset, baseOctave))
}

// Duplique la piece en deux passages (A puis A' plus doux) quand le contenu
// est court : le rendu garde une vraie forme musicale au lieu d'un fragment.
export function repeatIfShort(events: SoundEvent[], minSeconds: number): { events: SoundEvent[]; end: number } {
  const end = events.reduce((m, e) => Math.max(m, e.time + e.duration), 0)
  if (end >= minSeconds || events.length === 0) return { events, end }
  const second = events.map((e) => ({ ...e, time: e.time + end, velocity: e.velocity * 0.82 }))
  return { events: [...events, ...second], end: end * 2 }
}
