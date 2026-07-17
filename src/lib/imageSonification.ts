import { SCALES, type Sequence, type SoundEvent, chordNotes, clamp, repeatIfShort, scaleNote } from './sequence'

// Sonification d'une image en arrangement complet. L'image est balayee de
// gauche a droite : chaque colonne devient un pas de temps.
//
// Melodie (par colonne) :
//   - teinte moyenne                   -> degre de l'echelle, donc hauteur
//   - luminosite moyenne               -> velocite (une colonne sombre se tait)
//   - saturation moyenne               -> duree de la note
// Harmonie (par segment de 16 colonnes) :
//   - teinte dominante du segment      -> accord du segment (nappe tenue)
//   - basse : fondamentale et quinte de l'accord, toutes les 4 colonnes
//   - arpege : double-croches continues sur les sons de l'accord, velocite
//     portee par la saturation de la colonne
// Rythme :
//   - grosse caisse sur chaque temps (4 colonnes), renforcee quand l'image
//     est contrastee ; charley par colonne, accentue par les ruptures de
//     luminosite entre colonnes voisines
// Couleur globale :
//   - teinte dominante de l'image      -> echelle (chaud = majeur, froid = mineur)
//   - contraste global (ecart-type)    -> ouverture du filtre
//   - saturation globale               -> reverb et chorus ; dispersion -> delay
// Le balayage est rejoue en un second passage plus doux (forme A / A').
// Toutes les colonnes sont reduites en amont a une grille fixe : le resultat
// est deterministe et la Sequence extraite suffit a regenerer le son.

const COLUMNS = 64
const ROWS = 6
const STEP = 0.24 // secondes par colonne, soit environ 15 s de balayage

