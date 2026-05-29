'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

type Team       = Tables<'teams'>
type Player     = Tables<'players'>
type Tournament = Tables<'tournaments'>
type Position   = 'GK' | 'DEF' | 'MID' | 'FWD'
type ViewMode   = 'pitch' | 'stats'

interface TeamPlayerRow { player_id: string; team_id: string }

interface Props {
  tournament:  Tournament
  teams:       Team[]
  players:     Player[]
  teamPlayers: TeamPlayerRow[]
  readOnly?:   boolean
}

// FWD at top (attacking end), GK at bottom (defending goal)
const PITCH_ORDER: Position[] = ['FWD', 'MID', 'DEF', 'GK']

const PIN_COLOR: Record<Position, string> = {
  GK:  '#F59E0B',   // amber
  DEF: '#38BDF8',   // sky
  MID: '#A78BFA',   // violet
  FWD: '#FB7185',   // rose
}

function initials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2)
}

function calcAvg(roster: Player[]): string {
  if (roster.length === 0) return '—'
  return (roster.reduce((s, p) => s + p.rating, 0) / roster.length).toFixed(1)
}

function groupByPos(roster: Player[]): Record<Position, Player[]> {
  const g: Record<Position, Player[]> = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const p of roster) {
    if (p.position in g) g[p.position as Position].push(p)
  }
  return g
}

// ── Root panel ─────────────────────────────────────────────────────────────────

export function TeamsPanel({ tournament, teams, players, teamPlayers: initialTp, readOnly = false }: Props) {
  const t       = useTranslations('teams')
  const tCommon = useTranslations('common')
  const supabase = createClient()

  const [localTp,     setLocalTp]     = useState<TeamPlayerRow[]>(initialTp)
  const [swapSource,  setSwapSource]  = useState<{ playerId: string; fromTeamId: string } | null>(null)
  const [swapLoading, setSwapLoading] = useState(false)
  const [swapError,   setSwapError]   = useState<string | null>(null)

  const playerById = useMemo(
    () => new Map(players.map(p => [p.id, p])),
    [players],
  )

  const teamRosters = useMemo(() => {
    const rosters = new Map<string, Player[]>()
    for (const team of teams) rosters.set(team.id, [])
    for (const tp of localTp) {
      const player = playerById.get(tp.player_id)
      if (!player) continue   // ghost — not in non-ghost player list
      rosters.get(tp.team_id)?.push(player)
    }
    return rosters
  }, [localTp, playerById, teams])

  const swapOptions = useMemo(() => {
    if (!swapSource) return []
    return players.filter(p => {
      const tp = localTp.find(x => x.player_id === p.id)
      return tp && tp.team_id !== swapSource.fromTeamId
    })
  }, [swapSource, localTp, players])

  function teamForPlayer(playerId: string): Team | undefined {
    const teamId = localTp.find(tp => tp.player_id === playerId)?.team_id
    return teams.find(t => t.id === teamId)
  }

  // ── Swap ───────────────────────────────────────────────────────────────────────

  async function handleSwap(targetPlayerId: string) {
    if (!swapSource) return
    const { playerId: sourceId, fromTeamId: sourceTeamId } = swapSource
    const targetTp = localTp.find(tp => tp.player_id === targetPlayerId)
    if (!targetTp || targetTp.team_id === sourceTeamId) return

    const targetTeamId = targetTp.team_id

    // Optimistic update — instant feedback
    setLocalTp(prev => prev.map(tp => {
      if (tp.player_id === sourceId)       return { ...tp, team_id: targetTeamId }
      if (tp.player_id === targetPlayerId) return { ...tp, team_id: sourceTeamId }
      return tp
    }))
    setSwapSource(null)
    setSwapError(null)

    setSwapLoading(true)
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('team_players')
        .update({ team_id: targetTeamId })
        .eq('player_id', sourceId)
        .eq('tournament_id', tournament.id),
      supabase.from('team_players')
        .update({ team_id: sourceTeamId })
        .eq('player_id', targetPlayerId)
        .eq('tournament_id', tournament.id),
    ])
    setSwapLoading(false)

    if (e1 || e2) {
      // Revert on failure
      setLocalTp(prev => prev.map(tp => {
        if (tp.player_id === sourceId)       return { ...tp, team_id: sourceTeamId }
        if (tp.player_id === targetPlayerId) return { ...tp, team_id: targetTeamId }
        return tp
      }))
      setSwapError(e1?.message ?? e2?.message ?? tCommon('error'))
    }
  }

  // ── WhatsApp share ─────────────────────────────────────────────────────────────

  function handleShareWhatsApp() {
    const lines: string[] = [`🏆 ${tournament.name}`, '']
    for (const team of teams) {
      const roster = teamRosters.get(team.id) ?? []
      lines.push(`${team.name}:`)
      for (const player of roster) {
        lines.push(`• ${player.full_name}`)
      }
      lines.push('')
    }
    const text = lines.join('\n').trim()
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  // ── Render ─────────────────────────────────────────────────────────────────────

  if (teams.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-500">{t('noTeams')}</p>
  }

  return (
    <div className="space-y-4">

      {/* WhatsApp share — hidden in read-only mode */}
      {!readOnly && (
        <button
          onClick={handleShareWhatsApp}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] py-4 text-sm font-black text-white shadow-lg transition-all active:scale-[0.97] active:opacity-90"
        >
          <WhatsAppIcon />
          {t('shareWhatsApp')}
        </button>
      )}

      {swapError && (
        <p className="rounded-xl bg-red-900/40 px-4 py-3 text-sm text-red-300">{swapError}</p>
      )}

      {/* Team cards */}
      {teams.map(team => (
        <TeamCard
          key={team.id}
          team={team}
          roster={teamRosters.get(team.id) ?? []}
          selectedPlayerId={swapSource?.playerId ?? null}
          readOnly={readOnly}
          onPlayerTap={readOnly
            ? () => {}
            : (pid) => setSwapSource(prev =>
                prev?.playerId === pid ? null : { playerId: pid, fromTeamId: team.id }
              )
          }
        />
      ))}

      {/* Swap bottom sheet — hidden in read-only mode */}
      {!readOnly && swapSource && (
        <SwapSheet
          sourcePlayer={playerById.get(swapSource.playerId)!}
          options={swapOptions}
          teamForPlayer={teamForPlayer}
          loading={swapLoading}
          onSwap={handleSwap}
          onCancel={() => setSwapSource(null)}
        />
      )}
    </div>
  )
}

