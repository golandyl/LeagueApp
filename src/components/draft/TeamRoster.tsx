'use client'

import { useTranslations } from 'next-intl'
import type { Team, Player } from '@/store/draftArena'

const POSITION_LABEL: Record<string, string> = {
  GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD',
}

interface Props {
  team:      Team
  players:   Player[]
  isCurrent: boolean
}

export function TeamRoster({ team, players, isCurrent }: Props) {
  const t = useTranslations('draft')

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        isCurrent
          ? 'border-sky-500 bg-slate-800 shadow-lg shadow-sky-900/40'
          : 'border-slate-700 bg-slate-800/60'
      }`}
    >
      {/* Team header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {team.color && (
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-white/20"
              style={{ backgroundColor: team.color }}
            />
          )}
          <span className="truncate text-sm font-bold text-white">{team.name}</span>
        </div>
        {isCurrent && (
          <span className="shrink-0 rounded bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white animate-pulse">
            {t('pickingBadge')}
          </span>
        )}
      </div>

      {/* Player list */}
      {players.length === 0 ? (
        <p className="text-xs text-slate-600 italic">{t('noPicks')}</p>
      ) : (
        <ul className="space-y-1">
          {players.map(p => (
            <li key={p.id} className="flex items-center justify-between gap-1 text-xs">
              <span className={`font-semibold ${p.is_ghost ? 'text-slate-500 italic' : 'text-slate-200'}`}>
                {p.full_name}
              </span>
              <span className="shrink-0 text-slate-500">
                {POSITION_LABEL[p.position] ?? p.position}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-right text-[10px] text-slate-600">
        {t('drafted', { count: players.length })}
      </p>
    </div>
  )
}
