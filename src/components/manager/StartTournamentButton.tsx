'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { generateTeams } from '@/lib/team-generator'
import type { DraftPlayer } from '@/lib/team-generator'

interface Props {
  leagueId:    string
  playerCount: number
}

const TEAM_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899']

export function StartTournamentButton({ leagueId, playerCount }: Props) {
  const t       = useTranslations('tournament')
  const tCommon = useTranslations('common')
  const locale  = useLocale()
  const router  = useRouter()

  const [open,     setOpen]     = useState(false)
  const [numTeams, setNumTeams] = useState(2)
  const [dayName,  setDayName]  = useState(
    () => `${t('newDay')} – ${new Date().toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
  )
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const ghostCount = playerCount % numTeams === 0 ? 0 : numTeams - (playerCount % numTeams)

  async function handleGenerate() {
    setError(null)
    setLoading(true)

    const supabase = createClient()

    // 1. Fetch players
    const { data: players, error: pErr } = await supabase
      .from('players')
      .select('*')
      .eq('league_id', leagueId)
      .eq('is_ghost', false)

    if (pErr || !players || players.length < numTeams) {
      setError(pErr?.message ?? t('needMorePlayers', { count: numTeams }))
      setLoading(false)
      return
    }

    // 2. Create tournament
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .insert({
        league_id:    leagueId,
        name:         dayName.trim(),
        season:       new Date().getFullYear().toString(),
        status:       'active'    as const,
        draft_status: 'completed' as const,
      })
      .select('id')
      .single()

    if (tErr || !tournament) {
      setError(tErr?.message ?? tCommon('error'))
      setLoading(false)
      return
    }

    // 3. Generate balanced teams
    const draftPlayers = players.map(p => ({
      _id:      p.id,
      name:     p.full_name,
      rating:   p.rating,
      position: p.position as DraftPlayer['position'],
      stamina:  p.stamina  as DraftPlayer['stamina'],
      isGhost:  false as const,
    }))

    const generated = generateTeams(draftPlayers as unknown as DraftPlayer[], numTeams)

    // 4. Insert teams
    const { data: insertedTeams, error: teamsErr } = await supabase
      .from('teams')
      .insert(
        generated.map((_, i) => ({
          league_id:     leagueId,
          tournament_id: tournament.id,
          name:          `Team ${String.fromCharCode(65 + i)}`,
          color:         TEAM_COLORS[i % TEAM_COLORS.length],
        }))
      )
      .select('id')

    if (teamsErr || !insertedTeams) {
      setError(teamsErr?.message ?? tCommon('error'))
      setLoading(false)
      return
    }

    // 5. Insert team_players
    const teamPlayerRows = generated.flatMap((team, i) =>
      team.players
        .filter(p => !p.isGhost)
        .map(p => ({
          team_id:       insertedTeams[i].id,
          player_id:     (p as unknown as { _id: string })._id,
          tournament_id: tournament.id,
        }))
    )

    if (teamPlayerRows.length > 0) {
      const { error: tpErr } = await supabase.from('team_players').insert(teamPlayerRows)
      if (tpErr) { setError(tpErr.message); setLoading(false); return }
    }

    // 6. Round-robin matches
    const now = new Date().toISOString()
    const matchRows = []
    for (let i = 0; i < insertedTeams.length; i++) {
      for (let j = i + 1; j < insertedTeams.length; j++) {
        matchRows.push({
          league_id:     leagueId,
          tournament_id: tournament.id,
          home_team_id:  insertedTeams[i].id,
          away_team_id:  insertedTeams[j].id,
          status:        'scheduled' as const,
          match_date:    now,
        })
      }
    }

    const { error: matchErr } = await supabase.from('matches').insert(matchRows)
    if (matchErr) { setError(matchErr.message); setLoading(false); return }

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl bg-sky-600 py-5 text-base font-black text-white tracking-wide transition-all active:scale-[0.97] active:bg-sky-700"
      >
        🏆  {t('startNew')}
      </button>
    )
  }

  return (
    <div className="rounded-2xl bg-slate-800 p-5 space-y-4">
      <h3 className="font-black text-white">{t('newDay')}</h3>

      <div className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('dayName')}</p>
        <input
          type="text"
          value={dayName}
          onChange={e => setDayName(e.target.value)}
          className="w-full rounded-xl bg-slate-700 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('numTeams')}</p>
        <div className="flex gap-2">
          {[2, 3, 4].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setNumTeams(n)}
              className={`flex-1 rounded-xl py-3 text-sm font-black transition-colors ${
                numTeams === n ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          {t('perTeam', { count: playerCount, perTeam: Math.ceil(playerCount / numTeams) })}
          {ghostCount > 0 ? ` · ${t('ghostFillers', { count: ghostCount })}` : ''}
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-red-900/40 px-4 py-3 text-sm text-red-300">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          className="flex-1 rounded-xl bg-slate-700 py-3 text-sm font-bold text-slate-300 active:bg-slate-600"
        >
          {tCommon('cancel')}
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || playerCount < numTeams}
          className="flex-1 rounded-xl bg-sky-600 py-3 text-sm font-black text-white transition-all active:bg-sky-700 disabled:opacity-60"
        >
          {loading ? t('generating') : t('generateMatches')}
        </button>
      </div>
    </div>
  )
}
