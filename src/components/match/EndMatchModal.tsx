'use client'

import { useTranslations } from 'next-intl'
import type { Tables } from '@/types/database'

type Team   = Tables<'teams'>
type League = Tables<'leagues'>

export type EndDecision =
  | 'end_regular'
  | 'end_ot'
  | 'end_draw'
  | 'enter_ot'
  | 'enter_penalties'
  | 'penalties_home'
  | 'penalties_away'
  | 'wc_keep_home'
  | 'wc_keep_away'

export type EndReason =
  | { kind: 'win_score'; winner: 'home' | 'away'; phase: 'regulation' | 'overtime' }
  | { kind: 'time_up';   phase:  'regulation' | 'overtime' }
  | { kind: 'penalties' }

interface Props {
  reason:               EndReason
  homeTeam:             Team
  awayTeam:             Team
  homeScore:            number
  awayScore:            number
  league:               League
  saving:               boolean
  onDecision:           (d: EndDecision) => void
  winnerContinuesMode?: boolean
}

export function EndMatchModal({
  reason, homeTeam, awayTeam, homeScore, awayScore, league, saving, onDecision,
  winnerContinuesMode = false,
}: Props) {
  const t       = useTranslations('endMatch')
  const tCommon = useTranslations('common')

  const winner =
    homeScore > awayScore ? homeTeam :
    awayScore > homeScore ? awayTeam : null

  const winnerName = winner?.name ?? ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-5">
      <div className="w-full max-w-sm rounded-3xl bg-slate-800 p-7 shadow-2xl">

        {/* Live score */}
        <div className="mb-6 flex items-center justify-center gap-4">
          <ScoreCol name={homeTeam.name} color={homeTeam.color} score={homeScore} />
          <span className="text-3xl font-bold text-slate-600">–</span>
          <ScoreCol name={awayTeam.name} color={awayTeam.color} score={awayScore} />
        </div>

        {/* Contextual message + actions */}
        {reason.kind === 'win_score' && (
          <Section
            title={
              reason.phase === 'overtime'
                ? t('goldenGoal', { team: reason.winner === 'home' ? homeTeam.name : awayTeam.name })
                : t('goalLimit', { team: reason.winner === 'home' ? homeTeam.name : awayTeam.name })
            }
            titleColor="text-emerald-400"
          >
            <Btn
              onClick={() => onDecision(reason.phase === 'overtime' ? 'end_ot' : 'end_regular')}
              variant="emerald"
              disabled={saving}
            >
              {saving ? tCommon('saving') : t('endMatch')}
            </Btn>
          </Section>
        )}

        {reason.kind === 'time_up' && reason.phase === 'regulation' && winner && (
          <Section
            title={t('fullTimeWin', { team: winnerName })}
            titleColor="text-emerald-400"
          >
            <Btn onClick={() => onDecision('end_regular')} variant="emerald" disabled={saving}>
              {saving ? tCommon('saving') : t('endMatch')}
            </Btn>
          </Section>
        )}

        {reason.kind === 'time_up' && reason.phase === 'regulation' && !winner && (
          <Section
            title={winnerContinuesMode ? t('wcWhoStays') : t('fullTimeDraw')}
            titleColor="text-amber-400"
          >
            {!winnerContinuesMode && league.overtime_enabled && (
              <Btn onClick={() => onDecision('enter_ot')} variant="amber" disabled={saving}>
                {t('enterExtraTime')}
              </Btn>
            )}
            {winnerContinuesMode ? (
              <>
                <Btn onClick={() => onDecision('wc_keep_home')} variant="sky" disabled={saving}>
                  {saving ? tCommon('saving') : homeTeam.name}
                </Btn>
                <Btn onClick={() => onDecision('wc_keep_away')} variant="sky" disabled={saving}>
                  {saving ? tCommon('saving') : awayTeam.name}
                </Btn>
              </>
            ) : (
              <Btn onClick={() => onDecision('end_draw')} variant="slate" disabled={saving}>
                {saving ? tCommon('saving') : t('endAsDraw')}
              </Btn>
            )}
          </Section>
        )}

        {reason.kind === 'time_up' && reason.phase === 'overtime' && winner && (
          <Section
            title={t('extraTimeWin', { team: winnerName })}
            titleColor="text-emerald-400"
          >
            <Btn onClick={() => onDecision('end_ot')} variant="emerald" disabled={saving}>
              {saving ? tCommon('saving') : t('endMatch')}
            </Btn>
          </Section>
        )}

        {reason.kind === 'time_up' && reason.phase === 'overtime' && !winner && (
          <Section
            title={winnerContinuesMode ? t('wcWhoStays') : t('extraTimeTied')}
            titleColor="text-amber-400"
          >
            {!winnerContinuesMode && league.penalties_enabled && (
              <Btn onClick={() => onDecision('enter_penalties')} variant="amber" disabled={saving}>
                {t('goToPenalties')}
              </Btn>
            )}
            {winnerContinuesMode ? (
              <>
                <Btn onClick={() => onDecision('wc_keep_home')} variant="sky" disabled={saving}>
                  {saving ? tCommon('saving') : homeTeam.name}
                </Btn>
                <Btn onClick={() => onDecision('wc_keep_away')} variant="sky" disabled={saving}>
                  {saving ? tCommon('saving') : awayTeam.name}
                </Btn>
              </>
            ) : (
              <Btn onClick={() => onDecision('end_draw')} variant="slate" disabled={saving}>
                {saving ? tCommon('saving') : t('endAsDraw')}
              </Btn>
            )}
          </Section>
        )}

        {reason.kind === 'penalties' && (
          <Section title={t('penaltiesWhoWon')} titleColor="text-amber-400">
            <Btn onClick={() => onDecision('penalties_home')} variant="sky" disabled={saving}>
              {saving ? tCommon('saving') : homeTeam.name}
            </Btn>
            <Btn onClick={() => onDecision('penalties_away')} variant="sky" disabled={saving}>
              {saving ? tCommon('saving') : awayTeam.name}
            </Btn>
          </Section>
        )}
      </div>
    </div>
  )
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function ScoreCol({ name, color, score }: { name: string; color: string | null; score: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {color && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />}
      <span className="text-xs text-slate-400">{name}</span>
      <span className="text-5xl font-black text-white tabular-nums">{score}</span>
    </div>
  )
}

function Section({
  title, titleColor, children,
}: { title: string; titleColor: string; children: React.ReactNode }) {
  return (
    <>
      <p className={`mb-5 text-center text-lg font-black leading-snug ${titleColor}`}>{title}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </>
  )
}

function Btn({
  children, onClick, variant, disabled,
}: {
  children: React.ReactNode
  onClick:  () => void
  variant:  'emerald' | 'amber' | 'sky' | 'slate'
  disabled?: boolean
}) {
  const color = {
    emerald: 'bg-emerald-600 active:bg-emerald-700',
    amber:   'bg-amber-500 active:bg-amber-600',
    sky:     'bg-sky-600 active:bg-sky-700',
    slate:   'bg-slate-600 active:bg-slate-700',
  }[variant]

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl py-5 text-lg font-black text-white transition-all active:scale-[0.97] disabled:opacity-50 ${color}`}
    >
      {children}
    </button>
  )
}
