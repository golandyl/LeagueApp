'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

type Match      = Tables<'matches'>
type Team       = Tables<'teams'>
type MatchEvent = Tables<'match_events'>
type Player     = Tables<'players'>
type TeamPlayer = Tables<'team_players'>

interface Props {
  tournamentId: string
  leagueId:     string
  onFinished:   () => void
}

export function FinishTournamentButton({ tournamentId, leagueId, onFinished }: Props) {
  const t       = useTranslations('dashboard')
  const tCommon = useTranslations('common')
  const router  = useRouter()

  const [confirming,       setConfirming]       = useState(false)
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [loading,          setLoading]          = useState(false)
  const [deleting,         setDeleting]         = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [deleteError,      setDeleteError]      = useState<string | null>(null)
  const [archived,         setArchived]         = useState(false)
  const [copying,          setCopying]          = useState(false)
  const [copied,           setCopied]           = useState(false)

  function openConfirm() {
    setConfirming(true)
    setDeleteConfirming(false)
    setError(null)
    setDeleteError(null)
  }

  function closeAll() {
    setConfirming(false)
    setDeleteConfirming(false)
    setError(null)
    setDeleteError(null)
  }

  async function handleArchive() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('tournaments')
      .update({ status: 'completed' })
      .eq('id', tournamentId)
    if (err) { setError(err.message); setLoading(false); return }
    setLoading(false)
    setArchived(true)
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    const supabase = createClient()
    const { error: err } = await supabase.rpc('admin_delete_tournament', {
      p_tournament_id: tournamentId,
    })
    if (err) { setDeleteError(err.message); setDeleting(false); return }
    onFinished()
    router.refresh()
  }

  async function handleCopyWhatsApp() {
    setCopying(true)
    const supabase = createClient()

    const [{ data: teams }, { data: matches }] = await Promise.all([
      supabase.from('teams').select('*').eq('tournament_id', tournamentId),
      supabase.from('matches').select('*').eq('tournament_id', tournamentId).eq('status', 'completed'),
    ])

    const resolvedTeams   = (teams   ?? []) as Team[]
    const resolvedMatches = (matches ?? []) as Match[]
    const matchIds = resolvedMatches.map(m => m.id)

    const [eventsResult, teamPlayersResult, playersResult] = await Promise.all([
      matchIds.length > 0
        ? supabase.from('match_events').select('*').in('match_id', matchIds)
        : Promise.resolve({ data: [] as MatchEvent[] }),
      supabase.from('team_players').select('*').eq('tournament_id', tournamentId),
      supabase.from('players').select('*').eq('league_id', leagueId),
    ])

    const resolvedEvents      = (eventsResult.data      ?? []) as MatchEvent[]
    const resolvedPlayers     = (playersResult.data     ?? []) as Player[]

    // Champion: team with most wins (by regular score, not counting penalty extras)
    const winCount = new Map<string, number>()
    const gdMap    = new Map<string, number>()
    for (const t of resolvedTeams) { winCount.set(t.id, 0); gdMap.set(t.id, 0) }
    for (const m of resolvedMatches) {
      if (m.home_score == null || m.away_score == null) continue
      let hg = m.home_score, ag = m.away_score
      if (m.victory_condition === 'PENALTIES') { if (hg > ag) hg -= 1; else ag -= 1 }
      gdMap.set(m.home_team_id, (gdMap.get(m.home_team_id) ?? 0) + hg - ag)
      gdMap.set(m.away_team_id, (gdMap.get(m.away_team_id) ?? 0) + ag - hg)
      if (hg > ag) winCount.set(m.home_team_id, (winCount.get(m.home_team_id) ?? 0) + 1)
      else if (ag > hg) winCount.set(m.away_team_id, (winCount.get(m.away_team_id) ?? 0) + 1)
    }
    const champion = resolvedTeams.slice().sort((a, b) =>
      (winCount.get(b.id) ?? 0) - (winCount.get(a.id) ?? 0) ||
      (gdMap.get(b.id) ?? 0) - (gdMap.get(a.id) ?? 0)
    )[0] ?? null

    // Top scorer
    const scorerCounts = new Map<string, number>()
    for (const e of resolvedEvents) {
      if (e.event_type !== 'goal' || !e.player_id) continue
      scorerCounts.set(e.player_id, (scorerCounts.get(e.player_id) ?? 0) + 1)
    }
    const topScorerId    = [...scorerCounts.entries()].sort((a, b) => b[1] - a[1])[0]
    const topScorerPlayer = topScorerId ? resolvedPlayers.find(p => p.id === topScorerId[0]) : null

    // Top assister
    const assistCounts = new Map<string, number>()
    for (const e of resolvedEvents) {
      if (e.event_type !== 'assist' || !e.player_id) continue
      assistCounts.set(e.player_id, (assistCounts.get(e.player_id) ?? 0) + 1)
    }
    const topAssisterId    = [...assistCounts.entries()].sort((a, b) => b[1] - a[1])[0]
    const topAssisterPlayer = topAssisterId ? resolvedPlayers.find(p => p.id === topAssisterId[0]) : null

    const details: string[] = []
    if (champion) details.push(`🥇 *Champions:* ${champion.name}`)
    if (topScorerPlayer && topScorerId) details.push(`⚽ *Top Scorer:* ${topScorerPlayer.full_name} (${topScorerId[1]} Goals)`)
    if (topAssisterPlayer && topAssisterId) details.push(`🎯 *Top Assister:* ${topAssisterPlayer.full_name} (${topAssisterId[1]} Assists)`)

    const lines = [
      '🏆 *Tournament Complete!* 🏆',
      '',
      ...details,
      '',
      'Great games tonight, see you next session!',
    ]

    await navigator.clipboard.writeText(lines.join('\n'))
    setCopying(false)
    setCopied(true)
  }

  // ── Trigger button ─────────────────────────────────────────────────────────

  if (!confirming && !archived) {
    return (
      <button
        onClick={openConfirm}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 py-3.5 text-sm font-bold text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200 active:scale-[0.98]"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {t('finishDay')}
      </button>
    )
  }

  // ── Archived success state ─────────────────────────────────────────────────

  if (archived) {
    return (
      <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4 space-y-3">
        <p className="text-sm font-semibold text-emerald-300">✓ {t('archiveSuccess')}</p>
        <button
          onClick={() => { void handleCopyWhatsApp() }}
          disabled={copying}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50 active:scale-[0.98]"
        >
          <span>📋</span>
          {copied ? t('whatsAppCopied') : copying ? tCommon('loading') : t('whatsAppSummary')}
        </button>
        <button
          onClick={() => { onFinished(); router.refresh() }}
          className="w-full rounded-lg bg-zinc-800 py-2.5 text-sm font-bold text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          {t('close')}
        </button>
      </div>
    )
  }

  // ── Delete-specific confirmation ───────────────────────────────────────────

  if (deleteConfirming) {
    return (
      <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-4 space-y-3">
        <p className="text-sm leading-snug text-zinc-300">{t('deleteTournamentDesc')}</p>
        {deleteError && <p className="text-xs font-medium text-rose-400">{deleteError}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => { setDeleteConfirming(false); setDeleteError(null) }}
            disabled={deleting}
            className="flex-1 rounded-lg bg-zinc-800 py-2.5 text-sm font-bold text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {tCommon('cancel')}
          </button>
          <button
            onClick={() => { void handleDelete() }}
            disabled={deleting}
            className="flex-1 rounded-lg bg-rose-700 py-2.5 text-sm font-bold text-white transition-colors hover:bg-rose-600 disabled:opacity-40"
          >
            {deleting ? t('finishing') : t('deleteTournamentConfirm')}
          </button>
        </div>
      </div>
    )
  }

  // ── Archive confirmation (with delete escape hatch below) ──────────────────

  return (
    <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 space-y-3">
      <p className="text-sm leading-snug text-zinc-300">{t('finishDayDesc')}</p>
      {error && <p className="text-xs font-medium text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={closeAll}
          disabled={loading}
          className="flex-1 rounded-lg bg-zinc-800 py-2.5 text-sm font-bold text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {tCommon('cancel')}
        </button>
        <button
          onClick={() => { void handleArchive() }}
          disabled={loading}
          className="flex-1 rounded-lg bg-amber-700 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-600 disabled:opacity-40"
        >
          {loading ? t('finishing') : t('finishDayConfirmBtn')}
        </button>
      </div>
      <button
        onClick={() => { setDeleteConfirming(true); setError(null) }}
        disabled={loading}
        className="w-full rounded-lg border border-zinc-700 py-2 text-xs font-bold text-zinc-500 transition-all hover:border-rose-800/60 hover:bg-rose-950/20 hover:text-rose-400 active:scale-[0.98] disabled:opacity-40"
      >
        {t('deleteTournament')}
      </button>
    </div>
  )
}
