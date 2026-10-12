// Tournament access codes entered by non-managers, kept in localStorage as
// { [tournamentId]: code }. The browser Supabase client sends every stored
// code in the `x-access-codes` header; RLS (has_tournament_access) checks it.

const STORAGE_KEY = 'fl_access_codes'
const MAX_CODES   = 10

type CodeMap = Record<string, string>

function readMap(): CodeMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CodeMap) : {}
  } catch {
    return {}
  }
}

function writeMap(map: CodeMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Storage blocked (private mode) — the code just won't persist.
  }
}

export function normalizeAccessCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function getAccessCode(tournamentId: string): string | null {
  return readMap()[tournamentId] ?? null
}

export function saveAccessCode(tournamentId: string, code: string) {
  const map = readMap()
  delete map[tournamentId]
  map[tournamentId] = normalizeAccessCode(code)
  // Keep only the most recent entries so the header stays small.
  const entries = Object.entries(map).slice(-MAX_CODES)
  writeMap(Object.fromEntries(entries))
}

export function removeAccessCode(tournamentId: string) {
  const map = readMap()
  delete map[tournamentId]
  writeMap(map)
}

export function accessCodesHeader(): string {
  if (typeof window === 'undefined') return ''
  return Object.values(readMap()).join(',')
}
