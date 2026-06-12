'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { Tables, Enums } from '@/types/database'

type Match  = Tables<'matches'>
type Team   = Tables<'teams'>
type Player = Tables<'players'>

interface DraftGoal {
  key:       string
  teamId:    string
  scorerId:  string | null
  assistId:  string | null
  minute:    number
  isOwnGoal: boolean
}

interface Props {
  match:       Match
  homeTeam:    Team
  awayTeam:    Team
  homePlayers: Player[]
  awayPlayers: Player[]
  onSave:      (homeScore: number, awayScore: number) => void
  onClose:     () => void
}

export function OverrideMatchModal({
  match, homeTeam, awayTeam, homePlayers, awayPlayers, onSave, onClose,
}: Props) {
  const t       = useTranslations('match')
  const tEdit   = useTranslations('editMatch')
  const tCommon = useTranslations('common')
  const supabase = createClient()

  const [goals,   setGoals]   = useState<DraftGoal[]>([])
  const [vc,      setVc]      = useState<Enums<'victory_condition'>>(match.victory_condition ?? 'REGULAR')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data: events } = await supabase
        .from('match_events')
        .select('*')
        .eq('match_id', match.id)
        .order('minute', { ascending: true })

      if (events) {
        const assistMap = new Map<string, string>()
        for (const e of events) {
          if (e.event_type === 'assist' && e.player_id) {
            assistMap.set(`${e.team_id}:${e.minute}`, e.player_id)
          }
        }
        setGoals(
          events
            .filter(e => e.event_type === 'goal')
            .map(e => ({
              key:       e.id,
              teamId:    e.team_id,
              scorerId:  e.player_id,
              assistId:  assistMap.get(`${e.team_id}:${e.minute}`) ?? null,
              minute:    e.minute,
              isOwnGoal: e.description === 'own_goal',
            })),
        )
      }
      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id])

  const homeScore = goals.filter(g => g.teamId === homeTeam.id).length
  const awayScore = goals.filter(g => g.teamId === awayTeam.id).length

  function addGoal() {
    setGoals(prev => [...prev, {
      key:       crypto.randomUUID(),
      teamId:    homeTeam.id,
      scorerId:  null,
      assistId:  null,
      minute:    1,
      isOwnGoal: false,
    }])
  }

  function removeGoal(key: string) {
    setGoals(prev => prev.filter(g => g.key !== key))
  }

  function updateGoal(key: string, patch: Partial<DraftGoal>) {
    setGoals(prev => prev.map(g => g.key === key ? { ...g, ...patch } : g))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    // Build the flat event list the RPC expects.
    // The RPC runs SECURITY DEFINER with session_replication_role = 'replica'
    // so it bypasses both the RLS "completed tournament" policy and the
    // enforce_completed_tournament_lock trigger in a single atomic call.
    const rpcEvents = goals.flatMap(g => {
      const evs = [{
        event_type:  'goal',
        team_id:     g.teamId,
        player_id:   g.scorerId,   // null → SQL NULL handled by RPC
        minute:      g.minute,
        description: g.isOwnGoal ? 'own_goal' : null,
      }]
      if (g.assistId) {
        evs.push({
          event_type:  'assist',
          team_id:     g.teamId,
          player_id:   g.assistId,
          minute:      g.minute,
          description: null,
        })
      }
      return evs
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcErr } = await (supabase.rpc as any)('admin_override_match_events', {
      p_match_id:   match.id,
      p_home_score: homeScore,
      p_away_score: awayScore,
      p_vc:         vc,
      p_events:     rpcEvents,
    })

    if (rpcErr) {
      const msg = rpcErr.message ?? ''
      setError(
        msg.includes('UNAUTHORIZED')    ? 'Not authorized to override this match.' :
        msg.includes('MATCH_NOT_FOUND') ? 'Match not found.' :
        msg,
      )
      setSaving(false)
      return
    }

    onSave(homeScore, awayScore)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg rounded-t-3xl bg-zinc-900 sm:rounded-3xl flex flex-col max-h-[90dvh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-lg font-black text-white">{t('overrideTitle')}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
            aria-label={tCommon('cancel')}
          >
            ✕
          </button>
        </div>

        {/* Score */}
        <div className="flex items-center justify-center gap-5 px-5 pb-3 shrink-0">
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            {homeTeam.color && (
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: homeTeam.color }} />
            )}
            <span className="truncate text-sm font-bold text-zinc-300">{homeTeam.name}</span>
          </div>
          <span className="shrink-0 text-2xl font-black tabular-nums text-white">
            {homeScore} – {awayScore}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {awayTeam.color && (
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: awayTeam.color }} />
            )}
            <span className="truncate text-sm font-bold text-zinc-300">{awayTeam.name}</span>
          </div>
        </div>

        {/* VC selector */}
        <div className="px-5 pb-3 shrink-0">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-tight text-zinc-500">
            {t('overrideVc')}
          </p>
          <div className="flex gap-2">
            {(['REGULAR', 'OVERTIME', 'PENALTIES'] as const).map(v => (
              <button
                key={v}
                onClick={() => setVc(v)}
                className={[
                  'flex-1 rounded-lg py-2 text-xs font-bold transition-colors',
                  vc === v
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700',
                ].join(' ')}
              >
                {v === 'REGULAR' ? tEdit('vcRegular') : v === 'OVERTIME' ? tEdit('vcOvertime') : tEdit('vcPenalties')}
              </button>
            ))}
          </div>
        </div>

        {/* Goals list */}
        <div className="flex-1 overflow-y-auto px-5 space-y-2.5 py-1 min-h-0">
          {loading ? (
            <p className="py-6 text-center text-sm text-zinc-500">{tCommon('loading')}</p>
          ) : goals.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">{t('noGoals')}</p>
          ) : (
            goals.map(g => (
              <GoalRow
                key={g.key}
                goal={g}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                homePlayers={homePlayers}
                awayPlayers={awayPlayers}
                onChange={patch => updateGoal(g.key, patch)}
                onRemove={() => removeGoal(g.key)}
              />
            ))
          )}

          <button
            onClick={addGoal}
            className="w-full rounded-xl border border-dashed border-zinc-700 py-3 text-sm font-bold text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
          >
            {t('overrideAddGoal')}
          </button>
        </div>

        {error && (
          <p className="mx-5 mt-2 rounded-lg bg-rose-950/60 px-4 py-3 text-sm font-semibold text-rose-400 shrink-0">
            {error}
          </p>
        )}

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl bg-zinc-800 py-3 text-sm font-bold text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
          >
            {tCommon('cancel')}
          </button>
          <button
            onClick={() => { void handleSave() }}
            disabled={saving || loading}
            className="flex-1 rounded-xl bg-amber-600 py-3 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-40 transition-colors active:scale-[0.98]"
          >
            {saving ? t('overrideSaving') : t('overrideSave')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── GoalRow ───────────────────────────────────────────────────────────────────

function GoalRow({
  goal, homeTeam, awayTeam, homePlayers, awayPlayers, onChange, onRemove,
}: {
  goal:        DraftGoal
  homeTeam:    Team
  awayTeam:    Team
  homePlayers: Player[]
  awayPlayers: Player[]
  onChange:    (patch: Partial<DraftGoal>) => void
  onRemove:    () => void
}) {
  const t = useTranslations('match')
  const teamPlayers = goal.teamId === homeTeam.id ? homePlayers : awayPlayers

  return (
    <div className="rounded-xl bg-zinc-800 p-3 space-y-2.5">
      {/* Row 1: team toggle + minute + remove */}
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1.5">
          {[homeTeam, awayTeam].map(team => (
            <button
              key={team.id}
              onClick={() => onChange({ teamId: team.id, scorerId: null, assistId: null })}
              className={[
                'flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-lg px-2 py-1.5 text-xs font-bold transition-colors',
                goal.teamId === team.id
                  ? 'bg-emerald-700/80 text-white'
                  : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600',
              ].join(' ')}
            >
              {team.color && (
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />
              )}
              <span className="truncate">{team.name}</span>
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <input
            type="number"
            min={1}
            max={120}
            value={goal.minute}
            onChange={e => onChange({ minute: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-12 rounded-lg bg-zinc-700 px-1.5 py-1 text-center text-sm font-bold text-white"
          />
          <span className="text-[10px] text-zinc-500">{t('overrideMinute')}</span>
        </div>

        <button
          onClick={onRemove}
          className="shrink-0 rounded-lg bg-zinc-700 px-2 py-1 text-xs font-bold text-zinc-400 hover:bg-rose-900/50 hover:text-rose-400 transition-colors"
        >
          {t('overrideRemove')}
        </button>
      </div>

      {/* Row 2: scorer + assister */}
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-tight text-zinc-500">
            {t('overrideScorer')}
          </label>
          <select
            value={goal.scorerId ?? ''}
            onChange={e => onChange({ scorerId: e.target.value || null, assistId: null })}
            className="w-full rounded-lg bg-zinc-700 px-2 py-1.5 text-sm text-white"
          >
            <option value="">{t('overrideNoScorer')}</option>
            {teamPlayers.map(p => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-0">
          <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-tight text-zinc-500">
            {t('overrideAssister')}
          </label>
          <select
            value={goal.assistId ?? ''}
            onChange={e => onChange({ assistId: e.target.value || null })}
            className="w-full rounded-lg bg-zinc-700 px-2 py-1.5 text-sm text-white"
          >
            <option value="">{t('noAssist')}</option>
            {teamPlayers.filter(p => p.id !== goal.scorerId).map(p => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Own goal toggle */}
      <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={goal.isOwnGoal}
          onChange={e => onChange({ isOwnGoal: e.target.checked })}
          className="h-3.5 w-3.5 rounded accent-amber-500"
        />
        {t('ownGoal')}
      </label>
    </div>
  )
}
