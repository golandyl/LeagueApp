'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { TeamsPanel } from './TeamsPanel'
import type { Tables } from '@/types/database'

type Tournament = Tables<'tournaments'>
type Team       = Tables<'teams'>
type Match      = Tables<'matches'>
type Player     = Tables<'players'>

interface TournamentWithCount extends Tournament {
  teamCount: number
}

interface ArchiveDetails {
  teams:       Team[]
  teamPlayers: { player_id: string; team_id: string }[]
  matches:     Match[]
}

interface Props {
  leagueId: string
  players:  Player[]
}

export function HistoryPanel({ leagueId, players }: Props) {
  const t = useTranslations('dashboard')
  const tCommon = useTranslations('common')
  const [tournaments, setTournaments] = useState<TournamentWithCount[]>([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data: tours } = await supabase
        .from('tournaments')
        .select('*')
        .eq('league_id', leagueId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })

      if (cancelled) return

      if (!tours || tours.length === 0) {
        setLoading(false)
        return
      }

      const ids = tours.map(t => t.id)
      const { data: teamRows } = await supabase
        .from('teams')
        .select('tournament_id')
        .in('tournament_id', ids)

      if (cancelled) return

      const countMap = new Map<string, number>()
      for (const row of teamRows ?? []) {
        countMap.set(row.tournament_id, (countMap.get(row.tournament_id) ?? 0) + 1)
      }

      setTournaments(tours.map(t => ({ ...t, teamCount: countMap.get(t.id) ?? 0 })))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [leagueId])

  if (loading) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">{tCommon('loading')}</p>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
        {t('archiveTitle')}
      </h2>
      {tournaments.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('noHistory')}</p>
      ) : (
        tournaments.map(tour => (
          <ArchiveCard key={tour.id} tournament={tour} players={players} />
        ))
      )}
    </div>
  )
}

function ArchiveCard({
  tournament,
  players,
}: {
  tournament: TournamentWithCount
  players:    Player[]
}) {
  const t       = useTranslations('dashboard')
  const tCommon = useTranslations('common')

  const [expanded, setExpanded] = useState(false)
  const [details,  setDetails]  = useState<ArchiveDetails | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleToggle() {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (details) return

    setLoading(true)
    const supabase = createClient()
    const [
      { data: teams, error: teamsErr },
      { data: tp },
      { data: matches },
    ] = await Promise.all([
      supabase.from('teams').select('*').eq('tournament_id', tournament.id),
      supabase.from('team_players').select('player_id, team_id').eq('tournament_id', tournament.id),
      supabase.from('matches').select('*').eq('tournament_id', tournament.id).order('created_at'),
    ])
    setLoading(false)

    if (teamsErr || !teams) {
      setError(t('archiveLoadError'))
      return
    }
    setDetails({ teams, teamPlayers: tp ?? [], matches: matches ?? [] })
  }

  const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(tournament.created_at),
  )

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-800">
      <button
        onClick={handleToggle}
        className="flex w-full items-center gap-3 px-4 py-4 text-start transition-colors hover:bg-slate-700/30"
      >
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{tournament.name}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {date} · {t('teamsCount', { count: tournament.teamCount })}
          </p>
        </div>
        <svg
          className={[
            'h-4 w-4 shrink-0 text-slate-500 transition-transform',
            expanded ? 'rotate-90' : 'rtl:rotate-180',
          ].join(' ')}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-slate-700/60 px-4 pb-5 pt-4 space-y-6">
          {loading && (
            <p className="py-4 text-center text-sm text-slate-500">{tCommon('loading')}</p>
          )}
          {error && (
            <p className="text-sm font-medium text-rose-400">{error}</p>
          )}
          {details && (
            <>
              <section className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                  {t('archiveRosters')}
                </h3>
                <TeamsPanel
                  tournament={tournament}
                  teams={details.teams}
                  players={players}
                  teamPlayers={details.teamPlayers}
                  readOnly
                />
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                  {t('archiveMatchResults')}
                </h3>
                <ArchiveMatchList matches={details.matches} teams={details.teams} />
              </section>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ArchiveMatchList({ matches, teams }: { matches: Match[]; teams: Team[] }) {
  const t = useTranslations('dashboard')
  const teamsMap = new Map(teams.map(t => [t.id, t]))

  if (matches.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-500">{t('noMatches')}</p>
  }

  return (
    <div className="space-y-1.5">
      {matches.map(m => {
        const home = teamsMap.get(m.home_team_id)
        const away = teamsMap.get(m.away_team_id)
        return (
          <div
            key={m.id}
            className="flex items-center gap-2 rounded-xl bg-slate-700/50 px-3 py-2.5"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
              {home?.name ?? t('unknown')}
            </span>
            <span className="shrink-0 text-sm font-black tabular-nums text-white">
              {m.home_score ?? '–'}{' '}–{' '}{m.away_score ?? '–'}
            </span>
            <span className="min-w-0 flex-1 truncate text-end text-sm font-semibold text-white">
              {away?.name ?? t('unknown')}
            </span>
          </div>
        )
      })}
    </div>
  )
}
