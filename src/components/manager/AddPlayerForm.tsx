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

export function AddPlayerForm({ leagueId }: Props) {
  const t      = useTranslations('players')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [open,     setOpen]     = useState(false)
  const [name,     setName]     = useState('')
  const [rating,   setRating]   = useState(5)
  const [position, setPosition] = useState<Position>('MID')
  const [stamina,  setStamina]  = useState<Stamina>('Med')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: insertError } = await supabase.from('players').insert({
      full_name: name.trim(),
      rating,
      position,
      stamina,
      league_id: leagueId,
      is_ghost:  false,
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    setName(''); setRating(5); setPosition('MID'); setStamina('Med')
    setLoading(false)
    setOpen(false)
    router.refresh()
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
        onChange={e => setName(e.target.value)}
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

      {error && <p className="rounded-xl bg-red-900/40 px-4 py-2 text-sm text-red-300">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
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
    </form>
  )
}
