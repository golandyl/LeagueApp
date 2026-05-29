'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

type League = Tables<'leagues'>

interface Props {
  league: League
}

export function LeagueSettingsModal({ league }: Props) {
  const t       = useTranslations('settings')
  const tCreate = useTranslations('createLeague')
  const tCommon = useTranslations('common')

  const [open, setOpen] = useState(false)

  const [matchMin,     setMatchMin]     = useState(league.match_length_minutes)
  const [otMin,        setOtMin]        = useState(league.overtime_length_minutes)
  const [overtimeType, setOvertimeType] = useState<'GOLDEN_GOAL' | 'CLASSIC'>(
    league.overtime_type ?? 'CLASSIC',
  )
  const [winScore,     setWinScore]     = useState<number | ''>(league.win_score ?? '')
  const [status,       setStatus]       = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null)

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
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        aria-label={t('title')}
        className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
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

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-5"
          onClick={close}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-zinc-900 shadow-2xl border border-zinc-800 max-h-[90dvh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-white">{t('title')}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{league.name}</p>
              </div>
              <button
                onClick={close}
                aria-label={tCommon('cancel')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Divider */}
            <div className="h-px bg-zinc-800 mx-6" />

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">

              <div className="grid grid-cols-2 gap-3">
                <Field label={tCreate('matchLength')}>
                  <input
                    type="number"
                    value={matchMin}
                    onChange={e => setMatchMin(Number(e.target.value))}
                    min={5} max={180} required
                    className={inputCls}
                  />
                </Field>
                <Field label={tCreate('extraTime')}>
                  <input
                    type="number"
                    value={otMin}
                    onChange={e => setOtMin(Number(e.target.value))}
                    min={1} max={30} required
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label={tCreate('overtimeType')}>
                <div className="grid grid-cols-2 gap-2">
                  {(['CLASSIC', 'GOLDEN_GOAL'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setOvertimeType(type)}
                      className={`rounded-lg py-3 text-sm font-bold transition-all ${
                        overtimeType === type
                          ? 'bg-emerald-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {type === 'CLASSIC' ? tCreate('overtimeTypeClassic') : tCreate('overtimeTypeGoldenGoal')}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">
                  {overtimeType === 'GOLDEN_GOAL'
                    ? tCreate('overtimeTypeGoldenGoalHint')
                    : tCreate('overtimeTypeClassicHint')}
                </p>
              </Field>

              <Field
                label={tCreate('winScore')}
                hint={tCreate('winScoreHint')}
              >
                <input
                  type="number"
                  value={winScore}
                  onChange={e => setWinScore(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={tCreate('winScorePlaceholder')}
                  min={1}
                  className={inputCls}
                />
              </Field>

              {errorMsg && (
                <p className="rounded-lg bg-red-950/40 px-4 py-3 text-sm text-red-300">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={status === 'saving' || status === 'saved'}
                className={`w-full rounded-lg py-4 text-base font-black text-white transition-all active:scale-[0.97] disabled:opacity-70 ${
                  status === 'saved' ? 'bg-emerald-600' : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {status === 'saving'
                  ? tCommon('saving')
                  : status === 'saved'
                  ? `✓ ${tCommon('saved')}`
                  : tCommon('saveChanges')}
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
  'w-full rounded-lg bg-zinc-800 px-4 py-3.5 text-base text-white placeholder:text-zinc-600 outline-none focus:ring-2 focus:ring-emerald-500'

function Field({
  label, hint, children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold uppercase tracking-tight text-zinc-500">{label}</label>
      {hint && <p className="text-xs text-zinc-500 leading-relaxed">{hint}</p>}
      {children}
    </div>
  )
}
