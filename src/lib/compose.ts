import { mini } from '@strudel/mini'
import { n, rev, silence, slowcat, s as sound, timeCat, type Pattern } from '@strudel/core'
import {
  clamp,
  lerp,
  pick,
  type ArpPatch,
  type BassPatch,
  type HatPatch,
  type KickPatch,
  type LeadPatch,
  type PadPatch,
  type Sequence,
  type SequenceEffects,
  type SequenceTimbre,
  type SnarePatch,
} from './sequence'
import { compile, gate, layer, scaleRef, sequenceDuration, type ScaleDef } from './strudel'

// Moteur de composition commun au texte et a l'image.
//
// L'analyse de contenu ne produit pas directement des notes : elle produit un
// Brief, c'est-a-dire une intention musicale (couleur, energie, densite,
// tension, espace) accompagnee d'une ligne melodique brute. C'est ce module
// qui transforme cette intention en piece complete.
//
// La diversite vient de six leviers independants, tous pilotes par le
// contenu : le style (six archetypes aux instrumentations distinctes), la
// gamme (vingt-quatre disponibles), la tonique (douze), la metrique (3 a 7
// temps), la forme (arc d'intensite qui fait entrer et sortir les voix) et
// les timbres (chaque voix a sa propre famille de patches).

// ---------------------------------------------------------------------------
// Entree du moteur
// ---------------------------------------------------------------------------

// Un pas de la ligne melodique brute, tel que l'analyse le produit.
export interface MelodyStep {
  // Degre dans la gamme ; peut depasser sa taille, l'excedent monte d'octave.
  degree: number
  // Duree relative, exprimee en croches.
  weight: number
  velocity: number
  // Decalage d'octave par rapport au registre de base.
  octave: number
  rest: boolean
}

