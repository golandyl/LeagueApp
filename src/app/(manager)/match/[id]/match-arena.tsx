'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
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
type MatchEvent  = Tables<'match_events'>
type Phase       = 'regulation' | 'overtime' | 'penalties'
type MatchStatus = 'pre' | 'live' | 'paused' | 'ended'

interface RecordedGoal {
  id:            string
  scoringTeamId: string
  scorerId:      string | null
  assistId:      string | null
  minute:        number
  isOwnGoal:     boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  match:       Match
  league:      League
  homeTeam:    Team
  awayTeam:    Team
  homePlayers: Player[]
  awayPlayers: Player[]
}

export function MatchArena({ match, league, homeTeam, awayTeam, homePlayers, awayPlayers }: Props) {
  const supabase = createClient()

  // ── DB-derived state ──────────────────────────────────────────────────────────
  const [matchStatus, setMatchStatus] = useState<MatchStatus>(
    match.status === 'completed' ? 'ended'  :
    match.status === 'paused'    ? 'paused' :
    match.status === 'live'      ? 'live'   : 'pre'
  )
  const [phase,    setPhase]    = useState<Phase>('regulation')
  const [playedAt, setPlayedAt] = useState<string | null>(match.played_at)
  const [pausedAt, setPausedAt] = useState<string | null>(match.paused_at ?? null)

  const [homeScore, setHomeScore] = useState(match.home_score ?? 0)
  const [awayScore, setAwayScore] = useState(match.away_score ?? 0)
  const [rawEvents, setRawEvents] = useState<MatchEvent[]>([])
  const [finalVC,   setFinalVC]   = useState<Enums<'victory_condition'> | null>(
    match.status === 'completed' ? match.victory_condition : null,
  )

  // ── UI-only state ─────────────────────────────────────────────────────────────
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [endReason,     setEndReason]     = useState<EndReason | null>(null)
  const [saving,        setSaving]        = useState(false)

  // ── Timer ─────────────────────────────────────────────────────────────────────
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [secondsElapsed, setSecondsElapsed] = useState(() => {
    if (match.status === 'paused' && match.paused_at && match.played_at) {
      return Math.max(0, Math.floor(
        (new Date(match.paused_at).getTime() - new Date(match.played_at).getTime()) / 1000
      ))
    }
    if (match.status === 'live' && match.played_at) {
      return Math.max(0, Math.floor((Date.now() - new Date(match.played_at).getTime()) / 1000))
    }
    return 0
  })

  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }

    if (matchStatus === 'live' && playedAt) {
      const tick = () =>
        setSecondsElapsed(Math.max(0, Math.floor((Date.now() - new Date(playedAt).getTime()) / 1000)))
      tick()
      intervalRef.current = setInterval(tick, 1000)
    } else if (matchStatus === 'paused' && pausedAt && playedAt) {
      setSecondsElapsed(Math.max(0, Math.floor(
        (new Date(pausedAt).getTime() - new Date(playedAt).getTime()) / 1000
      )))
    }

    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null } }
  }, [matchStatus, playedAt, pausedAt])

  // ── Derived values ────────────────────────────────────────────────────────────
  const regSeconds   = league.match_length_minutes * 60
  const extraSeconds = league.overtime_enabled ? league.overtime_length_minutes * 60 : 0

  const isStoppageTime =
    matchStatus === 'live' && phase !== 'penalties' && secondsElapsed >= regSeconds

  const winScoreReached =
    league.win_score !== null && (homeScore >= league.win_score || awayScore >= league.win_score)

  const goldenGoalScored =
    phase === 'overtime' && league.overtime_type === 'GOLDEN_GOAL' && homeScore !== awayScore

  const autoTimerStopped =
    matchStatus === 'live' && (
      winScoreReached ||
      goldenGoalScored ||
      (secondsElapsed >= regSeconds && homeScore !== awayScore) ||
      secondsElapsed >= regSeconds + extraSeconds
    )

  // ── Goals derived from raw DB events ─────────────────────────────────────────
  const goals = useMemo<RecordedGoal[]>(() => {
    const assistMap = new Map<string, string>()
    for (const e of rawEvents) {
      if (e.event_type === 'assist' && e.player_id) {
        assistMap.set(`${e.team_id}:${e.minute}`, e.player_id)
      }
    }
    return rawEvents
      .filter(e => e.event_type === 'goal')
      .map(e => ({
        id:            e.id,
        scoringTeamId: e.team_id,
        scorerId:      e.player_id,
        assistId:      assistMap.get(`${e.team_id}:${e.minute}`) ?? null,
        minute:        e.minute,
        isOwnGoal:     e.description === 'own_goal',
      }))
  }, [rawEvents])

  // ── On-mount DB fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const [{ data: matchRow }, { data: eventRows }] = await Promise.all([
        supabase
          .from('matches')
          .select('home_score, away_score, status, played_at, paused_at, victory_condition')
          .eq('id', match.id)
          .single(),
        supabase
          .from('match_events')
          .select('*')
          .eq('match_id', match.id)
          .order('minute', { ascending: true }),
      ])

      if (matchRow) {
        setHomeScore(matchRow.home_score ?? 0)
        setAwayScore(matchRow.away_score ?? 0)
        setPlayedAt(matchRow.played_at)
        setPausedAt(matchRow.paused_at)
        if (matchRow.status === 'completed') {
          setMatchStatus('ended')
          setFinalVC(matchRow.victory_condition)
        } else if (matchRow.status === 'live') {
          setMatchStatus('live')
        } else if (matchRow.status === 'paused') {
          setMatchStatus('paused')
        }
      }
      if (eventRows) setRawEvents(eventRows)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id])

  // ── Realtime ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`match:${match.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${match.id}` },
        (payload) => {
          const updated = payload.new as Match
          setHomeScore(updated.home_score ?? 0)
          setAwayScore(updated.away_score ?? 0)
          if (updated.status === 'live') {
            setPlayedAt(updated.played_at)
            setPausedAt(null)
            setMatchStatus('live')
          } else if (updated.status === 'paused') {
            setPausedAt(updated.paused_at)
            setMatchStatus('paused')
          } else if (updated.status === 'completed') {
            setMatchStatus('ended')
            setFinalVC(updated.victory_condition)
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_events', filter: `match_id=eq.${match.id}` },
        (payload) => {
          const newEvent = payload.new as MatchEvent
          setRawEvents(prev => {
            if (prev.some(e => e.id === newEvent.id)) return prev
            return [...prev, newEvent].sort((a, b) => a.minute - b.minute)
          })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id])

  // ── Handlers ──────────────────────────────────────────────────────────────────

  async function handleKickOff() {
    const now = new Date().toISOString()
    await supabase.from('matches').update({ status: 'live', played_at: now }).eq('id', match.id)
    setMatchStatus('live')
    setPlayedAt(now)
  }

  function currentMinute(): number {
    if (phase === 'overtime' && secondsElapsed > regSeconds) {
      return league.match_length_minutes + Math.max(1, Math.ceil((secondsElapsed - regSeconds) / 60))
    }
    return Math.max(1, Math.ceil(secondsElapsed / 60))
  }

  async function handleGoalConfirm(sel: GoalSelection) {
    setShowGoalModal(false)

    const isHome   = sel.scoringTeamId === homeTeam.id
    const nextHome = isHome ? homeScore + 1 : homeScore
    const nextAway = isHome ? awayScore     : awayScore + 1
    const minute   = currentMinute()

    const events: TablesInsert<'match_events'>[] = [{
      match_id:    match.id,
      event_type:  'goal',
      team_id:     sel.scoringTeamId,
      player_id:   sel.scorerId,
      minute,
      description: sel.isOwnGoal ? 'own_goal' : null,
    }]
    if (sel.assistId) {
      events.push({
        match_id:   match.id,
        event_type: 'assist',
        team_id:    sel.scoringTeamId,
        player_id:  sel.assistId,
        minute,
      })
    }

    await Promise.all([
      supabase.from('match_events').insert(events),
      supabase.from('matches').update({ home_score: nextHome, away_score: nextAway }).eq('id', match.id),
    ])
  }

  async function handleTogglePause() {
    if (matchStatus === 'live') {
      const now = new Date().toISOString()
      await supabase.from('matches').update({ status: 'paused', paused_at: now }).eq('id', match.id)
      setMatchStatus('paused')
      setPausedAt(now)
    } else if (matchStatus === 'paused' && pausedAt && playedAt) {
      const pauseDurationMs = Date.now() - new Date(pausedAt).getTime()
      const newPlayedAt     = new Date(new Date(playedAt).getTime() + pauseDurationMs).toISOString()
      await supabase
        .from('matches')
        .update({ status: 'live', played_at: newPlayedAt, paused_at: null })
        .eq('id', match.id)
      setMatchStatus('live')
      setPlayedAt(newPlayedAt)
      setPausedAt(null)
    }
  }

  function handleWhistle() {
    setEndReason({ kind: 'time_up', phase: phase as 'regulation' | 'overtime' })
  }

  async function handleEndMatch() {
    const isOT = extraSeconds > 0 && secondsElapsed > regSeconds
    await handleEndDecision(isOT ? 'end_ot' : 'end_regular')
  }

  function handlePenaltyWinner(side: 'home' | 'away') {
    void handleEndDecision(side === 'home' ? 'penalties_home' : 'penalties_away')
  }

  async function handleEndDecision(decision: EndDecision) {
    if (decision === 'enter_ot') {
      setPhase('overtime')
      setEndReason(null)
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

    setSaving(true)
    try {
      await supabase.from('matches').update({
        status:            'completed',
        home_score:        finalHome,
        away_score:        finalAway,
        victory_condition: vc,
      }).eq('id', match.id)
      setFinalVC(vc)
      setMatchStatus('ended')
    } finally {
      setSaving(false)
    }
  }

  // ── Screens ───────────────────────────────────────────────────────────────────

  if (matchStatus === 'pre') {
    return (
      <PreMatch
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        league={league}
        leagueId={match.league_id}
        onKickOff={handleKickOff}
      />
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
      />
    )
  }

  // ── Live / Paused match ───────────────────────────────────────────────────────
  const timerRunning = matchStatus === 'live'

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950 px-4 pt-4 pb-10 gap-5">

      <Link
        href={`/league/${match.league_id}`}
        className="flex items-center gap-1.5 self-start text-sm font-semibold text-zinc-400 hover:text-white"
      >
        <span>‹</span>
        Back to Home
      </Link>

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
        onToggle={!autoTimerStopped ? () => { void handleTogglePause() } : undefined}
        onWhistle={autoTimerStopped || !timerRunning ? undefined : handleWhistle}
      />

      {autoTimerStopped ? (
        homeScore !== awayScore ? (
          <button
            onClick={() => { void handleEndMatch() }}
            disabled={saving}
            className="w-full rounded-xl bg-rose-600 py-7 text-2xl font-black uppercase tracking-tight text-white transition-all active:scale-[0.97] active:bg-rose-700 disabled:opacity-50"
          >
            {saving ? '…' : 'End Match'}
          </button>
        ) : (
          <div className="rounded-xl bg-zinc-900 p-4">
            <p className="mb-1 text-center text-base font-black uppercase tracking-tight text-amber-400">
              Decisive Penalty
            </p>
            <p className="mb-4 text-center text-xs text-zinc-400">Which team scored the penalty?</p>
            <div className="flex gap-3">
              <button
                onClick={() => handlePenaltyWinner('home')}
                disabled={saving}
                className="flex-1 rounded-xl bg-zinc-800 py-5 text-sm font-black text-white transition-all hover:bg-zinc-700 active:scale-[0.97] disabled:opacity-50"
                style={homeTeam.color ? { borderInlineStart: `4px solid ${homeTeam.color}` } : undefined}
              >
                {homeTeam.name}
              </button>
              <button
                onClick={() => handlePenaltyWinner('away')}
                disabled={saving}
                className="flex-1 rounded-xl bg-zinc-800 py-5 text-sm font-black text-white transition-all hover:bg-zinc-700 active:scale-[0.97] disabled:opacity-50"
                style={awayTeam.color ? { borderInlineStart: `4px solid ${awayTeam.color}` } : undefined}
              >
                {awayTeam.name}
              </button>
            </div>
          </div>
        )
      ) : (
        <button
          onClick={() => setShowGoalModal(true)}
          disabled={!timerRunning}
          className="w-full rounded-xl bg-emerald-600 py-7 text-2xl font-black uppercase tracking-tight text-white transition-all active:scale-[0.97] active:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ⚽  Goal Scored!
        </button>
      )}

      {goals.length > 0 && (
        <GoalLog
          goals={goals}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
        />
      )}

      {showGoalModal && timerRunning && !autoTimerStopped && (
        <GoalModal
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
          onConfirm={handleGoalConfirm}
          onClose={() => setShowGoalModal(false)}
        />
      )}

      {endReason && (
        <EndMatchModal
          reason={endReason}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeScore={homeScore}
          awayScore={awayScore}
          league={league}
          saving={saving}
          onDecision={handleEndDecision}
        />
      )}
    </div>
  )
}

