'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { generateTeams } from '@/lib/team-generator'
import type { DraftPlayer } from '@/lib/team-generator'
import type { Tables } from '@/types/database'

type Player     = Tables<'players'>
type Tournament = Tables<'tournaments'>
type Match      = Tables<'matches'>
type Step       = 'attendance' | 'method' | 'format' | 'preview'
type Format     = 'round_robin' | 'winner_continues' | 'cup'
type Generation = 'balanced' | 'random' | 'live_draft'

interface Props {
  leagueId:   string
  players:    Player[]
  onCreated?: (tournament: Tournament, matches: Match[]) => void
}

// Football bib colours — first three match the three most common sets (Red, Yellow, Blue).
const BIB_COLORS: { hex: string; label: string }[] = [
  { hex: '#EF4444', label: 'Red'    },
  { hex: '#EAB308', label: 'Yellow' },
  { hex: '#3B82F6', label: 'Blue'   },
  { hex: '#22C55E', label: 'Green'  },
  { hex: '#F5F5F5', label: 'White'  },
  { hex: '#3F3F46', label: 'Black'  },
  { hex: '#F97316', label: 'Orange' },
  { hex: '#EC4899', label: 'Pink'   },
]

const CUP_VALID_COUNTS = [4, 8, 16]

const POSITION_STYLE: Record<string, string> = {
  GK:  'bg-amber-800/70 text-amber-200',
  DEF: 'bg-blue-900/70 text-blue-200',
  MID: 'bg-violet-800/70 text-violet-200',
  FWD: 'bg-emerald-800/70 text-emerald-200',
}

type Slot = { _id: string; isGhost?: boolean }
interface PreviewTeam { players: Slot[]; color: string }

