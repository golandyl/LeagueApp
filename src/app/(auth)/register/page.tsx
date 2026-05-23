'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const router = useRouter()
  const [name,          setName]          = useState('')
  const [email,         setEmail]         = useState('')
  const [password,      setPassword]      = useState('')
  const [error,         setError]         = useState<string | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [checkEmail,    setCheckEmail]    = useState(false)

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
      // Email confirmation required — Supabase sent a verification email
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
          <h2 className="text-xl font-black text-white">Check your email</h2>
          <p className="text-slate-400 text-sm">
            We sent a confirmation link to <span className="font-semibold text-white">{email}</span>.
            Click it to activate your account, then{' '}
            <Link href="/login" className="font-semibold text-emerald-400">sign in</Link>.
          </p>
          <p className="text-xs text-slate-500">
            Tip: if you control the Supabase project, you can disable email confirmation in
            Authentication → Settings to skip this step.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">⚽</div>
          <h1 className="text-2xl font-black text-white">Start your league</h1>
          <p className="mt-1 text-sm text-slate-400">Create an account to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              required
              className="w-full rounded-2xl bg-slate-800 px-5 py-4 text-base text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              required
              className="w-full rounded-2xl bg-slate-800 px-5 py-4 text-base text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password (min 6 characters)"
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
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-emerald-400">Sign in</Link>
        </p>

      </div>
    </main>
  )
}
