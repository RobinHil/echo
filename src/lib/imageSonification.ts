import { clamp, lerp } from './sequence'
import { pickScale } from './strudel'
import type { Brief, MelodyStep } from './compose'

// Analyse d'une image en intention musicale.
//
// L'image est reduite a une grille de 96 colonnes par 8 lignes, balayee de
// gauche a droite. Chaque colonne fournit une teinte moyenne, une luminosite,
// une saturation, une texture verticale et une energie de contour ; ces cinq
// mesures alimentent le meme Brief que la sonification de texte, donc le meme
// moteur de composition.
//
// L'extraction (canvas) est separee de l'analyse : sonifyGrid ne depend que
// de nombres, ce qui la rend testable hors navigateur.

const COLUMNS = 96
const ROWS = 8

export interface Cell {
  h: number // teinte [0..360]
  s: number // saturation [0..1]
  l: number // luminosite [0..1]
}

function rgbToHsl(r: number, g: number, b: number): Cell {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h: h * 360, s, l }
}

// Reduit l'image en grille COLUMNS x ROWS de moyennes HSL via un canvas.
export function extractGrid(image: HTMLImageElement): Cell[][] {
  const canvas = document.createElement('canvas')
  canvas.width = COLUMNS
  canvas.height = ROWS
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error("Impossible d'obtenir un contexte canvas 2D.")
  ctx.drawImage(image, 0, 0, COLUMNS, ROWS)
  const data = ctx.getImageData(0, 0, COLUMNS, ROWS).data
  const grid: Cell[][] = []
  for (let x = 0; x < COLUMNS; x++) {
    const col: Cell[] = []
    for (let y = 0; y < ROWS; y++) {
      const i = (y * COLUMNS + x) * 4
      col.push(rgbToHsl(data[i], data[i + 1], data[i + 2]))
    }
    grid.push(col)
  }
  return grid
}

// Moyenne circulaire des teintes, ponderee par la saturation : les gris ne
// votent pas, et le passage 359 -> 0 degres ne fausse pas la moyenne.
function meanHue(cells: Cell[]): { hue: number; concentration: number } {
  let x = 0
  let y = 0
  let weight = 0
  for (const c of cells) {
    x += Math.cos((c.h * Math.PI) / 180) * c.s
    y += Math.sin((c.h * Math.PI) / 180) * c.s
    weight += c.s
  }
  const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
  return { hue, concentration: Math.sqrt(x * x + y * y) / Math.max(weight, 1e-6) }
}

function hashNumbers(values: number[], seed: number): number {
  let h = seed >>> 0
  for (const v of values) {
    h = (Math.imul(h, 31) + Math.round(v * 1000)) >>> 0
  }
  return h
}

interface Column {
  hue: number
  sat: number
  lum: number
  // Ecart-type vertical de luminosite : mesure la texture de la colonne.
  texture: number
  // Ecart de luminosite avec la colonne precedente : mesure les contours.
  edge: number
}

