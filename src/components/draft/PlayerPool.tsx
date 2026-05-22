'use client'

import { useState, useMemo } from 'react'
import type { Player } from '@/store/draftArena'
import type { Enums } from '@/types/database'

type Position = Enums<'position_type'>
type Stamina  = Enums<'stamina_level'>

const POSITION_TABS: ('ALL' | Position)[] = ['ALL', 'GK', 'DEF', 'MID', 'FWD']

const POSITION_STYLES: Record<Position, { bg: string; label: string }> = {
  GK:  { bg: 'bg-amber-500',   label: 'GK' },
  DEF: { bg: 'bg-blue-500',    label: 'DEF' },
  MID: { bg: 'bg-emerald-500', label: 'MID' },
  FWD: { bg: 'bg-rose-500',    label: 'FWD' },
}

const STAMINA_STYLES: Record<Stamina, { bg: string }> = {
  Low:  { bg: 'bg-slate-500' },
  Med:  { bg: 'bg-orange-400' },
  High: { bg: 'bg-green-500' },
}

interface Props {
  players:     Player[]
  showRatings: boolean   // false for team leaders — hide ratings on the client
  isMyTurn:    boolean
  onPick:      (playerId: string) => void
}

export function PlayerPool({ players, showRatings, isMyTurn, onPick }: Props) {
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL')
  const [query,     setQuery]     = useState('')
  const [picking,   setPicking]   = useState<string | null>(null)

  const visible = useMemo(() =>
    players.filter(p => {
      const matchPos  = posFilter === 'ALL' || p.position === posFilter
      const matchName = p.full_name.toLowerCase().includes(query.toLowerCase())
      return matchPos && matchName
    }),
  [players, posFilter, query])

  async function handlePick(playerId: string) {
    if (!isMyTurn || picking) return
    setPicking(playerId)
    try { await onPick(playerId) } finally { setPicking(null) }
  }

  if (players.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-20 text-slate-500">
        Player pool is empty
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          placeholder="Search players…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-sky-500"
        />
        <div className="flex gap-1">
          {POSITION_TABS.map(pos => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={`rounded px-2 py-1 text-xs font-semibold transition-colors ${
                posFilter === pos
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500">{visible.length} available</p>

      {/* Player grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map(player => {
          const pos    = POSITION_STYLES[player.position]
          const stam   = STAMINA_STYLES[player.stamina]
          const isGhost = player.is_ghost
          const busy   = picking === player.id

          return (
            <div
              key={player.id}
              className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors ${
                isGhost
                  ? 'border-slate-600 bg-slate-800/50 opacity-60'
                  : 'border-slate-700 bg-slate-800 hover:border-slate-500'
              }`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-1">
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${pos.bg}`}
                >
                  {pos.label}
                </span>
                {showRatings && (
                  <span className="text-sm font-bold text-amber-400">{player.rating}</span>
                )}
              </div>

              {/* Name */}
              <p className="truncate text-sm font-semibold leading-tight text-white">
                {player.full_name}
              </p>

              {/* Footer row */}
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${stam.bg}`}
                >
                  {player.stamina}
                </span>

                {isMyTurn ? (
                  <button
                    onClick={() => handlePick(player.id)}
                    disabled={!!picking}
                    className="rounded bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
                  >
                    {busy ? '…' : 'PICK'}
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-600">—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
