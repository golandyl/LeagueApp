'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

interface Props {
  leagueId:     string
  tournamentId: string
  onFinished:   () => void
}

export function FinishTournamentButton({ leagueId, tournamentId, onFinished }: Props) {
  const t       = useTranslations('dashboard')
  const tCommon = useTranslations('common')

  const [confirming, setConfirming] = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  async function handleFinish() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const { error: err } = await supabase
      .from('tournaments')
      .update({ status: 'completed' })
      .eq('id', tournamentId)
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    // Non-fatal: clear signups and rotate the cycle.
    // These steps require migrations 20260528–20260529 to be applied.
    // If the table/column doesn't exist yet, log and continue rather than blocking the finish.
    const { error: signupErr } = await supabase
      .from('tournament_signups').delete().eq('league_id', leagueId)
    if (signupErr) console.error('Reset failed details:', signupErr)

    const { error: cycleErr } = await supabase
      .from('leagues').update({ signup_cycle: crypto.randomUUID() }).eq('id', leagueId)
    if (cycleErr) console.error('Reset failed details:', cycleErr)

    onFinished()
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 py-3.5 text-sm font-bold text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200 active:scale-[0.98]"
      >
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {t('finishDay')}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 space-y-3">
      <p className="text-sm leading-snug text-zinc-300">{t('finishDayDesc')}</p>
      {error && <p className="text-xs font-medium text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => { setConfirming(false); setError(null) }}
          disabled={loading}
          className="flex-1 rounded-lg bg-zinc-800 py-2.5 text-sm font-bold text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {tCommon('cancel')}
        </button>
        <button
          onClick={handleFinish}
          disabled={loading}
          className="flex-1 rounded-lg bg-amber-700 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-600 disabled:opacity-40"
        >
          {loading ? t('finishing') : t('finishDayConfirmBtn')}
        </button>
      </div>
    </div>
  )
}