interface Cell {
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

export function sonifyImage(image: HTMLImageElement): Sequence {
  const grid = extractGrid(image)

  // Statistiques globales.
  const flat = grid.flat()
  const avgL = flat.reduce((s, c) => s + c.l, 0) / flat.length
  const avgS = flat.reduce((s, c) => s + c.s, 0) / flat.length
  const contrast = Math.sqrt(flat.reduce((s, c) => s + (c.l - avgL) ** 2, 0) / flat.length)
  // Teinte dominante ponderee par la saturation (les gris ne votent pas).
  let hx = 0
  let hy = 0
  for (const c of flat) {
    hx += Math.cos((c.h * Math.PI) / 180) * c.s
    hy += Math.sin((c.h * Math.PI) / 180) * c.s
  }
  const domHue = ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360
  const hueSpread = 1 - Math.sqrt(hx * hx + hy * hy) / Math.max(flat.reduce((s, c) => s + c.s, 0), 1e-6)

  // Echelle selon la temperature de couleur dominante :
  // rouges et jaunes = majeur, verts = dorien, bleus = mineur, violets = lydien.
  let scaleName: string
  if (domHue < 70 || domHue >= 330) scaleName = 'pentatonique majeure'
  else if (domHue < 170) scaleName = 'dorien'
  else if (domHue < 260) scaleName = 'pentatonique mineure'
  else scaleName = 'lydien'
  const scale = SCALES[scaleName]

  // Tonique tiree de la teinte dominante : deux images aux couleurs proches
  // partagent un centre tonal proche.
  const root = Math.round((domHue / 360) * 12) % 12

  const events: SoundEvent[] = []
  const START = 0.1

  // Statistiques par colonne, reutilisees par toutes les couches.
  const columns = grid.map((col) => {
    const cL = col.reduce((s, c) => s + c.l, 0) / ROWS
    const cS = col.reduce((s, c) => s + c.s, 0) / ROWS
    let cx = 0
    let cy = 0
    for (const c of col) {
      cx += Math.cos((c.h * Math.PI) / 180) * (c.s + 0.02)
      cy += Math.sin((c.h * Math.PI) / 180) * (c.s + 0.02)
    }
    return { l: cL, s: cS, h: ((Math.atan2(cy, cx) * 180) / Math.PI + 360) % 360 }
  })

  // ---- Harmonie : un accord par segment de 16 colonnes ----
  const SEGMENT = 16
  const degreePool = [0, 3, 4, 5]
  const segments: { degree: number; s: number; l: number }[] = []
  for (let seg = 0; seg < COLUMNS / SEGMENT; seg++) {
    const slice = columns.slice(seg * SEGMENT, (seg + 1) * SEGMENT)
    let sx = 0
    let sy = 0
    for (const c of slice) {
      sx += Math.cos((c.h * Math.PI) / 180) * (c.s + 0.02)
      sy += Math.sin((c.h * Math.PI) / 180) * (c.s + 0.02)
    }
    const segHue = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360
    const segS = slice.reduce((s, c) => s + c.s, 0) / slice.length
    const segL = slice.reduce((s, c) => s + c.l, 0) / slice.length
    // Le premier segment pose la tonique, les suivants suivent leur teinte.
    const degree = seg === 0 ? 0 : degreePool[Math.round((segHue / 360) * (degreePool.length - 1))]
    segments.push({ degree, s: segS, l: segL })
  }

  // ---- Melodie : une note par colonne ----
  let previousDegree = -1
  for (let x = 0; x < COLUMNS; x++) {
    const time = START + x * STEP
    const { l: cL, s: cS, h: cH } = columns[x]

    // Une colonne presque noire est un silence dans le balayage.
    if (cL < 0.05) {
      previousDegree = -1
      continue
    }

    // Teinte -> degre sur deux octaves ; saturation -> tenue de la note.
    const degree = Math.round((cH / 360) * (scale.length * 2 - 1))
    const duration = STEP * (0.9 + cS * 2.2)
    const velocity = clamp(0.2 + cL * 0.75, 0.2, 0.95)

    // Une colonne identique a la precedente prolonge le geste au lieu de
    // marteler la meme note : les aplats deviennent des tenues.
    if (degree === previousDegree && events.length > 0) {
      const last = events[events.length - 1]
      if (last.role === 'lead') {
        last.duration += STEP
        continue
      }
    }
    previousDegree = degree

    events.push({ time, duration, note: scaleNote(root, scale, degree, 4), velocity, role: 'lead' })
  }

  if (events.length === 0) {
    throw new Error("L'image est entièrement noire : aucun son à générer.")
  }

  // ---- Nappes : l'accord du segment, tenu sur toute sa largeur ----
  segments.forEach((seg, i) => {
    if (seg.l < 0.04) return
    const time = START + i * SEGMENT * STEP
    for (const note of chordNotes(root, scale, seg.degree, 3)) {
      events.push({
        time,
        duration: SEGMENT * STEP,
        note,
        velocity: clamp(0.25 + seg.s * 0.3, 0.25, 0.5),
        role: 'pad',
      })
    }
  })

  // ---- Basse : fondamentale et quinte de l'accord, toutes les 4 colonnes ----
  for (let x = 0; x < COLUMNS; x += 4) {
    const seg = segments[Math.floor(x / SEGMENT)]
    if (seg.l < 0.04) continue
    events.push({
      time: START + x * STEP,
      duration: 3.4 * STEP,
      note: scaleNote(root, scale, seg.degree + (x % 8 === 0 ? 0 : 4), 2),
      velocity: clamp(0.45 + seg.l * 0.2, 0.45, 0.65),
      role: 'bass',
    })
  }

  // ---- Arpege : double-croches sur l'accord, portees par la saturation ----
  const arpPattern = [0, 2, 4, 2]
  for (let x = 0; x < COLUMNS; x++) {
    const col = columns[x]
    if (col.l < 0.05) continue
    const seg = segments[Math.floor(x / SEGMENT)]
    events.push({
      time: START + x * STEP,
      duration: 0.8 * STEP,
      note: scaleNote(root, scale, seg.degree + arpPattern[x % arpPattern.length], 5),
      velocity: clamp(0.16 + col.s * 0.3, 0.16, 0.42),
      role: 'arp',
    })
  }

  // ---- Percussions : pulsation reguliere, accents sur les ruptures ----
  for (let x = 0; x < COLUMNS; x++) {
    const time = START + x * STEP
    if (x % 4 === 0) {
      events.push({ time, duration: 0.2, note: 'C1', velocity: x % 8 === 0 ? 0.85 : 0.65, role: 'kick' })
    }
    // Rupture de luminosite entre colonnes voisines -> charley accentue.
    const jump = x > 0 ? Math.abs(columns[x].l - columns[x - 1].l) : 0
    if (columns[x].l < 0.03 && jump < 0.05) continue
    events.push({
      time,
      duration: 0.05,
      note: 'C6',
      velocity: clamp(0.14 + jump * 2 + (x % 2 === 0 ? 0.08 : 0), 0.14, 0.5),
      role: 'hat',
    })
    if (jump > 0.25) {
      events.push({ time, duration: 0.18, note: 'C1', velocity: 0.55, role: 'kick' })
    }
  }

  // ---- Forme A / A' : le balayage est rejoue une seconde fois, plus doux ----
  const { events: finalEvents, end } = repeatIfShort(events, COLUMNS * STEP + 1)

  return {
    events: finalEvents,
    duration: end + 2.5,
    effects: {
      // Image saturee = espace et mouvement ; image terne = son sec.
      reverbWet: clamp(0.15 + avgS * 0.4, 0.15, 0.5),
      delayWet: clamp(hueSpread * 0.35, 0.05, 0.35),
      delayFeedback: clamp(0.2 + hueSpread * 0.3, 0.2, 0.5),
      chorusDepth: clamp(avgS * 0.8, 0, 0.7),
      // Image contrastee = spectre ouvert, image plate = son feutre.
      filterCutoff: clamp(1400 + contrast * 16000, 1400, 7600),
    },
    scaleName,
  }
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Le fichier ne peut pas être lu comme une image.'))
    }
    img.src = url
  })
}
