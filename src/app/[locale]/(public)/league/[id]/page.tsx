import { notFound }                        from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link }                              from '@/i18n/navigation'
import { createClient }                      from '@/lib/supabase/server'
import type { Tables }                       from '@/types/database'

type Match = Tables<'matches'>
type Team  = Pick<Tables<'teams'>, 'id' | 'name' | 'color'>

interface Props {
  params: Promise<{ locale: string; id: string }>
}

export default async function PublicLeaguePage({ params }: Props) {
  const { locale, id: leagueId } = await params
  setRequestLocale(locale)

  const supabase = await createClient()
  const t        = await getTranslations('signup')
  const tS       = await getTranslations('standings')

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, signup_status, signup_date')
    .eq('id', leagueId)
    .single()

  if (!league) notFound()

  const signupOpen = league.signup_status === 'open'

  // Latest tournament — used for recent match results below the banner
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let recentMatches: Match[] = []
  let teamsMap = new Map<string, Team>()

  if (tournament) {
    const [{ data: matchData }, { data: teamData }] = await Promise.all([
      supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', tournament.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('teams')
        .select('id, name, color')
        .eq('tournament_id', tournament.id),
    ])
    recentMatches = matchData ?? []
    teamsMap      = new Map((teamData ?? []).map(tm => [tm.id, tm]))
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">

      {/* ── ABSOLUTE TOP: signup banner ─────────────────────────────────
          Rendered first in the return — above the page header, statistics,
          and all other content — so it is the first thing users see.     */}
      {signupOpen && (
        <div className="mx-auto max-w-md px-4 pt-5">
          <div className="mb-6 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-emerald-400">
            <div className="flex items-center gap-2.5">
              <span
                className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400"
                aria-hidden="true"
              />
              <p className="text-sm font-black uppercase tracking-tight">
                {tS('signupBannerLiveNoDate')}
              </p>
            </div>
            <Link
              href={`/league/${leagueId}/signup`}
              className="ms-3 shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white transition-all hover:bg-emerald-500 active:scale-95"
            >
              {t('publicBannerCta')}
            </Link>
          </div>
        </div>
      )}

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 px-5 py-5 shadow-lg">
        <div className="mx-auto max-w-md">
          <p className="text-xs font-black uppercase tracking-tight text-zinc-500">
            {league.name}
          </p>
          {tournament && (
            <h1 className="mt-0.5 text-xl font-black uppercase tracking-tight text-white">
              {tournament.name}
            </h1>
          )}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-md space-y-6 px-4 py-6">

        {/* Recent match results */}
        {recentMatches.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-black uppercase tracking-tight text-zinc-500">
              {tS('standingsTitle')}
            </h2>
            <div className="divide-y divide-zinc-800/60 overflow-hidden rounded-xl bg-zinc-900">
              {recentMatches.map(m => {
                const home = teamsMap.get(m.home_team_id)
                const away = teamsMap.get(m.away_team_id)
                let hg = m.home_score ?? 0
                let ag = m.away_score ?? 0
                if (m.victory_condition === 'PENALTIES') {
                  if (hg > ag) hg -= 1; else ag -= 1
                }
                return (
                  <div key={m.id} className="flex items-center gap-2 px-4 py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {home?.color && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: home.color }}
                        />
                      )}
                      <span className="truncate text-sm font-bold text-white">
                        {home?.name ?? '—'}
                      </span>
                    </div>
                    <span className="shrink-0 px-2 text-base font-black tabular-nums text-white">
                      {hg}–{ag}
                    </span>
                    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                      <span className="truncate text-sm font-bold text-white">
                        {away?.name ?? '—'}
                      </span>
                      {away?.color && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: away.color }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Navigation links */}
        <nav aria-label="League sections" className="flex flex-col gap-2">
          <Link
            href={`/league/${leagueId}/standings`}
            className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-4 transition-colors hover:bg-zinc-800 active:scale-[0.98]"
          >
            <span className="text-sm font-bold text-white">{tS('standingsTitle')}</span>
            <span className="text-zinc-500 rtl:rotate-180">→</span>
          </Link>

          {signupOpen && (
            <Link
              href={`/league/${leagueId}/signup`}
              className="flex items-center justify-between rounded-xl bg-emerald-950/30 px-4 py-4 ring-1 ring-emerald-700/50 transition-colors hover:bg-emerald-950/50 active:scale-[0.98]"
            >
              <span className="text-sm font-bold text-emerald-400">{t('pageTitle')}</span>
              <span className="text-emerald-600 rtl:rotate-180">→</span>
            </Link>
          )}
        </nav>

      </div>
    </main>
  )
}
