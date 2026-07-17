import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CircleAlert, History } from 'lucide-react'
import { Logo } from './components/Logo'
import { ModeToggle } from './components/ModeToggle'
import { TextPanel } from './components/TextPanel'
import { ImagePanel } from './components/ImagePanel'
import { WaveLine } from './components/WaveLine'
import { Player } from './components/Player'
import { ExportPanel } from './components/ExportPanel'
import { HistoryPanel } from './components/HistoryPanel'
import { useAudioPlayer } from './hooks/useAudioPlayer'
import { sonifyText } from './lib/textSonification'
import { loadImageFromFile, sonifyImage } from './lib/imageSonification'
import { renderSequence } from './lib/renderAudio'
import { audioBufferToWav } from './lib/wav'
import { addEntry, clearHistory, loadHistory, removeEntry, type HistoryEntry } from './lib/history'
import type { InputMode, Sequence } from './lib/sequence'

type Screen = 'input' | 'generating' | 'result'

interface Result {
  id: string | null
  mode: InputMode
  label: string
  sequence: Sequence
  buffer: AudioBuffer
  wav: Uint8Array
}

// L'ecran de generation reste affiche au moins ce temps : la ligne d'onde
// a le droit d'exister, meme quand le rendu est immediat.
const MIN_GENERATION_MS = 2800

