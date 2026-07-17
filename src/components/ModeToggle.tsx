import { Image, Type } from 'lucide-react'
import type { InputMode } from '../lib/sequence'

interface Props {
  mode: InputMode
  onChange: (mode: InputMode) => void
  disabled?: boolean
}

const OPTIONS: { id: InputMode; label: string; icon: typeof Type }[] = [
  { id: 'text', label: 'Texte', icon: Type },
  { id: 'image', label: 'Image', icon: Image },
]

export function ModeToggle({ mode, onChange, disabled }: Props) {
  return (
    <div
      className="inline-flex rounded-full border border-hairline bg-glass p-1 backdrop-blur-xl"
      role="tablist"
      aria-label="Mode d'entrée"
    >
      {OPTIONS.map(({ id, label, icon: Icon }) => {
        const active = mode === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(id)}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50 ${
              active ? 'bg-ivory text-night' : 'text-ivory-soft hover:text-ivory'
            }`}
          >
            <Icon size={15} strokeWidth={2} aria-hidden />
            {label}
          </button>
        )
      })}
    </div>
  )
}
