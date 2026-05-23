import { notFound, redirect }    from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link }                  from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/server'
import { AddPlayerForm }       from '@/components/manager/AddPlayerForm'
import { PlayerList }          from '@/components/manager/PlayerList'
import { LeagueSettingsModal } from '@/components/manager/LeagueSettingsModal'
import { StartTournamentButton } from '@/components/manager/StartTournamentButton'
import { SignOutButton }         from '@/components/manager/SignOutButton'
import type { Tables } from '@/types/database'

type Match = Tables<'matches'>
type Team  = Tables<'teams'>

interface Props {
  params: Promise<{ locale: string; id: string }>
}

export default async function ManagerDashboardPage({ params }: Props) {
  const { locale, id: leagueId } = await params
  setRequestLocale(locale)

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  const [{ data: league }, { data: players }] = await Promise.all([
    supabase.from('leagues').select('*').eq('id', leagueId).single(),
    supabase
      .from('players')
      .select('*')
      .eq('league_id', leagueId)
      .eq('is_ghost', false)
      .order('rating', { ascending: false }),
  ])

  if (!league) notFound()
  if (league.manager_id !== user!.id) redirect(`/${locale}/login`)

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  let matches: Match[]            = []
  let teamsMap: Map<string, Team> = new Map()

  if (tournament) {
    const [{ data: rawMatches }, { data: rawTeams }] = await Promise.all([
      supabase.from('matches').select('*').eq('tournament_id', tournament.id).order('created_at'),
      supabase.from('teams').select('*').eq('tournament_id', tournament.id),
    ])
    matches  = rawMatches ?? []
    teamsMap = new Map((rawTeams ?? []).map(t => [t.id, t]))
  }

  const resolvedPlayers = players ?? []

  const t      = await getTranslations('dashboard')
  const tCreate = await getTranslations('createLeague')

  const otModeLabel = league.overtime_type === 'GOLDEN_GOAL'
    ? tCreate('overtimeTypeGoldenGoal')
    : tCreate('overtimeTypeClassic')

  return (
    <main className="min-h-screen bg-slate-900 text-white">

      {/* ── Header ── */}
      <div className="bg-slate-800 px-5 py-5 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('header')}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <h1 className="truncate text-2xl font-black">{league.name}</h1>
              <LeagueSettingsModal league={league} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {league.match_length_minutes} min
              {league.win_score ? ` · ${t('firstTo', { n: league.win_score })}` : ''}
              {league.overtime_enabled ? ` · ${t('otLabel')}: ${otModeLabel}` : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Link
              href="/create-league"
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors"
            >
              {t('newLeague')}
            </Link>
            <SignOutButton />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">

        {/* ── Section 1: Manage Players ── */}
        <section>
          <SectionHeader count={resolvedPlayers.length}>{t('managePlayers')}</SectionHeader>

          {resolvedPlayers.length === 0 ? (
            <p className="mb-4 text-center text-sm text-slate-500 py-4">
              {t('noPlayers')}
            </p>
          ) : (
            <PlayerList players={resolvedPlayers} />
          )}

          <AddPlayerForm leagueId={leagueId} />
        </section>

        {/* ── Section 2: Tournament Control ── */}
        <section>
          <SectionHeader>{t('tournamentControl')}</SectionHeader>
          {tournament && (
            <p className="mb-3 text-xs text-slate-500">
              {t('current')} <span className="font-semibold text-slate-300">{tournament.name}</span>
              {' · '}{t('matchCount', { count: matches.length })}
            </p>
          )}
          <StartTournamentButton
            leagueId={leagueId}
            playerCount={resolvedPlayers.length}
          />
        </section>

        {/* ── Section 3: Live Matches ── */}
        <section>
          <SectionHeader>{t('liveMatchLinks')}</SectionHeader>

          {matches.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              {t('noMatches')}
            </p>
          ) : (
            <div className="space-y-2">
              {matches.map(m => {
                const home = teamsMap.get(m.home_team_id)
                const away = teamsMap.get(m.away_team_id)
                return (
                  <Link
                    key={m.id}
                    href={`/match/${m.id}`}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-4 transition-all active:scale-[0.98] ${
                      m.status === 'live'      ? 'bg-emerald-900/30 ring-1 ring-emerald-700/60' :
                      m.status === 'completed' ? 'bg-slate-800/60' :
                                                 'bg-slate-800'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <TeamChip team={home} unknownLabel={t('unknown')} />
                      <span className="shrink-0 text-xs font-bold text-slate-500">{t('vs')}</span>
                      <TeamChip team={away} unknownLabel={t('unknown')} />
                    </div>
                    <MatchBadge match={m} liveLabel={t('live')} kickOffLabel={t('kickOff')} />
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        <div className="border-t border-slate-800 pt-4 text-center">
          <Link
            href={`/league/${leagueId}/standings`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors"
          >
            {t('viewStandings')}
            <svg className="h-3.5 w-3.5 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        </div>

      </div>
    </main>
  )
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function SectionHeader({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">{children}</h2>
      {count !== undefined && (
        <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-bold text-slate-300">
          {count}
        </span>
      )}
    </div>
  )
}

function TeamChip({ team, unknownLabel }: { team: Team | undefined; unknownLabel: string }) {
  if (!team) return <span className="text-sm text-slate-500">{unknownLabel}</span>
  return (
    <span className="flex min-w-0 items-center gap-1.5 truncate">
      {team.color && (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />
      )}
      <span className="truncate text-sm font-bold text-white">{team.name}</span>
    </span>
  )
}

function MatchBadge({ match, liveLabel, kickOffLabel }: { match: Match; liveLabel: string; kickOffLabel: string }) {
  if (match.status === 'live') {
    return (
      <span className="shrink-0 animate-pulse text-xs font-black uppercase text-emerald-400">
        ● {liveLabel}
      </span>
    )
  }
  if (match.status === 'completed' && match.home_score != null && match.away_score != null) {
    return (
      <span className="shrink-0 text-base font-black text-white tabular-nums">
        {match.home_score}–{match.away_score}
      </span>
    )
  }
  return (
    <span className="shrink-0 flex items-center gap-1 rounded-lg bg-slate-700 px-2.5 py-1 text-xs font-bold text-slate-400">
      {kickOffLabel}
      <svg className="h-3 w-3 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
      </svg>
    </span>
  )
}
