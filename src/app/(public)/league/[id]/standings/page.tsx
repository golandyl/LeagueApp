import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

type Match       = Tables<'matches'>
type Team        = Tables<'teams'>
type Player      = Tables<'players'>
type MatchEvent  = Tables<'match_events'>
type TeamPlayer  = Tables<'team_players'>

interface Props {
  params: Promise<{ id: string }>
}

// ── Standings computation ────────────────────────────────────────────────────

interface StandingRow {
  team:   Team
  gp:     number
  w:      number
  d:      number
  l:      number
  gf:     number
  ga:     number
  gd:     number
  pts:    number
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

    // For penalties: the +1 convention means the raw score already encodes winner.
    // home_score > away_score → home won (regardless of how it got there)
    const homeWon = m.home_score > m.away_score
    const awayWon = m.away_score > m.home_score

    // True goals for display: for PENALTIES matches, subtract the artificial +1
    let hg = m.home_score
    let ag = m.away_score
    if (m.victory_condition === 'PENALTIES') {
      if (homeWon) hg -= 1
      else         ag -= 1
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
      // points_draw from league config is not available here; default 1 for a draw
      // (draw after OT isn't possible in this system since penalties always resolve)
    }
  }

  return [...map.values()].sort((a, b) =>
    b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.name.localeCompare(b.team.name)
  )
}

// ── Leaderboard computation ─────────────────────────────────────────────────

interface LeaderRow {
  player: Player
  count:  number
}

function topScorers(events: MatchEvent[], players: Map<string, Player>): LeaderRow[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    if (e.event_type !== 'goal' || !e.player_id) continue
    const p = players.get(e.player_id)
    if (!p || p.is_ghost) continue
    counts.set(e.player_id, (counts.get(e.player_id) ?? 0) + 1)
  }
  return rankLeader(counts, players)
}

function topAssists(events: MatchEvent[], players: Map<string, Player>): LeaderRow[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    if (e.event_type !== 'assist' || !e.player_id) continue
    const p = players.get(e.player_id)
    if (!p || p.is_ghost) continue
    counts.set(e.player_id, (counts.get(e.player_id) ?? 0) + 1)
  }
  return rankLeader(counts, players)
}

function topWins(
  teamPlayers: TeamPlayer[],
  matches: Match[],
  players: Map<string, Player>,
): LeaderRow[] {
  // count wins per player: 1 win per match their team won
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

function rankLeader(counts: Map<string, number>, players: Map<string, Player>): LeaderRow[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ player: players.get(id)!, count }))
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function StandingsPage({ params }: Props) {
  const { id: leagueId } = await params
  const supabase = await createClient()

  const { data: league } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', leagueId)
    .single()

  if (!league) notFound()

  // Most recent tournament for this league
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!tournament) {
    return (
      <main className="min-h-screen bg-slate-900 p-6 text-white">
        <h1 className="mb-2 text-2xl font-black">{league.name}</h1>
        <p className="text-slate-400">No tournaments yet.</p>
      </main>
    )
  }

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

  const resolvedMatches     = matches     ?? []
  const resolvedTeams       = teams       ?? []
  const resolvedTeamPlayers = teamPlayers ?? []
  const resolvedPlayers     = players     ?? []

  const matchIds = resolvedMatches.map(m => m.id)
  const { data: rawEvents } = matchIds.length > 0
    ? await supabase.from('match_events').select('*').in('match_id', matchIds)
    : { data: [] as MatchEvent[] }

  const resolvedEvents  = rawEvents ?? []
  const playersMap      = new Map(resolvedPlayers.map(p => [p.id, p]))

  const standings = buildStandings(resolvedTeams, resolvedMatches)
  const scorers   = topScorers(resolvedEvents, playersMap)
  const assists   = topAssists(resolvedEvents, playersMap)
  const wins      = topWins(resolvedTeamPlayers, resolvedMatches, playersMap)

  return (
    <main className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 px-5 py-6 shadow-lg">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{league.name}</p>
        <h1 className="mt-0.5 text-2xl font-black">{tournament.name}</h1>
        <p className="mt-1 text-sm text-slate-400">{tournament.season}</p>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">

        {/* ── Leaderboards ─────────────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">
            Individual Awards
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <LeaderCard title="⚽ Top Scorers"  rows={scorers} unit="goal"  />
            <LeaderCard title="🎯 Top Assists"   rows={assists} unit="assist"/>
            <LeaderCard title="🏆 Most Wins"     rows={wins}    unit="win"   />
          </div>
        </section>

        {/* ── Standings table ───────────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">
            Standings
          </h2>
          {standings.length === 0 ? (
            <p className="text-center text-sm text-slate-500">No completed matches yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-slate-800 shadow-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Team</th>
                    <th className="px-3 py-3 text-center">GP</th>
                    <th className="px-3 py-3 text-center">W</th>
                    <th className="px-3 py-3 text-center">D</th>
                    <th className="px-3 py-3 text-center">L</th>
                    <th className="px-3 py-3 text-center">GF</th>
                    <th className="px-3 py-3 text-center">GA</th>
                    <th className="px-3 py-3 text-center">GD</th>
                    <th className="px-3 py-3 text-center font-black text-white">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row, i) => (
                    <tr
                      key={row.team.id}
                      className={`border-b border-slate-700/50 transition-colors last:border-0 ${
                        i === 0 ? 'bg-emerald-900/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3.5 text-slate-500">{i + 1}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          {row.team.color && (
                            <span
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: row.team.color }}
                            />
                          )}
                          <span className="font-bold text-white">{row.team.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-center text-slate-300">{row.gp}</td>
                      <td className="px-3 py-3.5 text-center text-emerald-400">{row.w}</td>
                      <td className="px-3 py-3.5 text-center text-slate-400">{row.d}</td>
                      <td className="px-3 py-3.5 text-center text-red-400">{row.l}</td>
                      <td className="px-3 py-3.5 text-center text-slate-300">{row.gf}</td>
                      <td className="px-3 py-3.5 text-center text-slate-300">{row.ga}</td>
                      <td className={`px-3 py-3.5 text-center font-semibold ${
                        row.gd > 0 ? 'text-emerald-400' :
                        row.gd < 0 ? 'text-red-400' : 'text-slate-400'
                      }`}>
                        {row.gd > 0 ? `+${row.gd}` : row.gd}
                      </td>
                      <td className="px-3 py-3.5 text-center text-lg font-black text-white">
                        {row.pts}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Points key */}
        <p className="text-center text-xs text-slate-600">
          Win (reg/OT) = 3 pts · Penalties win = 1 pt · Draw = 0 pts
        </p>
      </div>
    </main>
  )
}

// ── LeaderCard ───────────────────────────────────────────────────────────────

function LeaderCard({
  title, rows, unit,
}: {
  title: string
  rows:  LeaderRow[]
  unit:  string
}) {
  return (
    <div className="rounded-2xl bg-slate-800 p-4 shadow-lg">
      <h3 className="mb-3 text-sm font-black text-white">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">No data yet</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.player.id} className="flex items-center gap-3">
              <span className={`w-5 shrink-0 text-center text-xs font-black ${
                i === 0 ? 'text-amber-400' : 'text-slate-500'
              }`}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{r.player.full_name}</p>
                <p className="text-xs text-slate-400">{r.player.position}</p>
              </div>
              <span className={`shrink-0 text-sm font-black ${
                i === 0 ? 'text-amber-400' : 'text-slate-300'
              }`}>
                {r.count}
                <span className="ml-0.5 text-xs font-normal text-slate-500">
                  {r.count === 1 ? unit : `${unit}s`}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
