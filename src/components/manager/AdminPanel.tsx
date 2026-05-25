'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  leagueId:   string
  leagueName: string
  onReset:    () => void
}

export function AdminPanel({ leagueId, leagueName, onReset }: Props) {
  const t       = useTranslations('admin')
  const tCommon = useTranslations('common')
  const router  = useRouter()

  const [modalOpen, setModalOpen] = useState(false)
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState(false)

  const confirmed = input === leagueName

  function openModal() {
    setInput('')
    setError(null)
    setSuccess(false)
    setModalOpen(true)
  }

  async function handleReset() {
    if (!confirmed || loading) return
    setLoading(true)
    setError(null)

    const supabase = createClient()

    try {
      // 1. Collect all tournament IDs for this league
      const { data: tournaments, error: tFetchErr } = await supabase
        .from('tournaments')
        .select('id')
        .eq('league_id', leagueId)

      if (tFetchErr) throw tFetchErr

      const tournamentIds = (tournaments ?? []).map(t => t.id)

      if (tournamentIds.length > 0) {
        // 2. Collect match IDs (needed to target match_events)
        const { data: matchRows, error: mFetchErr } = await supabase
          .from('matches')
          .select('id')
          .in('tournament_id', tournamentIds)

        if (mFetchErr) throw mFetchErr

        const matchIds = (matchRows ?? []).map(m => m.id)

        // 3. match_events — must go before matches (FK: match_events.match_id → matches)
        if (matchIds.length > 0) {
          const { error: evErr } = await supabase
            .from('match_events')
            .delete()
            .in('match_id', matchIds)
          if (evErr) throw evErr
        }

        // 4. team_players — before matches and teams (FK: team_players.team_id → teams)
        const { error: tpErr } = await supabase
          .from('team_players').delete().in('tournament_id', tournamentIds)
        if (tpErr) throw tpErr

        // 5. matches — before teams (FK: matches.home/away_team_id → teams)
        const { error: mDelErr } = await supabase
          .from('matches').delete().in('tournament_id', tournamentIds)
        if (mDelErr) throw mDelErr

        // 6. teams — before tournaments (FK: teams.tournament_id → tournaments)
        const { error: teamsErr } = await supabase
          .from('teams').delete().in('tournament_id', tournamentIds)
        if (teamsErr) throw teamsErr

        // 7. tournaments
        const { error: tourErr } = await supabase
          .from('tournaments').delete().eq('league_id', leagueId)
        if (tourErr) throw tourErr
      }

      // Clear local match state instantly, then revalidate server data
      onReset()
      setSuccess(true)
      setModalOpen(false)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('deleteError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">

      {/* Danger Zone card */}
      <section className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
          {t('dangerZone')}
        </h2>

        <div className="rounded-2xl border border-rose-900/60 bg-rose-950/20 p-5 space-y-4">
          <div>
            <p className="font-bold text-rose-300">{t('resetHistory')}</p>
            <p className="mt-1 text-sm text-slate-400 leading-relaxed">
              {t('resetHistoryDesc')}
            </p>
          </div>

          {success && (
            <p className="text-sm font-semibold text-emerald-400">{t('deleteSuccess')}</p>
          )}

          <button
            onClick={openModal}
            className="rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-rose-600 active:scale-[0.98]"
          >
            {t('resetHistory')}
          </button>
        </div>
      </section>

      {/* Confirmation modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => { if (!loading) setModalOpen(false) }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-slate-800 p-6 shadow-2xl space-y-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-lg font-black text-white">{t('modalTitle')}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{t('resetHistoryDesc')}</p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                {t('typeToConfirm')}
              </label>
              <p className="font-mono text-xs text-slate-500">"{leagueName}"</p>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={leagueName}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full rounded-lg bg-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-rose-400">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setModalOpen(false)}
                disabled={loading}
                className="flex-1 rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-bold text-slate-300 transition-colors hover:bg-slate-600 disabled:opacity-50"
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleReset}
                disabled={!confirmed || loading}
                className="flex-1 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? t('deleting') : t('confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
