interface Props {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function TextPanel({ value, onChange, disabled }: Props) {
  return (
    <div className="animate-fade">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={7}
        placeholder="Collez ou écrivez un texte. Sa structure, ses mots et sa ponctuation deviendront une pièce sonore."
        aria-label="Texte à sonifier"
        className="w-full resize-y rounded-3xl border border-hairline bg-glass px-7 py-6 text-[15px] leading-relaxed text-ivory backdrop-blur-2xl transition-all duration-300 placeholder:text-ivory-faint focus:border-gold/50 focus:bg-glass-strong focus:outline-none disabled:opacity-60"
      />
      <p className="mt-2 text-right text-xs text-ivory-faint">
        {value.trim().length === 0 ? 'En attente de texte' : `${value.trim().split(/\s+/).length} mots`}
      </p>
    </div>
  )
}
