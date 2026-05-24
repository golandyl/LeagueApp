'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { PlayerList }          from './PlayerList'
import { AddPlayerForm }       from './AddPlayerForm'
import { StartTournamentButton } from './StartTournamentButton'
import { TeamsPanel }          from './TeamsPanel'
import type { Tables } from '@/types/database'

type Player     = Tables<'players'>
type Tournament = Tables<'tournaments'>
type Match      = Tables<'matches'>
type Team       = Tables<'teams'>

type TabId = 'matchday' | 'teams' | 'roster'

export interface DashboardTabsProps {
  leagueId:    string
  players:     Player[]
  tournament:  Tournament | null
  matches:     Match[]
  // Plain arrays — Maps aren't serialisable across the RSC boundary
  teams:       Team[]
  teamPlayers: { player_id: string; team_id: string }[]
}

export function DashboardTabs({
  leagueId,
  players,
  tournament,
  matches,
  teams,
  teamPlayers,
}: DashboardTabsProps) {
  const t        = useTranslations('dashboard')
  const [active, setActive] = useState<TabId>('matchday')

  const hasLive  = matches.some(m => m.status === 'live')
  const hasTeams = tournament !== null && teams.length > 0

  return (
    <div className="mx-auto max-w-2xl">

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      {/*
        `flex` on the container + `dir` on <html> means the tabs automatically
        reverse order in Hebrew/Arabic — no extra rtl: classes needed here.
        The `border-b border-slate-800` line is the "rail" that all tabs sit on.
        The active tab uses `-mb-px border-b-2 border-emerald-500` to draw its
        coloured indicator ON TOP of that rail (overlap trick).
      */}
      <div
        className="flex border-b border-slate-800 px-2"
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
            'flex items-center gap-2 px-4 py-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
            active === 'matchday'
              ? '-mb-px border-b-2 border-emerald-500 text-white'
              : 'text-slate-500 hover:text-slate-300',
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
              'flex items-center gap-2 px-4 py-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
              active === 'teams'
                ? '-mb-px border-b-2 border-emerald-500 text-white'
                : 'text-slate-500 hover:text-slate-300',
            ].join(' ')}
          >
            {t('tabTeams')}
            <span
              className={[
                'rounded-full px-1.5 py-px text-[10px] font-black tabular-nums transition-colors',
                active === 'teams'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-slate-700 text-slate-400',
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
            'flex items-center gap-2 px-4 py-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
            active === 'roster'
              ? '-mb-px border-b-2 border-emerald-500 text-white'
              : 'text-slate-500 hover:text-slate-300',
          ].join(' ')}
        >
          {t('tabRoster')}
          {players.length > 0 && (
            <span
              className={[
                'rounded-full px-1.5 py-px text-[10px] font-black tabular-nums transition-colors',
                active === 'roster'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-slate-700 text-slate-400',
              ].join(' ')}
            >
              {players.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab panels ────────────────────────────────────────────────────── */}

      {active === 'teams' && tournament && (
        <div
          id="panel-teams"
          role="tabpanel"
          className="px-4 py-6"
        >
          <TeamsPanel
            key={tournament.id}
            tournament={tournament}
            teams={teams}
            players={players}
            teamPlayers={teamPlayers}
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
            players={players}
            tournament={tournament}
            matches={matches}
            teams={teams}
          />
        </div>
      )}

      {active === 'roster' && (
        <div
          id="panel-roster"
          role="tabpanel"
          className="px-4 py-6"
        >
          <RosterPanel leagueId={leagueId} players={players} />
        </div>
      )}
    </div>
  )
}

// ── Matchday panel ─────────────────────────────────────────────────────────────

interface MatchdayPanelProps {
  leagueId:   string
  players:    Player[]
  tournament: Tournament | null
  matches:    Match[]
  teams:      Team[]
}

function MatchdayPanel({
  leagueId,
  players,
  tournament,
  matches,
  teams,
}: MatchdayPanelProps) {
  const t = useTranslations('dashboard')

  // Reconstruct lookup map from the serialised array
  const teamsMap = new Map(teams.map(team => [team.id, team]))

  return (
    <div className="space-y-8">

      {/* Tournament control — always first and immediately visible */}
      <section className="space-y-3">
        <PanelHeader>{t('tournamentControl')}</PanelHeader>

        {tournament && (
          <p className="text-xs text-slate-500">
            {t('current')}{' '}
            <span className="font-semibold text-slate-300">{tournament.name}</span>
            {' · '}
            {t('matchCount', { count: matches.length })}
          </p>
        )}

        <StartTournamentButton leagueId={leagueId} players={players} />
      </section>

      {/* Live match links — only rendered when a tournament day exists */}
      {(tournament || matches.length > 0) && (
        <section className="space-y-3">
          <PanelHeader>{t('liveMatchLinks')}</PanelHeader>

          {matches.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">{t('noMatches')}</p>
          ) : (
            <div className="space-y-2">
              {matches.map(m => {
                const home = teamsMap.get(m.home_team_id)
                const away = teamsMap.get(m.away_team_id)
                return (
                  <Link
                    key={m.id}
                    href={`/match/${m.id}`}
                    className={[
                      'flex items-center gap-3 rounded-2xl px-4 py-4 transition-all active:scale-[0.98]',
                      m.status === 'live'
                        ? 'bg-emerald-900/30 ring-1 ring-emerald-700/60'
                        : m.status === 'completed'
                        ? 'bg-slate-800/60'
                        : 'bg-slate-800',
                    ].join(' ')}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <TeamChip team={home} unknownLabel={t('unknown')} />
                      <span className="shrink-0 text-xs font-bold text-slate-500">
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
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Standings link */}
      <div className="border-t border-slate-800 pt-2 text-center">
        <Link
          href={`/league/${leagueId}/standings`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-400 transition-colors hover:text-sky-300"
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
    </div>
  )
}

// ── Roster panel ───────────────────────────────────────────────────────────────

interface RosterPanelProps {
  leagueId: string
  players:  Player[]
}

function RosterPanel({ leagueId, players }: RosterPanelProps) {
  const t = useTranslations('dashboard')

  return (
    <div className="space-y-4">
      {players.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('noPlayers')}</p>
      ) : (
        <PlayerList players={players} />
      )}
      <AddPlayerForm leagueId={leagueId} />
    </div>
  )
}

// ── Shared micro-components ────────────────────────────────────────────────────

function PanelHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
      {children}
    </h2>
  )
}

function TeamChip({ team, unknownLabel }: { team: Team | undefined; unknownLabel: string }) {
  if (!team) return <span className="text-sm text-slate-500">{unknownLabel}</span>
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
    <span className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-700 px-2.5 py-1 text-xs font-bold text-slate-400">
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
