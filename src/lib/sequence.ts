// Types partages entre l'analyse du contenu, la composition Strudel et le
// moteur de rendu Tone.
//
// Une Sequence est la description complete et deterministe d'une piece :
// evenements, timbres, effets. Elle est produite par la composition et
// consommee par le rendu ; rien d'autre ne circule entre les deux.

export type SynthRole = 'lead' | 'pad' | 'bass' | 'arp' | 'kick' | 'snare' | 'hat'

export const ROLES: readonly SynthRole[] = ['lead', 'pad', 'bass', 'arp', 'kick', 'snare', 'hat']

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
  // Position stereo [-1..1]. Alimentee par les operateurs Strudel (jux, pan).
  pan: number
}

export interface SequenceEffects {
  // Part de signal traite [0..1] pour chaque effet.
  reverbWet: number
  // Longueur de la queue de reverberation, en secondes.
  reverbDecay: number
  delayWet: number
  delayFeedback: number
  // Temps du delay en secondes, cale sur le tempo de la piece.
  delayTime: number
  chorusDepth: number
  // Frequence de coupure du filtre passe-bas global, en Hz.
  filterCutoff: number
}

// Chaque voix melodique dispose d'une petite famille de timbres nommes.
// Le choix est fait par l'analyse : deux contenus differents ne sonnent pas
// seulement sur d'autres notes, ils sonnent avec d'autres instruments.
export type LeadPatch = 'rhodes' | 'cloche' | 'verre' | 'anche' | 'corde'
export type PadPatch = 'choeur' | 'cordes' | 'halo' | 'souffle'
export type BassPatch = 'ronde' | 'sub' | 'grondante' | 'pincee'
export type ArpPatch = 'kalimba' | 'cristal' | 'boite' | 'goutte'
export type KickPatch = 'profonde' | 'seche' | 'ample'
export type SnarePatch = 'clap' | 'rim' | 'balai'
export type HatPatch = 'fermee' | 'scintillante' | 'sable'

export interface SequenceTimbre {
  lead: LeadPatch
  pad: PadPatch
  bass: BassPatch
  arp: ArpPatch
  kick: KickPatch
  snare: SnarePatch
  hat: HatPatch
  // Desaccord des nappes [0..1] : de la sinusoide pure au choeur large.
  detune: number
  // Ouverture generale des timbres [0..1] : agit sur l'indice FM et les
  // enveloppes, du plus feutre au plus mordant.
  brightness: number
}

export interface Sequence {
  events: SoundEvent[]
  // Duree totale en secondes, queue de reverb comprise.
  duration: number
  effects: SequenceEffects
  timbre: SequenceTimbre
  // Nom de l'echelle retenue, pour affichage.
  scaleName: string
  // Archetype d'arrangement retenu : identifie la famille sonore de la piece.
  styleName: string
}

export type InputMode = 'text' | 'image'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// Interpolation lineaire, utilisee partout pour traduire une caracteristique
// normalisee [0..1] en une plage de parametre musical.
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1)
}

// Choisit un element d'un tableau a partir d'un hash : deterministe, et
// reparti sur toute la liste.
export function pick<T>(list: readonly T[], hash: number): T {
  return list[Math.abs(hash) % list.length]
}
