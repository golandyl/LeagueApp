'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import {
  useDraftArenaStore,
  type Player,
  type Team,
  type TeamPlayer,
  type Tournament,
  type PresenceUser,
} from '@/store/draftArena'

// ─── Snake draft helper ───────────────────────────────────────────────────────

/** Returns the index into `teams[]` that should pick on pick number `totalPicks`. */
function snakeIndex(numTeams: number, totalPicks: number): number {
  const round = Math.floor(totalPicks / numTeams)
  const pos   = totalPicks % numTeams
  return round % 2 === 0 ? pos : numTeams - 1 - pos
}

export function getCurrentTeam(teams: Team[], totalPicks: number): Team | null {
  if (!teams.length) return null
  return teams[snakeIndex(teams.length, totalPicks)] ?? null
}

export function getRoundAndPick(numTeams: number, totalPicks: number) {
  return {
    round:       Math.floor(totalPicks / numTeams),
    pickInRound: totalPicks % numTeams,
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface InitData {
  tournament:  Tournament
  teams:       Team[]
  players:     Player[]
  teamPlayers: TeamPlayer[]
}

export function useDraftArena(
  tournamentId: string,
  initData: InitData,
  opts: { myTeamId: string | null; myName: string; isManager: boolean },
) {
  const { myTeamId, myName, isManager } = opts
  const supabase     = createClient()
  const channelRef   = useRef<RealtimeChannel | null>(null)

  // Store action selectors — stable references, safe to use in effects.
  const init          = useDraftArenaStore(s => s.init)
  const applyPick     = useDraftArenaStore(s => s.applyPick)
  const applyGhost    = useDraftArenaStore(s => s.applyGhost)
  const setDraftStatus = useDraftArenaStore(s => s.setDraftStatus)
  const setPresence   = useDraftArenaStore(s => s.setPresence)
  const setConnected  = useDraftArenaStore(s => s.setConnected)

  // ── 1. Hydrate the store once on mount with server-fetched data ────────────
  useEffect(() => {
    init(initData)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  // ── 2. Single Realtime channel: presence + broadcast + postgres_changes ────
  useEffect(() => {
    const presenceKey = myTeamId ?? 'manager'
    const me: PresenceUser = {
      teamId: myTeamId, name: myName, ready: false,
      isManager, onlineAt: new Date().toISOString(),
    }

    const channel = supabase
      .channel(`draft:${tournamentId}`, { config: { presence: { key: presenceKey } } })

      // Presence: who is online and their ready state
      .on('presence', { event: 'sync' }, () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setPresence(channel.presenceState() as any)
      })

      // Broadcast: lifecycle signals from the manager
      .on('broadcast', { event: 'DRAFT_STARTED' },   () => setDraftStatus('active'))
      .on('broadcast', { event: 'DRAFT_COMPLETED' }, () => setDraftStatus('completed'))
      .on('broadcast', { event: 'GHOST_ASSIGNED' },
        (msg: { payload: { teamId: string; ghost: Player } }) =>
          applyGhost(msg.payload.teamId, msg.payload.ghost),
      )

      // Postgres changes: persisted picks appear in real time for every client.
      // Ghost inserts also fire here but applyPick is a no-op for unknown players
      // (ghosts aren't in availablePlayers); those are handled by GHOST_ASSIGNED.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any,
        {
          event: 'INSERT', schema: 'public', table: 'team_players',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload: { new: TeamPlayer }) => applyPick(payload.new),
      )

      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track(me)
          setConnected(true)
        }
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setConnected(false)
        }
      })

    channelRef.current = channel
    return () => {
      void supabase.removeChannel(channel)
      setConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Called when a player card's PICK button is clicked. */
  const pickPlayer = useCallback(async (playerId: string) => {
    const { teams, teamPlayers } = useDraftArenaStore.getState()
    const currentTeam = getCurrentTeam(teams, teamPlayers.length)
    if (!currentTeam) return
    // Leaders can only pick for their own team; manager can pick for any.
    if (!isManager && currentTeam.id !== myTeamId) return

    await supabase
      .from('team_players')
      .insert({ team_id: currentTeam.id, player_id: playerId, tournament_id: tournamentId })
  }, [supabase, tournamentId, isManager, myTeamId])

  /** Team leader tracks themselves as ready via Presence. */
  const markReady = useCallback(async () => {
    await channelRef.current?.track({
      teamId: myTeamId, name: myName, ready: true,
      isManager, onlineAt: new Date().toISOString(),
    } satisfies PresenceUser)
  }, [myTeamId, myName, isManager])

  /** Manager starts the draft: persists status, broadcasts to all clients. */
  const startDraft = useCallback(async () => {
    if (!isManager) return
    await supabase
      .from('tournaments')
      .update({ draft_status: 'active' })
      .eq('id', tournamentId)
    await channelRef.current?.send({ type: 'broadcast', event: 'DRAFT_STARTED', payload: {} })
    setDraftStatus('active')
  }, [supabase, tournamentId, isManager, setDraftStatus])

  /**
   * Manager assigns Ghost Goalkeepers to teams with fewer players once the
   * pool is empty. Each ghost is persisted to the DB then broadcast so all
   * clients update without needing another round-trip.
   */
  const assignGhosts = useCallback(async () => {
    if (!isManager) return
    const { teams, rosters, tournament } = useDraftArenaStore.getState()
    if (!tournament) return

    const maxLen     = Math.max(...teams.map(t => rosters[t.id]?.length ?? 0))
    const shortTeams = teams.filter(t => (rosters[t.id]?.length ?? 0) < maxLen)

    for (const team of shortTeams) {
      const { data: ghost } = await supabase
        .from('players')
        .insert({
          league_id: tournament.league_id,
          full_name: 'Ghost Goalkeeper',
          rating: 5,
          position: 'DEF',
          stamina: 'Med',
          is_ghost: true,
        })
        .select()
        .single()

      if (ghost) {
        // Persist the team assignment
        await supabase
          .from('team_players')
          .insert({ team_id: team.id, player_id: ghost.id, tournament_id: tournamentId })

        // Broadcast full ghost data so non-manager clients can update their store
        // without a separate DB fetch (the postgres_changes event won't help here
        // since ghost players aren't in availablePlayers).
        await channelRef.current?.send({
          type: 'broadcast', event: 'GHOST_ASSIGNED',
          payload: { teamId: team.id, ghost },
        })

        // Update manager's local state immediately (no need to wait for broadcast)
        applyGhost(team.id, ghost)
      }
    }

    await supabase
      .from('tournaments')
      .update({ draft_status: 'completed' })
      .eq('id', tournamentId)
    await channelRef.current?.send({ type: 'broadcast', event: 'DRAFT_COMPLETED', payload: {} })
    setDraftStatus('completed')
  }, [supabase, tournamentId, isManager, applyGhost, setDraftStatus])

  return { pickPlayer, markReady, startDraft, assignGhosts }
}
