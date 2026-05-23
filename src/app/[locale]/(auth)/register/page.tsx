'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const t      = useTranslations('auth')
  const router = useRouter()
  const [name,       setName]       = useState('')
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [error,      setError]      = useState<string | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name.trim(), role: 'manager' } },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (!data.session) {
      setCheckEmail(true)
      setLoading(false)
      return
    }

    router.push('/create-league')
  }

  if (checkEmail) {
    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="text-5xl">📧</div>
          <h2 className="text-xl font-black text-white">{t('checkEmailTitle')}</h2>
          <p className="text-slate-400 text-sm">
            {t('checkEmailBody', { email })}{' '}
            <Link href="/login" className="font-semibold text-emerald-400">{t('signInLink')}</Link>.
          </p>
          <p className="text-xs text-slate-500">{t('checkEmailTip')}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">⚽</div>
          <h1 className="text-2xl font-black text-white">{t('signUpTitle')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('signUpSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('name')}
              required
              className="w-full rounded-2xl bg-slate-800 px-5 py-4 text-base text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500"
            />
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
              placeholder={t('passwordHint')}
              required
              minLength={6}
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
            {loading ? t('creatingAccount') : t('createAccount')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          {t('hasAccount')}{' '}
          <Link href="/login" className="font-semibold text-emerald-400">{t('signInLink')}</Link>
        </p>

      </div>
    </main>
  )
}
