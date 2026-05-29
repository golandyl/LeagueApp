'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { PlayerList }             from './PlayerList'
import { AddPlayerForm }          from './AddPlayerForm'
import { StartTournamentButton }  from './StartTournamentButton'
import { FinishTournamentButton } from './FinishTournamentButton'
import { TeamsPanel }             from './TeamsPanel'
import { AdminPanel }             from './AdminPanel'
import { HistoryPanel }           from './HistoryPanel'
import { EditMatchModal }          from '@/components/match/EditMatchModal'
import { SignupControlPanel }      from './SignupControlPanel'
import type { Tables } from '@/types/database'

type Signup = Tables<'tournament_signups'>

type Player     = Tables<'players'>
type Tournament = Tables<'tournaments'>
type Match      = Tables<'matches'>
type Team       = Tables<'teams'>

type TabId = 'matchday' | 'teams' | 'roster' | 'history' | 'admin'

export interface DashboardTabsProps {
  leagueId:     string
  leagueName:   string
  signupStatus: string
  signupDate:   string | null
  maxCapacity:  number
  players:      Player[]
  tournament:   Tournament | null
  matches:      Match[]
  // Plain arrays — Maps aren't serialisable across the RSC boundary
  teams:        Team[]
  teamPlayers:  { player_id: string; team_id: string }[]
  isManager:    boolean
}

