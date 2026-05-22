export interface League {
  id: string
  name: string
  season: string
  manager_id: string
  created_at: string
}

export interface Team {
  id: string
  league_id: string
  name: string
  owner_id: string
  created_at: string
}

export interface Player {
  id: string
  full_name: string
  position: 'GK' | 'DEF' | 'MID' | 'FWD'
  team_id: string | null
}

export interface Match {
  id: string
  league_id: string
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  match_date: string
  status: 'scheduled' | 'live' | 'completed'
}
