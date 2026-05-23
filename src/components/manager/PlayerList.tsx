'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { EditPlayerModal } from './EditPlayerModal'
import type { Tables } from '@/types/database'

type Player = Tables<'players'>

const POSITION_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 }

interface Props {
  players: Player[]
}

export function PlayerList({ players: initialPlayers }: Props) {
  const t = useTranslations('players')

  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [editing, setEditing] = useState<Player | null>(null)

  // When AddPlayerForm triggers router.refresh(), the server passes a new
  // initialPlayers array — sync local state so the new player appears.
  useEffect(() => {
    setPlayers(initialPlayers)
  }, [initialPlayers])

  const sorted = players
    .slice()
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9),
    )

  function handleSave(updated: Player) {
    setPlayers(prev => prev.map(p => (p.id === updated.id ? updated : p)))
    setEditing(null)
  }

  return (
    <>
      <div className="mb-4 divide-y divide-slate-700/50 rounded-2xl bg-slate-800 overflow-hidden">
        {sorted.map(p => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <span className="w-6 shrink-0 text-center text-sm font-black text-amber-400">
              {p.rating}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{p.full_name}</p>
            </div>

            <span className="shrink-0 rounded-md bg-slate-700 px-2 py-0.5 text-xs font-bold text-slate-300">
              {p.position}
            </span>

            <span className="shrink-0 text-xs text-slate-500">{p.stamina}</span>

            <button
              onClick={() => setEditing(p)}
              aria-label={t('editPlayer')}
              className="shrink-0 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-200 active:scale-90"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3.5 w-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <EditPlayerModal
          player={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
