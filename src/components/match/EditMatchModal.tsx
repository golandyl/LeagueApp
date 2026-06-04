'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { Tables, Enums } from '@/types/database'

type Match            = Tables<'matches'>
type Team             = Tables<'teams'>
type VictoryCondition = Enums<'victory_condition'>
type MatchStatus      = Enums<'match_status'>

// '' represents a draw (null victory_condition in DB)
type VCValue = VictoryCondition | ''

interface Props {
  match:    Match
  homeTeam: Team | undefined
  awayTeam: Team | undefined
  onSave:   (updated: Match) => void
  onClose:  () => void
}

export function EditMatchModal({ match, homeTeam, awayTeam, onSave, onClose }: Props) {
  const t       = useTranslations('editMatch')
  const tCommon = useTranslations('common')
  const router  = useRouter()

  const [homeScore, setHomeScore] = useState(String(match.home_score ?? 0))
  const [awayScore, setAwayScore] = useState(String(match.away_score ?? 0))
  const [vc,        setVc]        = useState<VCValue>(match.victory_condition ?? '')
  const [status,    setStatus]    = useState<MatchStatus>(
    match.status === 'cancelled' ? 'cancelled' : 'completed',
  )
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSave() {
    if (loading) return
    setLoading(true)
    setError(null)

    const updated: Match = {
      ...match,
      home_score:        Math.max(0, Number(homeScore) || 0),
      away_score:        Math.max(0, Number(awayScore) || 0),
      victory_condition: vc === '' ? null : vc,
      status,
    }

    // Optimistic update — parent state changes instantly
    onSave(updated)

    const supabase = createClient()
    const { error: err } = await supabase
      .from('matches')
      .update({
        home_score:        updated.home_score,
        away_score:        updated.away_score,
        victory_condition: updated.victory_condition,
        status:            updated.status,
      })
      .eq('id', match.id)

    if (err) {
      // Rollback
      onSave(match)
      setError(err.message)
      setLoading(false)
      return
    }

    onClose()
    router.refresh()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
      onClick={() => { if (!loading) onClose() }}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl bg-slate-800 p-6 shadow-2xl space-y-5 sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-black text-white">{t('title')}</h3>

        {/* ── Score row ── */}
        <div className="flex items-end gap-3">

          {/* Home team */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {homeTeam?.color && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: homeTeam.color }}
                />
              )}
              <span className="truncate text-xs font-bold text-slate-400">
                {homeTeam?.name ?? t('home')}
              </span>
            </div>
            <input
              type="number"
              min="0"
              value={homeScore}
              onChange={e => setHomeScore(e.target.value)}
              className="w-full rounded-xl bg-slate-700 py-3 text-center text-2xl font-black text-white tabular-nums outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <span className="shrink-0 pb-3 text-lg font-black text-slate-600">—</span>

          {/* Away team */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {awayTeam?.color && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: awayTeam.color }}
                />
              )}
              <span className="truncate text-xs font-bold text-slate-400">
                {awayTeam?.name ?? t('away')}
              </span>
            </div>
            <input
              type="number"
              min="0"
              value={awayScore}
              onChange={e => setAwayScore(e.target.value)}
              className="w-full rounded-xl bg-slate-700 py-3 text-center text-2xl font-black text-white tabular-nums outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>

        {/* ── Victory condition ── */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            {t('resultType')}
          </label>
          <select
            value={vc}
            onChange={e => setVc(e.target.value as VCValue)}
            className="w-full rounded-xl bg-slate-700 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">{t('vcDraw')}</option>
            <option value="REGULAR">{t('vcRegular')}</option>
            <option value="OVERTIME">{t('vcOvertime')}</option>
            <option value="PENALTIES">{t('vcPenalties')}</option>
          </select>
        </div>

        {/* ── Status ── */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            {t('status')}
          </label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as MatchStatus)}
            className="w-full rounded-xl bg-slate-700 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="completed">{t('statusCompleted')}</option>
            <option value="cancelled">{t('statusCancelled')}</option>
          </select>
        </div>

        {error && (
          <p className="text-sm font-medium text-rose-400">{error}</p>
        )}

        {/* ── Actions ── */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-bold text-slate-300 transition-colors hover:bg-slate-600 disabled:opacity-50"
          >
            {tCommon('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-sky-500 disabled:opacity-40"
          >
            {loading ? tCommon('saving') : tCommon('saveChanges')}
          </button>
        </div>
      </div>
    </div>
  )
}
