'use client'

import type { Tables } from '@/types/database'

type Team = Tables<'teams'>

interface Props {
  homeTeam:   Team
  awayTeam:   Team
  homeScore:  number
  awayScore:  number
}

export function Scoreboard({ homeTeam, awayTeam, homeScore, awayScore }: Props) {
  return (
    <div className="flex items-center gap-2">
      <TeamLabel team={homeTeam} align="right" />

      <div className="flex shrink-0 items-center gap-2">
        <Score value={homeScore} />
        <span className="text-3xl font-bold text-slate-600">–</span>
        <Score value={awayScore} />
      </div>

      <TeamLabel team={awayTeam} align="left" />
    </div>
  )
}

function TeamLabel({ team, align }: { team: Team; align: 'left' | 'right' }) {
  return (
    <div className={`flex flex-1 flex-col items-${align === 'left' ? 'start' : 'end'} gap-1 min-w-0`}>
      {team.color && (
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: team.color }}
        />
      )}
      <span className="truncate text-sm font-bold text-slate-300">{team.name}</span>
    </div>
  )
}

function Score({ value }: { value: number }) {
  return (
    <span className="min-w-[2.5ch] text-center text-[min(16vw,5rem)] font-black tabular-nums leading-none text-white">
      {value}
    </span>
  )
}
