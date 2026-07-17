import {
  SCALES,
  type Sequence,
  type SoundEvent,
  chordNotes,
  clamp,
  repeatIfShort,
  scaleNote,
} from './sequence'

// Sonification d'un texte en arrangement complet : melodie, nappes d'accords,
// arpeges, basse et percussions, tous derives du contenu.
//
// Melodie :
//   - lettres d'un mot (hash stable)        -> degre de l'echelle, donc hauteur
//   - longueur du mot                       -> duree de la note
//   - virgules, points, ? !, sauts de ligne -> silences, accents, octaves
//   - mots repetes                          -> echo harmonique une quinte plus haut
// Harmonie :
//   - chaque phrase choisit un accord (hash de ses mots) dans une progression
//     consonante ; la premiere phrase pose la tonique
//   - nappes : accord tenu sur la duree de la phrase
//   - basse : fondamentale et quinte de l'accord courant, toutes les 2 pulsations
//   - arpege : croches continues sur les sons de l'accord courant, motif
//     choisi par le hash global du texte
// Rythme :
//   - longueur moyenne des mots             -> tempo
//   - densite d'exclamations                -> energie (motif de percussions)
//   - grosse caisse sur les temps forts, charley en croches
// Effets et couleur :
//   - ratio voyelles / questions            -> echelle (couleur modale)
//   - longueur des phrases                  -> reverb ; repetitions -> delay ;
//     richesse du vocabulaire               -> ouverture du filtre
// Un texte court est rejoue en deux passages (A puis A' plus doux) et la
// duree totale est plafonnee pour les tres longs textes.

const MAX_DURATION = 75
const MIN_CONTENT = 16
const VOWELS = 'aeiouyàâäéèêëîïôöùûü'
const START = 0.1

interface Token {
  kind: 'word' | 'pause'
  word?: string
  steps?: number
  accent?: boolean
  question?: boolean
  newline?: boolean
}

// Hash deterministe : le meme mot produit toujours la meme note.
function wordHash(word: string): number {
  let h = 0
  for (let i = 0; i < word.length; i++) {
    h = (h * 31 + word.charCodeAt(i)) >>> 0
  }
  return h
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  const parts = text.split(/(\s+|[.,;:!?…])/u).filter((p) => p.length > 0)
  let pendingAccent = false
  let pendingQuestion = false
  for (const part of parts) {
    if (/^\s+$/u.test(part)) {
      if (part.includes('\n')) tokens.push({ kind: 'pause', steps: 3, newline: true })
      continue
    }
    if (/^[.,;:!?…]$/u.test(part)) {
      if (part === ',' || part === ';' || part === ':') tokens.push({ kind: 'pause', steps: 1 })
      else tokens.push({ kind: 'pause', steps: 2 })
      if (part === '!') pendingAccent = true
      if (part === '?') pendingQuestion = true
      continue
    }
    const word = part.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, '')
    if (word.length === 0) continue
    tokens.push({ kind: 'word', word, accent: pendingAccent, question: pendingQuestion })
    pendingAccent = false
    pendingQuestion = false
  }
  return tokens
}

