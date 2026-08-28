import { clamp, lerp } from './sequence'
import { pickScale, scaleForField } from './strudel'
import { profileOf, signatureOf } from './lexicon'
import type { Brief, MelodyStep } from './compose'

// Analyse d'un texte en intention musicale.
//
// Ce module ne produit aucune note directement : il extrait une vingtaine de
// caracteristiques du texte, les traduit en un Brief (couleur, energie,
// densite, tension, espace, ligne melodique, progression) et laisse le moteur
// de composition faire la musique.
//
// Le parti pris est de faire porter chaque decision musicale par une
// caracteristique differente, pour que deux textes distincts divergent sur
// plusieurs axes a la fois plutot que d'etre le meme morceau transpose.

const MAX_DURATION = 75
const VOWELS = 'aeiouy'
const ACCENTED = 'àâäéèêëîïôöùûüÿçñ'

interface Analysis {
  words: string[]
  tokens: Token[]
  sentences: string[][]
  avgWordLen: number
  wordLenSpread: number
  vowelRatio: number
  accentRatio: number
  upperRatio: number
  digitRatio: number
  uniqueRatio: number
  repetitionRatio: number
  questionRatio: number
  exclamRatio: number
  commaRatio: number
  ellipsisRatio: number
  avgSentenceLen: number
  paragraphs: number
  hashes: number[]
}

interface Token {
  kind: 'word' | 'pause'
  word?: string
  // Duree du silence, en croches.
  steps?: number
  accent?: boolean
  question?: boolean
  newline?: boolean
}

