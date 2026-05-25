'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

interface Props {
  tournamentId: string
  onFinished:   () => void
}

export function FinishTournamentButton({ tournamentId, onFinished }: Props) {
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
    onFinished()
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 py-3.5 text-sm font-bold text-slate-400 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-slate-200 active:scale-[0.98]"
      >
        {/* Check-circle icon */}
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
    <div className="rounded-2xl border border-amber-800/50 bg-amber-950/20 p-4 space-y-3">
      <p className="text-sm leading-snug text-slate-300">{t('finishDayDesc')}</p>
      {error && <p className="text-xs font-medium text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => { setConfirming(false); setError(null) }}
          disabled={loading}
          className="flex-1 rounded-xl bg-slate-700 py-2.5 text-sm font-bold text-slate-300 transition-colors hover:bg-slate-600 disabled:opacity-50"
        >
          {tCommon('cancel')}
        </button>
        <button
          onClick={handleFinish}
          disabled={loading}
          className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-500 disabled:opacity-40"
        >
          {loading ? t('finishing') : t('finishDayConfirmBtn')}
        </button>
      </div>
    </div>
  )
}
