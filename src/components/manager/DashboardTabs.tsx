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
import { HistoryPanel }           from './HistoryPanel'
import { LeagueStatsPanel }       from './LeagueStatsPanel'
import { EditMatchModal }          from '@/components/match/EditMatchModal'
import { AccessCodeCard }          from '@/components/manager/AccessCodeCard'
import { SignupControlPanel }      from './SignupControlPanel'
import { TournamentSignup }        from './TournamentSignup'
import { InsuranceFormCard }       from './InsuranceFormCard'
import type { Tables } from '@/types/database'
import type { TabId } from '@/types/dashboard'

type Player     = Tables<'players'>
type Tournament = Tables<'tournaments'>
type Match      = Tables<'matches'>
type Team       = Tables<'teams'>


export interface DashboardTabsProps {
  leagueId:     string
  leagueName:   string
  signupStatus: string
  signupDate:   string | null
  signupCycle:  string
  maxCapacity:  number
  players:      Player[]
  tournament:   Tournament | null
  matches:      Match[]
  // Plain arrays — Maps aren't serialisable across the RSC boundary
  teams:        Team[]
  teamPlayers:  { player_id: string; team_id: string }[]
  isManager:    boolean
  initialTab?:  TabId
}

export function DashboardTabs({
  leagueId,
  leagueName,
  signupStatus,
  signupDate,
  signupCycle,
  maxCapacity,
  players,
  tournament,
  matches: initialMatches,
  teams,
  teamPlayers,
  isManager,
  initialTab = 'matchday',
}: DashboardTabsProps) {
  const t = useTranslations('dashboard')

  const [active,            setActiveState]       = useState<TabId>(initialTab)
  const [liveMatches,       setLiveMatches]       = useState<Match[]>(initialMatches)
  const [activeTournament,  setActiveTournament]  = useState<Tournament | null>(tournament)
  // Lifted from TeamsPanel so swap changes persist across tab switches without
  // requiring a full router.refresh(). Resets whenever the active tournament
  // changes (new day started or tournament finished).
  const [localTeamPlayers,  setLocalTeamPlayers]  = useState(teamPlayers)

  // Sync RSC prop updates into state after router.refresh(). useState only
  // uses its initializer once, so compare against the last-seen props during
  // render (React's "adjust state when a prop changes" pattern).
  const [seenTournamentId, setSeenTournamentId] = useState(tournament?.id)
  if (tournament?.id !== seenTournamentId) {
    setSeenTournamentId(tournament?.id)
    setActiveTournament(tournament)
    // New tournament day began or ended — reset team player assignments
    setLocalTeamPlayers(teamPlayers)
  }
  const [seenMatches, setSeenMatches] = useState(initialMatches)
  if (initialMatches !== seenMatches) {
    setSeenMatches(initialMatches)
    setLiveMatches(initialMatches)
  }

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

  function handleTournamentFinished() {
    setActiveTournament(null)
    setLiveMatches([])
  }

  function handleTournamentCreated(t: Tournament, matches: Match[]) {
    setActiveTournament(t)
    setLiveMatches(matches)
  }

  // Mirror the tab in ?tab= so a refresh or a shared link reopens it.
  function setActive(tab: TabId) {
    setActiveState(tab)
    const url = new URL(window.location.href)
    if (tab === 'matchday') url.searchParams.delete('tab')
    else url.searchParams.set('tab', tab)
    window.history.replaceState(window.history.state, '', url)
    window.scrollTo({ top: 0 })
  }

  const signupPlayers = useMemo(
    () => players.slice().sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [players],
  )

  const hasLive  = liveMatches.some(m => m.status === 'live')
  const hasTeams = activeTournament !== null && teams.length > 0

  const tabs: { id: TabId; label: string; count?: number; dot?: boolean }[] = [
    { id: 'matchday', label: t('tabMatchday'), dot: hasLive },
    { id: 'signup',   label: t('tabSignup'), dot: signupStatus !== 'closed' && !hasLive },
    ...(hasTeams ? [{ id: 'teams' as const, label: t('tabTeams'), count: teams.length }] : []),
    ...(isManager ? [{ id: 'roster' as const, label: t('tabRoster'), count: players.length > 0 ? players.length : undefined }] : []),
    { id: 'stats',    label: t('tabStats') },
    { id: 'history',  label: t('tabHistory') },
  ]

  return (
    <div className="mx-auto max-w-2xl pb-[calc(4.5rem+env(safe-area-inset-bottom))]">

      {/* ── Bottom tab bar ─────────────────────────────────────────────────── */}
      {/*
        Fixed to the bottom like a native app so all tabs always fit on a
        phone: equal-width slots, icon above a short label. `dir` on <html>
        reverses the order automatically in Hebrew/Arabic.
      */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
        role="tablist"
        aria-label={t('header')}
      >
        <div className="mx-auto flex max-w-2xl">
          {tabs.map(tab => {
            const selected = active === tab.id
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActive(tab.id)}
                className={[
                  'relative flex min-w-0 flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500',
                  selected ? 'text-emerald-400' : 'text-zinc-500 active:text-zinc-300',
                ].join(' ')}
              >
                {selected && (
                  <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-emerald-400" aria-hidden="true" />
                )}
                <span className="relative">
                  <TabIcon id={tab.id} />
                  {tab.dot && (
                    <span className="absolute -top-0.5 -end-1 h-2 w-2 animate-pulse rounded-full bg-emerald-400 ring-2 ring-zinc-950" aria-hidden="true" />
                  )}
                  {tab.count !== undefined && (
                    <span className="absolute -top-1.5 start-4 min-w-4 rounded-full bg-zinc-800 px-1 text-center text-[9px] font-black leading-4 tabular-nums text-zinc-300 ring-2 ring-zinc-950">
                      {tab.count}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate px-1">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

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
            teamPlayers={localTeamPlayers}
            onTeamPlayersChange={setLocalTeamPlayers}
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
            players={players}
            tournament={activeTournament}
            matches={liveMatches}
            teams={teams}
            isManager={isManager}
            onMatchUpdate={handleMatchUpdate}
            onTournamentFinished={handleTournamentFinished}
            onTournamentCreated={handleTournamentCreated}
            onGoTo={setActive}
          />
        </div>
      )}

      {active === 'signup' && (
        <div
          id="panel-signup"
          role="tabpanel"
          className="space-y-6 px-4 py-6"
        >
          <InsuranceFormCard />
          {isManager ? (
            <SignupControlPanel
              leagueId={leagueId}
              leagueName={leagueName}
              signupStatus={signupStatus}
              signupDate={signupDate}
              maxCapacity={maxCapacity}
            />
          ) : (
            <TournamentSignup
              leagueId={leagueId}
              signupCycle={signupCycle}
              signupStatus={signupStatus}
              signupDate={signupDate}
              maxCapacity={maxCapacity}
              tournament={activeTournament ? { id: activeTournament.id } : null}
              players={signupPlayers}
              isManager={false}
            />
          )}
        </div>
      )}

      {active === 'roster' && isManager && (
        <div
          id="panel-roster"
          role="tabpanel"
          className="px-4 py-6"
        >
          <RosterPanel leagueId={leagueId} players={players} isManager={isManager} />
        </div>
      )}

      {active === 'stats' && (
        <div
          id="panel-stats"
          role="tabpanel"
          className="px-4 py-6"
        >
          <LeagueStatsPanel leagueId={leagueId} />
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
    </div>
  )
}

// ── Matchday panel ─────────────────────────────────────────────────────────────

interface MatchdayPanelProps {
  leagueId:               string
  signupStatus:           string
  players:                Player[]
  tournament:             Tournament | null
  matches:                Match[]
  teams:                  Team[]
  isManager:              boolean
  onMatchUpdate:          (updated: Match) => void
  onTournamentFinished:   () => void
  onTournamentCreated:    (tournament: Tournament, matches: Match[]) => void
  onGoTo:                 (tab: TabId) => void
}

function MatchdayPanel({
  leagueId,
  signupStatus,
  players,
  tournament,
  matches,
  teams,
  isManager,
  onMatchUpdate,
  onTournamentFinished,
  onTournamentCreated,
  onGoTo,
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

      {/* Nothing running — point visitors at signup and stats instead of a blank screen */}
      {!isManager && !tournament && matches.length === 0 && (
        <EmptyMatchday signupOpen={signupStatus !== 'closed'} onGoTo={onGoTo} />
      )}

      {/* Tournament control — only visible to the manager */}
      {isManager && (
        <section className="space-y-3">
          <PanelHeader>{t('tournamentControl')}</PanelHeader>

          {tournament && tournament.status === 'active' && (
            <AccessCodeCard tournamentId={tournament.id} />
          )}

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
                  tournamentId={tournament.id}
                  leagueId={leagueId}
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

// ── Empty matchday ─────────────────────────────────────────────────────────────

function EmptyMatchday({ signupOpen, onGoTo }: { signupOpen: boolean; onGoTo: (tab: TabId) => void }) {
  const t = useTranslations('dashboard')

  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl bg-zinc-900 px-6 py-10 text-center ring-1 ring-zinc-800">
      <span className="text-5xl" aria-hidden="true">⚽</span>
      <div className="space-y-1.5">
        <h2 className="text-lg font-black text-white">{t('emptyMatchdayTitle')}</h2>
        <p className="text-sm leading-relaxed text-zinc-400">{t('emptyMatchdayBody')}</p>
      </div>
      <div className="flex w-full flex-col gap-2 pt-2">
        {signupOpen && (
          <button
            onClick={() => onGoTo('signup')}
            className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-black text-white transition-all active:scale-[0.98] active:bg-emerald-700"
          >
            {t('emptyMatchdaySignupCta')}
          </button>
        )}
        <button
          onClick={() => onGoTo('stats')}
          className="w-full rounded-xl bg-zinc-800 py-3.5 text-sm font-bold text-zinc-200 transition-all active:scale-[0.98] active:bg-zinc-700"
        >
          {t('emptyMatchdayStatsCta')}
        </button>
      </div>
    </section>
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

// ── Tab icons (24px outline) ─────────────────────────────────────────────────

const TAB_ICON_PATHS: Record<TabId, string> = {
  // whistle / play
  matchday: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-1.5-12.75 5.25 3.75-5.25 3.75v-7.5Z',
  // clipboard with check
  signup:   'M9 4.5h6M9 4.5a1.5 1.5 0 0 0-1.5 1.5v0H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5v-12A1.5 1.5 0 0 0 18 6h-1.5a1.5 1.5 0 0 0-1.5-1.5M9 4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5M8.25 13.5l2.25 2.25 5.25-5.25',
  // shield
  teams:    'M12 3 4.5 6v5.25c0 4.5 3.2 8.4 7.5 9.75 4.3-1.35 7.5-5.25 7.5-9.75V6L12 3Z',
  // people
  roster:   'M15 19.5v-1.125A3.375 3.375 0 0 0 11.625 15h-4.5a3.375 3.375 0 0 0-3.375 3.375V19.5M9.375 11.25a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM20.25 19.5v-1.125a3.375 3.375 0 0 0-2.531-3.268M15.75 5.4a3 3 0 0 1 0 5.7',
  // bar chart
  stats:    'M4.5 19.5h15M7.5 16.5v-5.25M12 16.5V7.5M16.5 16.5v-3',
  // clock
  history:  'M12 7.5V12l3 2.25M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
}

function TabIcon({ id }: { id: TabId }) {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={TAB_ICON_PATHS[id]} />
    </svg>
  )
}
