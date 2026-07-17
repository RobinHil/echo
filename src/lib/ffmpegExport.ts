import { FFmpeg } from '@ffmpeg/ffmpeg'

// Conversion du WAV rendu vers les formats compresses via ffmpeg.wasm.
// Le binaire ffmpeg-core (js + wasm) est servi depuis /public : aucun CDN,
// tout fonctionne hors-ligne. L'instance est chargee une seule fois.

export type ExportFormat = 'wav' | 'mp3' | 'flac' | 'ogg'

export const FORMATS: { id: ExportFormat; label: string; mime: string }[] = [
  { id: 'mp3', label: 'MP3', mime: 'audio/mpeg' },
  { id: 'flac', label: 'FLAC', mime: 'audio/flac' },
  { id: 'wav', label: 'WAV', mime: 'audio/wav' },
  { id: 'ogg', label: 'OGG', mime: 'audio/ogg' },
]

const ENCODE_ARGS: Record<Exclude<ExportFormat, 'wav'>, string[]> = {
  mp3: ['-c:a', 'libmp3lame', '-b:a', '192k'],
  flac: ['-c:a', 'flac'],
  ogg: ['-c:a', 'libvorbis', '-q:a', '6'],
}

let ffmpegInstance: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance
  if (!loading) {
    loading = (async () => {
      const ffmpeg = new FFmpeg()
      const base = `${import.meta.env.BASE_URL}ffmpeg`
      await ffmpeg.load({
        coreURL: `${base}/ffmpeg-core.js`,
        wasmURL: `${base}/ffmpeg-core.wasm`,
      })
      ffmpegInstance = ffmpeg
      return ffmpeg
    })()
  }
  return loading
}

export async function encodeWav(wav: Uint8Array, format: ExportFormat): Promise<Blob> {
  const meta = FORMATS.find((f) => f.id === format)
  if (!meta) throw new Error(`Format inconnu : ${format}`)
  if (format === 'wav') {
    return new Blob([wav.slice().buffer], { type: meta.mime })
  }

  const ffmpeg = await getFFmpeg()
  const input = 'input.wav'
  const output = `output.${format}`
  // Copie obligatoire : writeFile transfere l'ArrayBuffer au worker et le
  // detache, ce qui rendrait le WAV inutilisable pour les exports suivants.
  await ffmpeg.writeFile(input, wav.slice())
  try {
    const code = await ffmpeg.exec(['-i', input, ...ENCODE_ARGS[format], output])
    if (code !== 0) {
      // Repli pour OGG si libvorbis manque dans le build core.
      if (format === 'ogg') {
        const retry = await ffmpeg.exec(['-i', input, '-c:a', 'vorbis', '-strict', '-2', output])
        if (retry !== 0) throw new Error("L'encodage OGG a échoué.")
      } else {
        throw new Error(`L'encodage ${format.toUpperCase()} a échoué.`)
      }
    }
    const data = await ffmpeg.readFile(output)
    const bytes = data as Uint8Array
    return new Blob([bytes.slice().buffer], { type: meta.mime })
  } finally {
    await ffmpeg.deleteFile(input).catch(() => {})
    await ffmpeg.deleteFile(output).catch(() => {})
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
