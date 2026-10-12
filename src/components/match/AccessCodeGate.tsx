'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

interface Props {
  onSubmit: (code: string) => Promise<boolean>
}

// Shown to non-managers who haven't entered the tournament's access code.
// They can still watch the match; the code unlocks the scoring controls.
export function AccessCodeGate({ onSubmit }: Props) {
  const t = useTranslations('match')
  const [code,     setCode]     = useState('')
  const [checking, setChecking] = useState(false)
  const [invalid,  setInvalid]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setChecking(true)
    setInvalid(false)
    const ok = await onSubmit(code)
    setChecking(false)
    if (!ok) setInvalid(true)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full space-y-3 rounded-xl bg-zinc-900 p-4 ring-1 ring-zinc-800"
    >
      <p className="text-sm font-bold text-white">{t('accessCodeTitle')}</p>
      <p className="text-xs text-zinc-400">{t('accessCodeHint')}</p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setInvalid(false) }}
          placeholder="ABC123"
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg bg-zinc-800 px-3 py-3 text-center font-mono text-lg font-bold tracking-[0.3em] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={checking || code.trim().length === 0}
          className="shrink-0 rounded-lg bg-emerald-600 px-5 text-sm font-black text-white transition-all active:scale-95 active:bg-emerald-700 disabled:opacity-40"
        >
          {checking ? '…' : t('accessCodeUnlock')}
        </button>
      </div>
      {invalid && (
        <p className="text-xs font-semibold text-rose-400">{t('accessCodeInvalid')}</p>
      )}
    </form>
  )
}