export function DashboardTabs({
  leagueId,
  leagueName,
  signupStatus,
  signupDate,
  maxCapacity,
  players,
  tournament,
  matches: initialMatches,
  teams,
  teamPlayers,
  isManager,
}: DashboardTabsProps) {
  const t      = useTranslations('dashboard')
  const tAdmin = useTranslations('admin')

  const [active,            setActive]            = useState<TabId>('matchday')
  const [liveMatches,       setLiveMatches]       = useState<Match[]>(initialMatches)
  const [activeTournament,  setActiveTournament]  = useState<Tournament | null>(tournament)

  // Sync RSC prop updates into state after router.refresh().
  // useState only uses the initializer once, so without these effects
  // a freshly-created tournament would never appear on the dashboard.
  useEffect(() => { setActiveTournament(tournament) }, [tournament?.id])
  useEffect(() => { setLiveMatches(initialMatches)  }, [initialMatches])

  // Realtime subscription — keeps the dashboard in sync when an anonymous
  // scorekeeper updates match scores or status from their device.
  const supabase = useMemo(() => createClient(), [])
  useEffect(() => {
    const channel = supabase
      .channel(`dashboard:${leagueId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `league_id=eq.${leagueId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setLiveMatches(prev =>
              prev.some(m => m.id === (payload.new as Match).id)
                ? prev
                : [...prev, payload.new as Match],
            )
          } else if (payload.eventType === 'UPDATE') {
            setLiveMatches(prev =>
              prev.map(m => m.id === (payload.new as Match).id ? payload.new as Match : m),
            )
          } else if (payload.eventType === 'DELETE') {
            setLiveMatches(prev =>
              prev.filter(m => m.id !== (payload.old as Match).id),
            )
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournaments', filter: `league_id=eq.${leagueId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setActiveTournament(prev =>
              prev?.id === (payload.new as Tournament).id ? payload.new as Tournament : prev,
            )
          } else if (payload.eventType === 'INSERT') {
            setActiveTournament(prev => prev ?? (payload.new as Tournament))
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [leagueId, supabase])

  function handleMatchUpdate(updated: Match) {
    setLiveMatches(prev => prev.map(m => m.id === updated.id ? updated : m))
  }

  function handleReset() {
    setLiveMatches([])
  }

  function handleTournamentFinished() {
    setActiveTournament(null)
    setLiveMatches([])
  }

  function handleTournamentCreated(t: Tournament, matches: Match[]) {
    setActiveTournament(t)
    setLiveMatches(matches)
  }

  const hasLive  = liveMatches.some(m => m.status === 'live')
  const hasTeams = activeTournament !== null && teams.length > 0

  return (
    <div className="mx-auto max-w-2xl">

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      {/*
        `flex` on the container + `dir` on <html> means the tabs automatically
        reverse order in Hebrew/Arabic — no extra rtl: classes needed here.
        The `border-b border-zinc-800` line is the "rail" that all tabs sit on.
        The active tab uses `-mb-px border-b-2 border-emerald-500` to draw its
        coloured indicator ON TOP of that rail (overlap trick).
      */}
      <div
        className="flex border-b border-zinc-800 px-2"
        role="tablist"
        aria-label={t('header')}
      >
        {/* ── Matchday tab ── */}
        <button
          role="tab"
          aria-selected={active === 'matchday'}
          aria-controls="panel-matchday"
          onClick={() => setActive('matchday')}
          className={[
            'flex items-center gap-2 px-4 py-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
            active === 'matchday'
              ? '-mb-px border-b-2 border-emerald-500 text-white'
              : 'text-zinc-500 hover:text-zinc-300',
          ].join(' ')}
        >
          {t('tabMatchday')}
          {/* Pulsing dot when a live match is running */}
          {hasLive && (
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"
              aria-hidden="true"
            />
          )}
        </button>

        {/* ── Teams tab — only visible when a tournament with teams exists ── */}
        {hasTeams && (
          <button
            role="tab"
            aria-selected={active === 'teams'}
            aria-controls="panel-teams"
            onClick={() => setActive('teams')}
            className={[
              'flex items-center gap-2 px-4 py-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
              active === 'teams'
                ? '-mb-px border-b-2 border-emerald-500 text-white'
                : 'text-zinc-500 hover:text-zinc-300',
            ].join(' ')}
          >
            {t('tabTeams')}
            <span
              className={[
                'rounded-full px-1.5 py-px text-[10px] font-black tabular-nums transition-colors',
                active === 'teams'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-zinc-800 text-zinc-400',
              ].join(' ')}
            >
              {teams.length}
            </span>
          </button>
        )}

        {/* ── Roster tab ── */}
        <button
          role="tab"
          aria-selected={active === 'roster'}
          aria-controls="panel-roster"
          onClick={() => setActive('roster')}
          className={[
            'flex items-center gap-2 px-4 py-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
            active === 'roster'
              ? '-mb-px border-b-2 border-emerald-500 text-white'
              : 'text-zinc-500 hover:text-zinc-300',
          ].join(' ')}
        >
          {t('tabRoster')}
          {players.length > 0 && (
            <span
              className={[
                'rounded-full px-1.5 py-px text-[10px] font-black tabular-nums transition-colors',
                active === 'roster'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-zinc-800 text-zinc-400',
              ].join(' ')}
            >
              {players.length}
            </span>
          )}
        </button>

        {/* ── History tab ── */}
        <button
          role="tab"
          aria-selected={active === 'history'}
          aria-controls="panel-history"
          onClick={() => setActive('history')}
          className={[
            'flex items-center gap-2 px-4 py-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
            active === 'history'
              ? '-mb-px border-b-2 border-emerald-500 text-white'
              : 'text-zinc-500 hover:text-zinc-300',
          ].join(' ')}
        >
          {t('tabHistory')}
        </button>

        {/* ── Admin tab — manager-only, pushed to the end with ms-auto ── */}
        {isManager && (
          <button
            role="tab"
            aria-selected={active === 'admin'}
            aria-controls="panel-admin"
            onClick={() => setActive('admin')}
            className={[
              'ms-auto flex items-center gap-1.5 px-4 py-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
              active === 'admin'
                ? '-mb-px border-b-2 border-rose-500 text-rose-300'
                : 'text-zinc-600 hover:text-zinc-400',
            ].join(' ')}
          >
            {tAdmin('tabAdmin')}
          </button>
        )}
      </div>

      {/* ── Tab panels ────────────────────────────────────────────────────── */}

      {active === 'teams' && activeTournament && (
        <div
          id="panel-teams"
          role="tabpanel"
          className="px-4 py-6"
        >
          <TeamsPanel
            key={activeTournament.id}
            tournament={activeTournament}
            teams={teams}
            players={players}
            teamPlayers={teamPlayers}
            readOnly={!isManager}
          />
        </div>
      )}

      {active === 'matchday' && (
        <div
          id="panel-matchday"
          role="tabpanel"
          className="px-4 py-6"
        >
          <MatchdayPanel
            leagueId={leagueId}
            signupStatus={signupStatus}
            signupDate={signupDate}
            maxCapacity={maxCapacity}
            players={players}
            tournament={activeTournament}
            matches={liveMatches}
            teams={teams}
            isManager={isManager}
            onMatchUpdate={handleMatchUpdate}
            onTournamentFinished={handleTournamentFinished}
            onTournamentCreated={handleTournamentCreated}
          />
        </div>
      )}

      {active === 'roster' && (
        <div
          id="panel-roster"
          role="tabpanel"
          className="px-4 py-6"
        >
          <RosterPanel leagueId={leagueId} players={players} isManager={isManager} />
        </div>
      )}

      {active === 'history' && (
        <div
          id="panel-history"
          role="tabpanel"
          className="px-4 py-6"
        >
          <HistoryPanel leagueId={leagueId} players={players} />
        </div>
      )}

      {active === 'admin' && (
        <div
          id="panel-admin"
          role="tabpanel"
          className="px-4 py-6"
        >
          <AdminPanel leagueId={leagueId} leagueName={leagueName} onReset={handleReset} />
        </div>
      )}
    </div>
  )
}

// ── Matchday panel ─────────────────────────────────────────────────────────────

interface MatchdayPanelProps {
  leagueId:               string
  signupStatus:           string
  signupDate:             string | null
  maxCapacity:            number
  players:                Player[]
  tournament:             Tournament | null
  matches:                Match[]
  teams:                  Team[]
  isManager:              boolean
  onMatchUpdate:          (updated: Match) => void
  onTournamentFinished:   () => void
  onTournamentCreated:    (tournament: Tournament, matches: Match[]) => void
}

function MatchdayPanel({
  leagueId,
  signupStatus,
  signupDate,
  maxCapacity,
  players,
  tournament,
  matches,
  teams,
  isManager,
  onMatchUpdate,
  onTournamentFinished,
  onTournamentCreated,
}: MatchdayPanelProps) {
  const t      = useTranslations('dashboard')
  const tDraft = useTranslations('draft')
  const tEdit  = useTranslations('editMatch')
  const locale = useLocale()

  const [editingMatch, setEditingMatch] = useState<Match | null>(null)

  // Reconstruct lookup map from the serialised array
  const teamsMap        = new Map(teams.map(team => [team.id, team]))
  const activeLiveMatch = tournament ? (matches.find(m => m.status === 'live') ?? null) : null

  return (
    <div className="space-y-8">

      {/* Manager-only: signup window controls + approval banner */}
      {isManager && (
        <SignupControlPanel
          leagueId={leagueId}
          signupStatus={signupStatus}
          signupDate={signupDate}
          maxCapacity={maxCapacity}
        />
      )}

      {/* Tournament control — only visible to the manager */}
      {isManager && (
        <section className="space-y-3">
          <PanelHeader>{t('tournamentControl')}</PanelHeader>

          {activeLiveMatch ? (
            /* Live guard: hide create/finish controls while a player is actively scoring */
            <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-900/30 px-5 py-5 ring-1 ring-emerald-700/60">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
                <p className="text-sm font-semibold text-emerald-300">{t('liveGameInProgress')}</p>
              </div>
              <Link
                href={`/match/${activeLiveMatch.id}`}
                className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white transition-all active:scale-95 active:bg-emerald-700"
              >
                {t('viewLiveMatch')}
              </Link>
            </div>
          ) : (
            <>
              {tournament && (
                <p className="text-xs text-zinc-500">
                  {t('current')}{' '}
                  <span className="font-semibold text-zinc-300">{tournament.name}</span>
                  {' · '}
                  {t('matchCount', { count: matches.length })}
                </p>
              )}

              <StartTournamentButton leagueId={leagueId} players={players} onCreated={onTournamentCreated} />

              {tournament && (
                <FinishTournamentButton
                  leagueId={leagueId}
                  tournamentId={tournament.id}
                  onFinished={onTournamentFinished}
                />
              )}
            </>
          )}
        </section>
      )}

      {/* Draft room card — shown when a live draft is still in progress */}
      {tournament && tournament.draft_status !== 'completed' && (
        <section className="space-y-3">
          <PanelHeader>{tDraft('draftInProgress')}</PanelHeader>
          <a
            href={`/${locale}/draft/${tournament.id}`}
            className="flex items-center justify-between gap-3 rounded-xl bg-zinc-900 px-5 py-5 ring-1 ring-zinc-700/40 transition-all hover:bg-zinc-800/60 active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
              <div>
                <p className="font-black text-white">{tDraft('title')}</p>
                <p className="mt-0.5 text-xs text-zinc-300">{tournament.name}</p>
              </div>
            </div>
            <span className="shrink-0 text-sm font-bold text-zinc-300">
              {tDraft('openDraftRoom')}
            </span>
          </a>
        </section>
      )}

      {/* Live match links — only rendered when a tournament day exists */}
      {(tournament || matches.length > 0) && (
        <section className="space-y-3">
          <PanelHeader>{t('liveMatchLinks')}</PanelHeader>

          {matches.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">{t('noMatches')}</p>
          ) : (
            <div className="space-y-2">
              {matches.map(m => {
                const home = teamsMap.get(m.home_team_id)
                const away = teamsMap.get(m.away_team_id)
                const canEdit = m.status === 'completed' || m.status === 'cancelled'
                return (
                  <div
                    key={m.id}
                    className={[
                      'flex items-center rounded-xl transition-all',
                      m.status === 'live'
                        ? 'bg-emerald-900/30 ring-1 ring-emerald-700/60'
                        : m.status === 'completed'
                        ? 'bg-zinc-900/60'
                        : 'bg-zinc-900',
                    ].join(' ')}
                  >
                    {/* Main row — navigates to match arena */}
                    <Link
                      href={`/match/${m.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 active:scale-[0.98]"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <TeamChip team={home} unknownLabel={t('unknown')} />
                        <span className="shrink-0 text-xs font-bold text-zinc-500">
                          {t('vs')}
                        </span>
                        <TeamChip team={away} unknownLabel={t('unknown')} />
                      </div>
                      <MatchBadge
                        match={m}
                        liveLabel={t('live')}
                        kickOffLabel={t('kickOff')}
                      />
                    </Link>

                    {/* Pencil edit button — manager only, for finished matches */}
                    {canEdit && isManager && (
                      <button
                        onClick={() => setEditingMatch(m)}
                        aria-label={tEdit('editAriaLabel')}
                        className="shrink-0 rounded-xl p-3 me-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Standings link */}
      <div className="border-t border-zinc-800 pt-2 text-center">
        <Link
          href={`/league/${leagueId}/standings`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-400 transition-colors hover:text-zinc-300"
        >
          {t('viewStandings')}
          <svg
            className="h-3.5 w-3.5 rtl:rotate-180"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
          </svg>
        </Link>
      </div>

      {/* Edit match modal — manager only */}
      {editingMatch && isManager && (
        <EditMatchModal
          match={editingMatch}
          homeTeam={teamsMap.get(editingMatch.home_team_id)}
          awayTeam={teamsMap.get(editingMatch.away_team_id)}
          onSave={updated => {
            onMatchUpdate(updated)
          }}
          onClose={() => setEditingMatch(null)}
        />
      )}
    </div>
  )
}

// ── Roster panel ───────────────────────────────────────────────────────────────

interface RosterPanelProps {
  leagueId:  string
  players:   Player[]
  isManager: boolean
}

function RosterPanel({ leagueId, players, isManager }: RosterPanelProps) {
  const t = useTranslations('dashboard')

  return (
    <div className="space-y-4">
      {players.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">{t('noPlayers')}</p>
      ) : (
        <PlayerList players={players} isManager={isManager} />
      )}
      {isManager && <AddPlayerForm leagueId={leagueId} />}
    </div>
  )
}

// ── Shared micro-components ────────────────────────────────────────────────────

function PanelHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-black uppercase tracking-tight text-zinc-400">
      {children}
    </h2>
  )
}

function TeamChip({ team, unknownLabel }: { team: Team | undefined; unknownLabel: string }) {
  if (!team) return <span className="text-sm text-zinc-500">{unknownLabel}</span>
  return (
    <span className="flex min-w-0 items-center gap-1.5 truncate">
      {team.color && (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: team.color }}
        />
      )}
      <span className="truncate text-sm font-bold text-white">{team.name}</span>
    </span>
  )
}

// ── Match badge ────────────────────────────────────────────────────────────────

function MatchBadge({
  match,
  liveLabel,
  kickOffLabel,
}: {
  match:         Match
  liveLabel:     string
  kickOffLabel:  string
}) {
  if (match.status === 'live') {
    return (
      <span className="shrink-0 animate-pulse text-xs font-black uppercase text-emerald-400">
        ● {liveLabel}
      </span>
    )
  }
  if (match.status === 'completed' && match.home_score != null && match.away_score != null) {
    return (
      <span className="shrink-0 text-base font-black tabular-nums text-white">
        {match.home_score}–{match.away_score}
      </span>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-bold text-zinc-400">
      {kickOffLabel}
      <svg
        className="h-3 w-3 rtl:rotate-180"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
      </svg>
    </span>
  )
}