export function StartTournamentButton({ leagueId, players, onCreated }: Props) {
  const t       = useTranslations('tournament')
  const tDraft  = useTranslations('draft')
  const tCommon = useTranslations('common')
  const locale  = useLocale()
  const router  = useRouter()

  const [open,         setOpen]         = useState(false)
  const [step,         setStep]         = useState<Step>('attendance')
  const [present,      setPresent]      = useState<Set<string>>(() => new Set())
  const [numTeams,     setNumTeams]     = useState(2)
  const [format,       setFormat]       = useState<Format>('round_robin')
  const [generation,   setGeneration]   = useState<Generation>('balanced')
  const [dayName,      setDayName]      = useState('')
  const [previewTeams, setPreviewTeams] = useState<PreviewTeam[]>([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // Used in the preview step to look up player data by id
  const playerMap = useMemo(() => new Map(players.map(p => [p.id, p])), [players])

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

  async function handleOpen() {
    setPresent(new Set(players.map(p => p.id)))
    setNumTeams(2)
    setFormat('round_robin')
    setGeneration('balanced')
    setDayName(
      `${t('newDay')} – ${new Date().toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    )
    setStep('attendance')
    setError(null)
    setOpen(true)

    try {
      const supabase = createClient()
      // Match by player_id (not name) so renames don't break the pre-selection.
      // Exclude unlisted requests that haven't been approved yet (player_id is null).
      const { data: signups } = await supabase
        .from('tournament_signups')
        .select('player_id')
        .eq('league_id', leagueId)
        .eq('status', 'active')
        .not('player_id', 'is', null)

      if (signups && signups.length > 0) {
        const signupIds = new Set(signups.map(s => s.player_id!))
        const matched   = players.filter(p => signupIds.has(p.id))
        if (matched.length > 0) setPresent(new Set(matched.map(p => p.id)))
      }
    } catch {
      // fall back to all-selected
    }
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

  function updateTeamColor(index: number, color: string) {
    setPreviewTeams(prev => prev.map((t, i) => i === index ? { ...t, color } : t))
  }

  // ── Step: format → preview ─────────────────────────────────────────────────
  // Runs the team assignment algorithm locally (no DB writes) and advances
  // to the preview step so the manager can adjust colours before committing.

  function handlePreview() {
    if (format === 'cup' && !cupValid) return
    setError(null)

    const defaultColor = (i: number) => BIB_COLORS[i % BIB_COLORS.length].hex

    if (generation === 'live_draft') {
      // Teams are empty until players draft themselves — preview just shows colours.
      setPreviewTeams(
        Array.from({ length: safeNumTeams }, (_, i) => ({ players: [], color: defaultColor(i) })),
      )
      setStep('preview')
      return
    }

    try {
      const draftPlayers = presentPlayers.map(p => ({
        _id:      p.id,
        name:     p.full_name,
        rating:   p.rating,
        position: p.position as DraftPlayer['position'],
        stamina:  p.stamina  as DraftPlayer['stamina'],
        isGhost:  false as const,
      }))

      let generated: { players: Slot[] }[]

      if (generation === 'random') {
        const pool: Slot[] = draftPlayers.map(p => ({ _id: p._id }))
        while (pool.length % safeNumTeams !== 0) pool.push({ _id: '', isGhost: true })
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[pool[i], pool[j]] = [pool[j], pool[i]]
        }
        const perTeam = pool.length / safeNumTeams
        generated = Array.from({ length: safeNumTeams }, (_, i) => ({
          players: pool.slice(i * perTeam, (i + 1) * perTeam),
        }))
      } else {
        generated = generateTeams(
          draftPlayers as unknown as DraftPlayer[],
          safeNumTeams,
        ) as unknown as { players: Slot[] }[]
      }

      setPreviewTeams(generated.map((team, i) => ({ players: team.players, color: defaultColor(i) })))
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon('error'))
    }
  }

  // ── Step: preview → DB ─────────────────────────────────────────────────────
  // Takes the preview state (team assignments + selected colours) and persists
  // everything to Supabase in one coordinated sequence.

  async function handleSave() {
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()

      // ── Path A: Live Draft ────────────────────────────────────────────────
      if (generation === 'live_draft') {
        const { data: tournament, error: tErr } = await supabase
          .from('tournaments')
          .insert({
            league_id:    leagueId,
            name:         dayName.trim() || t('newDay'),
            season:       new Date().getFullYear().toString(),
            status:       'active'  as const,
            draft_status: 'pending' as const,
            format,
          })
          .select('id')
          .single()

        if (tErr || !tournament) throw new Error(tErr?.message ?? tCommon('error'))

        const { error: teamsErr } = await supabase
          .from('teams')
          .insert(
            previewTeams.map((team, i) => ({
              league_id:     leagueId,
              tournament_id: tournament.id,
              name:          `Team ${String.fromCharCode(65 + i)}`,
              color:         team.color,
            })),
          )
        if (teamsErr) throw new Error(teamsErr.message)

        setOpen(false)
        setLoading(false)
        router.push(`/${locale}/draft/${tournament.id}`)
        return
      }

      // ── Path B: Balanced or Pure Random ───────────────────────────────────

      console.info('[StartTournamentButton] Step 1: inserting tournament', { format, generation })
      const { data: tournament, error: tErr } = await supabase
        .from('tournaments')
        .insert({
          league_id:    leagueId,
          name:         dayName.trim() || t('newDay'),
          season:       new Date().getFullYear().toString(),
          status:       'active'    as const,
          draft_status: 'completed' as const,
          format,
        })
        .select('*')
        .single()

      if (tErr || !tournament) {
        console.error('[StartTournamentButton] Step 1 FAILED', tErr)
        throw new Error(tErr?.message ?? tCommon('error'))
      }
      console.info('[StartTournamentButton] Step 1 OK – tournament', tournament.id)

      // 2. Insert teams with manager-selected colours
      console.info('[StartTournamentButton] Step 2: inserting', previewTeams.length, 'teams')
      const { data: insertedTeams, error: teamsErr } = await supabase
        .from('teams')
        .insert(
          previewTeams.map((team, i) => ({
            league_id:     leagueId,
            tournament_id: tournament.id,
            name:          `Team ${String.fromCharCode(65 + i)}`,
            color:         team.color,
          })),
        )
        .select('id')

      if (teamsErr || !insertedTeams) {
        console.error('[StartTournamentButton] Step 2 FAILED', teamsErr)
        throw new Error(teamsErr?.message ?? tCommon('error'))
      }
      if (insertedTeams.length < previewTeams.length) {
        throw new Error(`Team creation incomplete (${insertedTeams.length}/${previewTeams.length})`)
      }
      console.info('[StartTournamentButton] Step 2 OK – teams', insertedTeams.map(t => t.id))

      // 3. Insert team_players (non-ghost only)
      const teamPlayerRows = previewTeams.flatMap((team, i) =>
        team.players
          .filter(p => !p.isGhost)
          .map(p => ({
            team_id:       insertedTeams[i].id,
            player_id:     p._id,
            tournament_id: tournament.id,
          })),
      )

      if (teamPlayerRows.length > 0) {
        const { error: tpErr } = await supabase.from('team_players').insert(teamPlayerRows)
        if (tpErr) throw new Error(tpErr.message)
      }

      // 4. Format-aware match schedule
      const now = new Date().toISOString()
      const matchRows: {
        league_id:     string
        tournament_id: string
        home_team_id:  string
        away_team_id:  string
        status:        'scheduled'
        match_date:    string
      }[] = []
      let wcInitialQueue: string[] = []

      if (format === 'round_robin') {
        for (let i = 0; i < insertedTeams.length; i++) {
          for (let j = i + 1; j < insertedTeams.length; j++) {
            matchRows.push({
              league_id: leagueId, tournament_id: tournament.id,
              home_team_id: insertedTeams[i].id, away_team_id: insertedTeams[j].id,
              status: 'scheduled', match_date: now,
            })
          }
        }
      } else if (format === 'winner_continues') {
        const shuffled = [...insertedTeams].sort(() => Math.random() - 0.5)
        matchRows.push({
          league_id: leagueId, tournament_id: tournament.id,
          home_team_id: shuffled[0].id, away_team_id: shuffled[1].id,
          status: 'scheduled', match_date: now,
        })
        wcInitialQueue = shuffled.slice(2).map(t => t.id)
      } else if (format === 'cup') {
        const n = insertedTeams.length
        for (let i = 0; i < Math.floor(n / 2); i++) {
          matchRows.push({
            league_id: leagueId, tournament_id: tournament.id,
            home_team_id: insertedTeams[i].id, away_team_id: insertedTeams[n - 1 - i].id,
            status: 'scheduled', match_date: now,
          })
        }
      }

      let insertedMatches: Match[] = []
      if (matchRows.length > 0) {
        console.info('[StartTournamentButton] Step 4: inserting', matchRows.length, 'match(es) for format', format)
        const { data: mData, error: matchErr } = await supabase
          .from('matches')
          .insert(matchRows)
          .select('*')
        if (matchErr) {
          console.error('[StartTournamentButton] Step 4 FAILED', matchErr)
          throw new Error(matchErr.message)
        }
        insertedMatches = mData ?? []
        console.info('[StartTournamentButton] Step 4 OK – matches', insertedMatches.map(m => m.id))
      }

      if (format === 'winner_continues') {
        console.info('[StartTournamentButton] Step 4b: persisting wc_queue', wcInitialQueue)
        const { error: queueErr } = await supabase
          .from('tournaments')
          .update({ wc_queue: wcInitialQueue })
          .eq('id', tournament.id)
        if (queueErr) {
          console.error('[StartTournamentButton] Step 4b FAILED', queueErr)
          throw new Error(queueErr.message)
        }
      }

      setOpen(false)
      setLoading(false)
      onCreated?.(tournament, insertedMatches)
      router.refresh()

    } catch (err) {
      console.error('[StartTournamentButton] handleSave failed:', err)
      setError(err instanceof Error ? err.message : tCommon('error'))
      setLoading(false)
    }
  }

  // ── Trigger button ─────────────────────────────────────────────────────────

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="w-full rounded-lg bg-emerald-600 py-5 text-base font-black text-white tracking-wide transition-all active:scale-[0.97] active:bg-emerald-700"
      >
        🏆  {t('startNew')}
      </button>
    )
  }

  // ── Step 1: Attendance ─────────────────────────────────────────────────────

  if (step === 'attendance') {
    const allSelected  = presentCount === players.length
    const noneSelected = presentCount === 0

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">

        {/* Header */}
        <div className="shrink-0 bg-zinc-900 px-4 pb-4 pt-5 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-white">{t('selectPlayers')}</h2>
            <button
              onClick={handleClose}
              aria-label={tCommon('cancel')}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:bg-zinc-700"
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
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-40"
              >
                {t('selectAll')}
              </button>
              <button
                onClick={() => setPresent(new Set())}
                disabled={noneSelected}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-40"
              >
                {t('clearAll')}
              </button>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-950/40 px-3 py-1 text-xs font-black text-emerald-300 ring-1 ring-emerald-700/50">
              {t('checkedIn', { count: presentCount })}
            </span>
          </div>
        </div>

        {/* Player grid */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {players.length === 0 ? (
            <p className="py-16 text-center text-sm text-zinc-500">
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
                    className={`relative flex flex-col gap-2 rounded-xl p-3.5 text-start transition-all active:scale-95 ${
                      isPresent ? 'bg-zinc-800 ring-2 ring-emerald-500' : 'bg-zinc-900 opacity-40'
                    }`}
                  >
                    <span
                      className={`absolute end-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-black transition-colors ${
                        isPresent ? 'bg-emerald-500 text-white' : 'bg-zinc-700 text-zinc-500'
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
                          POSITION_STYLE[p.position] ?? 'bg-zinc-800 text-zinc-300'
                        }`}
                      >
                        {p.position}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-zinc-400">
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
        <div className="shrink-0 space-y-2 border-t border-zinc-800 bg-zinc-950 px-4 pb-6 pt-4">
          <button
            onClick={() => { setNumTeams(safeNumTeams); setStep('method') }}
            disabled={presentCount < 2}
            className="w-full rounded-lg bg-emerald-600 py-5 text-base font-black text-white tracking-wide transition-all active:scale-[0.97] active:bg-emerald-700 disabled:opacity-40"
          >
            {t('continueToTeams')}
          </button>

          <button
            onClick={handleClose}
            className="w-full rounded-xl py-3.5 text-sm font-semibold text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300 active:bg-zinc-900"
          >
            {tCommon('cancel')}
          </button>

          {players.length > 0 && (
            <p className="text-center text-xs text-zinc-600">{t('cancelHint')}</p>
          )}
        </div>
      </div>
    )
  }

  // ── Step 2: Method (day name + team count + generation method) ──────────────

  if (step === 'method') {
    const breakdown =
      bigTeams === 0
        ? t('teamSizeEven', { teams: safeNumTeams, size: floorSize })
        : t('teamSizeMixed', { bigCount: bigTeams, bigSize: ceilSize, smallCount: smallTeams, smallSize: floorSize })

    const internalGhosts = presentCount % safeNumTeams === 0
      ? 0
      : safeNumTeams - (presentCount % safeNumTeams)

    const generationOptions: { id: Generation; icon: string; label: string; desc: string }[] = [
      { id: 'balanced',   icon: '⚖️', label: t('modeBalanced'),      desc: t('modeBalancedDesc')      },
      { id: 'random',     icon: '🎲', label: t('modeRandom'),        desc: t('modeRandomDesc')        },
      { id: 'live_draft', icon: '🎯', label: t('modeChoosingRink'),  desc: t('modeChoosingRinkDesc')  },
    ]

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">

        {/* Header */}
        <div className="shrink-0 bg-zinc-900 px-4 pb-4 pt-5 shadow-lg">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setStep('attendance'); setError(null) }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white"
              aria-label={tCommon('back')}
            >
              <svg className="h-5 w-5 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="flex-1 text-lg font-black text-white">{t('newDay')}</h2>
            <button onClick={handleClose} aria-label={tCommon('cancel')} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6">

          {/* Day name */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">{t('dayName')}</p>
            <input
              type="text"
              value={dayName}
              onChange={e => setDayName(e.target.value)}
              className="w-full rounded-xl bg-zinc-800 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Team count */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">{t('numTeams')}</p>

            <div className="flex items-center justify-between rounded-xl bg-zinc-900 px-6 py-4">
              <button
                onClick={() => setNumTeams(n => Math.max(2, n - 1))}
                disabled={safeNumTeams <= 2}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800 text-2xl font-black text-white transition-colors active:bg-zinc-700 disabled:opacity-30"
              >
                −
              </button>
              <span className="text-5xl font-black tabular-nums text-white">{safeNumTeams}</span>
              <button
                onClick={() => setNumTeams(n => Math.min(presentCount, n + 1))}
                disabled={safeNumTeams >= presentCount}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800 text-2xl font-black text-white transition-colors active:bg-zinc-700 disabled:opacity-30"
              >
                +
              </button>
            </div>

            <div className="rounded-xl bg-zinc-900/70 px-4 py-3 text-center">
              <p className="text-xs font-semibold text-zinc-400">{t('checkedIn', { count: presentCount })}</p>
              <p className="mt-0.5 text-sm font-bold text-emerald-400">{breakdown}</p>
              {internalGhosts > 0 && (
                <p className="mt-1 text-xs text-amber-500">{t('ghostFillers', { count: internalGhosts })}</p>
              )}
            </div>
          </div>

          {/* Generation method */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">{t('balancingLabel')}</p>
            {generationOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setGeneration(opt.id)}
                className={[
                  'w-full rounded-xl px-5 py-4 text-start transition-all active:scale-[0.98]',
                  generation === opt.id
                    ? 'bg-zinc-800 ring-2 ring-emerald-500'
                    : 'bg-zinc-900 hover:bg-zinc-800/50',
                ].join(' ')}
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl leading-none">{opt.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-white">{opt.label}</p>
                      {generation === opt.id && (
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-300">✓</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">{opt.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 py-4">
          <button
            onClick={() => { setStep('format'); setError(null) }}
            disabled={presentCount < 2}
            className="w-full rounded-lg bg-emerald-600 py-5 text-base font-black text-white tracking-wide transition-all active:scale-[0.97] active:bg-emerald-700 disabled:opacity-40"
          >
            {t('continueToFormat')}
          </button>
        </div>
      </div>
    )
  }

  // ── Step 3: Format ─────────────────────────────────────────────────────────

  if (step === 'format') {
    const formats: { id: Format; icon: string; label: string; desc: string }[] = [
      { id: 'round_robin',      icon: '⚽', label: t('roundRobin'),      desc: t('roundRobinDesc')      },
      { id: 'winner_continues', icon: '👑', label: t('winnerContinues'), desc: t('winnerContinuesDesc') },
      { id: 'cup',              icon: '🏆', label: t('cup'),             desc: t('cupDesc')             },
    ]

    const canGenerate = format !== 'cup' || cupValid
    const isLiveDraft = generation === 'live_draft'

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">

        {/* Header */}
        <div className="shrink-0 bg-zinc-900 px-4 pb-4 pt-5 shadow-lg">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setStep('method'); setError(null) }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white"
              aria-label={tCommon('back')}
            >
              <svg className="h-5 w-5 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="flex-1 text-lg font-black text-white">{t('formatStep')}</h2>
            <button onClick={handleClose} aria-label={tCommon('cancel')} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white">
              ✕
            </button>
          </div>
          {isLiveDraft && (
            <p className="mt-2 text-xs text-zinc-400">{t('modeChoosingRink')} · {t('formatHintLiveDraft')}</p>
          )}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-6">
          {formats.map(f => (
            <button
              key={f.id}
              onClick={() => { setFormat(f.id); setError(null) }}
              className={[
                'w-full rounded-xl px-5 py-5 text-start transition-all active:scale-[0.98]',
                format === f.id
                  ? 'bg-zinc-800 ring-2 ring-emerald-500'
                  : 'bg-zinc-900 hover:bg-zinc-800/50',
              ].join(' ')}
            >
              <div className="flex items-start gap-4">
                <span className="text-2xl leading-none">{f.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-white">{f.label}</p>
                    {format === f.id && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-300">✓</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">{f.desc}</p>
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

        {/* Footer — advances to the preview step (no DB writes yet) */}
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 py-4">
          <button
            onClick={handlePreview}
            disabled={!canGenerate}
            className="w-full rounded-lg bg-emerald-600 py-5 text-base font-black text-white tracking-wide transition-all active:scale-[0.97] active:bg-emerald-700 disabled:opacity-40"
          >
            {isLiveDraft ? tDraft('startDraft') : t('generateMatches')}
          </button>
        </div>
      </div>
    )
  }

  // ── Step 4: Preview — review teams + pick colours ──────────────────────────

  const isLiveDraft = generation === 'live_draft'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">

      {/* Header */}
      <div className="shrink-0 bg-zinc-900 px-4 pb-4 pt-5 shadow-lg">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setStep('format'); setError(null) }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white"
            aria-label={tCommon('back')}
          >
            <svg className="h-5 w-5 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="flex-1 text-lg font-black text-white">{t('reviewTeams')}</h2>
          <button onClick={handleClose} aria-label={tCommon('cancel')} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white">
            ✕
          </button>
        </div>
      </div>

      {/* Team cards */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
        {previewTeams.map((team, i) => {
          const realPlayers = team.players.filter(s => !s.isGhost)
          return (
            <div key={i} className="rounded-xl bg-zinc-900 overflow-hidden">

              {/* Team header: colour dot + name + colour selector */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
                <div
                  className="h-6 w-6 shrink-0 rounded-full border-2 border-zinc-600"
                  style={{ backgroundColor: team.color }}
                />
                <span className="flex-1 font-black text-white">
                  Team {String.fromCharCode(65 + i)}
                </span>
                <select
                  value={team.color}
                  onChange={e => updateTeamColor(i, e.target.value)}
                  className="rounded-lg bg-zinc-800 px-2 py-1.5 text-xs font-bold text-white outline-none focus:ring-2 focus:ring-emerald-500 [color-scheme:dark]"
                >
                  {BIB_COLORS.map(c => (
                    <option key={c.hex} value={c.hex}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Player list (balanced/random) */}
              {!isLiveDraft && realPlayers.length > 0 && (
                <div className="divide-y divide-zinc-800/60">
                  {realPlayers.map(slot => {
                    const p = playerMap.get(slot._id)
                    if (!p) return null
                    return (
                      <div key={slot._id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-5 shrink-0 text-center text-xs font-black tabular-nums text-emerald-500">
                          {p.rating}
                        </span>
                        <span className="flex-1 text-sm font-semibold text-white">{p.full_name}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                            POSITION_STYLE[p.position] ?? 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          {p.position}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Live draft: no player list */}
              {isLiveDraft && (
                <p className="px-4 py-3 text-xs text-zinc-500 italic">
                  {tDraft('title')} — {tDraft('openDraftRoom')}
                </p>
              )}
            </div>
          )
        })}

        {error && (
          <p className="rounded-xl bg-red-900/40 px-4 py-3 text-sm text-red-300">{error}</p>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 py-4">
        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full rounded-lg bg-emerald-600 py-5 text-base font-black text-white tracking-wide transition-all active:scale-[0.97] active:bg-emerald-700 disabled:opacity-40"
        >
          {loading
            ? t('generating')
            : isLiveDraft
            ? tDraft('startDraft')
            : t('confirmAndStart')}
        </button>
      </div>
    </div>
  )
}