function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug.length > 0 ? slug : 'piece'
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('input')
  const [mode, setMode] = useState<InputMode>('text')
  const [text, setText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [generatingLabel, setGeneratingLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)

  const player = useAudioPlayer(result?.buffer ?? null)

  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  const canGenerate = mode === 'text' ? text.trim().length > 0 : imageFile !== null

  // Rend une sequence en passant par l'ecran de generation, avec un temps
  // d'affichage minimal pour que la transition reste un moment et non un flash.
  const runGeneration = useCallback(
    async (label: string, work: () => Promise<Omit<Result, 'buffer' | 'wav'> & { sequence: Sequence }>) => {
      setError(null)
      setGeneratingLabel(label)
      setDrawerOpen(false)
      setScreen('generating')
      const started = performance.now()
      try {
        const partial = await work()
        const buffer = await renderSequence(partial.sequence)
        const wav = audioBufferToWav(buffer)
        const elapsed = performance.now() - started
        await new Promise((r) => setTimeout(r, Math.max(0, MIN_GENERATION_MS - elapsed)))
        setResult({ ...partial, buffer, wav })
        setScreen('result')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'La génération a échoué.')
        setScreen('input')
      }
    },
    [],
  )

  const handleGenerate = useCallback(() => {
    const label = mode === 'text' ? text.trim().replace(/\s+/g, ' ') : ((imageFile as File)?.name ?? '')
    void runGeneration(label, async () => {
      let sequence: Sequence
      if (mode === 'text') {
        sequence = sonifyText(text)
      } else {
        const image = await loadImageFromFile(imageFile as File)
        sequence = sonifyImage(image)
      }
      const entries = addEntry(mode, label, sequence)
      setHistory(entries)
      return { id: entries[0]?.id ?? null, mode, label, sequence }
    })
  }, [mode, text, imageFile, runGeneration])

  const handleSelectEntry = useCallback(
    (entry: HistoryEntry) => {
      void runGeneration(entry.label, async () => ({
        id: entry.id,
        mode: entry.mode,
        label: entry.label,
        sequence: entry.sequence,
      }))
    },
    [runGeneration],
  )

  const handleRemoveEntry = useCallback((id: string) => {
    setHistory(removeEntry(id))
  }, [])

  const handleClearHistory = useCallback(() => {
    setHistory(clearHistory())
  }, [])

  const baseName = useMemo(() => (result ? `echo-${slugify(result.label)}` : 'echo'), [result])
  const generating = screen === 'generating'

  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* Fond : nuit, deux halos qui derivent, grain de pellicule. */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-night" aria-hidden>
        <div className="aurora-a" />
        <div className="aurora-b" />
        <div className="grain" />
      </div>

      <header
        className={`fixed inset-x-0 top-0 z-40 flex items-center justify-between px-6 py-5 transition-opacity duration-700 sm:px-10 ${
          generating ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        <button
          type="button"
          onClick={() => setScreen('input')}
          className="flex items-center gap-3 rounded-full py-1 pr-3 pl-1 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          aria-label="Revenir à l'accueil"
        >
          <Logo size={28} />
          <span className="text-[15px] font-medium tracking-wide text-ivory">Echo</span>
        </button>

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Historique"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-glass text-ivory-soft backdrop-blur-xl transition-all duration-300 hover:border-ivory-faint hover:text-ivory focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          <History size={16} strokeWidth={1.8} aria-hidden />
        </button>
      </header>

      <main className="flex min-h-dvh items-center justify-center px-6 py-28">
        {screen === 'input' && (
          <div key="input" className="w-full max-w-xl animate-screen">
            <h1 className="text-center text-3xl leading-snug font-extralight tracking-tight text-ivory sm:text-4xl">
              Donnez une forme sonore
              <br />
              <span className="text-ivory-soft">à vos mots et vos images.</span>
            </h1>

            <div className="mt-12 flex justify-center">
              <ModeToggle mode={mode} onChange={setMode} />
            </div>

            <div className="mt-6">
              {mode === 'text' ? (
                <TextPanel value={text} onChange={setText} />
              ) : (
                <ImagePanel file={imageFile} onSelect={setImageFile} onError={setError} />
              )}
            </div>

            <div className="mt-8 flex justify-center">
              <button
                type="button"
                disabled={!canGenerate}
                onClick={handleGenerate}
                className="h-12 rounded-full bg-ivory px-10 text-[15px] font-medium text-night transition-all duration-300 hover:bg-gold disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                Générer le son
              </button>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-6 flex items-start justify-center gap-2 text-sm leading-relaxed text-gold"
              >
                <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
                {error}
              </p>
            )}
          </div>
        )}

        {screen === 'generating' && (
          <div key="generating" className="flex w-full animate-fade flex-col items-center">
            <WaveLine />
            <p className="mt-12 text-[11px] font-medium tracking-[0.4em] text-ivory-faint uppercase">
              Génération
            </p>
            <p className="mt-4 max-w-md truncate px-6 text-sm text-ivory-soft">{generatingLabel}</p>
          </div>
        )}

        {screen === 'result' && result && (
          <div key="result" className="flex w-full max-w-2xl flex-col gap-10">
            <Player
              player={player}
              buffer={result.buffer}
              title={result.label}
              subtitle={`${result.mode === 'text' ? 'Texte' : 'Image'} - ${result.sequence.scaleName} - ${result.sequence.events.length} événements`}
            />
            <ExportPanel wav={result.wav} baseName={baseName} onError={setError} />

            {error && (
              <p role="alert" className="flex items-start gap-2 text-sm leading-relaxed text-gold">
                <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
                {error}
              </p>
            )}

            <div className="animate-screen-late">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setScreen('input')
                }}
                className="flex items-center gap-2 text-sm text-ivory-faint transition-colors hover:text-ivory focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                <ArrowLeft size={15} aria-hidden />
                Nouvelle création
              </button>
            </div>
          </div>
        )}
      </main>

      <footer
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 px-6 pb-5 transition-opacity duration-700 ${
          screen === 'input' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <p className="text-center text-xs leading-relaxed text-ivory-faint">
          Aucune donnée ne quitte votre navigateur. Sonification algorithmique, sans intelligence artificielle
          générative.
        </p>
      </footer>

      <HistoryPanel
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        entries={history}
        activeId={result?.id ?? null}
        disabled={generating}
        onSelect={handleSelectEntry}
        onRemove={handleRemoveEntry}
        onClear={handleClearHistory}
      />
    </div>
  )
}
