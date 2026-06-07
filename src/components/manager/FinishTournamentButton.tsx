'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

interface Props {
  tournamentId: string
  onFinished:   () => void
}

export function FinishTournamentButton({ tournamentId, onFinished }: Props) {
  const t       = useTranslations('dashboard')
  const tCommon = useTranslations('common')
  const router  = useRouter()

  const [confirming,       setConfirming]       = useState(false)
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [loading,          setLoading]          = useState(false)
  const [deleting,         setDeleting]         = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [deleteError,      setDeleteError]      = useState<string | null>(null)

  function openConfirm() {
    setConfirming(true)
    setDeleteConfirming(false)
    setError(null)
    setDeleteError(null)
  }

  function closeAll() {
    setConfirming(false)
    setDeleteConfirming(false)
    setError(null)
    setDeleteError(null)
  }

  async function handleArchive() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('tournaments')
      .update({ status: 'completed' })
      .eq('id', tournamentId)
    if (err) { setError(err.message); setLoading(false); return }
    onFinished()
    router.refresh()
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    const supabase = createClient()
    const { error: err } = await supabase.rpc('admin_delete_tournament', {
      p_tournament_id: tournamentId,
    })
    if (err) { setDeleteError(err.message); setDeleting(false); return }
    onFinished()
    router.refresh()
  }

  // ── Trigger button ─────────────────────────────────────────────────────────

  if (!confirming) {
    return (
      <button
        onClick={openConfirm}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 py-3.5 text-sm font-bold text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200 active:scale-[0.98]"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {t('finishDay')}
      </button>
    )
  }

  // ── Delete-specific confirmation ───────────────────────────────────────────

  if (deleteConfirming) {
    return (
      <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-4 space-y-3">
        <p className="text-sm leading-snug text-zinc-300">{t('deleteTournamentDesc')}</p>
        {deleteError && <p className="text-xs font-medium text-rose-400">{deleteError}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => { setDeleteConfirming(false); setDeleteError(null) }}
            disabled={deleting}
            className="flex-1 rounded-lg bg-zinc-800 py-2.5 text-sm font-bold text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {tCommon('cancel')}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 rounded-lg bg-rose-700 py-2.5 text-sm font-bold text-white transition-colors hover:bg-rose-600 disabled:opacity-40"
          >
            {deleting ? t('finishing') : t('deleteTournamentConfirm')}
          </button>
        </div>
      </div>
    )
  }

  // ── Archive confirmation (with delete escape hatch below) ──────────────────

  return (
    <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 space-y-3">
      <p className="text-sm leading-snug text-zinc-300">{t('finishDayDesc')}</p>
      {error && <p className="text-xs font-medium text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={closeAll}
          disabled={loading}
          className="flex-1 rounded-lg bg-zinc-800 py-2.5 text-sm font-bold text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {tCommon('cancel')}
        </button>
        <button
          onClick={handleArchive}
          disabled={loading}
          className="flex-1 rounded-lg bg-amber-700 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-600 disabled:opacity-40"
        >
          {loading ? t('finishing') : t('finishDayConfirmBtn')}
        </button>
      </div>
      <button
        onClick={() => { setDeleteConfirming(true); setError(null) }}
        disabled={loading}
        className="w-full rounded-lg border border-zinc-700 py-2 text-xs font-bold text-zinc-500 transition-all hover:border-rose-800/60 hover:bg-rose-950/20 hover:text-rose-400 active:scale-[0.98] disabled:opacity-40"
      >
        {t('deleteTournament')}
      </button>
    </div>
  )
}
