import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: league } = await supabase
      .from('leagues')
      .select('id')
      .eq('manager_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    redirect(league ? `/${locale}/manager-dashboard/${league.id}` : `/${locale}/create-league`)
  }

  const t    = await getTranslations('home')
  const tNav = await getTranslations('nav')

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-10 text-center">

        <div>
          <div className="mb-4 text-7xl">⚽</div>
          <h1 className="text-4xl font-black text-white tracking-tight uppercase">Sunday League</h1>
          <p className="mt-3 text-base text-zinc-400 leading-relaxed">
            {t('tagline')}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href="/register"
            className="flex h-14 items-center justify-center rounded-lg bg-emerald-600 text-lg font-black text-white tracking-tight uppercase transition-all active:scale-[0.97] active:bg-emerald-700"
          >
            {t('createNewLeague')}
          </Link>
          <Link
            href="/login"
            className="flex h-14 items-center justify-center rounded-lg bg-zinc-800 text-lg font-semibold text-zinc-200 transition-all active:scale-[0.97] active:bg-zinc-700"
          >
            {tNav('signIn')}
          </Link>
        </div>

      </div>
    </main>
  )
}
