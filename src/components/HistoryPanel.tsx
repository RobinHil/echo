import { useEffect } from 'react'
import { Image, RotateCcw, Trash2, Type, X } from 'lucide-react'
import type { HistoryEntry } from '../lib/history'

interface Props {
  open: boolean
  onClose: () => void
  entries: HistoryEntry[]
  activeId: string | null
  disabled?: boolean
  onSelect: (entry: HistoryEntry) => void
  onRemove: (id: string) => void
  onClear: () => void
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

// Tiroir lateral discret : absent du regard tant qu'on ne l'appelle pas,
// il glisse depuis la droite sur un voile qui floute la scene.
export function HistoryPanel({ open, onClose, entries, activeId, disabled, onSelect, onRemove, onClear }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-night/55 backdrop-blur-sm transition-opacity duration-500 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <aside
        aria-label="Historique des créations"
        className={`absolute top-0 right-0 flex h-full w-full max-w-sm flex-col border-l border-hairline bg-white/[0.055] backdrop-blur-2xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-hairline px-6 py-5">
          <h3 className="text-[11px] font-medium tracking-[0.25em] text-ivory-faint uppercase">Historique</h3>
          <div className="flex items-center gap-4">
            {entries.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                disabled={disabled}
                className="flex items-center gap-1.5 text-xs text-ivory-faint transition-colors hover:text-gold focus-visible:outline-2 focus-visible:outline-gold"
              >
                <Trash2 size={12} aria-hidden />
                Vider
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer l'historique"
              className="rounded-full p-1.5 text-ivory-faint transition-colors hover:bg-glass-strong hover:text-ivory focus-visible:outline-2 focus-visible:outline-gold"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {entries.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-hairline px-5 py-10 text-center text-xs leading-relaxed text-ivory-faint">
              Vos créations apparaîtront ici et resteront disponibles sur cet appareil.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entries.map((entry) => {
                const Icon = entry.mode === 'text' ? Type : Image
                const active = entry.id === activeId
                return (
                  <li key={entry.id} className="group relative">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelect(entry)}
                      className={`w-full rounded-2xl border px-4 py-3 pr-10 text-left transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-60 ${
                        active
                          ? 'border-gold/50 bg-gold-faint'
                          : 'border-transparent bg-glass hover:border-hairline hover:bg-glass-strong'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs text-ivory-faint">
                        <Icon size={12} aria-hidden />
                        {dateFormatter.format(new Date(entry.date))}
                        <span aria-hidden>-</span>
                        {entry.brief.scale.label}
                      </span>
                      <span className="mt-1 block truncate text-sm text-ivory">{entry.label}</span>
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onRemove(entry.id)}
                      aria-label={`Supprimer ${entry.label}`}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1.5 text-ivory-faint opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-gold focus-visible:outline-2 focus-visible:outline-gold"
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {entries.length > 0 && (
          <p className="flex items-center gap-1.5 border-t border-hairline px-6 py-4 text-xs leading-relaxed text-ivory-faint">
            <RotateCcw size={11} className="shrink-0" aria-hidden />
            Sélectionner une entrée régénère le son à l'identique.
          </p>
        )}
      </aside>
    </div>
  )
}
