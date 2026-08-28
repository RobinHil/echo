import { stack, silence, slowcat, pure, type Pattern } from '@strudel/core'
import '@strudel/tonal'
import { ROLES, clamp, type SoundEvent, type SynthRole } from './sequence'
import type { SemanticField } from './lexicon'

// Pont entre le langage de patterns Strudel et le moteur de rendu.
//
// Strudel sert ici de langage de composition uniquement : on construit des
// patterns avec son API JavaScript, puis on les interroge hors du temps avec
// queryArc. Aucun contexte audio, aucun eval, aucun sample, aucun reseau -
// le moteur audio de Strudel (superdough) n'est jamais charge.
//
// Convention : le controle `s` porte le nom du role (lead, pad, bass, arp,
// kick, snare, hat). C'est une simple etiquette qui traverse la requete
// jusqu'a l'evenement, et qui dit au moteur Tone quelle voix declencher.

const ROLE_SET = new Set<string>(ROLES)

// Velocite par defaut quand un pattern n'a pas precise de gain.
const DEFAULT_GAIN = 0.7

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Certaines chaines d'operateurs (typiquement .add(note(12))) renvoient un
// numero MIDI plutot qu'un nom de note. Tone interpreterait un nombre comme
// une frequence en Hz : on normalise systematiquement en notation
// scientifique avant de sortir de ce module.
function midiToName(midi: number): string {
  const rounded = clamp(Math.round(midi), 12, 108)
  return NOTE_NAMES[rounded % 12] + String(Math.floor(rounded / 12) - 1)
}

export interface CompileOptions {
  // Cycles par seconde : fixe le tempo reel de la piece.
  cps: number
  // Nombre de cycles a rendre.
  cycles: number
  // Silence initial avant la premiere note, en secondes.
  start: number
  // Facteur applique a la duree des notes (staccato < 1 < legato).
  legato: number
}

// Interroge le pattern sur toute la duree de la piece et traduit les
// evenements Strudel (haps) en SoundEvent consommables par le rendu Tone.
export function compile(pattern: Pattern, options: CompileOptions): SoundEvent[] {
  const { cps, cycles, start, legato } = options
  const haps = pattern.queryArc(0, cycles)
  const events: SoundEvent[] = []

  for (const hap of haps) {
    // Les signaux continus n'ont pas de `whole` : ils ne portent pas
    // d'evenement declenchable.
    if (!hap.whole) continue

    const value = hap.value as Record<string, unknown>
    const role = value.s
    if (typeof role !== 'string' || !ROLE_SET.has(role)) continue

    const rawNote = value.note
    let noteName: string
    if (typeof rawNote === 'number') noteName = midiToName(rawNote)
    else if (typeof rawNote === 'string' && rawNote.length > 0) noteName = rawNote
    else continue

    const begin = hap.whole.begin.valueOf()
    const end = hap.whole.end.valueOf()
    const duration = ((end - begin) / cps) * legato
    if (duration <= 0.001) continue

    const gain = typeof value.gain === 'number' ? value.gain : DEFAULT_GAIN
    // Strudel exprime le panoramique sur [0..1], le moteur sur [-1..1].
    const pan = typeof value.pan === 'number' ? clamp(value.pan * 2 - 1, -1, 1) : 0

    events.push({
      time: start + begin / cps,
      duration,
      note: noteName,
      velocity: clamp(gain, 0.02, 1),
      role: role as SynthRole,
      pan,
    })
  }

  // Ordre canonique : le rendu derive son humanisation de l'index de
  // l'evenement, donc l'ordre doit etre stable d'une execution a l'autre
  // quelle que soit celle dans laquelle Strudel a produit les haps.
  events.sort((a, b) => a.time - b.time || a.role.localeCompare(b.role) || a.note.localeCompare(b.note))
  return events
}

// Duree reelle d'une piece, queue de reverb comprise.
export function sequenceDuration(events: SoundEvent[], tail: number): number {
  const end = events.reduce((max, e) => Math.max(max, e.time + e.duration), 0)
  return end + tail
}

// ---------------------------------------------------------------------------
// Palette d'echelles
// ---------------------------------------------------------------------------

export interface ScaleDef {
  // Nom affiche dans l'interface.
  label: string
  // Nom compris par @strudel/tonal.
  id: string
  // Couleur affective [-1..1] : sombre et tendu vers -1, lumineux vers +1.
  brightness: number
  // Nombre de degres, utile pour calculer les sauts d'octave.
  size: number
}

