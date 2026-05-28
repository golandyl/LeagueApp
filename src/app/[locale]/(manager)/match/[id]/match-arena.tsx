'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Tables, Enums, TablesInsert } from '@/types/database'
import { LiveTimer }    from '@/components/match/LiveTimer'
import { Scoreboard }   from '@/components/match/Scoreboard'
import { GoalModal, type GoalSelection } from '@/components/match/GoalModal'
import { EndMatchModal, type EndReason, type EndDecision } from '@/components/match/EndMatchModal'

type Match       = Tables<'matches'>
type League      = Tables<'leagues'>
type Team        = Tables<'teams'>
type Player      = Tables<'players'>
type Phase       = 'regulation' | 'overtime' | 'penalties'
type MatchStatus = 'pre' | 'live' | 'ended'

interface RecordedGoal {
  localId:       string
  scoringTeamId: string
  scorerId:      string | null
  assistId:      string | null
  minute:        number
  isOwnGoal:     boolean
}

// ── localStorage persistence ──────────────────────────────────────────────────

const MAX_RECOVERY_AGE_MS = 8 * 60 * 60 * 1000

interface SavedState {
  matchId:        string
  matchStatus:    MatchStatus
  phase:          Phase
  secondsElapsed: number
  timerRunning:   boolean
  homeScore:      number
  awayScore:      number
  goals:          RecordedGoal[]
  endReason:      EndReason | null
  savedAt:        number
}

function storageKey(id: string) { return `match_arena:${id}` }

function readSaved(matchId: string): (SavedState & { driftSeconds: number }) | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey(matchId))
    if (!raw) return null
    const s = JSON.parse(raw) as SavedState
    if (s.matchId !== matchId)    return null
    if (s.matchStatus !== 'live') return null
    if (Date.now() - s.savedAt > MAX_RECOVERY_AGE_MS) return null
    const driftSeconds = s.timerRunning
      ? Math.max(0, Math.floor((Date.now() - s.savedAt) / 1000))
      : 0
    return { ...s, driftSeconds }
  } catch { return null }
}

function writeSaved(s: SavedState) {
  try { localStorage.setItem(storageKey(s.matchId), JSON.stringify(s)) } catch {}
}

function clearSaved(matchId: string) {
  try { localStorage.removeItem(storageKey(matchId)) } catch {}
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  match:            Match
  league:           League
  homeTeam:         Team
  awayTeam:         Team
  homePlayers:      Player[]
  awayPlayers:      Player[]
  tournamentFormat: string
  isManager:        boolean
}

