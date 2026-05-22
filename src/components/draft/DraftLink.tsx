'use client'

import { useState } from 'react'
import type { Team } from '@/store/draftArena'

interface Props {
  tournamentId: string
  teams:        Team[]
}

export function DraftLink({ tournamentId, teams }: Props) {
  const [open, setOpen]           = useState(false)
  const [copied, setCopied]       = useState<string | null>(null)

  function buildLink(teamId: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/draft/${tournamentId}?teamId=${teamId}`
  }

  async function copy(teamId: string) {
    await navigator.clipboard.writeText(buildLink(teamId))
    setCopied(teamId)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="border-b border-slate-700 bg-slate-800">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-slate-300 hover:text-white"
      >
        <span className="font-medium">Team Leader Links</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <ul className="divide-y divide-slate-700 px-4 pb-3">
          {teams.map(team => (
            <li key={team.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                {team.color && (
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: team.color }}
                  />
                )}
                <span className="truncate text-sm text-slate-200">{team.name}</span>
              </div>
              <button
                onClick={() => copy(team.id)}
                className="shrink-0 rounded bg-slate-600 px-3 py-1 text-xs font-medium text-white hover:bg-slate-500 transition-colors"
              >
                {copied === team.id ? '✓ Copied' : 'Copy link'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
