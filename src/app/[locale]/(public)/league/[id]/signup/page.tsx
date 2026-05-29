import { notFound }                        from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { createClient }                      from '@/lib/supabase/server'
import { TournamentSignup }                  from '@/components/manager/TournamentSignup'

interface Props {
  params: Promise<{ locale: string; id: string }>
}

export default async function LeagueSignupPage({ params }: Props) {
  const { locale, id: leagueId } = await params
  setRequestLocale(locale)

  const supabase = await createClient()

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, signup_cycle, signup_status, signup_date, max_capacity')
    .eq('id', leagueId)
    .single()

  if (!league) notFound()

  const [{ data: playersData }, { data: tournament }] = await Promise.all([
    supabase
      .from('players')
      .select('id, full_name')
      .eq('league_id', leagueId)
      .eq('is_ghost', false)
      .order('full_name'),
    supabase
      .from('tournaments')
      .select('id')
      .eq('league_id', leagueId)
      .neq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const players = playersData ?? []
  const t       = await getTranslations('signup')

  return (
    <main className="min-h-screen bg-zinc-950 text-white">

      {/* Header */}
      <div className="bg-zinc-900 px-5 py-5 shadow-lg">
        <div className="mx-auto max-w-md">
          <p className="text-xs font-black uppercase tracking-tight text-zinc-500">
            {league.name}
          </p>
          <h1 className="mt-0.5 text-xl font-black uppercase tracking-tight text-white">
            {t('pageTitle')}
          </h1>
        </div>
      </div>

      {/* Signup form */}
      <div className="mx-auto max-w-md px-4 py-6">
        <TournamentSignup
          leagueId={leagueId}
          signupCycle={league.signup_cycle ?? ''}
          signupStatus={league.signup_status ?? 'closed'}
          signupDate={league.signup_date ?? null}
          maxCapacity={league.max_capacity ?? 16}
          tournament={tournament ?? null}
          players={players}
          isManager={false}
        />
      </div>

    </main>
  )
}