export function MatchArena({
  match, league, homeTeam, awayTeam, homePlayers, awayPlayers, tournamentFormat, isManager,
}: Props) {
  const t        = useTranslations('match')
  const supabase = createClient()

  const isWinnerContinues = tournamentFormat === 'winner_continues'

  const [recovered] = useState(() => readSaved(match.id))
  const wasRecovered = recovered !== null

  const [matchStatus, setMatchStatus] = useState<MatchStatus>(
    recovered?.matchStatus ?? (match.status === 'completed' ? 'ended' : 'pre'),
  )
  const [phase, setPhase] = useState<Phase>(recovered?.phase ?? 'regulation')

  const [secondsElapsed, setSecondsElapsed] = useState(
    recovered ? recovered.secondsElapsed + recovered.driftSeconds : 0,
  )
  const [timerRunning, setTimerRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const timeLimit =
    phase === 'regulation'
      ? league.match_length_minutes * 60
      : league.overtime_length_minutes * 60

  const isStoppageTime =
    matchStatus === 'live' &&
    phase       !== 'penalties' &&
    secondsElapsed >= timeLimit

  const [homeScore, setHomeScore] = useState(recovered?.homeScore ?? match.home_score ?? 0)
  const [awayScore, setAwayScore] = useState(recovered?.awayScore ?? match.away_score ?? 0)
  const [goals,     setGoals]     = useState<RecordedGoal[]>(recovered?.goals ?? [])
  const [finalVC,   setFinalVC]   = useState<Enums<'victory_condition'> | null>(
    match.status === 'completed' ? match.victory_condition : null,
  )

  const [showGoalModal,      setShowGoalModal]      = useState(false)
  const [endReason,          setEndReason]          = useState<EndReason | null>(recovered?.endReason ?? null)
  const [saving,             setSaving]             = useState(false)
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(wasRecovered)

  // Winner Continues queue state
  const [nextMatchId, setNextMatchId] = useState<string | null>(null)
  const [wcLoading,   setWcLoading]   = useState(false)

  useEffect(() => {
    if (!showRecoveryBanner) return
    const timer = setTimeout(() => setShowRecoveryBanner(false), 6000)
    return () => clearTimeout(timer)
  }, [showRecoveryBanner])

  useEffect(() => {
    if (matchStatus !== 'live') return
    writeSaved({
      matchId: match.id, matchStatus, phase, secondsElapsed,
      timerRunning, homeScore, awayScore, goals, endReason, savedAt: Date.now(),
    })
  }, [matchStatus, phase, secondsElapsed, timerRunning, homeScore, awayScore, goals, endReason, match.id])

  const stopInterval = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
  }, [])

  const pauseTimer = useCallback(() => {
    stopInterval(); setTimerRunning(false)
  }, [stopInterval])

  const startTimer = useCallback(() => {
    stopInterval(); setTimerRunning(true)
    intervalRef.current = setInterval(() => setSecondsElapsed(s => s + 1), 1000)
  }, [stopInterval])

  const toggleTimer = useCallback(() => {
    if (timerRunning) pauseTimer(); else startTimer()
  }, [timerRunning, pauseTimer, startTimer])

  useEffect(() => () => stopInterval(), [stopInterval])

  async function handleKickOff() {
    await supabase
      .from('matches')
      .update({ status: 'live', played_at: new Date().toISOString() })
      .eq('id', match.id)
    setMatchStatus('live')
    startTimer()
  }

  function currentMinute(): number {
    const phaseMinute = Math.max(1, Math.ceil(secondsElapsed / 60))
    return phase === 'overtime'
      ? league.match_length_minutes + phaseMinute
      : phaseMinute
  }

  function handleGoalConfirm(sel: GoalSelection) {
    setShowGoalModal(false)

    const isHome   = sel.scoringTeamId === homeTeam.id
    const nextHome = isHome ? homeScore + 1 : homeScore
    const nextAway = isHome ? awayScore     : awayScore + 1

    setHomeScore(nextHome)
    setAwayScore(nextAway)
    setGoals(prev => [...prev, {
      localId:       crypto.randomUUID(),
      scoringTeamId: sel.scoringTeamId,
      scorerId:      sel.scorerId,
      assistId:      sel.assistId,
      minute:        currentMinute(),
      isOwnGoal:     sel.isOwnGoal,
    }])

    // Auto-end checks only apply when the manager is present to confirm the result.
    // Anonymous scorekeepers can record goals freely; the manager ends the match.
    if (isManager) {
      if (league.win_score !== null) {
        const winner =
          nextHome >= league.win_score ? 'home' :
          nextAway >= league.win_score ? 'away' : null
        if (winner) {
          pauseTimer()
          setEndReason({ kind: 'win_score', winner, phase: phase as 'regulation' | 'overtime' })
          return
        }
      }

      if (phase === 'overtime' && league.overtime_type === 'GOLDEN_GOAL' && nextHome !== nextAway) {
        const winner = nextHome > nextAway ? 'home' : 'away'
        pauseTimer()
        setEndReason({ kind: 'win_score', winner, phase: 'overtime' })
      }
    }
  }

  function handleWhistle() {
    pauseTimer()
    setEndReason({ kind: 'time_up', phase: phase as 'regulation' | 'overtime' })
  }

  // ── Winner Continues queue engine ─────────────────────────────────────────────
  // Queries all teams in the tournament, ranks non-winner teams by their most
  // recent played_at (NULLS FIRST = hasn't played yet gets priority), then
  // inserts a new scheduled match: winner vs top-of-queue.
  async function createNextWCMatch(winnerId: string): Promise<string | null> {
    const [{ data: allTeams }, { data: completedMatches }] = await Promise.all([
      supabase
        .from('teams')
        .select('id')
        .eq('tournament_id', match.tournament_id),
      supabase
        .from('matches')
        .select('home_team_id, away_team_id, played_at')
        .eq('tournament_id', match.tournament_id)
        .eq('status', 'completed'),
    ])

    if (!allTeams || allTeams.length < 2) return null

    // Build most-recent played_at per team from completed match history
    const lastPlayedMap = new Map<string, string | null>()
    for (const team of allTeams) lastPlayedMap.set(team.id, null)
    for (const m of completedMatches ?? []) {
      if (!m.played_at) continue
      const hPrev = lastPlayedMap.get(m.home_team_id)
      if (!hPrev || m.played_at > hPrev) lastPlayedMap.set(m.home_team_id, m.played_at)
      const aPrev = lastPlayedMap.get(m.away_team_id)
      if (!aPrev || m.played_at > aPrev) lastPlayedMap.set(m.away_team_id, m.played_at)
    }

    // Sort: null (never played) first, then ascending by last played timestamp
    const queue = allTeams
      .filter(t => t.id !== winnerId)
      .sort((a, b) => {
        const pa = lastPlayedMap.get(a.id)
        const pb = lastPlayedMap.get(b.id)
        if (!pa && !pb) return 0
        if (!pa) return -1
        if (!pb) return 1
        return pa < pb ? -1 : 1
      })

    const nextOpponent = queue[0]
    if (!nextOpponent) return null

    const { data: newMatch } = await supabase
      .from('matches')
      .insert({
        league_id:     match.league_id,
        tournament_id: match.tournament_id,
        home_team_id:  winnerId,
        away_team_id:  nextOpponent.id,
        status:        'scheduled',
        match_date:    new Date().toISOString(),
      })
      .select('id')
      .single()

    return newMatch?.id ?? null
  }

  // ── End match decisions ────────────────────────────────────────────────────────
  async function handleEndDecision(decision: EndDecision) {
    if (decision === 'enter_ot') {
      const overRunSeconds = Math.max(0, secondsElapsed - league.match_length_minutes * 60)
      setPhase('overtime')
      setSecondsElapsed(overRunSeconds)
      setEndReason(null)
      startTimer()
      return
    }

    if (decision === 'enter_penalties') {
      setPhase('penalties')
      setEndReason({ kind: 'penalties' })
      return
    }

    let vc: Enums<'victory_condition'> = 'REGULAR'
    let finalHome = homeScore
    let finalAway = awayScore

    if (decision === 'end_ot') {
      vc = 'OVERTIME'
    } else if (decision === 'penalties_home') {
      vc = 'PENALTIES'; finalHome = homeScore + 1
    } else if (decision === 'penalties_away') {
      vc = 'PENALTIES'; finalAway = awayScore + 1
    }
    // end_regular, end_draw, wc_keep_home, wc_keep_away → vc stays REGULAR

    // Determine Winner Continues winner for queue advancement
    let wcWinnerId: string | null = null
    if (isWinnerContinues) {
      if (decision === 'wc_keep_home' || decision === 'penalties_home') {
        wcWinnerId = homeTeam.id
      } else if (decision === 'wc_keep_away' || decision === 'penalties_away') {
        wcWinnerId = awayTeam.id
      } else if (finalHome > finalAway) {
        wcWinnerId = homeTeam.id
      } else if (finalAway > finalHome) {
        wcWinnerId = awayTeam.id
      }
      // Pure draw that slipped through (shouldn't happen in WC mode since
      // EndMatchModal replaces "End as Draw" with team buttons)
    }

    setSaving(true)
    try {
      await persistMatch(vc, finalHome, finalAway)
      clearSaved(match.id)
      setFinalVC(vc)
      setMatchStatus('ended')
    } finally {
      setSaving(false)
    }

    // After the match is persisted and FinalScreen is showing, build next WC match
    if (wcWinnerId) {
      setWcLoading(true)
      try {
        const nextId = await createNextWCMatch(wcWinnerId)
        setNextMatchId(nextId)
      } finally {
        setWcLoading(false)
      }
    }
  }

  async function persistMatch(
    victoryCondition: Enums<'victory_condition'>,
    finalHome: number,
    finalAway: number,
  ) {
    await supabase.from('matches').update({
      status:            'completed',
      home_score:        finalHome,
      away_score:        finalAway,
      victory_condition: victoryCondition,
    }).eq('id', match.id)

    const events: TablesInsert<'match_events'>[] = goals.flatMap(goal => {
      const rows: TablesInsert<'match_events'>[] = [{
        match_id:    match.id,
        event_type:  'goal',
        team_id:     goal.scoringTeamId,
        player_id:   goal.scorerId,
        minute:      goal.minute,
        description: goal.isOwnGoal ? 'own_goal' : null,
      }]
      if (goal.assistId) {
        rows.push({
          match_id:   match.id,
          event_type: 'assist',
          team_id:    goal.scoringTeamId,
          player_id:  goal.assistId,
          minute:     goal.minute,
        })
      }
      return rows
    })

    if (events.length > 0) {
      await supabase.from('match_events').insert(events)
    }
  }

  // ── Screens ───────────────────────────────────────────────────────────────────

  if (matchStatus === 'pre') {
    return (
      <PreMatch homeTeam={homeTeam} awayTeam={awayTeam} league={league} onKickOff={handleKickOff} />
    )
  }

  if (matchStatus === 'ended') {
    return (
      <FinalScreen
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        homeScore={homeScore}
        awayScore={awayScore}
        goals={goals}
        homePlayers={homePlayers}
        awayPlayers={awayPlayers}
        victoryCondition={finalVC}
        nextMatchId={nextMatchId}
        wcLoading={wcLoading}
      />
    )
  }

  // ── Live match ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-dvh flex-col bg-slate-900 px-4 pt-4 pb-10 gap-5">

      {showRecoveryBanner && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-700 bg-sky-900/50 px-4 py-3">
          <p className="text-sm font-semibold leading-snug text-sky-300">
            ⚡ {t('recovered')}
          </p>
          <button
            onClick={() => setShowRecoveryBanner(false)}
            className="shrink-0 rounded-full p-1 text-sky-500 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      <Scoreboard
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        homeScore={homeScore}
        awayScore={awayScore}
      />

      <LiveTimer
        seconds={secondsElapsed}
        phase={phase === 'penalties' ? 'overtime' : phase}
        running={timerRunning}
        isStoppageTime={isStoppageTime}
        onToggle={toggleTimer}
        onWhistle={isManager ? handleWhistle : undefined}
      />

      <button
        onClick={() => setShowGoalModal(true)}
        className="w-full rounded-2xl bg-emerald-600 py-7 text-2xl font-black uppercase tracking-widest text-white transition-all active:scale-[0.97] active:bg-emerald-700"
      >
        ⚽  {t('goalScored')}
      </button>

      {goals.length > 0 && (
        <GoalLog
          goals={goals}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
        />
      )}

      {showGoalModal && (
        <GoalModal
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
          onConfirm={handleGoalConfirm}
          onClose={() => setShowGoalModal(false)}
        />
      )}

      {endReason && isManager && (
        <EndMatchModal
          reason={endReason}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeScore={homeScore}
          awayScore={awayScore}
          league={league}
          saving={saving}
          onDecision={handleEndDecision}
          winnerContinuesMode={isWinnerContinues}
        />
      )}
    </div>
  )
}

