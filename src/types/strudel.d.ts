// Declarations de types pour les paquets @strudel/*, qui n'en fournissent pas.
// On ne declare que la surface reellement utilisee par la composition : c'est
// suffisant pour que les patterns soient verifies a la compilation plutot que
// manipules en `any`.

declare module '@strudel/core' {
  export interface Fraction {
    valueOf(): number
  }

  export interface TimeSpan {
    begin: Fraction
    end: Fraction
  }

  export interface Hap {
    // Absent pour les signaux continus (sine, saw...) : pas d'evenement
    // declenchable.
    whole?: TimeSpan
    part: TimeSpan
    value: unknown
  }

  // Un argument accepte partout ou Strudel attend une valeur "patternifiable".
  export type Patternable = number | string | Pattern

  export type PatternFn = (pattern: Pattern) => Pattern

  export interface Pattern {
    // --- interrogation ---
    queryArc(begin: number, end: number): Hap[]

    // --- controles ---
    note(value: Patternable): Pattern
    n(value: Patternable): Pattern
    s(value: Patternable): Pattern
    gain(value: Patternable): Pattern
    pan(value: Patternable): Pattern
    scale(name: Patternable): Pattern

    // --- arithmetique ---
    add(value: Patternable): Pattern
    sub(value: Patternable): Pattern
    mul(value: Patternable): Pattern
    range(min: number, max: number): Pattern

    // --- temps ---
    fast(factor: Patternable): Pattern
    slow(factor: Patternable): Pattern
    early(cycles: Patternable): Pattern
    late(cycles: Patternable): Pattern
    segment(count: Patternable): Pattern
    ply(count: Patternable): Pattern
    iter(count: Patternable): Pattern
    rev(): Pattern
    palindrome(): Pattern

    // --- structure ---
    struct(pattern: Patternable): Pattern
    mask(pattern: Patternable): Pattern
    euclid(pulses: number, steps: number): Pattern
    euclidRot(pulses: number, steps: number, rotation: number): Pattern
    euclidLegato(pulses: number, steps: number): Pattern

    // --- variation ---
    off(cycles: number, fn: PatternFn): Pattern
    superimpose(fn: PatternFn): Pattern
    jux(fn: PatternFn): Pattern
    juxBy(amount: number, fn: PatternFn): Pattern
    every(count: number, fn: PatternFn): Pattern
    chunk(count: number, fn: PatternFn): Pattern
    sometimesBy(probability: number, fn: PatternFn): Pattern
    degradeBy(amount: number): Pattern
    undegradeBy(amount: number): Pattern
  }

  // --- constructeurs ---
  export function pure(value: unknown): Pattern
  export function stack(...patterns: Pattern[]): Pattern
  export function cat(...patterns: Pattern[]): Pattern
  export function slowcat(...patterns: Pattern[]): Pattern
  export function fastcat(...patterns: Pattern[]): Pattern
  export function sequence(...values: unknown[]): Pattern
  // Sequence ponderee : chaque element occupe une part du cycle.
  export function timeCat(...pairs: [number, Pattern][]): Pattern
  export function run(count: number): Pattern

  // --- controles utilisables comme fonctions libres ---
  export function note(value: Patternable): Pattern
  export function n(value: Patternable): Pattern
  export function s(value: Patternable): Pattern
  export function gain(value: Patternable): Pattern
  export function pan(value: Patternable): Pattern

  // --- transformations libres (a passer a jux, every...) ---
  export function rev(pattern: Pattern): Pattern

  // --- signaux continus ---
  export const sine: Pattern
  export const cosine: Pattern
  export const saw: Pattern
  export const isaw: Pattern
  export const tri: Pattern
  export const square: Pattern
  export const perlin: Pattern
  export const rand: Pattern

  export const silence: Pattern
}

declare module '@strudel/mini' {
  import type { Pattern } from '@strudel/core'
  // Parseur de mini-notation : "bd*2 [hh hh]", "<0 2 4>(3,8)".
  export function mini(...strings: string[]): Pattern
}

declare module '@strudel/tonal' {
  // Import a effet de bord : enregistre .scale() et les fonctions d'accords
  // sur le prototype de Pattern.
}