// ── Sub-views ─────────────────────────────────────────────────────────────────

function PreMatch({
  homeTeam, awayTeam, league, leagueId, onKickOff,
}: {
  homeTeam:  Team
  awayTeam:  Team
  league:    League
  leagueId:  string
  onKickOff: () => void
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950 px-5">
      <div className="pt-4 pb-0">
        <Link
          href={`/league/${leagueId}`}
          className="flex items-center gap-1.5 text-sm font-semibold text-zinc-400 hover:text-white"
        >
          <span>‹</span>
          Back to Home
        </Link>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <div className="flex w-full items-center justify-between gap-3">
          <TeamPill team={homeTeam} />
          <span className="shrink-0 text-3xl font-black text-zinc-500">VS</span>
          <TeamPill team={awayTeam} />
        </div>

        <div className="flex w-full flex-col gap-2 rounded-xl bg-zinc-900 p-4 text-sm text-zinc-400">
          <Row label="Duration"   value={`${league.match_length_minutes} min`} />
          {league.win_score !== null && (
            <Row label="Win score" value={`First to ${league.win_score} goals`} />
          )}
          <Row label="Extra time" value={league.overtime_enabled ? `${league.overtime_length_minutes} min` : 'Off'} />
          {league.overtime_enabled && (
            <Row
              label="OT Mode"
              value={league.overtime_type === 'GOLDEN_GOAL' ? 'Golden Goal' : 'Classic'}
            />
          )}
          <Row label="Penalties"  value={league.penalties_enabled ? 'Enabled' : 'Off'} />
        </div>

        <button
          onClick={onKickOff}
          className="w-full rounded-xl bg-emerald-600 py-7 text-3xl font-black text-white transition-all active:scale-[0.97] active:bg-emerald-700"
        >
          ⚽  Kick Off!
        </button>
      </div>
    </div>
  )
}

