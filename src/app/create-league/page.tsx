'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function CreateLeaguePage() {
  const router  = useRouter()
  const [name,         setName]         = useState('')
  const [matchMin,     setMatchMin]     = useState(40)
  const [otMin,        setOtMin]        = useState(10)
  const [overtimeType, setOvertimeType] = useState<'GOLDEN_GOAL' | 'CLASSIC'>('CLASSIC')
  const [winScore,     setWinScore]     = useState<number | ''>('')
  const [error,        setError]        = useState<string | null>(null)
  const [loading,      setLoading]      = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      setError('You must be signed in. Please refresh and try again.')
      setLoading(false)
      return
    }

    const { data: league, error: insertError } = await supabase
      .from('leagues')
      .insert({
        name:                    name.trim(),
        manager_id:              user.id,
        match_length_minutes:    matchMin,
        overtime_length_minutes: otMin,
        overtime_type:           overtimeType,
        overtime_enabled:        true,
        penalties_enabled:       true,
        win_score:               winScore === '' ? null : (winScore as number),
      })
      .select('id')
      .single()

    if (insertError || !league) {
      setError(insertError?.message ?? 'Failed to create league.')
      setLoading(false)
      return
    }

    router.push(`/manager-dashboard/${league.id}`)
  }

  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">

        <div className="mb-8">
          <Link href="/" className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-300">← Back</Link>
          <h1 className="text-2xl font-black text-white">Create a League</h1>
          <p className="mt-1 text-sm text-slate-400">Configure your match format</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          <Field label="League Name">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Friday Night FC"
              required
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Match length (min)">
              <input
                type="number"
                value={matchMin}
                onChange={e => setMatchMin(Number(e.target.value))}
                min={5} max={180}
                required
                className={inputCls}
              />
            </Field>
            <Field label="Extra time (min)">
              <input
                type="number"
                value={otMin}
                onChange={e => setOtMin(Number(e.target.value))}
                min={1} max={30}
                required
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Overtime Type">
            <div className="grid grid-cols-2 gap-2">
              {(['CLASSIC', 'GOLDEN_GOAL'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setOvertimeType(type)}
                  className={`rounded-2xl py-3.5 text-sm font-bold transition-all ${
                    overtimeType === type
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {type === 'CLASSIC' ? 'Classic' : 'Golden Goal'}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {overtimeType === 'GOLDEN_GOAL'
                ? 'First goal in extra time wins immediately.'
                : 'Extra time plays to the final whistle.'}
            </p>
          </Field>

          <Field
            label="Win Score Limit (optional)"
            hint="Leave blank for time-based matches. Set a number for first-to-score games (e.g. 7)."
          >
            <input
              type="number"
              value={winScore}
              onChange={e => setWinScore(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. 7"
              min={1}
              className={inputCls}
            />
          </Field>

          {error && (
            <p className="rounded-xl bg-red-900/40 px-4 py-3 text-sm text-red-300">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-emerald-500 py-4 text-base font-black text-white tracking-wide transition-all active:scale-[0.97] disabled:opacity-60"
          >
            {loading ? 'Creating…' : 'Create League →'}
          </button>

        </form>
      </div>
    </main>
  )
}

const inputCls =
  'w-full rounded-2xl bg-slate-800 px-5 py-4 text-base text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500'

function Field({
  label, hint, children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">{label}</label>
      {hint && <p className="text-xs text-slate-500 leading-relaxed">{hint}</p>}
      {children}
    </div>
  )
}

