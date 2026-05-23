'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

type League = Tables<'leagues'>

interface Props {
  league: League
}

export function LeagueSettingsModal({ league }: Props) {
  const [open, setOpen] = useState(false)

  // ── Form state ────────────────────────────────────────────────────────────────
  const [matchMin,     setMatchMin]     = useState(league.match_length_minutes)
  const [otMin,        setOtMin]        = useState(league.overtime_length_minutes)
  const [overtimeType, setOvertimeType] = useState<'GOLDEN_GOAL' | 'CLASSIC'>(
    league.overtime_type ?? 'CLASSIC',
  )
  const [winScore,     setWinScore]     = useState<number | ''>(league.win_score ?? '')
  const [status,       setStatus]       = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null)

  // ── Escape to close ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function close() {
    setOpen(false)
    setStatus('idle')
    setErrorMsg(null)
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
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
      setTimeout(close, 900)
    }
  }

  return (
    <>
      {/* ── Trigger ────────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        aria-label="League settings"
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-700 hover:text-white active:scale-95"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-5"
          onClick={close}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-slate-800 shadow-2xl max-h-[90dvh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <div>
                <h2 className="text-lg font-black text-white">League Settings</h2>
                <p className="text-xs text-slate-500 mt-0.5">{league.name}</p>
              </div>
              <button
                onClick={close}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-700 hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Divider */}
            <div className="h-px bg-slate-700/60 mx-6" />

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">

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
                disabled={status === 'saving' || status === 'saved'}
                className={`w-full rounded-2xl py-4 text-base font-black text-white transition-all active:scale-[0.97] disabled:opacity-70 ${
                  status === 'saved' ? 'bg-emerald-600' : 'bg-sky-600 hover:bg-sky-500'
                }`}
              >
                {status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : 'Save Changes'}
              </button>

            </form>
          </div>
        </div>
      )}
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-2xl bg-slate-700 px-4 py-3.5 text-base text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-sky-500'

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
