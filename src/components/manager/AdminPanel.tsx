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

      if (tFetchErr) {
        console.error('Reset failed details:', tFetchErr)
        throw tFetchErr
      }

      const tournamentIds = (tournaments ?? []).map(t => t.id)

      if (tournamentIds.length > 0) {
        // 2. Collect match IDs (needed to target match_events)
        const { data: matchRows, error: mFetchErr } = await supabase
          .from('matches')
          .select('id')
          .in('tournament_id', tournamentIds)

        if (mFetchErr) {
          console.error('Reset failed details:', mFetchErr)
          throw mFetchErr
        }

        const matchIds = (matchRows ?? []).map(m => m.id)

        // 3. match_events — must go before matches (FK: match_events.match_id → matches)
        if (matchIds.length > 0) {
          const { error: evErr } = await supabase
            .from('match_events')
            .delete()
            .in('match_id', matchIds)
          if (evErr) {
            console.error('Reset failed details:', evErr)
            throw evErr
          }
        }

        // 4. team_players
        const { error: tpErr } = await supabase
          .from('team_players').delete().in('tournament_id', tournamentIds)
        if (tpErr) {
          console.error('Reset failed details:', tpErr)
          throw tpErr
        }

        // 5. matches
        const { error: mDelErr } = await supabase
          .from('matches').delete().in('tournament_id', tournamentIds)
        if (mDelErr) {
          console.error('Reset failed details:', mDelErr)
          throw mDelErr
        }

        // 6. teams
        const { error: teamsErr } = await supabase
          .from('teams').delete().in('tournament_id', tournamentIds)
        if (teamsErr) {
          console.error('Reset failed details:', teamsErr)
          throw teamsErr
        }

        // 7. tournaments
        const { error: tourErr } = await supabase
          .from('tournaments').delete().eq('league_id', leagueId)
        if (tourErr) {
          console.error('Reset failed details:', tourErr)
          throw tourErr
        }
      }

      // Core reset succeeded — mark done immediately before optional cleanup
      onReset()
      setSuccess(true)
      setModalOpen(false)
      router.refresh()

      // 8. tournament_signups — non-fatal: table may not exist on instances
      //    that haven't yet applied migration 20260528000000 or 20260529000000.
      const { error: signupErr } = await supabase
        .from('tournament_signups').delete().eq('league_id', leagueId)
      if (signupErr) {
        console.error('Reset failed details:', signupErr)
      }

      // 9. Rotate signup_cycle — non-fatal: column may not exist if the
      //    20260528000001 / 20260529000000 migration hasn't been applied yet.
      const { error: cycleErr } = await supabase
        .from('leagues').update({ signup_cycle: crypto.randomUUID() }).eq('id', leagueId)
      if (cycleErr) {
        console.error('Reset failed details:', cycleErr)
      }
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
        <h2 className="text-xs font-black uppercase tracking-tight text-zinc-500">
          {t('dangerZone')}
        </h2>

        <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-5 space-y-4">
          <div>
            <p className="font-bold text-rose-300">{t('resetHistory')}</p>
            <p className="mt-1 text-sm text-zinc-400 leading-relaxed">
              {t('resetHistoryDesc')}
            </p>
          </div>

          {success && (
            <p className="text-sm font-semibold text-emerald-400">{t('deleteSuccess')}</p>
          )}

          <button
            onClick={openModal}
            className="rounded-lg bg-rose-700 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-rose-600 active:scale-[0.98]"
          >
            {t('resetHistory')}
          </button>
        </div>
      </section>

      {/* Confirmation modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          onClick={() => { if (!loading) setModalOpen(false) }}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-zinc-900 p-6 shadow-2xl space-y-5 border border-zinc-800"
            onClick={e => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-lg font-black uppercase tracking-tight text-white">{t('modalTitle')}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{t('resetHistoryDesc')}</p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-tight text-zinc-500">
                {t('typeToConfirm')}
              </label>
              <p className="font-mono text-xs text-zinc-600">&quot;{leagueName}&quot;</p>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={leagueName}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full rounded-lg bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-rose-400">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setModalOpen(false)}
                disabled={loading}
                className="flex-1 rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-bold text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleReset}
                disabled={!confirmed || loading}
                className="flex-1 rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed"
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
