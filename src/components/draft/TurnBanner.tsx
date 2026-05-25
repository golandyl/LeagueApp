'use client'

import { useTranslations } from 'next-intl'
import type { Team } from '@/store/draftArena'
import type { Enums } from '@/types/database'

interface Props {
  currentTeam:  Team | null
  myTeamId:     string | null
  isManager:    boolean
  draftStatus:  Enums<'draft_status'>
  round:        number
  pickInRound:  number
  totalTeams:   number
  isConnected:  boolean
}

export function TurnBanner({
  currentTeam,
  myTeamId,
  isManager,
  draftStatus,
  round,
  pickInRound,
  totalTeams,
  isConnected,
}: Props) {
  const t = useTranslations('draft')

  if (draftStatus === 'pending') return null

  if (draftStatus === 'completed') {
    return (
      <div className="w-full bg-emerald-700 px-4 py-3 text-center">
        <span className="text-lg font-bold tracking-wide text-white">{t('draftComplete')}</span>
      </div>
    )
  }

  const isMyTurn = isManager || currentTeam?.id === myTeamId

  return (
    <div
      className={`w-full px-4 py-3 flex items-center justify-between gap-4 ${
        isMyTurn ? 'bg-emerald-700' : 'bg-slate-700'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {currentTeam?.color && (
          <span
            className="h-4 w-4 shrink-0 rounded-full border-2 border-white/40"
            style={{ backgroundColor: currentTeam.color }}
          />
        )}
        <span className="truncate font-semibold text-white">
          {isMyTurn
            ? `⚡ ${t('yourTurn')}`
            : t('waitingFor', { team: currentTeam?.name ?? '…' })}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-3 text-sm text-white/70">
        <span>{t('round', { n: round + 1 })}</span>
        <span className="hidden sm:inline">·</span>
        <span className="hidden sm:inline">
          {t('pickCount', { n: pickInRound + 1, total: totalTeams })}
        </span>
        {!isConnected && (
          <span className="rounded bg-rose-600 px-2 py-0.5 text-xs font-medium text-white">
            {t('reconnecting')}
          </span>
        )}
      </div>
    </div>
  )
}
