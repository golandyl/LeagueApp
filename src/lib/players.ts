import type { Tables } from '@/types/database'

type Player = Tables<'players'>

// Columns anyone may read. rating and stamina are manager-only in the
// database (see migration 20261014000002); managers read full rows through
// the get_league_players RPC instead.
export const PUBLIC_PLAYER_COLUMNS =
  'id, league_id, manager_id, full_name, position, is_ghost, created_at, updated_at, is_vip, is_verified'

export type PublicPlayer = Omit<Player, 'rating' | 'stamina'>

// Fills the private fields with neutral placeholders so public rows fit
// components typed for full players. Never show these values to users.
export function withHiddenRatings(rows: PublicPlayer[] | null | undefined): Player[] {
  return (rows ?? []).map(p => ({ ...p, rating: 0, stamina: 'Med' as const }))
}
