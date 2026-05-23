import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
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

    redirect(league ? `/manager-dashboard/${league.id}` : '/create-league')
  }

  return (
    <main className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-10 text-center">

        <div>
          <div className="mb-4 text-7xl">⚽</div>
          <h1 className="text-4xl font-black text-white tracking-tight">Sunday League</h1>
          <p className="mt-3 text-base text-slate-400 leading-relaxed">
            Live scoring, balanced team drafts,<br />and standings for your local games.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href="/register"
            className="flex h-14 items-center justify-center rounded-2xl bg-emerald-500 text-lg font-black text-white tracking-wide transition-all active:scale-[0.97] active:bg-emerald-600"
          >
            Create New League
          </Link>
          <Link
            href="/login"
            className="flex h-14 items-center justify-center rounded-2xl bg-slate-700 text-lg font-semibold text-slate-200 tracking-wide transition-all active:scale-[0.97] active:bg-slate-600"
          >
            Sign In
          </Link>
        </div>

      </div>
    </main>
  )
}
