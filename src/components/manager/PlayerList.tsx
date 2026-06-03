'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { EditPlayerModal } from './EditPlayerModal'
import type { Tables } from '@/types/database'

type Player = Tables<'players'>

const POSITION_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 }

interface Props {
  players:    Player[]
  isManager?: boolean
}

export function PlayerList({ players: initialPlayers, isManager = false }: Props) {
  const t = useTranslations('players')

  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [editing, setEditing] = useState<Player | null>(null)

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

  function handleDelete(id: string) {
    setPlayers(prev => prev.filter(p => p.id !== id))
    setEditing(null)
  }

  return (
    <>
      <div className="mb-4 divide-y divide-zinc-800/60 rounded-xl bg-zinc-900 overflow-hidden">
        {sorted.map(p => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            {isManager && (
              <span className="w-6 shrink-0 text-center text-sm font-black text-emerald-500">
                {p.rating}
              </span>
            )}

            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <p className="truncate text-sm font-bold text-white">{p.full_name}</p>
              {p.is_vip && (
                <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-black tracking-wide text-amber-400">
                  VIP
                </span>
              )}
            </div>

            {isManager && (
              <span className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-xs font-bold text-zinc-300">
                {p.position}
              </span>
            )}

            {isManager && (
              <span className="shrink-0 text-xs text-zinc-500">{p.stamina}</span>
            )}

            {isManager && (
              <button
                onClick={() => setEditing(p)}
                aria-label={t('editPlayer')}
                className="shrink-0 rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 active:scale-90"
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
            )}
          </div>
        ))}
      </div>

      {editing && isManager && (
        <EditPlayerModal
          player={editing}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