export function briefFromGrid(grid: Cell[][]): Brief {
  const flat = grid.flat()
  const avgL = flat.reduce((s, c) => s + c.l, 0) / flat.length
  const avgS = flat.reduce((s, c) => s + c.s, 0) / flat.length
  const contrast = Math.sqrt(flat.reduce((s, c) => s + (c.l - avgL) ** 2, 0) / flat.length)
  const global = meanHue(flat)
  // Dispersion des teintes : 0 pour une image monochrome, 1 pour une image
  // qui parcourt tout le cercle chromatique.
  const hueSpread = 1 - global.concentration

  const columns: Column[] = grid.map((col, i) => {
    const lum = col.reduce((s, c) => s + c.l, 0) / ROWS
    const sat = col.reduce((s, c) => s + c.s, 0) / ROWS
    const texture = Math.sqrt(col.reduce((s, c) => s + (c.l - lum) ** 2, 0) / ROWS)
    const previous = i > 0 ? grid[i - 1].reduce((s, c) => s + c.l, 0) / ROWS : lum
    return { hue: meanHue(col).hue, sat, lum, texture, edge: Math.abs(lum - previous) }
  })

  const avgTexture = columns.reduce((s, c) => s + c.texture, 0) / columns.length
  const avgEdge = columns.reduce((s, c) => s + c.edge, 0) / columns.length
  // Tendance de luminosite gauche -> droite : une image qui s'eclaircit ne
  // sonne pas comme une image qui s'assombrit.
  const half = Math.floor(columns.length / 2)
  const gradient =
    columns.slice(half).reduce((s, c) => s + c.lum, 0) / half -
    columns.slice(0, half).reduce((s, c) => s + c.lum, 0) / half

  // --- Caracteres continus ---

  // Energie : contours marques, texture verticale, contraste global.
  const energy = clamp(
    0.12 + clamp(avgEdge * 7, 0, 1) * 0.36 + clamp(avgTexture * 4, 0, 1) * 0.28 + clamp(contrast * 3, 0, 1) * 0.24,
    0,
    1,
  )

  // Couleur affective : teintes chaudes et image claire tirent vers le
  // lumineux, teintes froides et image sombre vers le grave.
  const warmth = Math.cos((global.hue * Math.PI) / 180)
  const brightness = clamp(warmth * 0.55 + (avgL - 0.46) * 2.2 + (avgS - 0.4) * 0.5, -1, 1)

  // Densite : richesse chromatique et saturation.
  const density = clamp(hueSpread * 0.5 + avgS * 0.5, 0, 1)

  // Tension : dispersion des teintes et irregularite des contours.
  const edgeSpread = Math.sqrt(columns.reduce((s, c) => s + (c.edge - avgEdge) ** 2, 0) / columns.length)
  const tension = clamp(hueSpread * 0.45 + clamp(edgeSpread * 9, 0, 1) * 0.35 + Math.abs(gradient) * 0.2, 0, 1)

  // Espace : image douce, peu contrastee, peu saturee.
  const space = clamp((1 - clamp(contrast * 3, 0, 1)) * 0.45 + (1 - avgS) * 0.3 + (1 - energy) * 0.25, 0, 1)

  const hashes = [
    hashNumbers(columns.map((c) => c.hue), 0x9e37),
    hashNumbers(columns.map((c) => c.lum), 0x85eb),
    hashNumbers(columns.map((c) => c.sat), 0xc2b2),
    hashNumbers(columns.map((c) => c.edge), 0x27d4),
    hashNumbers([global.hue, avgL, avgS, contrast, hueSpread], 0x165667),
    hashNumbers(columns.map((c) => c.texture), 0xd3a2),
  ]

  const scale = pickScale(brightness, hashes[0])
  // Tonique tiree de la teinte dominante : deux images aux couleurs proches
  // partagent un centre tonal proche.
  const root = Math.round((global.hue / 360) * 12) % 12

  // --- Ligne melodique : une colonne, un pas ---
  // Les colonnes consecutives de teinte et de luminosite proches sont fondues
  // en une note plus longue : les aplats tiennent, les zones detaillees
  // s'agitent.
  const melody: MelodyStep[] = []

  // La hauteur est lue sur trois axes - teinte, luminosite, texture - melanges
  // au prorata de ce que chacun apporte reellement dans cette image. Un
  // paysage colore fait chanter sa teinte, une photo en noir et blanc sa
  // luminosite, une image dense sa texture. Ponderer par la seule saturation
  // ne suffit pas : un ciel bleu est tres sature et pourtant de teinte
  // constante, il tomberait sur une note unique.
  const hueOffsets = columns.map((c) => ((c.hue - global.hue + 540) % 360) - 180)
  const lums = columns.map((c) => c.lum)
  const textures = columns.map((c) => c.texture)

  const spanOf = (values: number[]) => Math.max(...values) - Math.min(...values)
  // Chaque axe est normalise sur sa propre etendue : une image aux nuances
  // subtiles deploie autant d'ambitus qu'une image franchement contrastee.
  const normalizer = (values: number[], minimumSpan: number) => {
    const min = Math.min(...values)
    const span = Math.max(spanOf(values), minimumSpan)
    return (value: number) => clamp((value - min) / span, 0, 1)
  }
  const normHue = normalizer(hueOffsets, 30)
  const normLum = normalizer(lums, 0.12)
  const normTexture = normalizer(textures, 0.08)

  // Poids d'un axe : ce qu'il varie, tempere par sa fiabilite. La teinte n'a
  // de sens que sur une image sature ; la texture reste un appoint.
  const weights = {
    hue: clamp(spanOf(hueOffsets) / 90, 0, 1) * clamp(avgS * 2.5, 0, 1),
    lum: clamp(spanOf(lums) / 0.3, 0, 1),
    texture: clamp(spanOf(textures) / 0.25, 0, 1) * 0.6,
  }
  // Image totalement uniforme : la luminosite reprend la main par defaut.
  const totalWeight = weights.hue + weights.lum + weights.texture || 1
  if (weights.hue + weights.lum + weights.texture === 0) weights.lum = 1

  // Seuil de silence relatif a l'image : une photo nocturne ne doit pas se
  // taire entierement, seules ses zones les plus sombres se taisent.
  const silenceBelow = Math.max(0.04, avgL * 0.35)

  let index = 0
  while (index < columns.length) {
    const column = columns[index]
    let run = 1
    while (
      index + run < columns.length &&
      Math.abs(columns[index + run].lum - column.lum) < 0.06 &&
      Math.abs(((columns[index + run].hue - column.hue + 540) % 360) - 180) < 25 &&
      run < 6
    ) {
      run++
    }

    if (column.lum < silenceBelow) {
      melody.push({ degree: 0, weight: run, velocity: 0, octave: 0, rest: true })
    } else {
      const position =
        (weights.hue * normHue(hueOffsets[index]) +
          weights.lum * normLum(column.lum) +
          weights.texture * normTexture(column.texture)) /
        totalWeight
      melody.push({
        degree: Math.round(position * (scale.size * 2 - 1)),
        weight: run,
        velocity: clamp(0.3 + column.lum * 0.6 + column.sat * 0.12, 0.25, 0.95),
        // La texture verticale pousse la note vers l'aigu.
        octave: column.texture > avgTexture * 1.6 ? 1 : column.lum < avgL * 0.6 ? -1 : 0,
        rest: false,
      })
    }
    index += run
  }

  // --- Progression : un accord par bande verticale de l'image ---
  const bands = 6
  const bandSize = Math.ceil(columns.length / bands)
  const pool = [0, 5, 3, 4, 2, 6]
  const progression: number[] = []
  for (let b = 0; b < bands; b++) {
    const slice = columns.slice(b * bandSize, (b + 1) * bandSize)
    if (slice.length === 0) continue
    if (b === 0) {
      progression.push(0)
      continue
    }
    // La bande vote avec ses trois mesures : deux bandes de meme teinte mais
    // de clarte differente ne posent pas le meme accord.
    const bandHue = slice.reduce((s, c) => s + c.hue, 0) / slice.length
    const bandLum = slice.reduce((s, c) => s + c.lum, 0) / slice.length
    const bandSat = slice.reduce((s, c) => s + c.sat, 0) / slice.length
    progression.push(pool[hashNumbers([bandHue, bandLum, bandSat], 0x51ed) % pool.length])
  }

  return {
    scale,
    root,
    energy,
    density,
    tension,
    space,
    melody,
    progression,
    hashes,
    // Signature chromatique globale (teinte dominante, clarte, saturation,
    // contraste) : deux images d'aspect voisin s'instrumentent pareil.
    signature: hashes[4] % 512,
    // Une image riche en contours et en couleurs merite une piece plus longue.
    targetSeconds: clamp(lerp(18, 58, density * 0.5 + clamp(avgEdge * 6, 0, 1) * 0.5), 18, 58),
  }
}

export function briefFromImage(image: HTMLImageElement): Brief {
  return briefFromGrid(extractGrid(image))
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Le fichier ne peut pas être lu comme une image.'))
    }
    img.src = url
  })
}