// Hash deterministe : le meme mot produit toujours la meme note.
function hashString(input: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(h, 31) + input.charCodeAt(i)) >>> 0
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
      if (part.includes('\n')) tokens.push({ kind: 'pause', steps: 4, newline: true })
      continue
    }
    if (/^[.,;:!?…]$/u.test(part)) {
      if (part === ',' || part === ';' || part === ':') tokens.push({ kind: 'pause', steps: 1 })
      else if (part === '…') tokens.push({ kind: 'pause', steps: 5 })
      else tokens.push({ kind: 'pause', steps: 3 })
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

function analyze(text: string): Analysis {
  const tokens = tokenize(text)
  const words = tokens.filter((t) => t.kind === 'word').map((t) => t.word as string)
  if (words.length === 0) {
    throw new Error('Le texte ne contient aucun mot exploitable.')
  }

  // Decoupage en phrases, pour la progression harmonique.
  const sentences: string[][] = []
  let currentSentence: string[] = []
  for (const token of tokens) {
    if (token.kind === 'word') currentSentence.push(token.word as string)
    else if ((token.steps ?? 0) >= 3 && currentSentence.length > 0) {
      sentences.push(currentSentence)
      currentSentence = []
    }
  }
  if (currentSentence.length > 0) sentences.push(currentSentence)
  if (sentences.length === 0) sentences.push(words)

  const letters = words.join('')
  const lengths = words.map((w) => w.length)
  const avgWordLen = lengths.reduce((a, b) => a + b, 0) / lengths.length
  // Ecart-type des longueurs : un texte au debit regulier sonne autrement
  // qu'un texte qui alterne mots brefs et mots longs.
  const variance = lengths.reduce((a, l) => a + (l - avgWordLen) ** 2, 0) / lengths.length
  const wordLenSpread = clamp(Math.sqrt(variance) / 4, 0, 1)

  let vowels = 0
  let accents = 0
  for (const ch of letters) {
    if (VOWELS.includes(ch)) vowels++
    if (ACCENTED.includes(ch)) accents++
  }

  const upperCount = (text.match(/\p{Lu}/gu) ?? []).length
  const alphaCount = Math.max((text.match(/\p{L}/gu) ?? []).length, 1)
  const digitCount = (text.match(/\p{N}/gu) ?? []).length

  const counts = {
    question: (text.match(/\?/g) ?? []).length,
    exclam: (text.match(/!/g) ?? []).length,
    comma: (text.match(/[,;:]/g) ?? []).length,
    ellipsis: (text.match(/…|\.\.\./g) ?? []).length,
  }

  const frequencies = new Map<string, number>()
  for (const w of words) frequencies.set(w, (frequencies.get(w) ?? 0) + 1)
  const maxFrequency = Math.max(...frequencies.values())

  // Six projections independantes du texte : chaque choix musical secondaire
  // tire sur la sienne, ce qui evite que deux textes proches basculent
  // ensemble sur tous les criteres a la fois.
  const hashes = [
    hashString(letters, 0x9e37),
    hashString(words.slice().reverse().join(''), 0x85eb),
    hashString(words.map((w) => w.length).join(','), 0xc2b2),
    hashString([...new Set(words)].sort().join(''), 0x27d4),
    hashString(sentences.map((s) => s.length).join(','), 0x165667),
    hashString(text.replace(/\p{L}|\p{N}/gu, ''), 0xd3a2),
  ]

  return {
    words,
    tokens,
    sentences,
    avgWordLen,
    wordLenSpread,
    vowelRatio: vowels / Math.max(letters.length, 1),
    accentRatio: accents / Math.max(letters.length, 1),
    upperRatio: upperCount / alphaCount,
    digitRatio: digitCount / Math.max(text.length, 1),
    uniqueRatio: frequencies.size / words.length,
    repetitionRatio: clamp((maxFrequency - 1) / Math.max(words.length * 0.2, 1), 0, 1),
    questionRatio: counts.question / sentences.length,
    exclamRatio: counts.exclam / sentences.length,
    commaRatio: counts.comma / words.length,
    ellipsisRatio: counts.ellipsis / sentences.length,
    avgSentenceLen: words.length / sentences.length,
    paragraphs: (text.match(/\n+/g) ?? []).length + 1,
    hashes,
  }
}

export function briefFromText(text: string): Brief {
  const a = analyze(text)

  // Ce que le texte *dit*, en plus de ce dont il a l'air. Le profil pese
  // d'autant plus que le lexique reconnait de mots : un texte sans vocabulaire
  // marque garde exactement le comportement de l'analyse de surface.
  const profile = profileOf(a.words)
  const influence = clamp(profile.coverage * 2.2, 0, 0.62)
  const blend = (surface: number, semantic: number) => surface * (1 - influence) + semantic * influence

  // --- Caracteres continus, chacun porte par des traits differents ---

  // Energie : ponctuation exclamative, majuscules, mots brefs, chiffres,
  // temperee par l'agitation du vocabulaire.
  const energy = blend(
    clamp(
    0.14 +
      clamp(a.exclamRatio, 0, 1) * 0.3 +
      clamp(a.upperRatio * 3, 0, 1) * 0.22 +
      clamp((6.2 - a.avgWordLen) / 3.4, 0, 1) * 0.24 +
      clamp(a.digitRatio * 8, 0, 1) * 0.12 +
      a.wordLenSpread * 0.12,
      0,
      1,
    ),
    profile.arousal,
  )

  // Couleur affective : les voyelles ouvrent, les questions suspendent, les
  // accents colorent modalement, les points de suspension assombrissent.
  const brightness = blend(
    clamp(
      (a.vowelRatio - 0.38) * 5 -
      clamp(a.questionRatio, 0, 1) * 0.75 -
      clamp(a.ellipsisRatio, 0, 1) * 0.5 +
      clamp(a.exclamRatio, 0, 1) * 0.3 -
        clamp(a.accentRatio * 6, 0, 1) * 0.25,
      -1,
      1,
    ),
    profile.valence,
  )

  // Densite : richesse du vocabulaire et longueur des phrases.
  const density = clamp(a.uniqueRatio * 0.55 + clamp(a.avgSentenceLen / 22, 0, 1) * 0.45, 0, 1)

  // Tension : virgules serrees, questions, ecart de longueur des mots.
  const tension = blend(
    clamp(
      clamp(a.commaRatio * 5, 0, 1) * 0.34 + clamp(a.questionRatio, 0, 1) * 0.33 + a.wordLenSpread * 0.33,
      0,
      1,
    ),
    profile.tension,
  )

  // Espace : phrases longues, suspensions, paragraphes, faible energie.
  const space = blend(
    clamp(
      clamp(a.avgSentenceLen / 26, 0, 1) * 0.34 +
        clamp(a.ellipsisRatio, 0, 1) * 0.26 +
        clamp(a.paragraphs / 6, 0, 1) * 0.2 +
        (1 - energy) * 0.2,
      0,
      1,
    ),
    profile.space,
  )

  // Les champs dominants signent la piece. Sans vocabulaire reconnu, on
  // retombe sur un hash de surface : le comportement reste inchange.
  const hasTheme = profile.dominant.length > 0 && profile.coverage >= 0.06
  const signature = hasTheme ? signatureOf(profile) : a.hashes[0] % 512
  // Un texte thematique tire sa gamme de son sujet, un texte sans vocabulaire
  // marque la tire de sa seule couleur de surface.
  const scale = hasTheme ? scaleForField(profile.dominant[0], signature) : pickScale(brightness, signature)
  // La tonique combine la premiere lettre du texte et un hash global : deux
  // textes commencant pareil ne partent pas systematiquement du meme son.
  const root = (a.words[0].charCodeAt(0) + (a.hashes[1] % 7)) % 12

  // --- Ligne melodique ---
  const melody: MelodyStep[] = []
  let octave = 0
  let position = 0
  const seen = new Map<string, number>()

  for (const token of a.tokens) {
    if (token.kind === 'pause') {
      melody.push({ degree: 0, weight: token.steps ?? 1, velocity: 0, octave: 0, rest: true })
      // Un saut de ligne change de registre : la piece respire par blocs.
      if (token.newline) octave = octave === 0 ? 1 : 0
      position = 0
      continue
    }

    const word = token.word as string
    const hash = hashString(word, 0x1b3f)
    // Un mot deja entendu revient sur son degre, decale d'une quinte : le
    // vocabulaire repete devient un motif reconnaissable.
    const prior = seen.get(word) ?? 0
    const degree = (hash % (scale.size * 2)) + (prior > 0 ? 4 : 0)
    seen.set(word, prior + 1)

    melody.push({
      degree,
      weight: clamp(Math.round(word.length / 1.9), 1, 6),
      velocity: token.accent ? 0.95 : clamp(0.5 + position * 0.02 + (word.length > 7 ? 0.1 : 0), 0.34, 0.86),
      octave: octave + (token.question ? 1 : 0) + (word.length > 10 ? -1 : 0),
      rest: false,
    })
    position++
  }

  // --- Progression harmonique : un degre par phrase ---
  // Plus la tension est haute, plus la progression s'eloigne de la tonique.
  const pools = [
    [0, 5, 3, 4],
    [0, 3, 5, 1],
    [0, 4, 2, 5],
    [0, 6, 4, 2],
    [0, 2, 6, 3],
  ]
  const pool = pools[Math.floor(tension * (pools.length - 0.01))]
  const progression = a.sentences.map((sentence, i) =>
    i === 0 ? 0 : pool[hashString(sentence.join(''), 0x7f4a) % pool.length],
  )

  return {
    scale,
    root,
    energy,
    density,
    tension,
    space,
    melody,
    progression,
    hashes: a.hashes,
    signature,
    targetSeconds: clamp(lerp(11, MAX_DURATION, clamp(a.words.length / 120, 0, 1)), 11, MAX_DURATION),
  }
}
