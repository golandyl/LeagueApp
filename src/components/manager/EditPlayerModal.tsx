'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

type Player = Tables<'players'>

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const
const STAMINAS  = ['Low', 'Med', 'High'] as const
type Position = typeof POSITIONS[number]
type Stamina  = typeof STAMINAS[number]

interface Props {
  player:  Player
  onSave:  (updated: Player) => void
  onClose: () => void
}

export function EditPlayerModal({ player, onSave, onClose }: Props) {
  const t       = useTranslations('players')
  const tCommon = useTranslations('common')

  const [name,     setName]     = useState(player.full_name)
  const [rating,   setRating]   = useState(player.rating)
  const [position, setPosition] = useState<Position>(player.position as Position)
  const [stamina,  setStamina]  = useState<Stamina>(player.stamina as Stamina)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('players')
      .update({ full_name: name.trim(), rating, position, stamina })
      .eq('id', player.id)

    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    onSave({ ...player, full_name: name.trim(), rating, position, stamina })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-slate-800 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-lg font-black text-white">{t('editPlayer')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon('cancel')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-700 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="h-px bg-slate-700/60 mx-6" />

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('fullName')}
            required
            autoFocus
            className="w-full rounded-xl bg-slate-700 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-sky-500"
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
                className="w-full rounded-xl bg-slate-700 px-3 py-3 text-center text-sm text-white outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{t('position')}</p>
              <select
                value={position}
                onChange={e => setPosition(e.target.value as Position)}
                className="w-full rounded-xl bg-slate-700 px-3 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500"
              >
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{t('stamina')}</p>
              <select
                value={stamina}
                onChange={e => setStamina(e.target.value as Stamina)}
                className="w-full rounded-xl bg-slate-700 px-3 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500"
              >
                {STAMINAS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-red-900/40 px-4 py-2 text-sm text-red-300">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-slate-700 py-3 text-sm font-bold text-slate-300 active:bg-slate-600"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-sky-600 py-3 text-sm font-black text-white transition-all active:bg-sky-700 disabled:opacity-60"
            >
              {saving ? tCommon('saving') : t('updatePlayer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
