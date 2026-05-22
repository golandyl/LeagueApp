'use client'

import { useEffect, useRef } from 'react'
import {
  useDraftArenaStore,
} from '@/store/draftArena'
import {
  useDraftArena,
  getCurrentTeam,
  getRoundAndPick,
  type InitData,
} from '@/hooks/useDraftArena'
import { TurnBanner }  from '@/components/draft/TurnBanner'
import { DraftLink }   from '@/components/draft/DraftLink'
import { PlayerPool }  from '@/components/draft/PlayerPool'
import { TeamRoster }  from '@/components/draft/TeamRoster'
import { ReadyLobby }  from '@/components/draft/ReadyLobby'

interface Props {
  tournamentId: string
  initData:     InitData
  myTeamId:     string | null
  myName:       string
  isManager:    boolean
}

export function DraftArena({ tournamentId, initData, myTeamId, myName, isManager }: Props) {
  const draftStatus       = useDraftArenaStore(s => s.draftStatus)
  const teams             = useDraftArenaStore(s => s.teams)
  const rosters           = useDraftArenaStore(s => s.rosters)
  const availablePlayers  = useDraftArenaStore(s => s.availablePlayers)
  const teamPlayers       = useDraftArenaStore(s => s.teamPlayers)
  const presence          = useDraftArenaStore(s => s.presence)
  const isConnected       = useDraftArenaStore(s => s.isConnected)

  const { pickPlayer, markReady, startDraft, assignGhosts } = useDraftArena(
    tournamentId,
    initData,
    { myTeamId, myName, isManager },
  )

  // Fire assignGhosts exactly once when the pool empties during an active draft.
  const ghostsTriggeredRef = useRef(false)
  useEffect(() => {
    if (draftStatus !== 'active') return
    if (availablePlayers.length > 0) return
    if (!isManager) return
    if (ghostsTriggeredRef.current) return
    ghostsTriggeredRef.current = true
    void assignGhosts()
  }, [draftStatus, availablePlayers.length, isManager, assignGhosts])

  const currentTeam = getCurrentTeam(teams, teamPlayers.length)
  const { round, pickInRound } = getRoundAndPick(teams.length, teamPlayers.length)
  const isMyTurn =
    draftStatus === 'active' && (isManager || currentTeam?.id === myTeamId)

  // ── Pending: show lobby ──────────────────────────────────────────────────────
  if (draftStatus === 'pending') {
    return (
      <div className="flex min-h-screen flex-col bg-slate-900">
        {isManager && <DraftLink tournamentId={tournamentId} teams={teams} />}
        <ReadyLobby
          teams={teams}
          presence={presence}
          isManager={isManager}
          myTeamId={myTeamId}
          onReady={markReady}
          onStart={startDraft}
        />
      </div>
    )
  }

  // ── Active / Completed: full arena ───────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-slate-900">
      {/* Top bar */}
      {isManager && <DraftLink tournamentId={tournamentId} teams={teams} />}
      <TurnBanner
        currentTeam={currentTeam}
        myTeamId={myTeamId}
        isManager={isManager}
        draftStatus={draftStatus}
        round={round}
        pickInRound={pickInRound}
        totalTeams={teams.length}
        isConnected={isConnected}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">

        {/* Player pool — only shown while active */}
        {draftStatus === 'active' && (
          <div className="flex-1 min-w-0">
            <PlayerPool
              players={availablePlayers}
              showRatings={isManager}
              isMyTurn={isMyTurn}
              onPick={pickPlayer}
            />
          </div>
        )}

        {/* Team rosters */}
        <div
          className={`grid gap-3 ${
            draftStatus === 'active'
              ? 'grid-cols-2 sm:grid-cols-3 lg:w-72 lg:grid-cols-1 lg:shrink-0'
              : 'w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
          }`}
        >
          {teams.map(team => (
            <TeamRoster
              key={team.id}
              team={team}
              players={rosters[team.id] ?? []}
              isCurrent={draftStatus === 'active' && currentTeam?.id === team.id}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