// ── Sub-views ─────────────────────────────────────────────────────────────────

function PreMatch({
  homeTeam, awayTeam, league, onKickOff,
}: {
  homeTeam:  Team
  awayTeam:  Team
  league:    League
  onKickOff: () => void
}) {
  const t = useTranslations('match')

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-slate-900 px-5">
      <div className="flex w-full items-center justify-between gap-3">
        <TeamPill team={homeTeam} />
        <span className="shrink-0 text-3xl font-black text-slate-500">{t('vs')}</span>
        <TeamPill team={awayTeam} />
      </div>

      <div className="flex w-full flex-col gap-2 rounded-2xl bg-slate-800 p-4 text-sm text-slate-400">
        <Row label={t('duration')}   value={`${league.match_length_minutes} min`} />
        {league.win_score !== null && (
          <Row label={t('winScoreLabel')} value={t('firstToGoals', { n: league.win_score })} />
        )}
        <Row label={t('extraTimeLabel')} value={league.overtime_enabled ? `${league.overtime_length_minutes} min` : t('off')} />
        {league.overtime_enabled && (
          <Row
            label={t('otMode')}
            value={league.overtime_type === 'GOLDEN_GOAL' ? t('goldenGoal') : t('classic')}
          />
        )}
        <Row label={t('penalties')}  value={league.penalties_enabled ? t('enabled') : t('off')} />
      </div>

      <button
        onClick={onKickOff}
        className="w-full rounded-2xl bg-emerald-600 py-7 text-3xl font-black text-white transition-all active:scale-[0.97] active:bg-emerald-700"
      >
        ⚽  {t('kickOff')}
      </button>
    </div>
  )
}

