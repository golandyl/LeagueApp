'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

type Match      = Tables<'matches'>
type Team       = Tables<'teams'>
type Player     = Tables<'players'>
type MatchEvent = Tables<'match_events'>
type TeamPlayer = Tables<'team_players'>

// ── Computation (mirrored from public standings page) ─────────────────────────

interface StandingRow {
  team: Team
  gp: number; w: number; d: number; l: number
  gf: number; ga: number; gd: number; pts: number
}

interface LeaderRow {
  player: Player
  count:  number
}

function buildStandings(teams: Team[], matches: Match[]): StandingRow[] {
  const map = new Map<string, StandingRow>()
  for (const t of teams) {
    map.set(t.id, { team: t, gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 })
  }
  for (const m of matches) {
    if (m.status !== 'completed' || m.home_score == null || m.away_score == null) continue
    const home = map.get(m.home_team_id)
    const away = map.get(m.away_team_id)
    if (!home || !away) continue

    const homeWon = m.home_score > m.away_score
    const awayWon = m.away_score > m.home_score
    let hg = m.home_score, ag = m.away_score
    if (m.victory_condition === 'PENALTIES') {
      if (homeWon) hg -= 1; else ag -= 1
    }

    home.gp++; away.gp++
    home.gf += hg; home.ga += ag
    away.gf += ag; away.ga += hg
    home.gd = home.gf - home.ga
    away.gd = away.gf - away.ga

    if (homeWon) {
      home.w++; away.l++
      home.pts += m.victory_condition === 'PENALTIES' ? 1 : 3
    } else if (awayWon) {
      away.w++; home.l++
      away.pts += m.victory_condition === 'PENALTIES' ? 1 : 3
    } else {
      home.d++; away.d++
    }
  }
  return [...map.values()].sort((a, b) =>
    b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.name.localeCompare(b.team.name),
  )
}

function rankLeader(counts: Map<string, number>, players: Map<string, Player>): LeaderRow[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ player: players.get(id)!, count }))
}

function calcTopScorers(events: MatchEvent[], players: Map<string, Player>): LeaderRow[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    if (e.event_type !== 'goal' || !e.player_id) continue
    const p = players.get(e.player_id)
    if (!p || p.is_ghost) continue
    counts.set(e.player_id, (counts.get(e.player_id) ?? 0) + 1)
  }
  return rankLeader(counts, players)
}

function calcTopAssists(events: MatchEvent[], players: Map<string, Player>): LeaderRow[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    if (e.event_type !== 'assist' || !e.player_id) continue
    const p = players.get(e.player_id)
    if (!p || p.is_ghost) continue
    counts.set(e.player_id, (counts.get(e.player_id) ?? 0) + 1)
  }
  return rankLeader(counts, players)
}

function calcTopWins(
  teamPlayers: TeamPlayer[],
  matches: Match[],
  players: Map<string, Player>,
): LeaderRow[] {
  const counts = new Map<string, number>()
  for (const m of matches) {
    if (m.status !== 'completed' || m.home_score == null || m.away_score == null) continue
    let winTeamId: string | null = null
    if (m.home_score > m.away_score) winTeamId = m.home_team_id
    else if (m.away_score > m.home_score) winTeamId = m.away_team_id
    if (!winTeamId) continue
    for (const tp of teamPlayers) {
      if (tp.team_id !== winTeamId) continue
      const p = players.get(tp.player_id)
      if (!p || p.is_ghost) continue
      counts.set(tp.player_id, (counts.get(tp.player_id) ?? 0) + 1)
    }
  }
  return rankLeader(counts, players)
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  leagueId: string
}

interface StatsData {
  tournamentName: string
  standings:      StandingRow[]
  scorers:        LeaderRow[]
  assists:        LeaderRow[]
  wins:           LeaderRow[]
}

