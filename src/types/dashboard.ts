// Shared by the dashboard server page (reads ?tab=) and the client tab bar.
export type TabId = 'matchday' | 'signup' | 'teams' | 'roster' | 'stats' | 'history'

export const TAB_IDS: readonly TabId[] = ['matchday', 'signup', 'teams', 'roster', 'stats', 'history']
