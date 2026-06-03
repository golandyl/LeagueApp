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
  player:   Player
  onSave:   (updated: Player) => void
  onDelete: (id: string) => void
  onClose:  () => void
}

export function EditPlayerModal({ player, onSave, onDelete, onClose }: Props) {
  const t       = useTranslations('players')
  const tCommon = useTranslations('common')

  const [name,     setName]     = useState(player.full_name)
  const [rating,   setRating]   = useState(player.rating)
  const [position, setPosition] = useState<Position>(player.position as Position)
  const [stamina,  setStamina]  = useState<Stamina>(player.stamina as Stamina)
  const [isVip,        setIsVip]        = useState(player.is_vip ?? false)
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [deleteError,  setDeleteError]  = useState<string | null>(null)

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
      .update({ full_name: name.trim(), rating, position, stamina, is_vip: isVip })
      .eq('id', player.id)

    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    onSave({ ...player, full_name: name.trim(), rating, position, stamina, is_vip: isVip })
  }

  async function handleDelete() {
    if (!window.confirm(t('deleteConfirm', { name: player.full_name }))) return
    setDeleteError(null)
    setDeleting(true)

    const supabase = createClient()
    const { error: deleteErr } = await supabase
      .from('players')
      .delete()
      .eq('id', player.id)

    setDeleting(false)

    if (deleteErr) {
      const isFkViolation = (deleteErr as { code?: string }).code === '23503'
      setDeleteError(isFkViolation ? t('deleteError') : deleteErr.message)
      return
    }

    onDelete(player.id)
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
              disabled={saving || deleting}
              className="flex-1 rounded-xl bg-sky-600 py-3 text-sm font-black text-white transition-all active:bg-sky-700 disabled:opacity-60"
            >
              {saving ? tCommon('saving') : t('updatePlayer')}
            </button>
          </div>

          {/* Destructive zone */}
          <div className="border-t border-slate-700/60 pt-1">
            {deleteError && (
              <p className="mb-3 rounded-xl bg-red-900/40 px-4 py-2 text-sm text-red-300">
                {deleteError}
              </p>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving || deleting}
              className="w-full rounded-xl border border-red-900/40 py-2.5 text-sm font-black text-red-500/80 transition-all hover:border-red-700/60 hover:bg-red-950/30 hover:text-red-400 active:scale-[0.98] disabled:opacity-40"
            >
              {deleting ? t('deleting') : t('deletePlayer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
