export interface Draft {
  id: string
  league_id: string
  status: 'pending' | 'active' | 'completed'
  current_round: number
  current_pick: number
  started_at: string | null
  completed_at: string | null
}

export interface DraftPick {
  id: string
  draft_id: string
  team_id: string
  player_id: string
  round: number
  pick: number
  picked_at: string
}

export interface DraftRealtimeEvent {
  type: 'PICK_MADE' | 'DRAFT_STARTED' | 'DRAFT_COMPLETED' | 'TURN_CHANGED'
  payload: Record<string, unknown>
}
