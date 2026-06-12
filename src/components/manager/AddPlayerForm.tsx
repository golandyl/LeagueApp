'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const
const STAMINAS  = ['Low', 'Med', 'High'] as const

type Position = typeof POSITIONS[number]
type Stamina  = typeof STAMINAS[number]

interface Props { leagueId: string }

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function AddPlayerForm({ leagueId }: Props) {
  const t       = useTranslations('players')
  const tCommon = useTranslations('common')
  const router  = useRouter()

  const [open,        setOpen]        = useState(false)
  const [name,        setName]        = useState('')
  const [rating,      setRating]      = useState(5)
  const [position,    setPosition]    = useState<Position>('MID')
  const [stamina,     setStamina]     = useState<Stamina>('Med')
  const [isVip,       setIsVip]       = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)
  // non-null when a duplicate was detected; holds the base name for suffix computation
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null)

  function resetForm() {
    setName(''); setRating(5); setPosition('MID'); setStamina('Med'); setIsVip(false)
    setDuplicateOf(null); setError(null)
  }

  async function doInsert(finalName: string) {
    setLoading(true)
    const supabase = createClient()
    const { error: insertError } = await supabase.from('players').insert({
      full_name: finalName,
      rating,
      position,
      stamina,
      league_id: leagueId,
      is_ghost:  false,
      is_vip:    isVip,
    })
    setLoading(false)
    if (insertError) { setError(insertError.message); return }
    resetForm()
    setOpen(false)
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmedName = name.trim()
    const supabase    = createClient()

    // Check for an exact case-insensitive duplicate in this league
    const { data: existing } = await supabase
      .from('players')
      .select('id')
      .eq('league_id', leagueId)
      .ilike('full_name', trimmedName)
      .limit(1)

    if (existing && existing.length > 0) {
      setDuplicateOf(trimmedName)
      return
    }

    await doInsert(trimmedName)
  }

  async function handleConfirmDuplicate() {
    if (!duplicateOf) return
    setError(null)
    const supabase = createClient()

    // Fetch all names that start with the base name to find the next free suffix
    const { data: similar } = await supabase
      .from('players')
      .select('full_name')
      .eq('league_id', leagueId)
      .ilike('full_name', `${duplicateOf}%`)

    // Collect which suffix numbers are already taken
    // "John Doe" counts as 1, "John Doe 2" as 2, etc.
    const basePattern = new RegExp(`^${escapeRegex(duplicateOf)}(?:\\s+(\\d+))?$`, 'i')
    const taken = new Set<number>()
    for (const row of similar ?? []) {
      const m = row.full_name.match(basePattern)
      if (m) taken.add(m[1] ? parseInt(m[1], 10) : 1)
    }

    let suffix = 2
    while (taken.has(suffix)) suffix++

    await doInsert(`${duplicateOf} ${suffix}`)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border-2 border-dashed border-slate-700 py-4 text-sm font-bold text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-300 active:scale-[0.98]"
      >
        {t('addPlayer')}
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl bg-slate-800 p-5 space-y-4">
      <h3 className="font-black text-white">{t('newPlayer')}</h3>

      <input
        type="text"
        value={name}
        onChange={e => { setName(e.target.value); setDuplicateOf(null) }}
        placeholder={t('fullName')}
        required
        className="w-full rounded-xl bg-slate-700 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500"
      />

      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{t('rating')}</p>
          <input
            type="number"
            value={rating}
            onChange={e => setRating(Number(e.target.value))}
            min={1} max={10}
            required
            className="w-full rounded-xl bg-slate-700 px-3 py-3 text-center text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{t('position')}</p>
          <select
            value={position}
            onChange={e => setPosition(e.target.value as Position)}
            className="w-full rounded-xl bg-slate-700 px-3 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{t('stamina')}</p>
          <select
            value={stamina}
            onChange={e => setStamina(e.target.value as Stamina)}
            className="w-full rounded-xl bg-slate-700 px-3 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {STAMINAS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* VIP toggle */}
      <div className="flex items-center justify-between rounded-xl bg-slate-700/60 px-4 py-3">
        <span className="text-sm font-bold text-slate-300">{t('vipToggle')}</span>
        <button
          type="button"
          onClick={() => setIsVip(v => !v)}
          role="switch"
          aria-checked={isVip}
          className={[
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
            isVip ? 'bg-amber-500' : 'bg-slate-600',
          ].join(' ')}
        >
          <span className={[
            'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform',
            isVip ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
          ].join(' ')} />
        </button>
      </div>

      {/* Duplicate warning — replaces normal submit row */}
      {duplicateOf ? (
        <div className="space-y-3">
          <p className="rounded-xl bg-amber-900/40 px-4 py-3 text-sm text-amber-300">
            {t('duplicateWarning', { name: duplicateOf })}
          </p>
          {error && <p className="rounded-xl bg-red-900/40 px-4 py-2 text-sm text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDuplicateOf(null)}
              className="flex-1 rounded-xl bg-slate-700 py-3 text-sm font-bold text-slate-300 active:bg-slate-600"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmDuplicate}
              disabled={loading}
              className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-black text-white transition-all active:bg-amber-600 disabled:opacity-60"
            >
              {loading ? t('adding') : t('duplicateAddAnyway')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {error && <p className="rounded-xl bg-red-900/40 px-4 py-2 text-sm text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setOpen(false); resetForm() }}
              className="flex-1 rounded-xl bg-slate-700 py-3 text-sm font-bold text-slate-300 active:bg-slate-600"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-emerald-500 py-3 text-sm font-black text-white transition-all active:bg-emerald-600 disabled:opacity-60"
            >
              {loading ? t('adding') : t('add')}
            </button>
          </div>
        </>
      )}
    </form>
  )
}
