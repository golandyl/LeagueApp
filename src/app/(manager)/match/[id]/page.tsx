import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MatchArena } from './match-arena'
import type { Tables } from '@/types/database'

type Player = Tables<'players'>

interface Props {
  params: Promise<{ id: string }>
}

export default async function MatchPage({ params }: Props) {
  const { id: matchId } = await params
  const supabase = await createClient()

  const { data: match } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single()

  if (!match) notFound()

  const [
    { data: league },
    { data: homeTeam },
    { data: awayTeam },
    { data: homeTpRows },
    { data: awayTpRows },
  ] = await Promise.all([
    supabase.from('leagues').select('*').eq('id', match.league_id).single(),
    supabase.from('teams').select('*').eq('id', match.home_team_id).single(),
    supabase.from('teams').select('*').eq('id', match.away_team_id).single(),
    supabase.from('team_players').select('player_id').eq('team_id', match.home_team_id).eq('tournament_id', match.tournament_id),
    supabase.from('team_players').select('player_id').eq('team_id', match.away_team_id).eq('tournament_id', match.tournament_id),
  ])

  if (!league || !homeTeam || !awayTeam) notFound()

  const homeIds = homeTpRows?.map(r => r.player_id) ?? []
  const awayIds = awayTpRows?.map(r => r.player_id) ?? []

  const [{ data: homePlayers }, { data: awayPlayers }] = await Promise.all([
    homeIds.length > 0
      ? supabase.from('players').select('*').in('id', homeIds).eq('is_ghost', false)
      : Promise.resolve({ data: [] as Player[] }),
    awayIds.length > 0
      ? supabase.from('players').select('*').in('id', awayIds).eq('is_ghost', false)
      : Promise.resolve({ data: [] as Player[] }),
  ])

  return (
    <MatchArena
      match={match}
      league={league}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      homePlayers={homePlayers ?? []}
      awayPlayers={awayPlayers ?? []}
    />
  )
}