function FinalScreen({
  homeTeam, awayTeam, homeScore, awayScore, goals,
  homePlayers, awayPlayers, victoryCondition,
  nextMatchId, wcLoading,
}: {
  homeTeam:         Team
  awayTeam:         Team
  homeScore:        number
  awayScore:        number
  goals:            RecordedGoal[]
  homePlayers:      Player[]
  awayPlayers:      Player[]
  victoryCondition: Enums<'victory_condition'> | null
  nextMatchId:      string | null
  wcLoading:        boolean
}) {
  const t = useTranslations('match')

  const vcLabel =
    victoryCondition === 'OVERTIME'  ? t('afterExtraTime')  :
    victoryCondition === 'PENALTIES' ? t('wonOnPenalties')  : null

  return (
    <div className="flex min-h-dvh flex-col bg-slate-900 px-4 py-8 gap-6">
      <h1 className="text-center text-2xl font-black text-white">{t('fullTime')}</h1>

      <div className="flex items-center justify-center gap-6">
        <TeamPill team={homeTeam} />
        <div className="flex items-center gap-3">
          <span className="text-6xl font-black tabular-nums text-white">{homeScore}</span>
          <span className="text-4xl text-slate-600">–</span>
          <span className="text-6xl font-black tabular-nums text-white">{awayScore}</span>
        </div>
        <TeamPill team={awayTeam} />
      </div>

      {vcLabel && (
        <p className="text-center text-sm font-semibold text-amber-400">{vcLabel}</p>
      )}

      {/* Winner Continues — next match CTA */}
      {(wcLoading || nextMatchId) && (
        <div className="rounded-2xl bg-slate-800 p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
            {t('wcNextMatchReady')}
          </p>
          {wcLoading ? (
            <p className="text-sm text-slate-500">{t('wcCreatingNext')}</p>
          ) : nextMatchId ? (
            <Link
              href={`/match/${nextMatchId}`}
              className="block w-full rounded-2xl bg-sky-600 py-5 text-center text-base font-black text-white transition-all active:scale-[0.97] active:bg-sky-700"
            >
              {t('wcStartNext')}
            </Link>
          ) : null}
        </div>
      )}

      {goals.length > 0 ? (
        <GoalLog
          goals={goals}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
        />
      ) : (
        <p className="text-center text-sm italic text-slate-600">{t('noGoals')}</p>
      )}
    </div>
  )
}