export function LeagueStatsPanel({ leagueId }: Props) {
  const t       = useTranslations('standings')
  const tCommon = useTranslations('common')
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [data,    setData]    = useState<StatsData | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)

      // Most recent tournament for this league (any status)
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('id, name')
        .eq('league_id', leagueId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (cancelled) return
      if (!tournament) { setLoading(false); return }

      const [
        { data: teams },
        { data: matches },
        { data: teamPlayers },
        { data: players },
      ] = await Promise.all([
        supabase.from('teams').select('*').eq('tournament_id', tournament.id).order('name'),
        supabase.from('matches').select('*').eq('tournament_id', tournament.id),
        supabase.from('team_players').select('*').eq('tournament_id', tournament.id),
        supabase.from('players').select('*').eq('league_id', leagueId),
      ])

      if (cancelled) return

      const resolvedMatches     = matches     ?? []
      const resolvedTeams       = teams       ?? []
      const resolvedTeamPlayers = teamPlayers ?? []
      const resolvedPlayers     = players     ?? []
      const matchIds = resolvedMatches.map(m => m.id)

      const { data: rawEvents } = matchIds.length > 0
        ? await supabase.from('match_events').select('*').in('match_id', matchIds)
        : { data: [] as MatchEvent[] }

      if (cancelled) return

      const playersMap = new Map(resolvedPlayers.map(p => [p.id, p]))

      setData({
        tournamentName: tournament.name,
        standings: buildStandings(resolvedTeams, resolvedMatches),
        scorers:   calcTopScorers(rawEvents ?? [], playersMap),
        assists:   calcTopAssists(rawEvents ?? [], playersMap),
        wins:      calcTopWins(resolvedTeamPlayers, resolvedMatches, playersMap),
      })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [leagueId, supabase])

  if (loading) {
    return <p className="py-12 text-center text-sm text-zinc-500">{tCommon('loading')}</p>
  }

  if (!data) {
    return <p className="py-12 text-center text-sm text-zinc-500">{t('noTournaments')}</p>
  }

  return (
    <div className="space-y-8">

      {/* Section label */}
      <p className="text-xs font-black uppercase tracking-tight text-zinc-500">
        {data.tournamentName}
      </p>

      {/* ── Leaderboards ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-tight text-zinc-400">
          {t('individualAwards')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <LeaderCard title={t('topScorers')} rows={data.scorers} unitFn={n => t('goalUnit',   { count: n })} />
          <LeaderCard title={t('topAssists')} rows={data.assists} unitFn={n => t('assistUnit', { count: n })} />
          <LeaderCard title={t('mostWins')}   rows={data.wins}    unitFn={n => t('winUnit',    { count: n })} />
        </div>
      </section>

      {/* ── Standings table ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-tight text-zinc-400">
          {t('standingsTitle')}
        </h2>
        {data.standings.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">{t('noMatches')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-[10px] uppercase tracking-wider text-zinc-400">
                  <th className="px-3 py-3 text-start">#</th>
                  <th className="px-3 py-3 text-start">{t('colTeam')}</th>
                  <th className="px-2 py-3 text-center">{t('colGP')}</th>
                  <th className="px-2 py-3 text-center">{t('colW')}</th>
                  <th className="px-2 py-3 text-center">{t('colD')}</th>
                  <th className="px-2 py-3 text-center">{t('colL')}</th>
                  <th className="px-2 py-3 text-center">{t('colGF')}</th>
                  <th className="px-2 py-3 text-center">{t('colGA')}</th>
                  <th className="px-2 py-3 text-center">{t('colGD')}</th>
                  <th className="px-2 py-3 text-center font-black text-white">{t('colPts')}</th>
                </tr>
              </thead>
              <tbody>
                {data.standings.map((row, i) => (
                  <tr
                    key={row.team.id}
                    className={`border-b border-zinc-700/50 last:border-0 ${i === 0 ? 'bg-emerald-900/20' : ''}`}
                  >
                    <td className="px-3 py-3 text-zinc-500">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {row.team.color && (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: row.team.color }}
                          />
                        )}
                        <span className="font-bold text-white">{row.team.name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center text-zinc-300">{row.gp}</td>
                    <td className="px-2 py-3 text-center text-emerald-400">{row.w}</td>
                    <td className="px-2 py-3 text-center text-zinc-400">{row.d}</td>
                    <td className="px-2 py-3 text-center text-red-400">{row.l}</td>
                    <td className="px-2 py-3 text-center text-zinc-300">{row.gf}</td>
                    <td className="px-2 py-3 text-center text-zinc-300">{row.ga}</td>
                    <td className={`px-2 py-3 text-center font-semibold ${
                      row.gd > 0 ? 'text-emerald-400' :
                      row.gd < 0 ? 'text-red-400' : 'text-zinc-400'
                    }`}>
                      {row.gd > 0 ? `+${row.gd}` : row.gd}
                    </td>
                    <td className="px-2 py-3 text-center text-base font-black text-white">
                      {row.pts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-center text-xs text-zinc-600">{t('pointsKey')}</p>
    </div>
  )
}

// ── LeaderCard ────────────────────────────────────────────────────────────────

function LeaderCard({
  title, rows, unitFn,
}: {
  title:  string
  rows:   LeaderRow[]
  unitFn: (count: number) => string
}) {
  const t = useTranslations('standings')
  return (
    <div className="rounded-xl bg-zinc-900 p-4">
      <h3 className="mb-3 text-sm font-black text-white">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500">{t('noData')}</p>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((r, i) => (
            <li key={r.player.id} className="flex items-center gap-3">
              <span className={`w-4 shrink-0 text-center text-xs font-black ${i === 0 ? 'text-amber-400' : 'text-zinc-600'}`}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{r.player.full_name}</p>
                <p className="text-[10px] text-zinc-500">{r.player.position}</p>
              </div>
              <span className={`shrink-0 text-sm font-black tabular-nums ${i === 0 ? 'text-amber-400' : 'text-zinc-300'}`}>
                {r.count}
                <span className="ms-0.5 text-[10px] font-normal text-zinc-600">
                  {unitFn(r.count)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
