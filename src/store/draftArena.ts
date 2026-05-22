import { create } from 'zustand'
import type { Tables, Enums } from '@/types/database'

export type Player     = Tables<'players'>
export type Team       = Tables<'teams'>
export type TeamPlayer = Tables<'team_players'>
export type Tournament = Tables<'tournaments'>

export interface PresenceUser {
  teamId:    string | null
  name:      string
  ready:     boolean
  isManager: boolean
  onlineAt:  string
}

type PresenceState = PresenceUser & { presence_ref: string }

interface DraftArenaState {
  tournament:       Tournament | null
  teams:            Team[]
  rosters:          Record<string, Player[]>   // teamId → drafted players
  availablePlayers: Player[]
  teamPlayers:      TeamPlayer[]
  draftStatus:      Enums<'draft_status'>
  presence:         Record<string, PresenceState[]>
  isConnected:      boolean

  init: (data: {
    tournament:  Tournament
    teams:       Team[]
    players:     Player[]
    teamPlayers: TeamPlayer[]
  }) => void
  applyPick:       (teamPlayer: TeamPlayer) => void
  applyGhost:      (teamId: string, ghost: Player) => void
  setDraftStatus:  (status: Enums<'draft_status'>) => void
  setPresence:     (p: Record<string, PresenceState[]>) => void
  setConnected:    (v: boolean) => void
}

export const useDraftArenaStore = create<DraftArenaState>((set) => ({
  tournament:       null,
  teams:            [],
  rosters:          {},
  availablePlayers: [],
  teamPlayers:      [],
  draftStatus:      'pending',
  presence:         {},
  isConnected:      false,

  init: ({ tournament, teams, players, teamPlayers }) => {
    const draftedIds = new Set(teamPlayers.map(tp => tp.player_id))
    const rosters: Record<string, Player[]> = Object.fromEntries(teams.map(t => [t.id, []]))
    for (const tp of teamPlayers) {
      const p = players.find(x => x.id === tp.player_id)
      if (p) rosters[tp.team_id] = [...(rosters[tp.team_id] ?? []), p]
    }
    set({
      tournament,
      teams,
      rosters,
      availablePlayers: players.filter(p => !draftedIds.has(p.id)),
      teamPlayers,
      draftStatus: tournament.draft_status,
    })
  },

  applyPick: (tp) =>
    set(state => {
      const player = state.availablePlayers.find(p => p.id === tp.player_id)
      // Ghost players don't live in availablePlayers — handled via applyGhost broadcast.
      if (!player) return {}
      return {
        availablePlayers: state.availablePlayers.filter(p => p.id !== tp.player_id),
        teamPlayers: [...state.teamPlayers, tp],
        rosters: {
          ...state.rosters,
          [tp.team_id]: [...(state.rosters[tp.team_id] ?? []), player],
        },
      }
    }),

  applyGhost: (teamId, ghost) =>
    set(state => ({
      rosters: {
        ...state.rosters,
        [teamId]: [...(state.rosters[teamId] ?? []), ghost],
      },
    })),

  setDraftStatus: (draftStatus) => set({ draftStatus }),
  setPresence:    (presence)    => set({ presence }),
  setConnected:   (isConnected) => set({ isConnected }),
}))
