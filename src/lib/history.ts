import type { InputMode, Sequence } from './sequence'

// Historique local des creations, persiste en localStorage.
// On stocke la Sequence complete (description deterministe de la piece),
// pas l'audio encode : quelques dizaines de Ko par entree suffisent pour
// regenerer un rendu strictement identique a la demande.

export interface HistoryEntry {
  id: string
  mode: InputMode
  // Apercu : debut du texte ou nom du fichier image.
  label: string
  // Date ISO de creation.
  date: string
  sequence: Sequence
}

const STORAGE_KEY = 'echo.history.v1'
const MAX_ENTRIES = 20

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : []
  } catch {
    return []
  }
}

function persist(entries: HistoryEntry[]): HistoryEntry[] {
  let list = entries.slice(0, MAX_ENTRIES)
  // En cas de depassement de quota, on retire les entrees les plus anciennes.
  for (;;) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
      return list
    } catch {
      if (list.length === 0) return list
      list = list.slice(0, list.length - 1)
    }
  }
}

export function addEntry(mode: InputMode, label: string, sequence: Sequence): HistoryEntry[] {
  const entry: HistoryEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    label: label.length > 80 ? `${label.slice(0, 77)}...` : label,
    date: new Date().toISOString(),
    sequence,
  }
  return persist([entry, ...loadHistory()])
}

export function removeEntry(id: string): HistoryEntry[] {
  return persist(loadHistory().filter((e) => e.id !== id))
}

export function clearHistory(): HistoryEntry[] {
  localStorage.removeItem(STORAGE_KEY)
  return []
}