function GoalLog({
  goals, homeTeam, awayTeam, homePlayers, awayPlayers,
}: {
  goals:       RecordedGoal[]
  homeTeam:    Team
  awayTeam:    Team
  homePlayers: Player[]
  awayPlayers: Player[]
}) {
  const t          = useTranslations('match')
  const allPlayers = [...homePlayers, ...awayPlayers]

  const playerName = (id: string | null) =>
    id ? (allPlayers.find(p => p.id === id)?.full_name ?? '?') : null

  const teamFor = (id: string) => id === homeTeam.id ? homeTeam : awayTeam

  return (
    <div className="rounded-2xl bg-slate-800 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">{t('goalLog')}</h3>
      <ul className="space-y-2">
        {goals.map(g => {
          const team = teamFor(g.scoringTeamId)
          const scorer = g.isOwnGoal ? `OG (${team.name})` : (playerName(g.scorerId) ?? team.name)
          return (
            <li key={g.localId} className="flex items-baseline gap-2">
              <span className="text-base leading-none">⚽</span>
              <span className="shrink-0 font-black tabular-nums text-amber-400">
                {g.minute}&apos;
              </span>
              <span className="text-slate-400">—</span>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {team.color && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: team.color }}
                  />
                )}
                <span className="truncate text-sm font-semibold text-white">{scorer}</span>
              </div>
              {g.assistId && (
                <span className="shrink-0 text-xs text-slate-400">
                  ▶ {playerName(g.assistId)}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ── Shared micro-components ───────────────────────────────────────────────────

function TeamPill({ team }: { team: Team }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 min-w-0">
      {team.color && (
        <span
          className="h-5 w-5 rounded-full border-2 border-white/20"
          style={{ backgroundColor: team.color }}
        />
      )}
      <span className="truncate text-center text-sm font-black text-white">{team.name}</span>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-semibold text-slate-300">{value}</span>
    </div>
  )
}
