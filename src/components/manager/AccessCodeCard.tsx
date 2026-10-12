'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

interface Props {
  tournamentId: string
}

// Manager-only: shows the tournament's access code so it can be shared with
// whoever should run games, and lets the manager rotate it.
export function AccessCodeCard({ tournamentId }: Props) {
  const t        = useTranslations('dashboard')
  const supabase = createClient()

  const [code,    setCode]    = useState<string | null>(null)
  const [busy,    setBusy]    = useState(false)
  const [copied,  setCopied]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('tournament_access_codes')
        .select('code')
        .eq('tournament_id', tournamentId)
        .maybeSingle()
      setCode(data?.code ?? null)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  async function handleRegenerate() {
    if (!confirm(t('accessCodeRegenerateConfirm'))) return
    setBusy(true)
    setError(null)
    const { data, error: rpcErr } = await supabase.rpc('regenerate_tournament_access_code', {
      p_tournament_id: tournamentId,
    })
    setBusy(false)
    if (rpcErr) {
      setError(rpcErr.message)
      return
    }
    setCode(data)
  }

  async function handleCopy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked — the code is visible on screen anyway.
    }
  }

  return (
    <div className="space-y-2 rounded-xl bg-zinc-900 px-5 py-4 ring-1 ring-zinc-800">
      <p className="text-xs font-bold uppercase tracking-tight text-zinc-500">{t('accessCodeLabel')}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-2xl font-black tracking-[0.3em] text-white">
          {code ?? '······'}
        </span>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => { void handleCopy() }}
            disabled={!code}
            className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-200 transition-all hover:bg-zinc-700 active:scale-95 disabled:opacity-40"
          >
            {copied ? t('accessCodeCopied') : t('accessCodeCopy')}
          </button>
          <button
            onClick={() => { void handleRegenerate() }}
            disabled={busy}
            className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-200 transition-all hover:bg-zinc-700 active:scale-95 disabled:opacity-40"
          >
            {busy ? '…' : t('accessCodeRegenerate')}
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-500">{t('accessCodeHelp')}</p>
      {error && <p className="text-xs font-semibold text-rose-400">{error}</p>}
    </div>
  )
}
