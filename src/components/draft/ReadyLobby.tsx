'use client'

import type { Team, PresenceUser } from '@/store/draftArena'

interface Props {
  teams:       Team[]
  presence:    Record<string, (PresenceUser & { presence_ref: string })[]>
  isManager:   boolean
  myTeamId:    string | null
  onReady:     () => void
  onStart:     () => void
}

export function ReadyLobby({ teams, presence, isManager, myTeamId, onReady, onStart }: Props) {
  // Flatten presence values to get all connected users
  const allUsers = Object.values(presence).flat()

  function isTeamOnline(teamId: string) {
    return allUsers.some(u => u.teamId === teamId)
  }
  function isTeamReady(teamId: string) {
    return allUsers.some(u => u.teamId === teamId && u.ready)
  }
  function isManagerOnline() {
    return allUsers.some(u => u.isManager)
  }

  const allReady = teams.length > 0 && teams.every(t => isTeamReady(t.id))

  // Whether the current leader has already marked themselves ready
  const myReady = myTeamId ? isTeamReady(myTeamId) : false

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Draft Lobby</h2>
        <p className="mt-1 text-sm text-slate-400">
          Waiting for all team leaders to confirm ready…
        </p>
      </div>

      {/* Participant list */}
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 divide-y divide-slate-700">
        {/* Manager row */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isManagerOnline() ? 'bg-green-400' : 'bg-slate-600'}`} />
            <span className="text-sm text-slate-300">Manager</span>
          </div>
          <span className="text-xs font-semibold text-amber-400">HOST</span>
        </div>

        {/* Team rows */}
        {teams.map(team => {
          const online = isTeamOnline(team.id)
          const ready  = isTeamReady(team.id)
          return (
            <div key={team.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-green-400' : 'bg-slate-600'}`} />
                {team.color && (
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: team.color }}
                  />
                )}
                <span className="truncate text-sm text-slate-300">{team.name}</span>
              </div>
              {ready ? (
                <span className="text-xs font-bold text-emerald-400">✓ Ready</span>
              ) : online ? (
                <span className="text-xs text-slate-500">Joining…</span>
              ) : (
                <span className="text-xs text-slate-600">Offline</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-3">
        {/* Leader: mark ready */}
        {!isManager && myTeamId && (
          <button
            onClick={onReady}
            disabled={myReady}
            className="rounded-xl bg-sky-600 px-8 py-3 text-sm font-bold text-white transition-colors hover:bg-sky-500 disabled:bg-emerald-700 disabled:cursor-default"
          >
            {myReady ? '✓ Ready' : "I'm Ready"}
          </button>
        )}

        {/* Manager: start */}
        {isManager && (
          <button
            onClick={onStart}
            disabled={!allReady}
            className="rounded-xl bg-emerald-600 px-8 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {allReady ? 'Start Draft →' : `Waiting for ${teams.filter(t => !isTeamReady(t.id)).length} more…`}
          </button>
        )}

        {!isManager && !myTeamId && (
          <p className="text-sm text-slate-500">You are observing this draft.</p>
        )}
      </div>
    </div>
  )
}