// Vingt-quatre echelles, du plus consonant au plus depaysant. C'est le
// premier levier de diversite : deux contenus tombent rarement sur la meme.
export const SCALES: readonly ScaleDef[] = [
  { label: 'pentatonique majeure', id: 'major pentatonic', brightness: 0.8, size: 5 },
  { label: 'ionien', id: 'ionian', brightness: 0.9, size: 7 },
  { label: 'lydien', id: 'lydian', brightness: 1, size: 7 },
  { label: 'mixolydien', id: 'mixolydian', brightness: 0.5, size: 7 },
  { label: 'ritusen', id: 'ritusen', brightness: 0.6, size: 5 },
  { label: 'egyptienne', id: 'egyptian', brightness: 0.35, size: 5 },
  { label: 'kumoi', id: 'kumoi', brightness: 0.3, size: 5 },
  { label: 'promethee', id: 'prometheus', brightness: 0.45, size: 6 },
  { label: 'ton par ton', id: 'whole tone', brightness: 0.25, size: 6 },
  { label: 'bebop', id: 'bebop', brightness: 0.55, size: 7 },
  { label: 'dorien', id: 'dorian', brightness: 0.1, size: 7 },
  { label: 'mineure melodique', id: 'melodic minor', brightness: 0, size: 7 },
  { label: 'pentatonique mineure', id: 'minor pentatonic', brightness: -0.2, size: 5 },
  { label: 'hirajoshi', id: 'hirajoshi', brightness: -0.3, size: 5 },
  { label: 'eolien', id: 'aeolian', brightness: -0.4, size: 7 },
  { label: 'blues', id: 'blues', brightness: -0.35, size: 6 },
  { label: 'augmentee', id: 'augmented', brightness: -0.15, size: 6 },
  { label: 'pelog', id: 'pelog', brightness: -0.5, size: 5 },
  { label: 'in-sen', id: 'in-sen', brightness: -0.6, size: 5 },
  { label: 'mineure harmonique', id: 'harmonic minor', brightness: -0.55, size: 7 },
  { label: 'phrygienne', id: 'phrygian', brightness: -0.75, size: 7 },
  { label: 'iwato', id: 'iwato', brightness: -0.85, size: 5 },
  { label: 'alteree', id: 'altered', brightness: -0.9, size: 7 },
  { label: 'locrienne', id: 'locrian', brightness: -1, size: 7 },
]

// Choisit une echelle proche de la couleur affective demandee, puis departage
// avec un hash : la couleur reste fidele au contenu, sans que tous les textes
// sombres tombent sur la meme gamme.
export function pickScale(brightness: number, hash: number): ScaleDef {
  const target = clamp(brightness, -1, 1)
  const sorted = [...SCALES].sort(
    (a, b) => Math.abs(a.brightness - target) - Math.abs(b.brightness - target),
  )
  const pool = sorted.slice(0, 6)
  return pool[Math.abs(hash) % pool.length]
}

// Echelles associees a chaque champ semantique. C'est le lien direct entre ce
// dont un texte parle et sa couleur : deux textes sur la mer puisent dans les
// memes trois gammes, deux textes de guerre dans trois autres. Le choix a
// l'interieur d'une famille reste ouvert, pour qu'ils se ressemblent sans se
// confondre.
const FIELD_SCALES: Record<SemanticField, string[]> = {
  eau: ['kumoi', 'ritusen', 'egyptian'],
  feu: ['mixolydian', 'blues', 'bebop'],
  nuit: ['aeolian', 'harmonic minor', 'in-sen'],
  lumiere: ['lydian', 'ionian', 'major pentatonic'],
  nature: ['major pentatonic', 'ritusen', 'dorian'],
  violence: ['locrian', 'altered', 'phrygian'],
  amour: ['ionian', 'major pentatonic', 'melodic minor'],
  mort: ['harmonic minor', 'phrygian', 'iwato'],
  joie: ['major pentatonic', 'lydian', 'bebop'],
  tristesse: ['aeolian', 'minor pentatonic', 'dorian'],
  temps: ['dorian', 'whole tone', 'prometheus'],
  ville: ['minor pentatonic', 'blues', 'augmented'],
  machine: ['whole tone', 'augmented', 'altered'],
  corps: ['dorian', 'minor pentatonic', 'mixolydian'],
  voyage: ['mixolydian', 'dorian', 'prometheus'],
  silence: ['hirajoshi', 'pelog', 'kumoi'],
}

const BY_ID = new Map(SCALES.map((scale) => [scale.id, scale]))

// Echelle d'un champ semantique. Le hash tranche a l'interieur de la famille.
export function scaleForField(field: SemanticField, hash: number): ScaleDef {
  const family = FIELD_SCALES[field]
  const id = family[Math.abs(hash) % family.length]
  return BY_ID.get(id) as ScaleDef
}

const PITCH_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// Construit le nom de gamme attendu par .scale(), ex : "Eb3:hirajoshi".
export function scaleRef(rootPitchClass: number, octave: number, scale: ScaleDef): string {
  return `${PITCH_NAMES[((rootPitchClass % 12) + 12) % 12]}${octave}:${scale.id}`
}

// ---------------------------------------------------------------------------
// Helpers de composition
// ---------------------------------------------------------------------------

// Masque cycle par cycle : sert a faire entrer et sortir les voix au fil de la
// piece. Les operateurs indexes sur le cycle (every, chunk) gardent leur phase
// globale, contrairement a un decoupage en sous-rendus.
export function gate(active: readonly boolean[]): Pattern {
  return slowcat(...active.map((on) => pure(on)))
}

// Empile en ignorant les voix absentes : chaque style n'utilise qu'une partie
// des sept roles.
export function layer(...voices: (Pattern | null)[]): Pattern {
  const present = voices.filter((v): v is Pattern => v !== null)
  return present.length > 0 ? stack(...present) : silence
}
