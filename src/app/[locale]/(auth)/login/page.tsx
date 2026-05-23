'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const t      = useTranslations('auth')
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    const { data: league } = await supabase
      .from('leagues')
      .select('id')
      .eq('manager_id', data.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    router.push(league ? `/manager-dashboard/${league.id}` : '/create-league')
  }

  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">⚽</div>
          <h1 className="text-2xl font-black text-white">{t('signInTitle')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('signInSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t('email')}
              required
              className="w-full rounded-2xl bg-slate-800 px-5 py-4 text-base text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('password')}
              required
              className="w-full rounded-2xl bg-slate-800 px-5 py-4 text-base text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-900/40 px-4 py-3 text-sm text-red-300">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-emerald-500 py-4 text-base font-black text-white tracking-wide transition-all active:scale-[0.97] disabled:opacity-60"
          >
            {loading ? t('signingIn') : t('signIn')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          {t('noAccount')}{' '}
          <Link href="/register" className="font-semibold text-emerald-400">{t('createOne')}</Link>
        </p>

      </div>
    </main>
  )
}