function FinalScreen({
  homeTeam, awayTeam, homeScore, awayScore, goals,
  homePlayers, awayPlayers, victoryCondition,
}: {
  homeTeam:         Team
  awayTeam:         Team
  homeScore:        number
  awayScore:        number
  goals:            RecordedGoal[]
  homePlayers:      Player[]
  awayPlayers:      Player[]
  victoryCondition: Enums<'victory_condition'> | null
}) {
  const vcLabel =
    victoryCondition === 'OVERTIME'  ? 'After Extra Time' :
    victoryCondition === 'PENALTIES' ? 'Won on Penalties' : null

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950 px-4 py-8 gap-6">
      <h1 className="text-center text-2xl font-black text-white">Full Time</h1>

      <div className="flex items-center justify-center gap-6">
        <TeamPill team={homeTeam} />
        <div className="flex items-center gap-3">
          <span className="text-6xl font-black tabular-nums text-white">{homeScore}</span>
          <span className="text-4xl text-zinc-600">–</span>
          <span className="text-6xl font-black tabular-nums text-white">{awayScore}</span>
        </div>
        <TeamPill team={awayTeam} />
      </div>

      {vcLabel && (
        <p className="text-center text-sm font-semibold text-amber-400">{vcLabel}</p>
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
        <p className="text-center text-sm italic text-zinc-600">No goals recorded</p>
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
  const allPlayers = [...homePlayers, ...awayPlayers]

  const playerName = (id: string | null) =>
    id ? (allPlayers.find(p => p.id === id)?.full_name ?? '?') : null

  const teamFor = (id: string) => id === homeTeam.id ? homeTeam : awayTeam

  return (
    <div className="rounded-xl bg-zinc-900 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-tight text-zinc-500">Goal Log</h3>
      <ul className="space-y-2">
        {goals.map(g => {
          const team = teamFor(g.scoringTeamId)
          const scorer = g.isOwnGoal ? `OG (${team.name})` : (playerName(g.scorerId) ?? team.name)
          return (
            <li key={g.id} className="flex items-baseline gap-2">
              <span className="text-base leading-none">⚽</span>
              <span className="shrink-0 font-black tabular-nums text-amber-400">
                {g.minute}&apos;
              </span>
              <span className="text-zinc-400">—</span>
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
                <span className="shrink-0 text-xs text-zinc-400">
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
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  )
}