// ── Team card ──────────────────────────────────────────────────────────────────

function TeamCard({
  team, roster, selectedPlayerId, onPlayerTap, readOnly,
}: {
  team:             Team
  roster:           Player[]
  selectedPlayerId: string | null
  onPlayerTap:      (playerId: string) => void
  readOnly?:        boolean
}) {
  const t      = useTranslations('teams')
  const byPos  = groupByPos(roster)
  const avg    = calcAvg(roster)
  const [viewMode, setViewMode] = useState<ViewMode>('pitch')

  const isThisTeamSelected = selectedPlayerId !== null && roster.some(p => p.id === selectedPlayerId)

  return (
    <div className="overflow-hidden rounded-xl bg-zinc-900 shadow-lg">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {team.color && (
          <span
            className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white/20"
            style={{ backgroundColor: team.color }}
          />
        )}
        <span className="min-w-0 flex-1 truncate font-black text-white">{team.name}</span>
        {/* Avg rating badge — hidden for non-managers */}
        {!readOnly && (
          <div className="shrink-0 rounded-xl bg-emerald-950/30 px-3.5 py-2 text-center ring-1 ring-emerald-700/40">
            <p className="text-2xl font-black tabular-nums leading-none text-emerald-300">{avg}</p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-tight text-emerald-600/80">
              {t('avgRating')}
            </p>
          </div>
        )}
      </div>

      {/* View mode toggle */}
      <div className="mx-3 mb-3 flex gap-0.5 rounded-xl bg-zinc-950/60 p-0.5">
        <button
          onClick={() => setViewMode('pitch')}
          className={[
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-colors',
            viewMode === 'pitch'
              ? 'bg-zinc-800 text-white shadow-sm'
              : 'text-zinc-500 hover:text-zinc-400',
          ].join(' ')}
        >
          <PitchIcon />
          {t('pitchView')}
        </button>
        <button
          onClick={() => setViewMode('stats')}
          className={[
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-colors',
            viewMode === 'stats'
              ? 'bg-zinc-800 text-white shadow-sm'
              : 'text-zinc-500 hover:text-zinc-400',
          ].join(' ')}
        >
          <ListIcon />
          {t('statsView')}
        </button>
      </div>

      {/* Pitch view */}
      {viewMode === 'pitch' && (
        <div
          className="relative mx-3 mb-3 overflow-hidden rounded-xl"
          style={{ minHeight: '232px', backgroundColor: '#052e16' }}
        >
          <PitchMarkings />
          <div
            className="relative z-10 flex flex-col justify-between px-4 py-5"
            style={{ minHeight: '232px' }}
          >
            {PITCH_ORDER.map(pos => {
              const pp = byPos[pos]
              if (pp.length === 0) return null
              return (
                <div key={pos} className="flex items-center justify-center gap-3">
                  {pp.map(player => (
                    <PlayerPin
                      key={player.id}
                      player={player}
                      pos={pos}
                      isSelected={selectedPlayerId === player.id}
                      onTap={onPlayerTap}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Stats view */}
      {viewMode === 'stats' && (
        <StatsRoster
          roster={roster}
          selectedPlayerId={selectedPlayerId}
          onPlayerTap={onPlayerTap}
          readOnly={readOnly}
        />
      )}

      {/* Swap hint — hidden in read-only mode */}
      {!readOnly && isThisTeamSelected && (
        <p className="px-4 pb-3 text-center text-xs font-semibold text-amber-400">
          {t('swapHint')}
        </p>
      )}
    </div>
  )
}

// ── Stats roster ───────────────────────────────────────────────────────────────

function StatsRoster({
  roster, selectedPlayerId, onPlayerTap, readOnly,
}: {
  roster:           Player[]
  selectedPlayerId: string | null
  onPlayerTap:      (playerId: string) => void
  readOnly?:        boolean
}) {
  const byPos = groupByPos(roster)

  return (
    <div className="mx-3 mb-3 space-y-2.5">
      {PITCH_ORDER.map(pos => {
        const group = byPos[pos]
        if (group.length === 0) return null
        return (
          <div key={pos}>
            {/* Position group label */}
            <p
              className="mb-1.5 px-1 text-[9px] font-black uppercase tracking-tight"
              style={{ color: PIN_COLOR[pos] }}
            >
              {pos}
            </p>
            <div className="space-y-1.5">
              {group.map(player => (
                <StatPlayerCard
                  key={player.id}
                  player={player}
                  pos={pos}
                  isSelected={selectedPlayerId === player.id}
                  onTap={onPlayerTap}
                  readOnly={readOnly}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Stat player card ───────────────────────────────────────────────────────────

function StatPlayerCard({
  player, pos, isSelected, onTap, readOnly,
}: {
  player:     Player
  pos:        Position
  isSelected: boolean
  onTap:      (playerId: string) => void
  readOnly?:  boolean
}) {
  const pinColor = PIN_COLOR[pos]

  const inner = (
    <div
      className={[
        'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all',
        isSelected
          ? 'bg-amber-500/20 ring-1 ring-amber-500/50'
          : 'bg-zinc-800/50',
      ].join(' ')}
    >
      {/* Position badge */}
      <span
        className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase"
        style={{ backgroundColor: `${pinColor}22`, color: pinColor }}
      >
        {pos}
      </span>
      {/* Player name */}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
        {player.full_name}
      </span>
      {/* Individual rating — hidden for non-managers */}
      {!readOnly && (
        <span
          className={[
            'shrink-0 text-base font-black tabular-nums',
            isSelected ? 'text-amber-400' : 'text-zinc-200',
          ].join(' ')}
        >
          {player.rating}
        </span>
      )}
    </div>
  )

  if (readOnly) {
    return <div>{inner}</div>
  }

  return (
    <button
      onClick={() => onTap(player.id)}
      className={[
        'w-full text-start transition-transform active:scale-[0.98]',
        isSelected ? 'scale-[1.01]' : '',
      ].join(' ')}
      aria-pressed={isSelected}
    >
      {inner}
    </button>
  )
}

// ── Pitch SVG markings ─────────────────────────────────────────────────────────

function PitchMarkings() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g stroke="white" fill="none" opacity="0.07" strokeWidth="0.7">
        <line   x1="0"  y1="70" x2="100" y2="70" />
        <circle cx="50" cy="70" r="14" />
        <circle cx="50" cy="70" r="1.5" fill="white" stroke="none" />
        <rect   x="22"  y="3"   width="56" height="24" />
        <rect   x="22"  y="113" width="56" height="24" />
        <rect   x="37"  y="3"   width="26" height="8" />
        <rect   x="37"  y="129" width="26" height="8" />
      </g>
    </svg>
  )
}

// ── Player pin ─────────────────────────────────────────────────────────────────

function PlayerPin({
  player, pos, isSelected, onTap, readOnly,
}: {
  player:     Player
  pos:        Position
  isSelected: boolean
  onTap:      (playerId: string) => void
  readOnly?:  boolean
}) {
  const pinColor = PIN_COLOR[pos]

  const inner = (
    <>
      <div
        className={[
          'flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-black text-white ring-2 transition-all',
          isSelected ? 'ring-white/80' : 'ring-black/40',
        ].join(' ')}
        style={{ backgroundColor: isSelected ? '#F59E0B' : pinColor }}
      >
        {initials(player.full_name)}
      </div>
      <span className="max-w-[44px] truncate text-center text-[8px] font-semibold leading-tight text-white/75">
        {player.full_name.split(' ')[0]}
      </span>
    </>
  )

  if (readOnly) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        {inner}
      </div>
    )
  }

  return (
    <button
      onClick={() => onTap(player.id)}
      className={[
        'flex flex-col items-center gap-0.5 transition-all active:scale-90',
        isSelected ? 'scale-110' : '',
      ].join(' ')}
      aria-pressed={isSelected}
    >
      {inner}
    </button>
  )
}

// ── Swap bottom sheet ──────────────────────────────────────────────────────────

function SwapSheet({
  sourcePlayer, options, teamForPlayer, loading, onSwap, onCancel,
}: {
  sourcePlayer:  Player
  options:       Player[]
  teamForPlayer: (playerId: string) => Team | undefined
  loading:       boolean
  onSwap:        (targetPlayerId: string) => void
  onCancel:      () => void
}) {
  const t       = useTranslations('teams')
  const tCommon = useTranslations('common')

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        className="max-h-[65vh] overflow-y-auto rounded-t-xl bg-zinc-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-zinc-700" />

        <div className="px-5 pb-3 pt-4">
          <p className="text-xs font-bold uppercase tracking-tight text-zinc-400">
            {t('swapPlayer')}
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            {t('swapWith')}{' '}
            <span className="font-black text-amber-400">{sourcePlayer.full_name}</span>
          </p>
        </div>

        <div className="space-y-2 px-5 pb-4">
          {options.map(player => {
            const team = teamForPlayer(player.id)
            return (
              <button
                key={player.id}
                onClick={() => onSwap(player.id)}
                disabled={loading}
                className="flex w-full items-center gap-3 rounded-xl bg-zinc-800/60 px-4 py-3.5 text-start transition-all active:scale-[0.98] active:bg-zinc-700 disabled:opacity-50"
              >
                {team?.color && (
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white/20"
                    style={{ backgroundColor: team.color }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">{player.full_name}</p>
                  <p className="text-xs text-zinc-400">
                    {team?.name} · {player.position}
                  </p>
                </div>
                <svg
                  className="h-4 w-4 shrink-0 text-zinc-500 rtl:rotate-180"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                </svg>
              </button>
            )
          })}

          {options.length === 0 && (
            <p className="py-4 text-center text-sm text-zinc-500">{t('noSwapOptions')}</p>
          )}
        </div>

        <div className="border-t border-zinc-800/60 px-5 py-4">
          <button
            onClick={onCancel}
            className="w-full rounded-xl py-3.5 text-sm font-semibold text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 active:bg-zinc-800"
          >
            {tCommon('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Toggle icons ───────────────────────────────────────────────────────────────

function PitchIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1" y="2" width="14" height="12" rx="1" />
      <line x1="8" y1="2" x2="8" y2="14" />
      <circle cx="8" cy="8" r="2" />
      <line x1="1" y1="8" x2="4" y2="8" />
      <line x1="12" y1="8" x2="15" y2="8" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <line x1="5" y1="4" x2="14" y2="4" />
      <line x1="5" y1="8" x2="14" y2="8" />
      <line x1="5" y1="12" x2="14" y2="12" />
      <circle cx="2.5" cy="4"  r="1" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="8"  r="1" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// ── WhatsApp icon ──────────────────────────────────────────────────────────────

function WhatsAppIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.38 1.25 4.79L2.05 22l5.43-1.43a9.844 9.844 0 004.56 1.13c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.52 14.14c-.23.64-1.34 1.23-1.84 1.3-.46.07-1.05.1-1.7-.11-.39-.12-.89-.29-1.53-.57-2.68-1.16-4.43-3.88-4.57-4.06-.13-.18-1.1-1.46-1.1-2.79 0-1.32.69-1.97 1-2.24.3-.27.65-.33.87-.33.22 0 .43 0 .62.01.2.01.46-.08.72.55.27.64.9 2.19.98 2.35.08.16.13.34.02.54-.1.19-.16.32-.31.49-.16.17-.33.38-.47.51-.16.15-.33.31-.14.61.19.3.84 1.38 1.8 2.24.79.71 1.5 1.03 1.87 1.21.37.18.58.15.79-.09.22-.24.92-1.07 1.17-1.44.25-.37.5-.31.84-.18.35.13 2.19 1.03 2.57 1.22.37.19.62.28.71.44.09.16.09.93-.14 1.57z" />
    </svg>
  )
}