export interface Brief {
  scale: ScaleDef
  // Classe de hauteur de la tonique [0..11].
  root: number
  // Caracteres continus, tous normalises.
  energy: number // 0..1  agitation rythmique
  density: number // 0..1  remplissage, nombre de voix actives
  tension: number // 0..1  mouvement harmonique et dissonance
  space: number // 0..1  reverberation et delay
  melody: MelodyStep[]
  // Progression harmonique en degres d'echelle, un par section.
  progression: number[]
  // Hashes independants : chaque choix secondaire tire sur le sien, de sorte
  // que deux contenus proches ne basculent pas ensemble sur tous les criteres.
  hashes: number[]
  // Identite du contenu : pour un texte, les champs semantiques dominants ;
  // pour une image, sa signature chromatique. C'est elle qui pilote la gamme
  // et les timbres, de sorte que deux contenus de meme nature se reconnaissent
  // entre eux. Le rythme et la forme restent tires de la surface, pour qu'ils
  // se ressemblent sans se confondre.
  signature: number
  // Duree cible en secondes, avant ajustement sur la metrique.
  targetSeconds: number
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

// Duree maximale d'une piece, hors queue de reverberation.
const MAX_SECONDS = 75

export type StyleId = 'nocturne' | 'houle' | 'carillon' | 'cascade' | 'fracture' | 'pulsation'

interface StyleDef {
  id: StyleId
  // Plage de tempo, en pulsations par minute.
  bpm: [number, number]
  // Metriques admises, en pulsations par cycle.
  meters: number[]
  // Facteur de duree des notes : staccato sous 1, legato au-dessus.
  legato: number
  // Registre de base de la melodie.
  leadOctave: number
  // Queue laissee apres la derniere note, en secondes.
  tail: number
  timbres: {
    lead: LeadPatch[]
    pad: PadPatch[]
    bass: BassPatch[]
    arp: ArpPatch[]
    kick: KickPatch[]
    snare: SnarePatch[]
    hat: HatPatch[]
  }
}

const STYLES: Record<StyleId, StyleDef> = {
  nocturne: {
    id: 'nocturne',
    bpm: [56, 74],
    meters: [4, 3, 6],
    legato: 1.35,
    leadOctave: 4,
    tail: 6,
    timbres: {
      lead: ['verre', 'cloche', 'rhodes'],
      pad: ['halo', 'souffle', 'choeur'],
      bass: ['sub', 'ronde'],
      arp: ['cristal', 'boite'],
      kick: ['profonde'],
      snare: ['balai'],
      hat: ['scintillante'],
    },
  },
  houle: {
    id: 'houle',
    bpm: [68, 88],
    meters: [4, 6],
    legato: 1.2,
    leadOctave: 4,
    tail: 5.5,
    timbres: {
      lead: ['rhodes', 'anche', 'verre'],
      pad: ['choeur', 'halo', 'cordes'],
      bass: ['sub', 'ronde', 'grondante'],
      arp: ['boite', 'goutte'],
      kick: ['profonde', 'ample'],
      snare: ['rim', 'balai'],
      hat: ['sable', 'fermee'],
    },
  },
  carillon: {
    id: 'carillon',
    bpm: [88, 116],
    meters: [5, 7, 3],
    legato: 0.75,
    leadOctave: 5,
    tail: 4.5,
    timbres: {
      lead: ['cloche', 'verre', 'corde'],
      pad: ['souffle', 'halo'],
      bass: ['pincee', 'ronde'],
      arp: ['kalimba', 'boite', 'cristal'],
      kick: ['seche', 'profonde'],
      snare: ['rim'],
      hat: ['fermee', 'scintillante'],
    },
  },
  cascade: {
    id: 'cascade',
    bpm: [98, 126],
    meters: [4, 6],
    legato: 0.85,
    leadOctave: 5,
    tail: 4,
    timbres: {
      lead: ['cloche', 'rhodes', 'verre'],
      pad: ['cordes', 'choeur', 'halo'],
      bass: ['ronde', 'pincee'],
      arp: ['cristal', 'goutte', 'boite'],
      kick: ['seche', 'profonde'],
      snare: ['clap', 'rim'],
      hat: ['fermee', 'scintillante'],
    },
  },
  fracture: {
    id: 'fracture',
    bpm: [86, 108],
    meters: [4, 7, 5],
    legato: 0.6,
    leadOctave: 5,
    tail: 3.5,
    timbres: {
      lead: ['corde', 'anche', 'verre'],
      pad: ['souffle', 'cordes'],
      bass: ['grondante', 'pincee', 'sub'],
      arp: ['goutte', 'cristal'],
      kick: ['seche', 'ample'],
      snare: ['rim', 'clap'],
      hat: ['sable', 'fermee'],
    },
  },
  pulsation: {
    id: 'pulsation',
    bpm: [116, 134],
    meters: [4],
    legato: 0.7,
    leadOctave: 4,
    tail: 3.5,
    timbres: {
      lead: ['anche', 'corde', 'rhodes'],
      pad: ['cordes', 'choeur'],
      bass: ['grondante', 'sub'],
      arp: ['goutte', 'cristal'],
      kick: ['ample', 'profonde'],
      snare: ['clap'],
      hat: ['fermee', 'sable'],
    },
  },
}

// L'energie choisit la famille, le hash departage : la correlation au contenu
// reste lisible sans que tous les textes calmes tombent sur le meme style.
const STYLE_BANDS: [number, StyleId[]][] = [
  [0.18, ['nocturne', 'houle']],
  [0.34, ['nocturne', 'houle', 'carillon']],
  [0.5, ['houle', 'carillon', 'cascade']],
  [0.66, ['carillon', 'cascade', 'fracture']],
  [0.82, ['cascade', 'fracture', 'pulsation']],
  [1.01, ['fracture', 'pulsation']],
]

function pickStyle(energy: number, hash: number): StyleDef {
  const band = STYLE_BANDS.find(([ceiling]) => energy < ceiling) ?? STYLE_BANDS[STYLE_BANDS.length - 1]
  return STYLES[pick(band[1], hash)]
}

// ---------------------------------------------------------------------------
// Forme
// ---------------------------------------------------------------------------

// Arcs d'intensite disponibles. Chaque valeur est un niveau de 0 (nappes
// seules) a 3 (tutti) ; les voix entrent et sortent en suivant cette courbe,
// ce qui donne a la piece une vraie forme plutot qu'un bloc homogene.
const ARCS: number[][] = [
  [0, 1, 2, 3, 2, 1],
  [0, 1, 3, 1, 3, 2],
  [1, 2, 3, 3, 1, 0],
  [0, 2, 1, 3, 2, 3],
  [1, 3, 2, 3, 1, 1],
  [0, 1, 1, 2, 3, 3],
]

// Voix actives par niveau d'intensite.
const LEVEL_VOICES: Record<number, Set<string>> = {
  0: new Set(['pad', 'lead']),
  1: new Set(['pad', 'lead', 'bass', 'hat']),
  2: new Set(['pad', 'lead', 'bass', 'arp', 'kick', 'hat']),
  3: new Set(['pad', 'lead', 'bass', 'arp', 'kick', 'snare', 'hat']),
}

// ---------------------------------------------------------------------------
// Helpers de patterns
// ---------------------------------------------------------------------------

// Une valeur differente a chaque cycle de la piece.
function perCycle(count: number, build: (index: number) => Pattern): Pattern {
  const cycles: Pattern[] = []
  for (let i = 0; i < count; i++) cycles.push(build(i))
  return cycles.length > 0 ? slowcat(...cycles) : silence
}

// Repartit la ligne melodique sur les cycles en respectant les durees
// relatives : une note qui ne tient pas dans le cycle courant demarre au
// cycle suivant, ce qui aligne les phrases sur les mesures.
function melodyCycles(steps: MelodyStep[], stepsPerCycle: number, scaleSize: number): Pattern[] {
  const cycles: Pattern[] = []
  let current: [number, Pattern][] = []
  let used = 0

  const flush = () => {
    if (used < stepsPerCycle) current.push([stepsPerCycle - used, silence])
    if (current.length > 0) cycles.push(timeCat(...current))
    current = []
    used = 0
  }

  for (const step of steps) {
    const weight = clamp(Math.round(step.weight), 1, stepsPerCycle)
    if (used + weight > stepsPerCycle) flush()
    // Fenetre d'une octave et demie autour du registre de base, et decalage
    // d'octave borne : la ligne garde son relief sans monter indefiniment.
    const degree =
      fold(step.degree, Math.round(scaleSize * 1.5)) + clamp(step.octave, -1, 1) * scaleSize
    current.push([weight, step.rest ? silence : n(degree).gain(step.velocity)])
    used += weight
  }
  if (used > 0) flush()
  return cycles
}

// Une progression peut arriver degeneree : contenu d'une seule phrase, ou
// image monochrome dont toutes les bandes donnent le meme accord. On la
// prolonge et on la diversifie avec des degres consonants tires du hash,
// sinon la piece resterait immobile sur la tonique de bout en bout.
function extendProgression(progression: number[], minimum: number, hash: number): number[] {
  const pool = [0, 5, 3, 4, 2, 6]
  const degree = (i: number) => pool[Math.abs(hash + i * 7919) % pool.length]
  const uniform = progression.length === 0 || new Set(progression).size === 1
  const extended = uniform
    ? [0, ...Array.from({ length: Math.max(minimum, progression.length) - 1 }, (_, i) => degree(i))]
    : [...progression]
  let i = extended.length
  while (extended.length < minimum) {
    extended.push(degree(i))
    i++
  }
  return extended
}

// Ramene un degre dans une fenetre de registre. Sans cela les degres
// s'additionnent - accord de la section, puis figure de la voix, puis decalage
// d'octave - et chaque voix derive vers l'aigu jusqu'a quitter le registre ou
// elle sonne. Le repliement conserve la classe de hauteur, donc l'harmonie.
function fold(degree: number, span: number): number {
  return ((degree % span) + span) % span
}

// Accord de trois sons empiles dans l'espace de la gamme : consonant sur
// toutes les echelles de la palette.
function chord(degree: number): Pattern {
  return n(mini(`${degree},${degree + 2},${degree + 4}`))
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export function composeBrief(brief: Brief): Sequence {
  const [h0, h1, h2, h3, h4] = brief.hashes
  const style = pickStyle(brief.energy, h0)
  const scale = brief.scale

  const meter = pick(style.meters, h1)
  const bpm = Math.round(lerp(style.bpm[0], style.bpm[1], brief.energy * 0.7 + (h2 % 100) / 300))
  const cps = bpm / 60 / meter
  const stepsPerCycle = meter * 2 // la croche est le pas de base

  // --- Forme : arc d'intensite decoupe en sections ---
  const arc = pick(ARCS, h3)
  const melodyPats = melodyCycles(brief.melody, stepsPerCycle, scale.size)
  const minCycles = Math.ceil(brief.targetSeconds * cps)
  // Plafond ferme : une piece ne depasse jamais MAX_SECONDS, quel que soit le
  // volume du contenu ou la lenteur du tempo.
  const maxCycles = Math.max(arc.length, Math.floor(MAX_SECONDS * cps))
  const cycles = clamp(Math.max(melodyPats.length, minCycles, arc.length), arc.length, maxCycles)

  const sectionLength = Math.max(1, Math.ceil(cycles / arc.length))
  const levelAt = (cycle: number) => arc[Math.min(Math.floor(cycle / sectionLength), arc.length - 1)]
  const gateFor = (voice: string) => {
    const active: boolean[] = []
    for (let c = 0; c < cycles; c++) active.push(LEVEL_VOICES[levelAt(c)].has(voice))
    return gate(active)
  }

  // --- Harmonie : un accord par section, la premiere pose la tonique ---
  const progression = extendProgression(brief.progression, 4, h4)
  const chordAt = (cycle: number) =>
    progression[Math.min(Math.floor(cycle / sectionLength), progression.length - 1) % progression.length]

  // La melodie boucle si le contenu est plus court que la piece. Quand elle
  // tient en un ou deux cycles, on la transpose sur l'accord courant : un
  // contenu bref garde ainsi un mouvement harmonique au lieu de ressasser la
  // meme hauteur.
  // Materiau melodique pauvre : une phrase tres courte, ou un contenu presque
  // uniforme (aplat de couleur, mot unique) qui ne fournit qu'une poignee de
  // degres. Dans ces cas la ligne suit la progression harmonique, sinon la
  // piece resterait figee sur la meme hauteur du debut a la fin.
  const distinctDegrees = new Set(brief.melody.filter((step) => !step.rest).map((step) => step.degree)).size
  const shortLoop = melodyPats.length > 0 && (melodyPats.length < 3 || distinctDegrees < 3)
  const melodyAt = (cycle: number) => {
    if (melodyPats.length === 0) return silence
    const base = melodyPats[cycle % melodyPats.length]
    const offset = shortLoop ? chordAt(cycle) : 0
    return offset === 0 ? base : base.add(n(offset))
  }

  // Registres : la melodie occupe le medium, l'arpege se pose juste au-dessus
  // au lieu de deux octaves plus haut, les nappes tiennent le bas-medium et la
  // basse descend a l'octave 1. L'equilibre grave/medium/aigu se joue ici.
  const refLead = scaleRef(brief.root, style.leadOctave - 1, scale)
  const refPad = scaleRef(brief.root, style.leadOctave - 2, scale)
  const refBass = scaleRef(brief.root, 1, scale)
  const refArp = scaleRef(brief.root, style.leadOctave, scale)

  const voices = buildVoices({
    style,
    brief,
    cycles,
    stepsPerCycle,
    meter,
    melodyAt,
    chordAt,
    refs: { lead: refLead, pad: refPad, bass: refBass, arp: refArp },
    gateFor,
    hashes: brief.hashes,
  })

  const events = compile(voices, { cps, cycles, start: 0.25, legato: style.legato })
  const effects = buildEffects(style, brief)

  return {
    events,
    // La piece laisse au moins de quoi laisser mourir la reverberation :
    // sans cela une nappe a longue queue serait tranchee net a la fin.
    duration: sequenceDuration(events, Math.max(style.tail, effects.reverbDecay * 0.8)),
    effects,
    timbre: buildTimbre(style, brief),
    scaleName: scale.label,
    styleName: style.id,
  }
}

interface VoiceContext {
  style: StyleDef
  brief: Brief
  cycles: number
  stepsPerCycle: number
  meter: number
  melodyAt: (cycle: number) => Pattern
  chordAt: (cycle: number) => number
  refs: { lead: string; pad: string; bass: string; arp: string }
  gateFor: (voice: string) => Pattern
  hashes: number[]
}

function buildVoices(ctx: VoiceContext): Pattern {
  const { style, brief, cycles, meter, melodyAt, chordAt, refs, gateFor } = ctx
  const [, , , h3, h4, h5] = ctx.hashes
  const id = style.id
  const size = brief.scale.size

  // --- Melodie ---
  let lead = perCycle(cycles, melodyAt).scale(refs.lead).s('lead')
  if (brief.tension > 0.55) lead = lead.off(1 / (meter * 2), (x) => x.add(n(4)).gain(0.32))
  if (id === 'fracture') lead = lead.every(4, (x) => x.chunk(2, (y) => y.fast(2)))
  if (id === 'cascade' || id === 'carillon') lead = lead.jux(rev)
  if (id === 'pulsation') lead = lead.every(8, (x) => x.ply(2))

  // --- Nappes : accord tenu, souffle par la densite ---
  const padGain = lerp(0.26, 0.42, brief.density)
  // Doublure grave sur la seule fondamentale : doubler l'accord entier une
  // octave plus bas empaterait le bas du spectre, ou les intervalles serres
  // deviennent trouble.
  let pad = layer(
    perCycle(cycles, (c) => chord(fold(chordAt(c), size))).gain(padGain),
    perCycle(cycles, (c) => n(fold(chordAt(c), size) - size)).gain(padGain * 0.95),
  )
    .scale(refs.pad)
    .s('pad')
  if (brief.space > 0.6) pad = pad.superimpose((x) => x.add(n(2)).gain(0.14).late(0.25))

  // --- Basse ---
  // Les figures sont ecrites en degres replies : la basse reste dans son
  // octave au lieu de grimper avec la progression.
  const f = (d: number, offset = 0) => fold(d + offset, size)
  const bassFigure: Record<StyleId, (d: number) => string> = {
    nocturne: (d) => `${f(d)}`,
    houle: (d) => `${f(d)} ~ ~ ${f(d, 4)}`,
    carillon: (d) => `${f(d)} ~ ${f(d, 4)} ~ ${f(d, 2)}`,
    cascade: (d) => `${f(d)} ${f(d)} ${f(d, 4)} ${f(d, 2)}`,
    fracture: (d) => `${f(d)} ~ ${f(d, 4)} ${f(d)} ~ ${f(d, 2)} ~`,
    pulsation: (d) => `${f(d)}*${meter}`,
  }
  const bassGain = lerp(0.45, 0.68, brief.energy)
  let bass = perCycle(cycles, (c) => n(mini(bassFigure[id](chordAt(c)))))
    .gain(bassGain)
    // Doublure a l'octave superieure : c'est elle qu'on entend reellement sur
    // un petit haut-parleur, le fondamental restant en dessous pour l'assise.
    .superimpose((x) => x.add(n(size)).gain(bassGain * 0.75))
    .scale(refs.bass)
    .s('bass')
  if (id === 'pulsation') bass = bass.every(4, (x) => x.ply(2))
  if (id === 'fracture') bass = bass.sometimesBy(0.3, (x) => x.fast(2))

  // --- Arpege ---
  const arpRate = id === 'cascade' ? 4 : id === 'pulsation' ? 4 : id === 'nocturne' ? 1 : 2
  const arpShapes = ['0 2 4 2', '0 4 2 4', '4 2 0 2', '0 2 4 6', '4 6 2 0']
  const shape = pick(arpShapes, h4)
  let arp = perCycle(cycles, (c) => {
    const d = chordAt(c)
    const degrees = shape
      .split(' ')
      .map((x) => fold(Number(x) + d, Math.round(size * 1.5)))
      .join(' ')
    return n(mini(degrees))
  })
    .fast(arpRate)
    .scale(refs.arp)
    .s('arp')
    .gain(lerp(0.18, 0.34, brief.density))
  arp = brief.density > 0.45 ? arp.jux(rev) : arp.pan(0.36)
  if (id === 'fracture') arp = arp.degradeBy(0.35)
  if (brief.density < 0.3) arp = arp.degradeBy(0.3)
  if (id === 'carillon') arp = arp.every(3, (x) => x.rev())

  // --- Percussions : euclidien pilote par le contenu ---
  const kickSteps = meter * 2
  const kickPulses = clamp(
    Math.round(lerp(2, kickSteps - 2, brief.energy * 0.8 + (h5 % 40) / 200)),
    1,
    kickSteps - 1,
  )
  const kickPattern =
    id === 'pulsation'
      ? `kick*${meter}`
      : id === 'nocturne'
        ? `kick(2,${kickSteps})`
        : `kick(${kickPulses},${kickSteps},${h5 % 4})`
  let kick = sound(mini(kickPattern)).note('C1').gain(lerp(0.7, 0.95, brief.energy))
  if (id === 'fracture') kick = kick.every(4, (x) => x.ply(2))

  const snarePulses = clamp(Math.round(lerp(1, 5, brief.energy)), 1, 6)
  const snarePattern =
    id === 'pulsation' ? `~ snare ~ snare` : `snare(${snarePulses},${meter * 2},${(h3 % 3) + 1})`
  const snare = sound(mini(snarePattern)).note('D2').gain(lerp(0.4, 0.72, brief.energy))

  const hatRate = id === 'nocturne' ? 2 : id === 'fracture' ? 8 : 4
  let hat = sound(mini(`hat*${hatRate}`))
    .note('F#5')
    .gain(lerp(0.16, 0.34, brief.energy))
  hat = hat.degradeBy(clamp(0.42 - brief.energy * 0.35, 0.04, 0.42))
  if (id === 'fracture') hat = hat.sometimesBy(0.25, (x) => x.ply(2))
  if (id !== 'nocturne') hat = hat.jux(rev)

  // --- Mise en forme : chaque voix suit l'arc d'intensite ---
  return layer(
    lead.mask(gateFor('lead')),
    pad.mask(gateFor('pad')),
    bass.mask(gateFor('bass')),
    arp.mask(gateFor('arp')),
    kick.mask(gateFor('kick')),
    snare.mask(gateFor('snare')),
    hat.mask(gateFor('hat')),
  )
}

function buildEffects(style: StyleDef, brief: Brief): SequenceEffects {
  const spacious = style.id === 'nocturne' || style.id === 'houle'
  return {
    reverbWet: clamp(lerp(spacious ? 0.34 : 0.14, spacious ? 0.66 : 0.42, brief.space), 0.1, 0.7),
    reverbDecay: lerp(spacious ? 4.5 : 2.2, spacious ? 9 : 5, brief.space),
    delayWet: clamp(lerp(0.06, style.id === 'houle' ? 0.45 : 0.3, brief.space * 0.7 + brief.tension * 0.3), 0.04, 0.45),
    delayFeedback: clamp(lerp(0.18, style.id === 'houle' ? 0.62 : 0.48, brief.tension), 0.15, 0.62),
    // Delay cale sur la croche pointee du tempo : toujours dans le groove.
    delayTime: clamp((60 / lerp(style.bpm[0], style.bpm[1], brief.energy)) * 0.75, 0.12, 0.9),
    chorusDepth: clamp(lerp(0.1, 0.7, brief.space * 0.5 + brief.density * 0.5), 0, 0.7),
    filterCutoff: clamp(lerp(1800, 11000, brief.density * 0.55 + brief.energy * 0.45), 1600, 11500),
  }
}

function buildTimbre(style: StyleDef, brief: Brief): SequenceTimbre {
  // Les cinq tirages derivent tous de la signature : deux contenus de meme
  // nature s'instrumentent pareil, a style egal.
  const [a, b, c, d, e] = [1, 7, 13, 29, 37].map((k) => Math.abs(brief.signature * k + k))
  return {
    lead: pick(style.timbres.lead, a),
    pad: pick(style.timbres.pad, b),
    bass: pick(style.timbres.bass, c),
    arp: pick(style.timbres.arp, d),
    kick: pick(style.timbres.kick, e),
    snare: pick(style.timbres.snare, a + b),
    hat: pick(style.timbres.hat, c + d),
    detune: clamp(brief.space * 0.6 + brief.density * 0.4, 0, 1),
    brightness: clamp(brief.energy * 0.5 + brief.tension * 0.5, 0, 1),
  }
}
