import { notFound }                from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link }                   from '@/i18n/navigation'
import { createClient }           from '@/lib/supabase/server'
import { LeagueSettingsModal }    from '@/components/manager/LeagueSettingsModal'
import { SignOutButton }          from '@/components/manager/SignOutButton'
import { DashboardTabs }          from '@/components/manager/DashboardTabs'
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

  const isManager = !!user && user.id === league.manager_id

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('league_id', leagueId)
    .neq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  let matches:     Match[]                                    = []
  let teams:       Team[]                                     = []
  let teamPlayers: { player_id: string; team_id: string }[]  = []

  if (tournament) {
    const [{ data: rawMatches }, { data: rawTeams }, { data: rawTp }] = await Promise.all([
      supabase.from('matches').select('*').eq('tournament_id', tournament.id).order('created_at'),
      supabase.from('teams').select('*').eq('tournament_id', tournament.id),
      supabase.from('team_players').select('player_id, team_id').eq('tournament_id', tournament.id),
    ])
    matches     = rawMatches ?? []
    teams       = rawTeams   ?? []
    teamPlayers = rawTp      ?? []
  }

  const resolvedPlayers = players ?? []

  const t      = await getTranslations('dashboard')
  const tCreate = await getTranslations('createLeague')

  const otModeLabel = league.overtime_type === 'GOLDEN_GOAL'
    ? tCreate('overtimeTypeGoldenGoal')
    : tCreate('overtimeTypeClassic')

  return (
    <main className="min-h-screen bg-zinc-950 text-white">

      {/* ── Page header ── */}
      <div className="bg-zinc-900 px-5 py-5 shadow-lg">
        <div className="mx-auto flex max-w-2xl items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-tight text-zinc-400">
              {t('header')}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <h1 className="truncate text-2xl font-black">{league.name}</h1>
              {isManager && <LeagueSettingsModal league={league} />}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {league.match_length_minutes} min
              {league.win_score ? ` · ${t('firstTo', { n: league.win_score })}` : ''}
              {league.overtime_enabled ? ` · ${t('otLabel')}: ${otModeLabel}` : ''}
            </p>
          </div>

          {isManager && (
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Link
                href="/create-league"
                className="text-xs font-semibold text-zinc-400 transition-colors hover:text-zinc-200"
              >
                {t('newLeague')}
              </Link>
              <SignOutButton />
            </div>
          )}
        </div>
      </div>

      {/* ── Tabbed content — client component ── */}
      <DashboardTabs
        leagueId={leagueId}
        signupStatus={league.signup_status ?? 'closed'}
        signupDate={league.signup_date ?? null}
        maxCapacity={league.max_capacity ?? 16}
        players={resolvedPlayers}
        tournament={tournament ?? null}
        matches={matches}
        teams={teams}
        teamPlayers={teamPlayers}
        isManager={isManager}
      />

    </main>
  )
}
