export type UserRole = 'manager' | 'player'

export interface UserProfile {
  id: string
  email: string
  role: UserRole
  full_name: string | null
  avatar_url: string | null
  created_at: string
}