export function sonifyText(text: string): Sequence {
  const tokens = tokenize(text)
  const words = tokens.filter((t) => t.kind === 'word').map((t) => t.word as string)
  if (words.length === 0) {
    throw new Error('Le texte ne contient aucun mot exploitable.')
  }

  // Statistiques globales qui pilotent tempo, echelle, energie et effets.
  const avgWordLen = words.reduce((s, w) => s + w.length, 0) / words.length
  const letters = words.join('')
  let vowelCount = 0
  for (const ch of letters) if (VOWELS.includes(ch)) vowelCount++
  const vowelRatio = vowelCount / Math.max(letters.length, 1)
  const questionCount = (text.match(/\?/g) ?? []).length
  const exclamCount = (text.match(/!/g) ?? []).length
  const sentenceCount = Math.max((text.match(/[.!?…]+/g) ?? []).length, 1)
  const avgSentenceLen = words.length / sentenceCount
  const uniqueRatio = new Set(words).size / words.length
  const textHash = wordHash(letters)

  // Echelle : les questions tirent vers le dorien (suspendu), un texte
  // riche en voyelles sonne majeur, un texte dense en consonnes sonne mineur.
  let scaleName: string
  if (questionCount / sentenceCount > 0.34) scaleName = 'dorien'
  else if (vowelRatio > 0.46) scaleName = 'pentatonique majeure'
  else if (vowelRatio < 0.4) scaleName = 'pentatonique mineure'
  else scaleName = 'lydien'
  const scale = SCALES[scaleName]

  const root = letters.charCodeAt(0) % 12
  const bpm = clamp(112 - (avgWordLen - 4) * 9, 66, 126)
  const beat = 60 / bpm
  const step = beat / 2 // croche
  // Energie rythmique : exclamations et tempo eleve densifient les percussions.
  const energy = clamp(0.3 + exclamCount / sentenceCount + (bpm - 66) / 150, 0, 1)

  const events: SoundEvent[] = []

  // ---- Melodie, et releve des frontieres de phrases pour l'harmonie ----
  const sentenceStarts: { time: number; degree: number }[] = []
  let sentenceWords: string[] = []
  let sentenceStart = START
  // Progression consonante : tonique, sixte, quarte, quinte (en degres d'echelle).
  const degreePool = [0, 5, 3, 4]

  const closeSentence = (endTime: number) => {
    if (sentenceWords.length === 0) return
    const degree =
      sentenceStarts.length === 0 ? 0 : degreePool[wordHash(sentenceWords.join('')) % degreePool.length]
    sentenceStarts.push({ time: sentenceStart, degree })
    sentenceWords = []
    sentenceStart = endTime
  }

  let time = START
  let octaveOffset = 0
  let posInSentence = 0
  const seen = new Map<string, number>()

  for (const token of tokens) {
    if (time > MAX_DURATION - 8) break

    if (token.kind === 'pause') {
      const stepsCount = token.steps ?? 1
      time += stepsCount * step
      if (token.newline) octaveOffset = octaveOffset === 0 ? 1 : 0
      if (stepsCount >= 2) {
        closeSentence(time)
        posInSentence = -1
      } else {
        posInSentence = 0
      }
      continue
    }

    const word = token.word as string
    const hash = wordHash(word)
    const degree = hash % (scale.length * 2)
    const durSteps = clamp(Math.round(word.length / 2.4), 1, 4)
    const duration = durSteps * step

    let velocity = clamp(0.52 + posInSentence * 0.015, 0.4, 0.78)
    if (token.accent) velocity = 0.95
    const octave = 4 + octaveOffset + (token.question ? 1 : 0)

    events.push({
      time,
      duration: duration * 0.92,
      note: scaleNote(root, scale, degree, octave),
      velocity,
      role: 'lead',
    })

    // Un mot deja rencontre declenche son echo une quinte plus haut.
    const prior = seen.get(word) ?? 0
    if (prior > 0 && prior < 4) {
      events.push({
        time: time + step,
        duration: duration * 0.7,
        note: scaleNote(root, scale, degree + 4, octave),
        velocity: velocity * 0.4,
        role: 'pad',
      })
    }
    seen.set(word, prior + 1)

    sentenceWords.push(word)
    time += duration
    posInSentence = posInSentence < 0 ? 1 : posInSentence + 1
  }
  closeSentence(time)
  const contentEnd = time

  // Accord actif a un instant donne (les phrases se suivent sans trou).
  const chordAt = (t: number): number => {
    let degree = 0
    for (const s of sentenceStarts) {
      if (s.time <= t) degree = s.degree
      else break
    }
    return degree
  }

  // ---- Nappes : un accord tenu par phrase ----
  sentenceStarts.forEach((s, i) => {
    const spanEnd = i + 1 < sentenceStarts.length ? sentenceStarts[i + 1].time : contentEnd
    const duration = clamp(spanEnd - s.time + beat, 2 * beat, 8 * beat)
    for (const note of chordNotes(root, scale, s.degree, 3)) {
      events.push({ time: s.time, duration, note, velocity: 0.38, role: 'pad' })
    }
  })

  // ---- Basse : fondamentale et quinte de l'accord, toutes les 2 pulsations ----
  for (let i = 0, t = START; t < contentEnd - 0.05; i++, t = START + i * 2 * beat) {
    const degree = chordAt(t) + (i % 2 === 0 ? 0 : 4)
    events.push({
      time: t,
      duration: 1.6 * beat,
      note: scaleNote(root, scale, degree, 2),
      velocity: 0.55,
      role: 'bass',
    })
  }

  // ---- Arpege : croches continues sur les sons de l'accord courant ----
  const arpPatterns = [
    [0, 2, 4, 2],
    [0, 4, 2, 4],
    [4, 2, 0, 2],
  ]
  const arpPattern = arpPatterns[textHash % arpPatterns.length]
  for (let i = 0, t = START; t < contentEnd - 0.05; i++, t = START + i * step) {
    const degree = chordAt(t) + arpPattern[i % arpPattern.length]
    events.push({
      time: t,
      duration: 0.4 * beat,
      note: scaleNote(root, scale, degree, 5),
      velocity: i % 2 === 0 ? 0.3 : 0.24,
      role: 'arp',
    })
  }

  // ---- Percussions : grosse caisse sur les temps forts, charley en croches ----
  const bar = 4 * beat
  for (let t = START; t < contentEnd - 0.05; t += bar) {
    events.push({ time: t, duration: 0.2, note: 'C1', velocity: 0.85, role: 'kick' })
    events.push({ time: t + 2 * beat, duration: 0.2, note: 'C1', velocity: 0.7, role: 'kick' })
    if (energy > 0.55) {
      events.push({ time: t + 1.5 * beat, duration: 0.15, note: 'C1', velocity: 0.5, role: 'kick' })
    }
  }
  for (let i = 0, t = START; t < contentEnd - 0.05; i++, t = START + i * step) {
    // Une croche sur huit respire, sauf quand le texte est tres energique.
    if (i % 8 === 7 && energy < 0.6) continue
    events.push({ time: t, duration: 0.05, note: 'C6', velocity: i % 2 === 0 ? 0.32 : 0.18, role: 'hat' })
  }

  // ---- Forme : un contenu court est rejoue en second passage plus doux ----
  const { events: finalEvents, end } = repeatIfShort(events, MIN_CONTENT)

  return {
    events: finalEvents,
    duration: Math.min(end + 2.5, MAX_DURATION * 2),
    effects: {
      reverbWet: clamp(0.15 + avgSentenceLen / 60, 0.15, 0.45),
      delayWet: clamp(0.3 - uniqueRatio * 0.25, 0.05, 0.3),
      delayFeedback: clamp(0.5 - uniqueRatio * 0.3, 0.15, 0.5),
      chorusDepth: clamp(exclamCount / sentenceCount, 0, 0.6),
      filterCutoff: clamp(1200 + uniqueRatio * 6000, 1200, 7200),
    },
    scaleName,
  }
}
