import { useCallback, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 12 * 1024 * 1024 // 12 Mo

interface Props {
  file: File | null
  onSelect: (file: File | null) => void
  onError: (message: string) => void
  disabled?: boolean
}

export function ImagePanel({ file, onSelect, onError, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const accept = useCallback(
    (candidate: File) => {
      if (!ACCEPTED.includes(candidate.type)) {
        onError('Formats acceptés : JPEG, PNG ou WEBP.')
        return
      }
      if (candidate.size > MAX_SIZE) {
        onError('Image trop lourde : 12 Mo maximum.')
        return
      }
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old)
        return URL.createObjectURL(candidate)
      })
      onSelect(candidate)
    },
    [onError, onSelect],
  )

  const clear = useCallback(() => {
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    onSelect(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [onSelect])

  return (
    <div className="animate-fade">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        aria-label="Choisir une image"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) accept(f)
        }}
      />

      {file && previewUrl ? (
        <div className="relative overflow-hidden rounded-3xl border border-hairline bg-glass backdrop-blur-2xl">
          <img src={previewUrl} alt={file.name} className="max-h-72 w-full object-contain" />
          <div className="flex items-center justify-between border-t border-hairline px-6 py-3.5">
            <p className="truncate text-sm text-ivory-soft">{file.name}</p>
            <button
              type="button"
              onClick={clear}
              disabled={disabled}
              aria-label="Retirer l'image"
              className="rounded-full p-1.5 text-ivory-faint transition-colors hover:bg-glass-strong hover:text-ivory focus-visible:outline-2 focus-visible:outline-gold"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files?.[0]
            if (f) accept(f)
          }}
          className={`flex w-full flex-col items-center gap-3 rounded-3xl border border-dashed px-6 py-16 backdrop-blur-2xl transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-60 ${
            dragging ? 'border-gold/60 bg-gold-faint' : 'border-hairline bg-glass hover:border-ivory-faint hover:bg-glass-strong'
          }`}
        >
          <ImagePlus size={22} strokeWidth={1.5} className="text-ivory-faint" aria-hidden />
          <span className="text-sm text-ivory-soft">Déposez une image ici, ou cliquez pour parcourir</span>
          <span className="text-xs text-ivory-faint">JPEG, PNG ou WEBP, 12 Mo max</span>
        </button>
      )}
    </div>
  )
}
