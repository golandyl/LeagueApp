'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { generateTeams } from '@/lib/team-generator'
import type { DraftPlayer } from '@/lib/team-generator'
import type { Tables } from '@/types/database'

type Player = Tables<'players'>
type Step   = 'attendance' | 'config' | 'format'
type Format = 'round_robin' | 'winner_continues' | 'cup'

interface Props {
  leagueId: string
  players:  Player[]
}

const TEAM_COLORS     = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899']
const CUP_VALID_COUNTS = [4, 8, 16]

const POSITION_STYLE: Record<string, string> = {
  GK:  'bg-amber-800/70 text-amber-200',
  DEF: 'bg-sky-800/70 text-sky-200',
  MID: 'bg-violet-800/70 text-violet-200',
  FWD: 'bg-emerald-800/70 text-emerald-200',
}

export function StartTournamentButton({ leagueId, players }: Props) {
  const t       = useTranslations('tournament')
  const tCommon = useTranslations('common')
  const locale  = useLocale()
  const router  = useRouter()

  const [open,     setOpen]     = useState(false)
  const [step,     setStep]     = useState<Step>('attendance')
  const [present,  setPresent]  = useState<Set<string>>(() => new Set())
  const [numTeams, setNumTeams] = useState(2)
  const [format,   setFormat]   = useState<Format>('round_robin')
  const [dayName,  setDayName]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const presentPlayers = useMemo(
    () => players.filter(p => present.has(p.id)),
    [players, present],
  )
  const presentCount = presentPlayers.length

  const safeNumTeams = Math.max(2, Math.min(numTeams, Math.max(2, presentCount)))
  const floorSize    = presentCount > 0 ? Math.floor(presentCount / safeNumTeams) : 0
  const ceilSize     = presentCount > 0 ? Math.ceil(presentCount / safeNumTeams)  : 0
  const bigTeams     = presentCount % safeNumTeams
  const smallTeams   = safeNumTeams - bigTeams
  const cupValid     = CUP_VALID_COUNTS.includes(safeNumTeams)

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleOpen() {
    setPresent(new Set(players.map(p => p.id)))
    setNumTeams(2)
    setFormat('round_robin')
    setDayName(
      `${t('newDay')} – ${new Date().toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    )
    setStep('attendance')
    setError(null)
    setOpen(true)
  }

  function handleClose() {
    setOpen(false)
    setError(null)
  }

  function togglePlayer(id: string) {
    setPresent(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleContinueToConfig() {
    setNumTeams(safeNumTeams)
    setStep('config')
  }

  function handleContinueToFormat() {
    setStep('format')
    setError(null)
  }

  async function handleGenerate() {
    if (format === 'cup' && !cupValid) return
    setError(null)
    setLoading(true)
    const supabase = createClient()

    // 1. Create tournament (format stored for queue engine in match arena)
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .insert({
        league_id:    leagueId,
        name:         dayName.trim() || t('newDay'),
        season:       new Date().getFullYear().toString(),
        status:       'active'    as const,
        draft_status: 'completed' as const,
        format:       format,
      })
      .select('id')
      .single()

    if (tErr || !tournament) {
      setError(tErr?.message ?? tCommon('error'))
      setLoading(false)
      return
    }

    // 2. Generate balanced teams from present players only
    const draftPlayers = presentPlayers.map(p => ({
      _id:      p.id,
      name:     p.full_name,
      rating:   p.rating,
      position: p.position as DraftPlayer['position'],
      stamina:  p.stamina  as DraftPlayer['stamina'],
      isGhost:  false as const,
    }))

    const generated = generateTeams(draftPlayers as unknown as DraftPlayer[], safeNumTeams)

    // 3. Insert teams
    const { data: insertedTeams, error: teamsErr } = await supabase
      .from('teams')
      .insert(
        generated.map((_, i) => ({
          league_id:     leagueId,
          tournament_id: tournament.id,
          name:          `Team ${String.fromCharCode(65 + i)}`,
          color:         TEAM_COLORS[i % TEAM_COLORS.length],
        })),
      )
      .select('id')

    if (teamsErr || !insertedTeams) {
      setError(teamsErr?.message ?? tCommon('error'))
      setLoading(false)
      return
    }

    // 4. Insert team_players (non-ghost only)
    const teamPlayerRows = generated.flatMap((team, i) =>
      team.players
        .filter(p => !p.isGhost)
        .map(p => ({
          team_id:       insertedTeams[i].id,
          player_id:     (p as unknown as { _id: string })._id,
          tournament_id: tournament.id,
        })),
    )

    if (teamPlayerRows.length > 0) {
      const { error: tpErr } = await supabase.from('team_players').insert(teamPlayerRows)
      if (tpErr) { setError(tpErr.message); setLoading(false); return }
    }

    // 5. Format-aware match schedule
    const now = new Date().toISOString()
    const matchRows: {
      league_id:     string
      tournament_id: string
      home_team_id:  string
      away_team_id:  string
      status:        'scheduled'
      match_date:    string
    }[] = []

    if (format === 'round_robin') {
      // Full round-robin: every pair plays once
      for (let i = 0; i < insertedTeams.length; i++) {
        for (let j = i + 1; j < insertedTeams.length; j++) {
          matchRows.push({
            league_id:     leagueId,
            tournament_id: tournament.id,
            home_team_id:  insertedTeams[i].id,
            away_team_id:  insertedTeams[j].id,
            status:        'scheduled',
            match_date:    now,
          })
        }
      }
    } else if (format === 'winner_continues') {
      // Shuffle before picking first two so the opening match is random
      const shuffled = [...insertedTeams].sort(() => Math.random() - 0.5)
      matchRows.push({
        league_id:     leagueId,
        tournament_id: tournament.id,
        home_team_id:  shuffled[0].id,
        away_team_id:  shuffled[1].id,
        status:        'scheduled',
        match_date:    now,
      })
    } else if (format === 'cup') {
      // Standard bracket seeding: seed 1 vs N, seed 2 vs N-1, …
      const n = insertedTeams.length
      for (let i = 0; i < Math.floor(n / 2); i++) {
        matchRows.push({
          league_id:     leagueId,
          tournament_id: tournament.id,
          home_team_id:  insertedTeams[i].id,
          away_team_id:  insertedTeams[n - 1 - i].id,
          status:        'scheduled',
          match_date:    now,
        })
      }
    }

    const { error: matchErr } = await supabase.from('matches').insert(matchRows)
    if (matchErr) { setError(matchErr.message); setLoading(false); return }

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  // ── Trigger button ─────────────────────────────────────────────────────────

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="w-full rounded-2xl bg-sky-600 py-5 text-base font-black text-white tracking-wide transition-all active:scale-[0.97] active:bg-sky-700"
      >
        🏆  {t('startNew')}
      </button>
    )
  }

  // ── Attendance step ────────────────────────────────────────────────────────

  if (step === 'attendance') {
    const allSelected  = presentCount === players.length
    const noneSelected = presentCount === 0

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">

        {/* Header */}
        <div className="shrink-0 bg-slate-800 px-4 pb-4 pt-5 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-white">{t('selectPlayers')}</h2>
            <button
              onClick={handleClose}
              aria-label={tCommon('cancel')}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-400 transition-colors hover:bg-slate-700 hover:text-white active:bg-slate-600"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              {tCommon('cancel')}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                onClick={() => setPresent(new Set(players.map(p => p.id)))}
                disabled={allSelected}
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 transition-colors hover:bg-slate-600 disabled:opacity-40"
              >
                {t('selectAll')}
              </button>
              <button
                onClick={() => setPresent(new Set())}
                disabled={noneSelected}
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 transition-colors hover:bg-slate-600 disabled:opacity-40"
              >
                {t('clearAll')}
              </button>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-900/60 px-3 py-1 text-xs font-black text-emerald-300 ring-1 ring-emerald-700/50">
              {t('checkedIn', { count: presentCount })}
            </span>
          </div>
        </div>

        {/* Player grid */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {players.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">
              {t('needMinPlayers', { min: 2 })}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {players.map(p => {
                const isPresent = present.has(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlayer(p.id)}
                    className={`relative flex flex-col gap-2 rounded-2xl p-3.5 text-start transition-all active:scale-95 ${
                      isPresent
                        ? 'bg-slate-700 ring-2 ring-emerald-500'
                        : 'bg-slate-800 opacity-40'
                    }`}
                  >
                    <span
                      className={`absolute end-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-black transition-colors ${
                        isPresent
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-600 text-slate-500'
                      }`}
                    >
                      {isPresent ? '✓' : '○'}
                    </span>

                    <span className="pe-6 text-sm font-bold leading-tight text-white">
                      {p.full_name}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                          POSITION_STYLE[p.position] ?? 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {p.position}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-slate-400">
                        {p.rating}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 space-y-2 border-t border-slate-800 bg-slate-900 px-4 pb-6 pt-4">
          <button
            onClick={handleContinueToConfig}
            disabled={presentCount < 2}
            className="w-full rounded-2xl bg-sky-600 py-5 text-base font-black text-white tracking-wide transition-all active:scale-[0.97] active:bg-sky-700 disabled:opacity-40"
          >
            {t('continueToTeams')}
          </button>

          <button
            onClick={handleClose}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300 active:bg-slate-800"
          >
            {tCommon('cancel')}
          </button>

          {players.length > 0 && (
            <p className="text-center text-xs text-slate-600">
              {t('cancelHint')}
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Config step ─────────────────────────────────────────────────────────────

  if (step === 'config') {
    const breakdown =
      bigTeams === 0
        ? t('teamSizeEven', { teams: safeNumTeams, size: floorSize })
        : t('teamSizeMixed', {
            bigCount:   bigTeams,
            bigSize:    ceilSize,
            smallCount: smallTeams,
            smallSize:  floorSize,
          })

    const internalGhosts = presentCount % safeNumTeams === 0
      ? 0
      : safeNumTeams - (presentCount % safeNumTeams)

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">

        {/* Header */}
        <div className="shrink-0 bg-slate-800 px-4 pb-4 pt-5 shadow-lg">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setStep('attendance'); setError(null) }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-700 hover:text-white"
              aria-label={tCommon('back')}
            >
              <svg
                className="h-5 w-5 rtl:rotate-180"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="flex-1 text-lg font-black text-white">{t('newDay')}</h2>
            <button
              onClick={handleClose}
              aria-label={tCommon('cancel')}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-700 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6">

          {/* Day name */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {t('dayName')}
            </p>
            <input
              type="text"
              value={dayName}
              onChange={e => setDayName(e.target.value)}
              className="w-full rounded-xl bg-slate-700 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Team count */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {t('numTeams')}
            </p>

            <div className="flex items-center justify-between rounded-2xl bg-slate-800 px-6 py-4">
              <button
                onClick={() => setNumTeams(n => Math.max(2, n - 1))}
                disabled={safeNumTeams <= 2}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-700 text-2xl font-black text-white transition-colors active:bg-slate-600 disabled:opacity-30"
              >
                −
              </button>
              <span className="text-5xl font-black tabular-nums text-white">
                {safeNumTeams}
              </span>
              <button
                onClick={() => setNumTeams(n => Math.min(presentCount, n + 1))}
                disabled={safeNumTeams >= presentCount}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-700 text-2xl font-black text-white transition-colors active:bg-slate-600 disabled:opacity-30"
              >
                +
              </button>
            </div>

            <div className="rounded-xl bg-slate-800/70 px-4 py-3 text-center">
              <p className="text-xs font-semibold text-slate-400">
                {t('checkedIn', { count: presentCount })}
              </p>
              <p className="mt-0.5 text-sm font-bold text-emerald-400">
                {breakdown}
              </p>
              {internalGhosts > 0 && (
                <p className="mt-1 text-xs text-amber-500">
                  {t('ghostFillers', { count: internalGhosts })}
                </p>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-800 bg-slate-900 px-4 py-4">
          <button
            onClick={handleContinueToFormat}
            disabled={presentCount < 2}
            className="w-full rounded-2xl bg-sky-600 py-5 text-base font-black text-white tracking-wide transition-all active:scale-[0.97] active:bg-sky-700 disabled:opacity-40"
          >
            {t('continueToFormat')}
          </button>
        </div>
      </div>
    )
  }

  // ── Format step ──────────────────────────────────────────────────────────────

  const formats: { id: Format; icon: string; label: string; desc: string }[] = [
    { id: 'round_robin',      icon: '⚽', label: t('roundRobin'),      desc: t('roundRobinDesc')      },
    { id: 'winner_continues', icon: '👑', label: t('winnerContinues'), desc: t('winnerContinuesDesc') },
    { id: 'cup',              icon: '🏆', label: t('cup'),             desc: t('cupDesc')             },
  ]

  const canGenerate = format !== 'cup' || cupValid

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">

      {/* Header */}
      <div className="shrink-0 bg-slate-800 px-4 pb-4 pt-5 shadow-lg">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setStep('config'); setError(null) }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-700 hover:text-white"
            aria-label={tCommon('back')}
          >
            <svg
              className="h-5 w-5 rtl:rotate-180"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="flex-1 text-lg font-black text-white">{t('formatStep')}</h2>
          <button
            onClick={handleClose}
            aria-label={tCommon('cancel')}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-6">

        {formats.map(f => (
          <button
            key={f.id}
            onClick={() => { setFormat(f.id); setError(null) }}
            className={[
              'w-full rounded-2xl px-5 py-5 text-start transition-all active:scale-[0.98]',
              format === f.id
                ? 'bg-slate-700 ring-2 ring-emerald-500'
                : 'bg-slate-800 hover:bg-slate-700/50',
            ].join(' ')}
          >
            <div className="flex items-start gap-4">
              <span className="text-2xl leading-none">{f.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-black text-white">{f.label}</p>
                  {format === f.id && (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-300">
                      ✓
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{f.desc}</p>
                {f.id === 'cup' && (
                  <p className={`mt-1.5 text-[10px] font-bold ${cupValid ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {t('cupValidCounts')} · {safeNumTeams} {t('numTeams').toLowerCase()}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}

        {format === 'cup' && !cupValid && (
          <p className="rounded-xl bg-amber-900/30 px-4 py-3 text-sm text-amber-300">
            {t('cupTeamError')}
          </p>
        )}

        {error && (
          <p className="rounded-xl bg-red-900/40 px-4 py-3 text-sm text-red-300">{error}</p>
        )}

      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-slate-800 bg-slate-900 px-4 py-4">
        <button
          onClick={handleGenerate}
          disabled={loading || !canGenerate}
          className="w-full rounded-2xl bg-emerald-600 py-5 text-base font-black text-white tracking-wide transition-all active:scale-[0.97] active:bg-emerald-700 disabled:opacity-40"
        >
          {loading ? t('generating') : t('generateMatches')}
        </button>
      </div>
    </div>
  )
}
