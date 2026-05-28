'use client'

import { useTranslations } from 'next-intl'

type Phase = 'regulation' | 'overtime'

interface Props {
  seconds:        number
  phase:          Phase
  running:        boolean
  isStoppageTime: boolean
  onToggle:       () => void
  onWhistle?:     () => void
}

function fmt(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function LiveTimer({ seconds, phase, running, isStoppageTime, onToggle, onWhistle }: Props) {
  const t = useTranslations('match')

  return (
    <div className="flex flex-col items-center gap-5">

      {/* Phase / status pill */}
      {isStoppageTime ? (
        <span className="animate-pulse rounded-full bg-red-600 px-5 py-1.5 text-sm font-black uppercase tracking-widest text-white">
          ⏱ {t('stoppageTime')}
        </span>
      ) : phase === 'overtime' ? (
        <span className="rounded-full bg-amber-500 px-5 py-1.5 text-sm font-black uppercase tracking-widest text-white">
          {t('extraTimePill')}
        </span>
      ) : null}

      {/* Giant clock */}
      <div
        className={`text-[min(22vw,9rem)] font-black tabular-nums leading-none transition-colors ${
          isStoppageTime ? 'text-red-400' :
          running        ? 'text-white'   :
                           'text-amber-400'
        }`}
      >
        {fmt(seconds)}
        {!running && !isStoppageTime && (
          <span className="ms-3 inline-block animate-pulse text-[min(6vw,2.5rem)] align-middle">
            ⏸
          </span>
        )}
      </div>

      {/* Action button */}
      {isStoppageTime && onWhistle ? (
        <button
          onClick={onWhistle}
          className="w-full max-w-sm rounded-2xl bg-red-600 py-6 text-2xl font-black uppercase tracking-widest text-white transition-all active:scale-95 active:bg-red-700"
        >
          🔴  {t('blowWhistle')}
        </button>
      ) : (
        <button
          onClick={onToggle}
          className={`w-full max-w-sm rounded-2xl py-6 text-2xl font-black uppercase tracking-widest transition-all active:scale-95 ${
            running
              ? 'bg-amber-500 text-white active:bg-amber-600'
              : 'bg-emerald-500 text-white active:bg-emerald-600'
          }`}
        >
          {running ? `⏸  ${t('pause')}` : `▶  ${t('resume')}`}
        </button>
      )}
    </div>
  )
}
