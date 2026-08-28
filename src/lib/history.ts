import type { Brief } from './compose'
import type { InputMode } from './sequence'

// Historique local des creations, persiste en localStorage.
// On stocke le Brief, c'est-a-dire l'intention musicale extraite du contenu
// (couleur, energie, ligne melodique, progression), pas les evenements ni
// l'audio : quelques kilo-octets par entree suffisent a regenerer un rendu
// strictement identique, sans conserver le texte ou l'image d'origine.

export interface HistoryEntry {
  id: string
  mode: InputMode
  // Apercu : debut du texte ou nom du fichier image.
  label: string
  // Date ISO de creation.
  date: string
  brief: Brief
}

const STORAGE_KEY = 'echo.history.v2'
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

export function addEntry(mode: InputMode, label: string, brief: Brief): HistoryEntry[] {
  const entry: HistoryEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    label: label.length > 80 ? `${label.slice(0, 77)}...` : label,
    date: new Date().toISOString(),
    brief,
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
