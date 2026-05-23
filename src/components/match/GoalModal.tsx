'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Tables } from '@/types/database'

type Team   = Tables<'teams'>
type Player = Tables<'players'>

type Step = 'team' | 'scorer' | 'assist'

export interface GoalSelection {
  scoringTeamId: string
  scorerId:      string | null
  assistId:      string | null
  isOwnGoal:     boolean
}

interface Props {
  homeTeam:    Team
  awayTeam:    Team
  homePlayers: Player[]
  awayPlayers: Player[]
  onConfirm:   (sel: GoalSelection) => void
  onClose:     () => void
}

export function GoalModal({ homeTeam, awayTeam, homePlayers, awayPlayers, onConfirm, onClose }: Props) {
  const t       = useTranslations('match')
  const tCommon = useTranslations('common')

  const [step,          setStep]          = useState<Step>('team')
  const [scoringTeamId, setScoringTeamId] = useState<string | null>(null)
  const [scorerId,      setScorerId]      = useState<string | null>(null)

  const scoringPlayers = scoringTeamId === homeTeam.id ? homePlayers : awayPlayers
  const activePlayers  = scoringPlayers.filter(p => !p.is_ghost)
  const assistOptions  = activePlayers.filter(p => p.id !== scorerId)

  function pickTeam(teamId: string) {
    setScoringTeamId(teamId)
    setStep('scorer')
  }

  function pickScorer(id: string | 'own_goal') {
    if (id === 'own_goal') {
      onConfirm({ scoringTeamId: scoringTeamId!, scorerId: null, assistId: null, isOwnGoal: true })
      return
    }
    setScorerId(id)
    setStep('assist')
  }

  function pickAssist(id: string | 'solo') {
    onConfirm({
      scoringTeamId: scoringTeamId!,
      scorerId:      scorerId,
      assistId:      id === 'solo' ? null : id,
      isOwnGoal:     false,
    })
  }

  function goBack() {
    if (step === 'assist') { setStep('scorer'); return }
    if (step === 'scorer') { setScoringTeamId(null); setStep('team') }
  }

  const heading = {
    team:   `⚽  ${t('whichTeamScored')}`,
    scorer: `⚽  ${t('whoScored')}`,
    assist: `🎯  ${t('whoAssisted')}`,
  }[step]

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="w-full max-h-[88vh] overflow-y-auto rounded-t-3xl bg-slate-800 p-6 pb-10 sm:mx-auto sm:max-w-md sm:rounded-2xl sm:pb-6">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-2">
          <div>
            {step !== 'team' && (
              <button onClick={goBack} className="mb-1.5 inline-flex items-center gap-1 text-sm font-semibold text-sky-400">
                <svg className="h-3.5 w-3.5 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
                </svg>
                {tCommon('back')}
              </button>
            )}
            <h2 className="text-xl font-black text-white">{heading}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full bg-slate-700 p-2 text-slate-400 hover:text-white"
            aria-label={tCommon('cancel')}
          >
            ✕
          </button>
        </div>

        {/* Step 1 — team */}
        {step === 'team' && (
          <div className="flex flex-col gap-3">
            {[homeTeam, awayTeam].map(team => (
              <button
                key={team.id}
                onClick={() => pickTeam(team.id)}
                className="flex items-center gap-4 rounded-2xl border-2 border-slate-600 bg-slate-700 px-5 py-5 text-start transition-all active:scale-[0.97] active:bg-slate-600"
              >
                {team.color && (
                  <span
                    className="h-8 w-8 shrink-0 rounded-full border-2 border-white/20"
                    style={{ backgroundColor: team.color }}
                  />
                )}
                <span className="text-xl font-black text-white">{team.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — scorer */}
        {step === 'scorer' && (
          <div className="flex flex-col gap-2">
            <PlayerButton
              label={`🙈  ${t('ownGoal')}`}
              sub={t('ownGoalSub')}
              variant="orange"
              onClick={() => pickScorer('own_goal')}
            />
            <Divider />
            {activePlayers.map(p => (
              <PlayerButton key={p.id} label={p.full_name} sub={p.position} onClick={() => pickScorer(p.id)} />
            ))}
            {activePlayers.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-500">{t('noPlayersOnTeam')}</p>
            )}
          </div>
        )}

        {/* Step 3 — assist */}
        {step === 'assist' && (
          <div className="flex flex-col gap-2">
            <PlayerButton
              label={`👟  ${t('soloGoal')}`}
              sub={t('noAssist')}
              variant="sky"
              onClick={() => pickAssist('solo')}
            />
            <Divider />
            {assistOptions.map(p => (
              <PlayerButton key={p.id} label={p.full_name} sub={p.position} onClick={() => pickAssist(p.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function PlayerButton({
  label, sub, onClick, variant = 'default',
}: {
  label:    string
  sub:      string
  onClick:  () => void
  variant?: 'default' | 'orange' | 'sky'
}) {
  const base = 'flex items-center justify-between rounded-xl px-5 py-4 text-start transition-all active:scale-[0.97]'
  const styles = {
    default: `${base} bg-slate-700 active:bg-slate-600`,
    orange:  `${base} border-2 border-orange-500/30 bg-orange-500/10 active:bg-orange-500/20`,
    sky:     `${base} border-2 border-sky-500/30 bg-sky-500/10 active:bg-sky-500/20`,
  }[variant]

  const labelColor = {
    default: 'text-white',
    orange:  'text-orange-300',
    sky:     'text-sky-300',
  }[variant]

  return (
    <button onClick={onClick} className={styles}>
      <span className={`text-base font-bold ${labelColor}`}>{label}</span>
      <span className="text-xs text-slate-400">{sub}</span>
    </button>
  )
}

function Divider() {
  return <div className="my-1 border-t border-slate-700" />
}
