import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DraftArena } from './arena'
import type { InitData } from '@/hooks/useDraftArena'
import { PUBLIC_PLAYER_COLUMNS, withHiddenRatings } from '@/lib/players'

interface Props {
  params:       Promise<{ locale: string; id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function DraftPage({ params, searchParams }: Props) {
  const { id: tournamentId } = await params
  const sp = await searchParams
  const teamId = typeof sp.teamId === 'string' ? sp.teamId : null

  const supabase = await createClient()

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single()

  if (!tournament) notFound()

  const [
    { data: { user } },
    { data: league },
    { data: teams },
    { data: teamPlayers },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('leagues').select('manager_id').eq('id', tournament.league_id).single(),
    supabase.from('teams').select('*').eq('tournament_id', tournamentId).order('name'),
    supabase.from('team_players').select('*').eq('tournament_id', tournamentId).order('drafted_at'),
  ])

  const isManager = !!(user && league && user.id === league.manager_id)

  // Ratings/stamina are manager-only; others get public columns by name.
  const players = isManager
    ? (await supabase
        .rpc('get_league_players', { p_league_id: tournament.league_id })
        .eq('is_ghost', false)
        .order('rating', { ascending: false })).data ?? []
    : withHiddenRatings((await supabase
        .from('players')
        .select(PUBLIC_PLAYER_COLUMNS)
        .eq('league_id', tournament.league_id)
        .eq('is_ghost', false)
        .order('full_name')).data)

  const resolvedTeams       = teams       ?? []
  const resolvedPlayers     = players     ?? []
  const resolvedTeamPlayers = teamPlayers ?? []

  const initData: InitData = {
    tournament,
    teams:       resolvedTeams,
    players:     resolvedPlayers,
    teamPlayers: resolvedTeamPlayers,
  }

  const myTeam = resolvedTeams.find(t => t.id === teamId) ?? null
  const myName = isManager
    ? ((user?.user_metadata?.full_name as string | undefined) ?? 'Manager')
    : (myTeam?.name ?? 'Observer')

  return (
    <DraftArena
      tournamentId={tournamentId}
      initData={initData}
      myTeamId={teamId}
      myName={myName}
      isManager={isManager}
    />
  )
}
