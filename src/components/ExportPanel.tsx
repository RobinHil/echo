import { useState } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { FORMATS, downloadBlob, encodeWav, type ExportFormat } from '../lib/ffmpegExport'

interface Props {
  wav: Uint8Array
  baseName: string
  onError: (message: string) => void
}

export function ExportPanel({ wav, baseName, onError }: Props) {
  const [busy, setBusy] = useState<ExportFormat | null>(null)

  const handleExport = async (format: ExportFormat) => {
    setBusy(format)
    try {
      const blob = await encodeWav(wav, format)
      downloadBlob(blob, `${baseName}.${format}`)
    } catch (err) {
      onError(err instanceof Error ? err.message : `L'export ${format.toUpperCase()} a échoué.`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-label="Telechargement" className="animate-screen-late">
      <h3 className="mb-3 text-[11px] font-medium tracking-[0.25em] text-ivory-faint uppercase">Télécharger</h3>
      <div className="flex flex-wrap gap-2">
        {FORMATS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            disabled={busy !== null}
            onClick={() => handleExport(id)}
            className="flex items-center gap-2 rounded-full border border-hairline bg-glass px-5 py-2.5 text-sm font-medium text-ivory backdrop-blur-xl transition-all duration-300 hover:border-gold/50 hover:text-gold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            {busy === id ? (
              <LoaderCircle size={14} className="animate-spin" aria-hidden />
            ) : (
              <Download size={14} aria-hidden />
            )}
            {label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-ivory-faint">
        La première conversion MP3, FLAC ou OGG charge le moteur d'encodage (environ 30 Mo) : elle peut prendre
        quelques secondes.
      </p>
    </section>
  )
}
