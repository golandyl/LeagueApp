'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

type League = Tables<'leagues'>

interface Props {
  league: League
}

export function EditLeagueRulesForm({ league }: Props) {
  const [matchMin, setMatchMin]       = useState(league.match_length_minutes)
  const [otMin,    setOtMin]          = useState(league.overtime_length_minutes)
  const [overtimeType, setOvertimeType] = useState<'GOLDEN_GOAL' | 'CLASSIC'>(
    (league.overtime_type as 'GOLDEN_GOAL' | 'CLASSIC') ?? 'CLASSIC',
  )
  const [winScore, setWinScore]       = useState<number | ''>(league.win_score ?? '')
  const [status,   setStatus]         = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('saving')
    setErrorMsg(null)

    const supabase = createClient()
    const { error } = await supabase
      .from('leagues')
      .update({
        match_length_minutes:    matchMin,
        overtime_length_minutes: otMin,
        overtime_type:           overtimeType,
        win_score:               winScore === '' ? null : Number(winScore),
      })
      .eq('id', league.id)

    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
    } else {
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2500)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-slate-800 p-4">

      <div className="grid grid-cols-2 gap-3">
        <Field label="Match length (min)">
          <input
            type="number"
            value={matchMin}
            onChange={e => setMatchMin(Number(e.target.value))}
            min={5} max={180} required
            className={inputCls}
          />
        </Field>
        <Field label="Extra time (min)">
          <input
            type="number"
            value={otMin}
            onChange={e => setOtMin(Number(e.target.value))}
            min={1} max={30} required
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
              className={`rounded-xl py-3 text-sm font-bold transition-all ${
                overtimeType === type
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
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
        hint="Leave blank for time-based. Set a number for first-to-score."
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

      {errorMsg && (
        <p className="rounded-xl bg-red-900/40 px-4 py-3 text-sm text-red-300">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === 'saving'}
        className="w-full rounded-2xl bg-sky-600 py-4 text-base font-black text-white transition-all active:scale-[0.97] disabled:opacity-60"
      >
        {status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : 'Save Changes'}
      </button>

    </form>
  )
}

const inputCls =
  'w-full rounded-2xl bg-slate-700 px-5 py-4 text-base text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-sky-500'

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
